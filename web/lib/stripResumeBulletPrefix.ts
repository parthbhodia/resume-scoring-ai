/** Leading bullet / numbering markers from PDF extract or model output — strip for uniform display. */
const LEADING_BULLET =
  /^[\s\uFEFF]*(?:[-*•●◦‧·・‣⁃▪►➤○⚫—–‑]|\d{1,2}[\).\]])\s*/u;

export function stripResumeBulletPrefix(line: string): string {
  let s = line.replace(/\ufeff/g, "").trimStart();
  s = s.replace(LEADING_BULLET, "").trimStart();
  return s.trim();
}
