/**
 * Persist tailor "match" runs (analyze-first, no PDF) to Supabase `resumes`
 * so TailorRecentJobs can list and restore them.
 */
import type { RatingsData } from "@/lib/types";
import { slugToken } from "@/lib/resumeFileName";
import { upsertResume } from "@/lib/supabase";

/** Stable library folder per target company+role (one row; bump created_at on re-run). */
export function tailorMatchFolder(company: string, role: string): string {
  const c = slugToken(company, "co");
  const r = slugToken(role, "role");
  return `tailor_match_${c}_${r}`.slice(0, 100);
}

export async function saveTailorMatchToLibrary(opts: {
  folder: string;
  company: string;
  role: string;
  model: string;
  ratings: RatingsData;
  jobDescription: string;
  candidateProfile?: string | null;
}): Promise<string | null> {
  const profile = opts.candidateProfile?.trim();
  return upsertResume(
    opts.folder,
    opts.company,
    opts.role,
    opts.model,
    "",
    null,
    opts.ratings,
    opts.jobDescription,
    {
      renderer: "structured",
      schemaVersion: 1,
      resumeDoc: profile ? { profile } : null,
    },
    { bumpCreatedAt: true },
  );
}
