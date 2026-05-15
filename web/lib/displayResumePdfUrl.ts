import type { ResumeRecord } from "@/lib/types";
import { apiUrl } from "@/lib/utils";

/**
 * URL for opening a library résumé’s PDF in the browser.
 *
 * `pdf_url` in Supabase is often null when Storage upload failed or the client
 * never got an absolute URL — but the resume API may still serve the file at
 * `/pdf/{folder}/{basename}.pdf` (same basename as the saved `.tex`).
 */
export function displayPdfUrlForResume(
  record: Pick<ResumeRecord, "folder" | "tex_path" | "pdf_url">,
): string | null {
  const raw = record.pdf_url?.trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return apiUrl(path);
  }

  const folder = record.folder?.trim();
  const tp = record.tex_path?.trim();
  if (!folder || !tp) return null;

  const seg = tp.replace(/\\/g, "/").split("/").filter(Boolean);
  const base = seg[seg.length - 1];
  if (!base?.toLowerCase().endsWith(".tex")) return null;

  const pdfName = `${base.slice(0, -4)}.pdf`;
  return apiUrl(`/pdf/${encodeURIComponent(folder)}/${encodeURIComponent(pdfName)}`);
}
