export interface Criterion {
  name: string;
  weight: "High" | "Medium" | "Low";
  score: number;         // 1-10
  notes: string;
}

// ── Detailed ratings (new bifurcated schema) ──────────────────────────────

export interface DetailedRatingItem {
  text: string;
  context?: string;   // for covered items — evidence from resume
  analysis?: string;  // for missing items — gap + bridge suggestion
}

export interface DetailedCategory {
  score: number;
  covered: DetailedRatingItem[];
  missing: DetailedRatingItem[];
}

export interface JobTitleRating {
  matched: boolean;
  jd_title: string;
  resume_title: string;
  score: number;
  detail: string;
}

export interface ContextualKeyword {
  keyword: string;
  count: number;
}

export interface KeywordsRating {
  /** Categorised keyword data (new schema) */
  direct_skills?: { found: string[]; missing: string[] };
  contextual?: { found: ContextualKeyword[]; missing: string[] };
  /** Legacy flat arrays — present when backend returns old format */
  found?: string[];
  missing?: string[];
  found_count: number;
  total_count: number;
}

export interface RatingsData {
  // Legacy fields (always present for backwards compat)
  match_score: number;
  criteria: Criterion[];
  whats_working: string[];
  gaps: string[];
  verdict: string;
  // New detailed fields (present when using new scoring schema)
  overall_score?: number;
  job_title?: JobTitleRating;
  qualifications?: DetailedCategory;
  responsibilities?: DetailedCategory;
  keywords?: KeywordsRating;
}

export function isDetailedRatings(r: RatingsData): r is RatingsData & {
  overall_score: number;
  job_title: JobTitleRating;
  qualifications: DetailedCategory;
  responsibilities: DetailedCategory;
  keywords: KeywordsRating;
} {
  return !!(r.qualifications && r.responsibilities && r.keywords && r.job_title);
}

export interface DiffLine {
  type: "add" | "remove" | "context" | "hunk";
  text: string;
}

export interface ChangeRationale {
  type: "added" | "removed" | "rewrote";
  text: string;
  previous?: string;
  why: string;
}

export interface Source {
  title: string;
  url: string;
}

export interface ResumeRecord {
  id: string;
  folder: string;
  company: string;
  role: string;
  model_used: string;
  tex_path: string | null;
  pdf_url: string | null;
  score: number | null;
  verdict: string | null;
  /** Job description text from the last tailor run — used to prefill Builder when tailoring again. */
  job_description?: string | null;
  resume_doc?: Record<string, unknown> | null;
  applied_patch?: Record<string, unknown> | null;
  renderer?: "legacy" | "structured" | null;
  schema_version?: number | null;
  /** Lowercase segment for public URL `/r/?id=<public_slug>`. */
  public_slug?: string | null;
  /** Single primary resume per account (library ordering + “default link” UX). */
  is_default?: boolean;
  created_at: string;
  user_id?: string;
  criteria?: Criterion[];
}

export interface GenerationResult {
  folder: string | null;
  baseFolder: string | null;
  baseLoaded: boolean | null;
  texPath: string | null;
  pdfUrl: string | null;
  ratings: RatingsData | null;
  diff: DiffLine[];
  adds: number;
  removes: number;
  rationales: ChangeRationale[];
  sources: Source[];
  latexPreview: string;
  status: string;
}

// ── Parsed resume tree (for the bullet editor) ────────────────────────────
//
// We keep this *deliberately shallow* — sections → entries → bullets — because
// that's the only structure users actually edit. Headers stay as a single
// string; we don't try to reverse-engineer the LaTeX macro that built them
// (different templates use different commands and parsing all of them is a
// rabbit hole). Instead, on save we splice edited bullet text back into the
// original .tex by line offsets the parser captured. Lossless round-trip,
// zero re-formatting risk.
export interface ParsedBullet {
  id: string;       // stable client-side id (uuid-ish)
  text: string;     // plain text — \textbf{x} / **x** rendered as **x** in the editor
  texLine: number;  // 0-indexed line in source .tex (-1 for newly added bullets)
}

