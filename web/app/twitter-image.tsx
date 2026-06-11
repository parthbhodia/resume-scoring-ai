// Twitter uses its own image slot; share OG design but declare metadata locally
// (Next.js 16 disallows re-exporting `runtime` from another image route).
export { default } from "./opengraph-image";

export const runtime = "edge";
export const alt = "Resunova — AI Resume Scoring & Tailoring";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
