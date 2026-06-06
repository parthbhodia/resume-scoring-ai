/** Static config for the Interview Prep workflow (no mock resume data). */

export type WorkflowStep = {
  id: number;
  label: string;
  /** Only the active step is interactive; future steps render disabled. */
  enabled: boolean;
};

export const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: 1, label: "Resume & Job Details", enabled: true },
  { id: 2, label: "Interview Type", enabled: false },
  { id: 3, label: "Practice Setup", enabled: false },
  { id: 4, label: "Prep Dashboard", enabled: false },
];

export const SUGGESTED_COMPANIES = [
  "Google",
  "Amazon",
  "Meta",
  "Microsoft",
  "Stripe",
  "Apple",
];
