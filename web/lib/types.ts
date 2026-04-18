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
  texPath: string | null;
  pdfUrl: string | null;
  ratings: RatingsData | null;
  diff: DiffLine[];
  adds: number;
  removes: number;
  sources: Source[];
  latexPreview: string;
  status: string;
}

// SSE event shapes from Python backend
export type SSEEvent =
  | { event: "status";  msg: string }
  | { event: "chunk";   text: string }
  | { event: "sources"; urls: Source[] }
  | { event: "diff";    data: DiffLine[]; adds: number; removes: number }
  | { event: "ratings"; data: RatingsData }
  | { event: "saved";   folder: string; tex_path: string }
  | { event: "pdf";     url: string }
  | { event: "done" }
  | { event: "error";   msg: string };
