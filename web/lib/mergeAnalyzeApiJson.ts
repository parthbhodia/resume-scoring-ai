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

  return out;
}
