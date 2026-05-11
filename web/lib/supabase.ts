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
  const rows = (data ?? []) as ResumeRecord[];
  // Prefer default résumé first without relying on DB column sort (older DBs may lack `is_default`).
  rows.sort((a, b) => {
    const d = Number(!!b.is_default) - Number(!!a.is_default);
    if (d !== 0) return d;
    return (b.created_at ?? "").localeCompare(a.created_at ?? "");
  });
  return rows;
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

  // Include the signed-in user's id so RLS policies apply (insert with null user_id is rejected).
  const { data: { session } } = await db.auth.getSession();
  const user_id = session?.user?.id ?? null;
  if (!user_id) {
    throw new Error(
      "Not signed in — sign in with Google first, then generate again so we can save this résumé to your Library.",
    );
  }

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

/** Normalize user-facing slug input to stored form (lowercase, hyphenated, a-z0-9 only). */
export function normalizeResumePublicSlug(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s;
}

export async function fetchResumeShareMetaByFolder(
  folder: string,
): Promise<{ public_slug: string | null; is_default: boolean } | null> {
  const db = getSupabaseClient();
  const { data: { session } } = await db.auth.getSession();
  if (!session?.user?.id) return null;
  const { data, error } = await db
    .from("resumes")
    .select("public_slug, is_default")
    .eq("user_id", session.user.id)
    .eq("folder", folder)
    .maybeSingle();
  if (error || !data) return null;
  return {
    public_slug: (data.public_slug as string | null) ?? null,
    is_default: !!(data as { is_default?: boolean }).is_default,
  };
}

/** Update public slug and/or default flag for a library row (RLS: own rows only). */
export async function updateResumeShareSettings(
  folder: string,
  opts: { publicSlug: string | null; isDefault: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getSupabaseClient();
  const { data: { session } } = await db.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) return { ok: false, error: "Sign in to save a public link." };

  const normalized = opts.publicSlug?.trim()
    ? normalizeResumePublicSlug(opts.publicSlug)
    : "";
  if (normalized && (normalized.length < 3 || normalized.length > 50)) {
    return { ok: false, error: "Slug must be 3–50 characters." };
  }
  if (normalized && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return { ok: false, error: "Use lowercase letters, numbers, and single hyphens only." };
  }

  if (opts.isDefault) {
    const { error: e1 } = await db.from("resumes").update({ is_default: false }).eq("user_id", uid);
    if (e1) return { ok: false, error: e1.message };
  }

  const { data: updated, error: e2 } = await db
    .from("resumes")
    .update({
      is_default: opts.isDefault,
      public_slug: normalized || null,
    })
    .eq("user_id", uid)
    .eq("folder", folder)
    .select("id");

  if (e2) {
    const msg = e2.message.toLowerCase();
    if (e2.code === "23505" || msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false, error: "That link is already taken. Try another slug." };
    }
    return { ok: false, error: e2.message };
  }
  if (!updated?.length) {
    return {
      ok: false,
      error: "Résumé is not in your library yet — wait a few seconds after the PDF finishes, then try again.",
    };
  }
  return { ok: true };
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
