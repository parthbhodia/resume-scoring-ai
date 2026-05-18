/** Mirrors backend ``username_company_role`` folder / PDF stem in resume_library.py. */

export function slugToken(part: string, fallback = "x"): string {
  const token = (part || "").trim().replace(/[^\w]/g, "");
  return token || fallback;
}

export function ownerSlugFromProfile(profile: string | null | undefined): string {
  if (!profile?.trim()) return "User";
  const nameMatch = profile.match(/^Name:\s*(.+)$/im);
  if (nameMatch?.[1]) return slugToken(nameMatch[1], "User");
  const emailMatch = profile.match(/^E-?mail:\s*([^\s|]+)/im);
  if (emailMatch?.[1]?.includes("@")) {
    return slugToken(emailMatch[1].split("@")[0], "User");
  }
  const firstLine = profile.trim().split("\n")[0]?.trim();
  if (firstLine && firstLine.length < 48 && /^[A-Za-z]/.test(firstLine)) {
    return slugToken(firstLine.replace(/\s+/g, ""), "User");
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
