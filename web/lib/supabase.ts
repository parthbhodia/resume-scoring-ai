import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ResumeRecord, Criterion, RatingsData } from "./types";
import { type ProfileFormState, EMPTY_PROFILE } from "./profileStorage";

/* ── Analyze-history types ───────────────────────────────────── */
// result is typed as Record<string,unknown> here because the DB stores raw
// JSON — callers (AnalyzeResume.tsx) cast to their own full AnalysisResult.
export interface AnalyzeRecord {
  id:        string;
  label:     string;
  score:     number;
  createdAt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result:    any;
}

// Lazy singleton — avoids crashing at build time when env vars aren't set
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
  _client = createClient(url, key);
  return _client;
}

/* ── Resume CRUD ─────────────────────────────────────────── */

export async function fetchResumes(): Promise<ResumeRecord[]> {
  const db = getSupabaseClient();

  // Always scope to the signed-in user — prevents data leakage and ensures
  // the query satisfies Supabase RLS policies (which require a matching user_id).
  const { data: { session } } = await db.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return [];          // not authenticated → empty list, not all rows

  const { data, error } = await db
    .from("resumes")
    .select("*, criteria(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ResumeRecord[];
}

export async function upsertResume(
  folder: string,
  company: string,
  role: string,
  model: string,
  texPath: string,
  pdfUrl: string | null,
  ratings: RatingsData | null,
  jobDescription?: string | null,
): Promise<string> {
  const db = getSupabaseClient();

  // Include the signed-in user's id so RLS policies apply
  const { data: { session } } = await db.auth.getSession();
  const user_id = session?.user?.id ?? null;

  const { data, error } = await db
    .from("resumes")
    .upsert(
      {
        folder,
        company,
        role,
        model_used: model,
        tex_path: texPath,
        pdf_url: pdfUrl,
        score: ratings?.match_score ?? null,
        verdict: ratings?.verdict ?? null,
        job_description: jobDescription?.trim() || null,
        user_id,
      },
      { onConflict: "user_id,folder" },
    )
    .select("id")
    .single();

  if (error) throw error;
  const resumeId: string = data.id;

  if (ratings?.criteria?.length) {
    const rows = ratings.criteria.map((c: Criterion) => ({
      resume_id: resumeId,
      name: c.name,
      weight: c.weight,
      score: c.score,
      notes: c.notes,
    }));
    await db.from("criteria").upsert(rows, { onConflict: "resume_id,name" });
  }

  if (ratings) {
    const signals = [
      ...(ratings.whats_working ?? []).map((t: string) => ({ resume_id: resumeId, kind: "working", text: t })),
      ...(ratings.gaps ?? []).map((t: string) => ({ resume_id: resumeId, kind: "gap", text: t })),
    ];
    if (signals.length) {
      await db.from("resume_signals").delete().eq("resume_id", resumeId);
      await db.from("resume_signals").insert(signals);
    }
  }

  return resumeId;
}

/* ── Analyze history CRUD ────────────────────────────────────── */

/** Fetch a user's analysis history, newest first. Returns [] if unauthenticated. */
export async function fetchAnalyses(limit = 20): Promise<AnalyzeRecord[]> {
  const db = getSupabaseClient();
  const { data: { session } } = await db.auth.getSession();
  if (!session?.user?.id) return [];

  const { data, error } = await db
    .from("resume_analyses")
    .select("id, label, score, result, created_at")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id:        row.id as string,
    label:     row.label as string,
    score:     row.score as number,
    createdAt: row.created_at as string,
    result:    row.result,
  }));
}

/** Insert a new analysis row. Returns the new row id. */
export async function insertAnalysis(
  label: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: any,
): Promise<string | null> {
  const db = getSupabaseClient();
  const { data: { session } } = await db.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await db
    .from("resume_analyses")
    .insert({
      user_id: session.user.id,
      label,
      score:   result.overallScore,
      result,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

/** Delete a single analysis row by id. */
export async function deleteAnalysis(id: string): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from("resume_analyses")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/* ── User profile (Tailor defaults + EEO) ─────────────────────────────────── */

function coerceUserProfilePayload(raw: unknown): ProfileFormState {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PROFILE };
  return { ...EMPTY_PROFILE, ...(raw as Partial<ProfileFormState>) };
}

/** Load signed-in user’s profile row from `user_profiles`. Returns null if missing, logged out, or on error. */
export async function fetchUserProfile(): Promise<ProfileFormState | null> {
  try {
    const db = getSupabaseClient();
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user?.id) return null;

    const { data, error } = await db
      .from("user_profiles")
      .select("profile")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      console.warn("[user_profiles] fetch:", error.message);
      return null;
    }
    if (!data?.profile) return null;
    return coerceUserProfilePayload(data.profile);
  } catch (e) {
    console.warn("[user_profiles] fetch:", e);
    return null;
  }
}

/** Upsert full profile JSON for the signed-in user. No-op when logged out. */
export async function upsertUserProfile(profile: ProfileFormState): Promise<void> {
  try {
    const db = getSupabaseClient();
    const { data: { session } } = await db.auth.getSession();
    if (!session?.user?.id) return;

    const { error } = await db.from("user_profiles").upsert(
      {
        user_id: session.user.id,
        profile: profile as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (error) console.warn("[user_profiles] upsert:", error.message);
  } catch (e) {
    console.warn("[user_profiles] upsert:", e);
  }
}
