/**
 * Some proxies or older responses use snake_case keys. Merge into the camelCase
 * shape the Analyze UI expects without losing fields.
 */
export function mergeAnalyzeApiJson(json: Record<string, unknown>): Record<string, unknown> {
  const out = { ...json } as Record<string, unknown>;
  const ex = json.extractedText ?? json.extracted_text;
  if (typeof ex === "string" && ex.length > 0) out.extractedText = ex;

  const rh = json.resumeHeader ?? json.resume_header;
  if (Array.isArray(rh) && rh.every((x) => typeof x === "string")) out.resumeHeader = rh;

  const lf = json.libraryFolder ?? json.library_folder;
  if (typeof lf === "string" && lf.trim() !== "") out.libraryFolder = lf.trim();

  const sr = json.structuredResume ?? json.structured_resume;
  if (sr && typeof sr === "object" && !Array.isArray(sr)) out.structuredResume = sr;

  const bm = json.bulletMap ?? json.bullet_map;
  if (Array.isArray(bm)) out.bulletMap = bm;

  const bullets = json.bulletAnalysis ?? json.bullet_analysis;
  if (Array.isArray(bullets)) {
    out.bulletAnalysis = bullets.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      const b = { ...(row as Record<string, unknown>) };
      const cr = b.categoryRewrites ?? b.category_rewrites;
      if (cr && typeof cr === "object" && !Array.isArray(cr)) {
        b.categoryRewrites = cr;
      }
      const pc = b.primaryCategory ?? b.primary_category;
      if (typeof pc === "string" && pc.trim() !== "") b.primaryCategory = pc;
      const ic = b.issueCategories ?? b.issue_categories;
      if (Array.isArray(ic)) {
        b.issueCategories = ic.filter((x): x is string => typeof x === "string");
      }
      const rawIssues = b.issues;
      b.issues = Array.isArray(rawIssues) ? rawIssues.filter((x): x is string => typeof x === "string") : [];
      return b;
    });
  }

  return out;
}
