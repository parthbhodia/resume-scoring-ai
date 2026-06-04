/** Mirrors backend ``username_company_role`` folder / PDF stem in resume_library.py. */

import type { StructuredResume } from "@/store/resumeAnalyzeStore";

export function slugToken(part: string, fallback = "x"): string {
  const token = (part || "").trim().replace(/[^\w]/g, "");
  return token || fallback;
}

/**
 * Try to pull the candidate's name out of the resume profile text.
 * Most résumés put the name on the first non-empty line. We walk the top
 * ~12 lines looking for the same kind of "name line" the backend looks
 * for in _infer_full_name_from_resume_text (parity matters — the file
 * stem and the rendered PDF header should agree).
 *
 * Falls back to email local part, then to "User".
 */
export function ownerSlugFromProfile(profile: string | null | undefined): string {
  if (!profile?.trim()) return "User";

  // Explicit "Name: ..." labels win (some imports add them).
  const nameMatch = profile.match(/^Name:\s*(.+)$/im);
  if (nameMatch?.[1]) return slugToken(nameMatch[1], "User");

  // Walk the top of the resume looking for a name-shaped line.
  const SECTION_WORDS = new Set([
    "summary", "experience", "education", "skills", "projects", "objective",
    "profile", "certifications", "awards", "publications", "languages",
    "interests", "achievements", "contact", "résumé", "resume",
    "references", "volunteering", "leadership",
  ]);
  const lines = profile.split("\n").slice(0, 12).map((l) => l.trim());
  for (const ln of lines) {
    if (!ln || ln.length > 60) continue;
    if (/[@+0-9|·]/.test(ln)) continue;                  // contact-line markers
    if (ln === ln.toUpperCase() && /[A-Z]/.test(ln)) continue; // ALL-CAPS = heading
    const words = ln.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    if (words.some((w) => SECTION_WORDS.has(w.toLowerCase().replace(/[,.]/g, "")))) continue;
    const looksLikeNameWord = (w: string) => {
      const c = w.replace(/[,.]/g, "");
      if (!c) return false;
      return c.split("-").every((p) => p.length >= 2 && /^[A-Z]/.test(p));
    };
    if (words.every(looksLikeNameWord)) {
      return slugToken(ln.replace(/\s+/g, ""), "User");
    }
  }

  // Fallback: email local part (the line above usually has one).
  const emailMatch = profile.match(/^E-?mail:\s*([^\s|]+)/im) || profile.match(/([A-Za-z0-9._-]+)@[A-Za-z0-9.-]+/);
  if (emailMatch?.[1]?.length) {
    const local = emailMatch[1].includes("@") ? emailMatch[1].split("@")[0] : emailMatch[1];
    return slugToken(local, "User");
  }

  return "User";
}

export function buildResumeFileStem(
  company: string,
  role: string,
  candidateProfile?: string | null,
): string {
  const user = ownerSlugFromProfile(candidateProfile);
  const comp = slugToken(company, "Company");
  const rol = slugToken(role, "Role");
  return `${user}_${comp}_${rol}`;
}

/** Role slug for exports — JD/target role wins, else latest job on structured résumé. */
export function roleSlugForExport(
  roleLabel?: string | null,
  structured?: StructuredResume | null,
): string {
  const explicit = (roleLabel || "").trim();
  if (explicit) return slugToken(explicit, "Resume");
  const exp = structured?.experience?.[0]?.role?.trim();
  if (exp) return slugToken(exp, "Resume");
  const headline = structured?.headline?.trim();
  if (headline) return slugToken(headline, "Resume");
  return "Resume";
}

/** Download stem: ``Name_Role`` (e.g. ``JohnDoe_SoftwareEngineer``). */
export function buildNameRoleExportBasename(
  candidateProfile?: string | null,
  roleLabel?: string | null,
  structured?: StructuredResume | null,
): string {
  const profileText =
    candidateProfile?.trim()
    || structured?.full_name?.trim()
    || "";
  const name = ownerSlugFromProfile(profileText);
  const role = roleSlugForExport(roleLabel, structured);
  return `${name}_${role}`;
}

export function buildNameRoleExportFilename(
  candidateProfile?: string | null,
  roleLabel?: string | null,
  structured?: StructuredResume | null,
  ext: "pdf" | "docx" = "pdf",
): string {
  const stem = buildNameRoleExportBasename(candidateProfile, roleLabel, structured);
  if (stem === "User_Resume") return `resume.${ext}`;
  return `${stem}.${ext}`;
}