export interface ParsedEntry {
  header: string;              // e.g. "Bloomberg | Senior SWE | 2022-Present"
  // ── Per-entry bookkeeping the backend uses to do block-replace on save.
  // The frontend treats these as opaque pass-through fields — never mutate
  // them; only mutate `bullets` (add / remove / reorder freely).
  headerLine?: number;
  indent?: string;
  useListMacros?: boolean;
  bulletBlockStart?: number;
  bulletBlockEnd?: number;
  bullets: ParsedBullet[];
}

export interface ParsedSection {
  name: string;                // e.g. "Experience", "Projects"
  entries: ParsedEntry[];
  editable: boolean;           // backend-driven; presently no sections are locked
}

// Contact header — name, location, links, email, phone. Lives in the LaTeX
// preamble between marker comments so the parser can find / rewrite it
// losslessly. May be `null` for very old resumes that predate the markers
// AND don't have any tabular header at all.
export interface ParsedContact {
  blockStart:   number;
  blockEnd:     number;
  marked:       boolean;
  /** True when the parser couldn't find a real marker block and is handing
   *  back a default-filled synthetic; the splicer inserts a fresh block on
   *  save so subsequent edits become a normal in-place rewrite. */
  synthetic?:   boolean;
  name:         string;
  location:     string;
  website:      string;
  websiteUrl:   string;
  linkedin:     string;
  linkedinUrl:  string;
  github:       string;
  githubUrl:    string;
  email:        string;
  phone:        string;
  locationLabel?: string;
  emailLabel?: string;
  phoneLabel?: string;
  customFields?: Array<{ id: string; label: string; value: string }>;
}

export interface ParsedResume {
  sections: ParsedSection[];
  rawTex: string;              // original .tex — needed so backend can splice
  contact?: ParsedContact | null;
  pdfLayout?: {
    pageSize?: "a4" | "letter";
    density?: "compact" | "standard" | "spacious";
    fontScale?: -1 | 0 | 1;
  };
}

// SSE event shapes from Python backend
export type SSEEvent =
  | { event: "status";  msg: string }
  | { event: "chunk";   text: string }
  | { event: "sources"; urls: Source[] }
  | { event: "search_query";  query: string }                 // Live: a web search query from this AI run
  | { event: "search_source"; title: string | null; url: string }  // Live: a page cited from web research
  | { event: "base";    folder: string; loaded: boolean; chars: number }
  | { event: "diff";    data: DiffLine[]; adds: number; removes: number }
  | { event: "rationales"; data: ChangeRationale[] }
  | { event: "ratings"; data: RatingsData }
  | { event: "saved";   folder: string; tex_path: string }
  | { event: "pdf";     url: string }
  | { event: "storage"; artifact: "pdf" | "tex"; stored: boolean; url?: string; reason?: string }
  | { event: "done" }
  | { event: "error";   msg: string };

export type { ResumeDoc, ResumeTemplate } from "@/lib/resumeDoc";
export type { ResumeEdit, ResumeEditOp, LlmResumePatch } from "@/lib/resumeEdits";

export interface AdminAnalyticsSummary {
  total_runs: number;
  total_tokens: number;
  success_runs: number;
  failed_runs: number;
  unique_users: number;
  unique_tools: number;
  unique_models: number;
}

export interface AdminAnalyticsResponse {
  window_days: number;
  summary: AdminAnalyticsSummary;
  users: Array<{ user_id: string; user_email: string | null; runs: number; tokens: number; tools: Record<string, number> }>;
  tools: Array<{ tool_name: string; runs: number; tokens: number }>;
  models: Array<{ model: string; runs: number; tokens: number }>;
  daily: Array<{ date: string; runs: number; tokens: number; failures: number }>;
}
