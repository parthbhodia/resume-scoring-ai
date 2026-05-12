/**
 * Turn raw API / provider error strings into short, actionable copy for the UI.
 * Never show giant JSON blobs or internal status codes alone.
 */
export function toUserFriendlyErrorMessage(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "Something went wrong. Please try again.";

  const lower = s.toLowerCase();

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
