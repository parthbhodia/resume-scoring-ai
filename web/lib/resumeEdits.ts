export type ResumeEditOp = "replace" | "append" | "remove" | "move";

export type ResumeEdit = {
  op: ResumeEditOp;
  path: string;
  value?: unknown;
  to?: string;
  reason?: string;
};

export type LlmResumePatch = {
  edits: ResumeEdit[];
  rationale?: string[];
  warnings?: string[];
};
