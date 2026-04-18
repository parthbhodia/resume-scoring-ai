import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ResumeRecord, Criterion, RatingsData } from "./types";

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
  const { data, error } = await getSupabaseClient()
    .from("resumes")
    .select("*, criteria(*)")
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
        user_id,
      },
      { onConflict: "folder" },
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
