export interface Criterion {
  name: string;
  weight: "High" | "Medium" | "Low";
  score: number;         // 1-10
  notes: string;
}

export interface RatingsData {
  match_score: number;
  criteria: Criterion[];
  whats_working: string[];
  gaps: string[];
  verdict: string;
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
}

export interface ParsedResume {
  sections: ParsedSection[];
  rawTex: string;              // original .tex — needed so backend can splice
  contact?: ParsedContact | null;
}

// SSE event shapes from Python backend
export type SSEEvent =
  | { event: "status";  msg: string }
  | { event: "chunk";   text: string }
  | { event: "sources"; urls: Source[] }
  | { event: "search_query";  query: string }                 // Live: a Google query Gemini just issued
  | { event: "search_source"; title: string | null; url: string }  // Live: a page Gemini just cited
  | { event: "base";    folder: string; loaded: boolean; chars: number }
  | { event: "diff";    data: DiffLine[]; adds: number; removes: number }
  | { event: "rationales"; data: ChangeRationale[] }
  | { event: "ratings"; data: RatingsData }
  | { event: "saved";   folder: string; tex_path: string }
  | { event: "pdf";     url: string }
  | { event: "storage"; artifact: "pdf" | "tex"; stored: boolean; url?: string; reason?: string }
  | { event: "done" }
  | { event: "error";   msg: string };
