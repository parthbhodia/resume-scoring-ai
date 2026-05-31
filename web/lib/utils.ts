import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { messageForNonJsonApiFailure } from "@/lib/userFriendlyError";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

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
  if (w === "High")   return { bg: "rgba(245, 158, 11, 0.14)", color: "var(--orange)" };
  if (w === "Medium") return { bg: "var(--yellow-bg)", color: "var(--yellow)" };
  return                     { bg: "var(--surface3)",  color: "var(--muted)"  };
}

export function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8765").replace(/\/$/, "");
  return `${base}${path}`;
}

export function isResumeUploadFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.includes("pdf")) return true;
  if (t.includes("wordprocessingml") || t === "application/msword") return true;
  return /\.(pdf|docx?)$/i.test(file.name || "");
}

export async function parseJsonOrThrow<T = unknown>(resp: Response): Promise<T> {
  const text = await resp.text();
  const ct   = resp.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Server returned invalid JSON (status ${resp.status}).`);
    }
  }
  if (!resp.ok) {
    let snippet = text.trim().slice(0, 240) || resp.statusText || "Request failed";
    try {
      const j = JSON.parse(text) as { message?: string; error?: string };
      if (j?.message) snippet = String(j.message);
      else if (j?.error) snippet = String(j.error);
    } catch { /* plain text / HTML */ }
    throw new Error(messageForNonJsonApiFailure(resp.status, snippet));
  }
  throw new Error("The résumé server returned an unexpected response (not JSON). Please try again.");
}

export function escHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
