/**
 * Base URL the web app calls for Starlette `/api/*` (must match `apiUrl` in `utils.ts`).
 */
export function apiBackendBaseUrl(): string {
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL
      ? String(process.env.NEXT_PUBLIC_API_URL).trim()
      : "";
  return (fromEnv || "http://localhost:8765").replace(/\/$/, "");
}

/**
 * When the response is not JSON (often HTML “Not Found”), map status to helpful copy.
 */
export function messageForNonJsonApiFailure(status: number, bodySnippet: string): string {
  const base = apiBackendBaseUrl();
  const hint = bodySnippet.replace(/\s+/g, " ").trim().slice(0, 120);

  if (status === 404) {
    const looksHtml =
      /^</.test(hint.trim()) ||
      /<!doctype/i.test(hint) ||
      (hint.length > 20 && /<html/i.test(hint));
    if (looksHtml) {
      return (
        `HTTP 404 from ${base}, but the body looks like a normal web page (HTML), not the Python API. ` +
        `NEXT_PUBLIC_API_URL is probably pointing at your Next/marketing host instead of Starlette, ` +
        `or you are viewing an export built without the API URL. Fix: set NEXT_PUBLIC_API_URL in web/.env.local ` +
        `to http://127.0.0.1:8765 (or your deployed API), stop and run npm run dev again, then hard-refresh. ` +
        `In DevTools → Network, failed calls should hit port 8765 and return JSON, not HTML.`
      );
    }
    return (
      `HTTP 404 from ${base} — no matching /api route (plain “Not Found”). ` +
      `Start the backend from the project root: python resume_gui/app.py (port 8765). ` +
      `If it is running, confirm DevTools → Network shows the full URL as ${base}/api/… and that nothing else is bound to that port.`
    );
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The résumé server is temporarily unavailable. Please try again in a minute.";
  }
  if (status >= 500) {
    return "The résumé server reported an error. Please try again in a moment.";
  }
  if (hint && !hint.startsWith("<") && hint.length < 200) {
    return `The résumé server could not complete this request (HTTP ${status}). ${hint}`;
  }
  return `The résumé server could not complete this request (HTTP ${status}). Please try again.`;
}

/**
 * Turn raw API / provider error strings into short, actionable copy for the UI.
 * Never show giant JSON blobs or internal status codes alone.
 */
export function toUserFriendlyErrorMessage(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "Something went wrong. Please try again.";

  const lower = s.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("echec du chargement") ||
    lower.includes("err_connection_refused") ||
    lower.includes("connection refused")
  ) {
    const base = apiBackendBaseUrl();
    const hosted =
      /railway\.app|render\.com|fly\.dev|herokuapp\.com/i.test(base);
    if (hosted) {
      return (
        `Cannot reach the résumé API at ${base}. ` +
        `If the browser console shows a CORS error, the API is often offline or restarting (502 from the host) — ` +
        `check your Railway/deploy logs and restart the service. ` +
        `When the API is healthy, GET ${base}/api/health should return {"ok":true}.`
      );
    }
    return (
      `Cannot reach the résumé API at ${base}. ` +
      `Check the server is running, the URL is correct, and nothing is blocking the connection (firewall or VPN). ` +
      `Local dev: from the project root run python resume_gui/app.py unless NEXT_PUBLIC_API_URL points elsewhere.`
    );
  }

  if (
    lower.startsWith("server returned 404") ||
    (lower.includes("404") && lower.includes("not found") && lower.includes("server"))
  ) {
    return messageForNonJsonApiFailure(404, "");
  }

  const capacity =
    /\b503\b/.test(lower) ||
    lower.includes("unavailable") ||
    lower.includes("high demand") ||
    lower.includes("spikes in demand") ||
    lower.includes("try again later") ||
    lower.includes("overloaded") ||
    lower.includes("deadline exceeded") ||
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted") ||
    /\b429\b/.test(lower) ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("quota");

  if (capacity) {
    return "The AI service is temporarily busy. Please wait a minute and try again.";
  }

  if (
    lower.includes("api key") ||
    lower.includes("invalid api key") ||
    lower.includes("permission denied") ||
    lower.includes("unauthenticated") ||
    lower.includes("401")
  ) {
    return "There is a problem with API access. Check your configuration and try again.";
  }

  if (s.length > 360 && (s.includes("'error'") || s.includes('"error"') || s.includes("'code'"))) {
    return "The AI service returned an error. Please try again in a moment.";
  }

  return s;
}
