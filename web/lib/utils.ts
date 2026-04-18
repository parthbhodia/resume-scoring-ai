export function scoreColor(score: number): string {
  if (score >= 75) return "var(--green)";
  if (score >= 55) return "var(--yellow)";
  return "var(--red)";
}

export function scoreClass(score: number): "s-high" | "s-mid" | "s-low" {
  if (score >= 75) return "s-high";
  if (score >= 55) return "s-mid";
  return "s-low";
}

export function weightColor(w: string): { bg: string; color: string } {
  if (w === "High")   return { bg: "var(--red-bg)",    color: "var(--orange)" };
  if (w === "Medium") return { bg: "var(--yellow-bg)", color: "var(--yellow)" };
  return                     { bg: "var(--surface3)",  color: "var(--muted)"  };
}

export function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8765").replace(/\/$/, "");
  return `${base}${path}`;
}

export function escHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
