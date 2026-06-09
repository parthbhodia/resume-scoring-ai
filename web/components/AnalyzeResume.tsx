"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent } from "react";
import { useSearchParams } from "next/navigation";
import ScoreRing from "./ScoreRing";
import BulletImprovedEditor from "./BulletImprovedEditor";
import {
  buildBulletPrimaryCategories,
  bulletBelongsToCategory,
  bulletMatchesAnalysisCategory,
  countBulletsInCategory,
  getRewriteForCategory,
  cleanAiArtifacts,
  inferPrimaryCategoryFromBullet,
  isLanguageQualityMicroRewrite,
  isTrivialRewrite,
  type CategoryAssignmentOptions,
} from "@/lib/analysisCategoryMatch";
import { apiUrl } from "@/lib/utils";
import { apiErrorFromUnknown, toUserFriendlyErrorMessage } from "@/lib/userFriendlyError";
import { mergeAnalyzeApiJson } from "@/lib/mergeAnalyzeApiJson";
import { stripResumeBulletPrefix } from "@/lib/stripResumeBulletPrefix";
import { useResumeAnalyzeStore } from "@/store/resumeAnalyzeStore";
import type { StructuredResume, BulletMapEntry } from "@/store/resumeAnalyzeStore";
import { getSupabaseClient, fetchAnalyses, insertAnalysis, deleteAnalysis } from "@/lib/supabase";
import type { AnalyzeRecord } from "@/lib/supabase";
import AnalyzePreviewPane from "@/components/AnalyzePreviewPane";
import {
  AnalyzeUploadLanding,
  AnalyzeCoachLoader,
  ANALYZE_LOADER_STEPS,
  ANALYZE_COACH_TIPS,
} from "@/components/AnalyzeExperience";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAppShellSidebar } from "@/contexts/AppShellSidebarContext";

// ── Interfaces ────────────────────────────────────────────────────────────────
// Full strongly-typed shape of the AI analysis response.
// AnalyzeRecord is imported from @/lib/supabase (result typed as `any` for
// JSON column flexibility); we cast result → AnalysisResult when reading.

interface RequirementConceptFE {
  id: string;
  canonical: string;
  aliases: string[];
  type: string;
  importance: "required" | "preferred" | "nice_to_have";
  roleFamily: string;
  sourceText: string;
  confidence: number;
}

interface JdMatchBreakdown {
  job_title:        { score: number; matched: boolean; evidence: string[] };
  qualifications:   { total: number; covered: number; missing: number };
  responsibilities: { total: number; covered: number; missing: number };
  keywords: {
    required_total:   number;
    required_found:   number;
    preferred_total:  number;
    preferred_found:  number;
  };
  overall_score: number;
}

interface ScoringMeta {
  scoring_model:     string;
  scoring_version:   string;
  prompt_version:    string;
  scoring_algorithm: string;
}

interface AnalysisResult {
  overallScore: number;
  categoryScores: {
    readability: number;
    atsCompatibility: number;
    jobMatch: number | null;
    achievementQuality: number;
    quantification: number;
    sectionStructure: number;
    languageQuality: number;
    technicalBranding: number;
  };
  /** Per-category 1–2 sentence explanation of why that score was assigned. */
  categoryRationales?: Partial<Record<keyof AnalysisResult["categoryScores"], string>>;
  summary: string;
  topStrengths: string[];
  topIssues: Array<{
    issue: string;
    severity: "low" | "medium" | "high";
    whyItMatters: string;
    suggestion: string;
    /** Explicit categoryScores key (backend-authoritative for deterministic checks). */
    category?: keyof AnalysisResult["categoryScores"];
    /** Concrete offending items (bullets, words, phrases) to list under the issue. */
    items?: string[];
    /** "deterministic" for rule-based recruiter checks surfaced by the backend. */
    source?: string;
  }>;
  atsWarnings: Array<{ warning: string; suggestion: string }>;
  keywordAnalysis: {
    matchedKeywords: string[];
    missingKeywords: string[];
    keywordScore: number | null;
    suggestions: string[];
  };
  bulletAnalysis: Array<{
    originalBullet: string;
    score: number;
    issues: string[];
    improvedBullet: string;
    categoryRewrites?: Partial<Record<string, string>>;
    /** Backend-authoritative category bucketing (see analysisCategoryMatch). */
    primaryCategory?: string;
    issueCategories?: string[];
  }>;
  /** Plain text from PDF/LaTeX extraction — drives live preview when present. */
  extractedText?: string;
  /** Name + contact lines extracted before the first section heading. */
  resumeHeader?: string[];
  /** Faithfully-extracted structured model (no JD tailoring). */
  structuredResume?: StructuredResume | null;
  /** Maps flat bulletAnalysis[i] → {experienceIdx, bulletIdx} in structuredResume. */
  bulletMap?: BulletMapEntry[];
  sectionFeedback: Array<{ section: string; score: number; feedback: string }>;
  rewriteSuggestions: Array<{ before: string; after: string; reason: string }>;
  finalRecommendations: string[];
  /** Deterministic document-level ATS / structural flags (LinkedIn, open dates, misclassified sections, separators). */
  structuralFlags?: Array<{ issue: string; risk: string; severity?: "high" | "medium" | "low" }>;
  /** When analysis used a library folder (TeX on disk), persisted so history restore can reopen Builder with `base=`. */
  libraryFolder?: string | null;
  /** Merged professional tenure from structuredResume.experience dates. */
  experienceSummary?: {
    totalMonths: number;
    totalYearsLabel: string;
    roleCount: number;
    datedRoleCount: number;
    roles: Array<{
      company: string;
      role: string;
      dates: string;
      months: number;
    }>;
  };
  /** Deterministic JD match score (0–100). Present only when a JD was supplied. */
  jdMatchScore?: number | null;
  /** Per-bucket breakdown of the deterministic JD match scoring. */
  jdMatchBreakdown?: JdMatchBreakdown | null;
  /** Structured JD requirements extracted by the LLM (one entry per concept). */
  requirementConcepts?: RequirementConceptFE[];
  /** Provenance/version metadata for the deterministic scorer. */
  scoringMeta?: ScoringMeta | null;
  /** Set when backend persisted this run (analyze-upload). */
  analysisId?: string;
  /** True when backend wrote resume_analyses; false/absent means client should insert. */
  analysisPersisted?: boolean;
  sourcePdfUrl?: string | null;
  sourceFilename?: string | null;
  scanLimitStatus?: { limit: number; used: number; remaining: number; resetAt: string } | null;
}


// ── Helpers ─────────────────────────────────────────────────────────────────

const SCORE_NEEDS_EXPLANATION = 95;

function scoreColor(score: number | null): string {
  if (score === null) return "var(--border)";
  if (score >= 80) return "var(--green)";
  if (score >= 60) return "var(--yellow)";
  return "var(--red)";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Good";
  return "Needs Work";
}

function severityColor(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "var(--red)";
  if (severity === "medium") return "#f59e0b";
  return "var(--accent)";
}

function severityBg(severity: "low" | "medium" | "high"): string {
  if (severity === "high") return "rgba(248,113,113,0.12)";
  if (severity === "medium") return "rgba(245,158,11,0.12)";
  return "rgba(99,102,241,0.12)";
}

const CATEGORY_LABELS: Array<{ key: keyof AnalysisResult["categoryScores"]; label: string }> = [
  { key: "readability", label: "Readability" },
  { key: "atsCompatibility", label: "ATS Safety" },
  { key: "jobMatch", label: "Job Match" },
  { key: "achievementQuality", label: "Achievement" },
  { key: "quantification", label: "Quantification" },
  { key: "sectionStructure", label: "Structure" },
  { key: "languageQuality", label: "Language" },
  { key: "technicalBranding", label: "Field & depth" },
];

function flaggedBulletFixChip(
  activeCategory: keyof AnalysisResult["categoryScores"] | null,
  isLanguageMicroEdit: boolean,
): string {
  if (isLanguageMicroEdit) return "Proofreading";
  if (!activeCategory) return "Fix";
  return CATEGORY_LABELS.find(c => c.key === activeCategory)?.label ?? "Fix";
}

/**
 * Plain-language coaching for a flagged bullet, written for a new grad who has
 * never built a résumé. Each entry answers the three questions a confused
 * student actually has: why is this weak, what do I do, and what does good
 * look like? Keyed by the analysis category the bullet was flagged under.
 */
type CategoryCoach = { why: string; how: string; example: string };

const CATEGORY_COACH: Partial<Record<keyof AnalysisResult["categoryScores"], CategoryCoach>> = {
  achievementQuality: {
    why: "Right now this says what you were responsible for, not what changed because of you. Recruiters skim for results, not duties.",
    how: "Start with a strong action verb and end with the outcome: what got better, faster, cheaper, or bigger?",
    example: "“Responsible for onboarding design” → “Redesigned onboarding, cutting setup time ~40% for 500+ new users.”",
  },
  quantification: {
    why: "Numbers make a line believable and easy to skim. “Improved the flow” is vague; “cut it from 3 weeks to 1” sticks.",
    how: "Add any real figure: people, %, time, money, or scale. No exact number? A rough count or range still helps.",
    example: "“Grew community engagement” → “Grew engagement 40% across 2 social channels.”",
  },
  sectionStructure: {
    why: "This line tries to do too much at once, or it’s the only bullet for the role. Recruiters scan fast, so each line should carry one clear idea.",
    how: "Split it into 2–4 short bullets for the job, each leading with an action and ending with a result.",
    example: "One long line → “Led UX for the AI Automation team.” + “Shipped 3 product flows now used across 4 product teams.”",
  },
  languageQuality: {
    why: "Small wording slips like the wrong tense, passive voice, or filler make a line read less confident than you are.",
    how: "Use past tense for past roles, start with the action, and cut empty words like “responsible for” or “various.”",
    example: "“Was responsible for various design tasks” → “Designed and shipped the team’s design system.”",
  },
  readability: {
    why: "Long, dense lines are hard to skim, and a recruiter spends only seconds on each résumé.",
    how: "Keep every bullet to one or two lines. Put the important part first and trim the rest.",
    example: "A 3-line run-on → one tight line that leads with the result.",
  },
  technicalBranding: {
    why: "This line doesn’t show the specific tools or methods that prove you can actually do the work in your field.",
    how: "Name the real tools, methods, or systems you used, the ones a hiring manager in your field looks for.",
    example: "“Did user research” → “Ran 12 usability tests in Figma + Maze, turning findings into a service blueprint.”",
  },
};

const COACH_BODY_STYLE: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.55,
  color: "var(--muted)",
  margin: 0,
};

// Category icons (SVG paths)
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  quantification:     <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 12h2v2H2zM6 9h2v5H6zM10 6h2v8h-2zM14 3h-2v11h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  achievementQuality: <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2l1.8 3.6 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.1 6.2l4-.6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>,
  languageQuality:    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  readability:        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 3h12v10H2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  atsCompatibility:   <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  sectionStructure:   <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="2" y="7" width="7" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/><rect x="2" y="12" width="9" height="2" rx="1" stroke="currentColor" strokeWidth="1.3"/></svg>,
  technicalBranding:  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M5 4l-3 4 3 4M11 4l3 4-3 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 3l-2 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  jobMatch:           <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  quantification:     "Aim for metrics on ~75% of experience bullets, prioritizing your biggest wins.",
  achievementQuality: "Outcomes and ownership, not duty lists.",
  languageQuality:    "Active verbs; less passive voice and filler.",
  readability:        "Short, clear bullets recruiters can skim fast.",
  atsCompatibility:   "ATS-safe layout and standard section headings.",
  sectionStructure:   "Right sections, in the order recruiters expect.",
  technicalBranding:  "Clear tools, credentials, and field signals.",
  jobMatch:           "Keywords and experience that match the job.",
};

// Map top-issue text keywords to category keys for smart linking
const ISSUE_TEXT_TO_CATEGORY: Array<{ patterns: string[]; key: keyof AnalysisResult["categoryScores"] }> = [
  {
    patterns: [
      "weak action", "weak verb", "duty-only", "responsible for", "task-focused",
      "vague outcome", "no achievement", "duty list",
    ],
    key: "achievementQuality",
  },
  { patterns: ["quantif", "metric", "no numbers", "measur", "lack of data", "numeric", "no metrics"], key: "quantification" },
  { patterns: ["language", "verb", "passive", "buzzword", "communication", "word"], key: "languageQuality" },
  { patterns: ["readab", "length", "format", "clarity", "long", "short"], key: "readability" },
  { patterns: ["ats", "applicant", "tracking", "keyword", "scan"], key: "atsCompatibility" },
  { patterns: ["section", "structure", "summary", "objective", "order"], key: "sectionStructure" },
  {
    patterns: [
      "github", "gitlab", "portfolio", "tech stack", "full stack", "technical stack", "stack depth",
      "technical branding", "writing sample", "work sample", "teaching portfolio", "clinical credential",
      "licensure", "board certified", "certification gap", "creative reel", "publications section",
      "domain expertise", "field-specific",
    ],
    key: "technicalBranding",
  },
  { patterns: ["job match", "fit", "requirement", "relevance"], key: "jobMatch" },
];

function guessIssueCategory(issueText: string): keyof AnalysisResult["categoryScores"] | null {
  const lower = issueText.toLowerCase();
  for (const { patterns, key } of ISSUE_TEXT_TO_CATEGORY) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return null;
}

/** Category for a topIssue: trust the backend's explicit `category` (deterministic
 *  checks set it authoritatively); fall back to the text heuristic for LLM issues. */
function issueCategoryOf(
  issue: AnalysisResult["topIssues"][number],
): keyof AnalysisResult["categoryScores"] | null {
  if (issue.category) return issue.category;
  return guessIssueCategory(`${issue.issue} ${issue.whyItMatters} ${issue.suggestion}`);
}

function getBulletsForCategory(
  key: string,
  bulletAnalysis: AnalysisResult["bulletAnalysis"],
  opts?: CategoryAssignmentOptions,
): AnalysisResult["bulletAnalysis"] {
  return bulletAnalysis.filter((b, i) =>
    bulletBelongsToCategory(b, key, bulletAnalysis, i, opts),
  );
}

function formatExperienceTenureChip(summary: AnalysisResult["experienceSummary"]): string | null {
  if (!summary) return null;
  const { totalYearsLabel, roleCount, datedRoleCount } = summary;
  if (datedRoleCount === 0 && roleCount === 0) return null;
  const rolePart = roleCount === 1 ? "1 role" : `${roleCount} roles`;
  if (datedRoleCount === 0) return `${rolePart} · dates not parsed`;
  return `${totalYearsLabel} · ${rolePart}`;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
    >
      <circle cx="9" cy="9" r="7" stroke="var(--border)" strokeWidth="2.5" />
      <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

// ── Analyze history helpers ───────────────────────────────────────────────────
// Primary store: Supabase `resume_analyses` table (cross-device, permanent).
// Offline fallback: localStorage `rn_az_history_<userId>` (same AnalyzeRecord[]).

const LS_KEY  = (uid: string) => `rn_az_history_${uid}`;
const LS_MAX  = 20;

function lsLoad(uid: string): AnalyzeRecord[] {
  try { const r = localStorage.getItem(LS_KEY(uid)); return r ? JSON.parse(r) : []; }
  catch { return []; }
}
function lsSave(uid: string, recs: AnalyzeRecord[]) {
  try { localStorage.setItem(LS_KEY(uid), JSON.stringify(recs.slice(0, LS_MAX))); }
  catch { /* quota */ }
}
function lsPush(uid: string, rec: AnalyzeRecord) {
  lsSave(uid, [rec, ...lsLoad(uid)]);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AnalyzeResume() {
  const searchParams = useSearchParams();
  const appShellSidebar = useAppShellSidebar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [scansRemaining, setScansRemaining] = useState<number | null>(null);
  const [result, setResult]             = useState<AnalysisResult | null>(null);
  const [jd, setJd]                     = useState("");
  const [loadingMsg, setLoadingMsg]     = useState(0);
  const [loadingTipIdx, setLoadingTipIdx] = useState(0);
  const [expandedBullets, setExpandedBullets] = useState<Record<number, boolean>>({});
  const [historyOpen, setHistoryOpen]   = useState(false);
  // Mobile/tablet: the score + category header collapses to a slim bar by
  // default so the résumé preview isn't pushed off-screen. Tap to expand.
  const [mobileHeadExpanded, setMobileHeadExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  /** Accordion for category-detail flagged bullets (`bulletAnalysis` index, or null = all collapsed). */
  const [expandedFlaggedBulletIdx, setExpandedFlaggedBulletIdx] = useState<number | null>(null);
  /** When a category switch is triggered by clicking a bullet in the preview,
   *  remember which bullet to auto-expand so the [activeCategory] effect opens
   *  *that* card instead of defaulting to the first flagged one. */
  const pendingExpandIdxRef = useRef<number | null>(null);
  const restoredFromUrlRef = useRef(false);
  /** Desktop: recent-analyses / improvement-plan column — open by default; user can hide via toggle. */
  const [improvementPlanVisible, setImprovementPlanVisible] = useState(true);
  const [selectedBulletIndex, setSelectedBulletIndex] = useState<number | null>(null);
  /** User picked a row from Recent Analyses — original upload file is not available until they upload again. */
  const [historyRestoreActive, setHistoryRestoreActive] = useState(false);
  /** Keys local preview-edit drafts (`rn_az_edit_v1_*` in localStorage); set to history row id or optimistic `local_*` id. */
  const [activeEditDraftId, setActiveEditDraftId] = useState<string | null>(null);
  const [editDraftStatus, setEditDraftStatus] = useState<string | null>(null);
  const [azHistory, setAzHistory]           = useState<AnalyzeRecord[]>([]);
  const [userId, setUserId]                 = useState<string | null>(null);
  const [userEmail, setUserEmail]           = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const rewriteEdits = useResumeAnalyzeStore((s) => s.rewriteEdits);
  const patchRewrite = useResumeAnalyzeStore((s) => s.patchRewrite);
  const previewLineOverrides = useResumeAnalyzeStore((s) => s.lineOverrides);
  const persistEdits = useResumeAnalyzeStore((s) => s.persistEdits);
  const restoreEdits = useResumeAnalyzeStore((s) => s.restoreEdits);
  const clearEditsStore = useResumeAnalyzeStore((s) => s.clearEdits);
  const migrateEdits = useResumeAnalyzeStore((s) => s.migrateEdits);

  const analyzePreviewSnapshot = useMemo(
    () =>
      result
        ? {
            extractedText: result.extractedText ?? null,
            resumeHeader: Array.isArray(result.resumeHeader) ? result.resumeHeader : null,
            bulletAnalysis: Array.isArray(result.bulletAnalysis) ? result.bulletAnalysis : null,
          }
        : null,
    [result],
  );

  // Load user + history on mount: Supabase first, localStorage fallback
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.id) { setLoadingHistory(false); return; }
      setUserId(user.id);
      setUserEmail(user.email ?? null);
      // Seed from localStorage immediately so UI isn't empty while fetching
      setAzHistory(lsLoad(user.id));
      // Fetch scan quota so remaining count shows before the first scan
      supabase.auth.getSession().then(({ data: { session } }) => {
        const authHeader = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
        fetch(apiUrl("/api/scan-limit-status"), { headers: authHeader })
          .then(r => r.json())
          .then((data: Record<string, unknown>) => {
            if (data.enforced && !data.unlimited && typeof data.remaining === "number") {
              setScansRemaining(data.remaining as number);
            }
          })
          .catch(() => { /* non-critical */ });
      });
      try {
        const rows = await fetchAnalyses(20);
        setAzHistory(rows);
        lsSave(user.id, rows);          // keep local cache in sync
      } catch {
        // Network/auth error — stay on localStorage data
      } finally {
        setLoadingHistory(false);
      }
    });
  }, []);

  // Cycle loader steps and coach tips while analysis runs
  useEffect(() => {
    if (!loading) {
      setLoadingMsg(0);
      setLoadingTipIdx(0);
      return;
    }
    // Step delays (ms from start): reading fast, ATS medium, AI scoring slow, then hold at last step.
    // With JD a 5th "keyword matching" step is appended.
    const stepDelays = jd.trim() ? [5000, 13000, 25000, 38000] : [5000, 13000, 26000];
    const stepTimers = stepDelays.map((delay, i) => setTimeout(() => setLoadingMsg(i + 1), delay));
    const tipIv = setInterval(() => setLoadingTipIdx((t) => (t + 1) % ANALYZE_COACH_TIPS.length), 7000);
    return () => {
      stepTimers.forEach(clearTimeout);
      clearInterval(tipIv);
    };
  }, [loading, jd]);

  useLayoutEffect(() => {
    if (!result) {
      useResumeAnalyzeStore.getState().reset();
      return;
    }
    useResumeAnalyzeStore.getState().hydrateFromAnalysis({
      extractedText: result.extractedText,
      bulletAnalysis: result.bulletAnalysis,
      resumeHeader: result.resumeHeader,
      structuredResume: result.structuredResume,
      bulletMap: result.bulletMap,
    });
  }, [result]);

  /** Re-apply browser-stored preview edits after hydrate. */
  useEffect(() => {
    if (!result || !activeEditDraftId) return;
    const restored = restoreEdits(activeEditDraftId);
    if (restored) setEditDraftStatus("Loaded saved preview edits from this browser.");
  }, [result, activeEditDraftId, restoreEdits]);

  useEffect(() => {
    if (!editDraftStatus) return;
    const t = window.setTimeout(() => setEditDraftStatus(null), 4500);
    return () => clearTimeout(t);
  }, [editDraftStatus]);

  useEffect(() => {
    if (!feedbackToast) return;
    const t = window.setTimeout(() => setFeedbackToast(null), 5200);
    return () => clearTimeout(t);
  }, [feedbackToast]);

  // Persist result to Supabase + localStorage
  const persistResult = useCallback(async (label: string, res: AnalysisResult, forcedDraftId?: string) => {
    const optimistic: AnalyzeRecord = {
      id:        forcedDraftId ?? `local_${Date.now()}`,
      label,
      score:     res.overallScore,
      createdAt: new Date().toISOString(),
      result:    res,
    };
    // Optimistic update — show instantly
    setAzHistory(prev => [optimistic, ...prev].slice(0, 20));
    if (userId) lsPush(userId, optimistic);

    try {
      const backendPersisted = res.analysisPersisted === true;
      const backendId = backendPersisted ? (res.analysisId ?? null) : null;
      const sourcePdfUrl = res.sourcePdfUrl ?? null;
      const sourceFilename = res.sourceFilename ?? null;
      const newId = backendId ?? await insertAnalysis(label, res, {
        sourcePdfUrl,
        sourceFilename,
      });
      if (newId) {
        migrateEdits(optimistic.id, newId);
        setActiveEditDraftId((cur) => (cur === optimistic.id ? newId : cur));
        // Replace optimistic row with real DB id
        setAzHistory(prev => prev.map(r => r.id === optimistic.id ? { ...r, id: newId } : r));
        if (userId) lsSave(userId, azHistory.map(r => r.id === optimistic.id ? { ...r, id: newId } : r));
      }
    } catch { /* DB save failed — localStorage copy is still intact */ }
  }, [userId, azHistory]);

  const run = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    appShellSidebar?.collapseSidebar();

    setExpandedBullets({});
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setHistoryRestoreActive(false);
    const fd = new FormData();
    fd.append("file", file);
    if (jd.trim()) fd.append("jd", jd);
    if (userId)    fd.append("user_id", userId);
    if (userEmail) fd.append("user_email", userEmail);
    try {
      const supabase = getSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
      if (session?.user?.id) {
        fd.set("user_id", session.user.id);
        if (session.user.email) fd.set("user_email", session.user.email);
      }
      const resp = await fetch(apiUrl("/api/analyze-upload"), { method: "POST", body: fd, headers });
      const json = await resp.json();
      if (!resp.ok) {
        if (resp.status === 429 && json?.code === "daily_scan_limit_reached") {
          const limit = Number(json?.limit);
          const freeLimit = Number.isFinite(limit) && limit > 0 ? limit : 5;
          setFeedbackToast(
            `Daily limit reached. UMBC students get unlimited scans. Other users get ${freeLimit} scans/day for free.`,
          );
        }
        throw new Error(json.error || "Analysis failed");
      }
      const res = mergeAnalyzeApiJson(json as Record<string, unknown>) as unknown as AnalysisResult;
      const resWithMeta: AnalysisResult = { ...res, libraryFolder: null };
      const draftId = `local_${Date.now()}`;
      setActiveEditDraftId(draftId);
      setResult(resWithMeta);
      if (res.scanLimitStatus) {
        setScansRemaining(res.scanLimitStatus.remaining);
        const { remaining, limit } = res.scanLimitStatus;
        setFeedbackToast(
          remaining === 0
            ? `0 of ${limit} free scans remaining today · Resets at midnight UTC`
            : `${remaining} of ${limit} free scan${limit !== 1 ? "s" : ""} remaining today`,
        );
      }
      persistResult(file.name.replace(/\.(pdf|docx)$/i, ""), resWithMeta, draftId);
    } catch (e: unknown) {
      setError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [jd, persistResult, appShellSidebar]);

  const runFolder = useCallback(async (folder: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    appShellSidebar?.collapseSidebar();

    setExpandedBullets({});
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setHistoryRestoreActive(false);
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const resp = await fetch(apiUrl(`/api/analyze-folder/${encodeURIComponent(folder)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id ?? "", jd }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      const res = mergeAnalyzeApiJson(json as Record<string, unknown>) as unknown as AnalysisResult;
      const resWithMeta: AnalysisResult = { ...res, libraryFolder: folder };
      const draftId = `local_${Date.now()}`;
      setActiveEditDraftId(draftId);
      setResult(resWithMeta);
      persistResult(folder, resWithMeta, draftId);
    } catch (e: unknown) {
      setError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, [jd, persistResult, appShellSidebar]);

  // Restore a cached result instantly — no re-analysis needed
  const restoreRecord = useCallback((rec: AnalyzeRecord) => {
    setActiveEditDraftId(rec.id);
    const merged = mergeAnalyzeApiJson(rec.result as Record<string, unknown>) as unknown as AnalysisResult;
    setResult(merged);
    
    setExpandedBullets({});
    setHistoryOpen(false);
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setHistoryRestoreActive(true);
    setImprovementPlanVisible(true);
  }, []);

  useEffect(() => {
    if (restoredFromUrlRef.current || loadingHistory) return;
    const id = (searchParams?.get("analysis") ?? "").trim();
    if (!id) return;
    const rec = azHistory.find((row) => row.id === id);
    if (!rec) return;
    restoredFromUrlRef.current = true;
    restoreRecord(rec);
  }, [azHistory, loadingHistory, restoreRecord, searchParams]);

  const deleteRecord = useCallback(async (id: string) => {
    // Optimistic remove
    const next = azHistory.filter(r => r.id !== id);
    setAzHistory(next);
    if (userId) lsSave(userId, next);
    // Skip DB delete for optimistic local-only rows
    if (!id.startsWith("local_")) {
      try { await deleteAnalysis(id); } catch { /* ignore */ }
    }
  }, [userId, azHistory]);

  const azHistoryRows = useMemo(
    () =>
      azHistory.map((rec) => (
        <div
          key={rec.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 10px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "transparent",
            transition: "background var(--transition), border-color var(--transition)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "var(--amber-bg)";
            (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(196,121,58,0.3)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = "transparent";
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
          }}
        >
          <button
            type="button"
            onClick={() => restoreRecord(rec)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              padding: 0,
              minWidth: 0,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                flexShrink: 0,
                background: "var(--surface2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: scoreColor(rec.score),
              }}
            >
              {rec.score}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {rec.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 1 }}>
                {new Date(rec.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => deleteRecord(rec.id)}
            title="Remove"
            style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              flexShrink: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dim)",
              transition: "background var(--transition), color var(--transition)",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(248,113,113,0.15)";
              e.currentTarget.style.color = "var(--red)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--dim)";
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
              <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )),
    [azHistory, restoreRecord, deleteRecord],
  );

  const categoryAssignmentOpts = useMemo((): CategoryAssignmentOptions => {
    if (!result) return {};
    const kw = [
      ...(result.keywordAnalysis?.matchedKeywords ?? []),
      ...(result.keywordAnalysis?.missingKeywords ?? []),
    ]
      .map((k) => k.trim())
      .filter((k) => k.length >= 2);
    return { jdKeywords: kw };
  }, [result]);

  const bulletPrimaryCategories = useMemo(
    () => (result?.bulletAnalysis?.length
      ? buildBulletPrimaryCategories(result.bulletAnalysis, categoryAssignmentOpts)
      : []),
    [result, categoryAssignmentOpts],
  );

  const handleBulletLinkedSelect = useCallback(
    (index: number) => {
      useResumeAnalyzeStore.getState().pulseBullet(index);
      setSelectedBulletIndex(index);
      const b = result?.bulletAnalysis[index];
      if (!b) return;
      if (
        activeCategory
        && result
        && bulletMatchesAnalysisCategory(b, activeCategory, result.bulletAnalysis, index, categoryAssignmentOpts)
      ) {
        return;
      }
      setActiveCategory(
        inferPrimaryCategoryFromBullet(
          b,
          result?.bulletAnalysis,
          index,
          categoryAssignmentOpts,
        ) as keyof AnalysisResult["categoryScores"],
      );
    },
    [result, activeCategory, categoryAssignmentOpts],
  );

  // Clicking a bullet in the résumé preview should open that bullet's
  // suggestion card on the left. If the bullet belongs to a different
  // category than the one currently shown, switch to its primary category
  // first (the [activeCategory] effect then expands the pending bullet).
  const handleBulletSelectFromPreview = useCallback(
    (index: number) => {
      handleBulletLinkedSelect(index);
      // bulletPrimaryCategories is the authoritative per-bullet assignment
      // (same string[] that builds the rendered flagged list).
      const primaryCat = bulletPrimaryCategories[index];
      if (primaryCat && primaryCat !== activeCategory) {
        // Defer expansion to the [activeCategory] effect via the ref.
        pendingExpandIdxRef.current = index;
        setActiveCategory(primaryCat as keyof AnalysisResult["categoryScores"]);
      } else {
        // Same category already active (or none) — expand directly.
        setExpandedFlaggedBulletIdx(index);
      }
    },
    [handleBulletLinkedSelect, bulletPrimaryCategories, activeCategory],
  );

  const bulletBlurClearRef = useRef<number | null>(null);
  const cancelBulletSelectionClear = useCallback(() => {
    if (bulletBlurClearRef.current !== null) {
      clearTimeout(bulletBlurClearRef.current);
      bulletBlurClearRef.current = null;
    }
  }, []);
  const scheduleBulletSelectionClear = useCallback(() => {
    cancelBulletSelectionClear();
    bulletBlurClearRef.current = window.setTimeout(() => {
      bulletBlurClearRef.current = null;
      setSelectedBulletIndex(null);
    }, 220);
  }, [cancelBulletSelectionClear]);

  const onBulletWorkspaceTextareaFocus = useCallback(
    (index: number) => {
      cancelBulletSelectionClear();
      handleBulletLinkedSelect(index);
    },
    [cancelBulletSelectionClear, handleBulletLinkedSelect],
  );

  const onBulletWorkspaceTextareaBlur = useCallback(
    (index: number, e: FocusEvent<HTMLTextAreaElement>) => {
      const rt = e.relatedTarget as Node | null;
      const host = e.currentTarget.closest(`[data-az-bullet-workspace="${index}"]`);
      if (rt && host?.contains(rt)) return;
      scheduleBulletSelectionClear();
    },
    [scheduleBulletSelectionClear],
  );

  useEffect(
    () => () => {
      if (bulletBlurClearRef.current !== null) clearTimeout(bulletBlurClearRef.current);
    },
    [],
  );

  useEffect(() => {
    // Auto-open a flagged bullet card when a category is selected so users
    // immediately see the suggestion without having to click.
    if (!result?.bulletAnalysis) { setExpandedFlaggedBulletIdx(null); return; }
    if (activeCategory) {
      // If this category switch was triggered by clicking a bullet in the
      // preview, open *that* bullet's card. Otherwise default to the first
      // flagged bullet in the category.
      const pending = pendingExpandIdxRef.current;
      pendingExpandIdxRef.current = null;
      if (pending !== null) {
        setExpandedFlaggedBulletIdx(pending);
        return;
      }
      // Use the same per-bullet primary-category assignment that builds the
      // rendered flagged list, so "first flagged" matches what the user sees.
      const firstFlaggedIdx = result.bulletAnalysis.findIndex((b, i) =>
        bulletBelongsToCategory(b, activeCategory, result.bulletAnalysis, i, categoryAssignmentOpts),
      );
      setExpandedFlaggedBulletIdx(firstFlaggedIdx >= 0 ? firstFlaggedIdx : null);
    } else {
      setExpandedFlaggedBulletIdx(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory]);

  const onFile = (f: File | null | undefined) => {
    if (!f || !/\.(pdf|docx?)$/i.test(f.name)) { setError("Please upload a PDF or Word (.doc / .docx) file."); return; }
    run(f);
  };

  // Sort issues high → medium → low
  const sortedIssues = result?.topIssues
    ? [...result.topIssues].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  // Split categories into TOP FIXES (score < 70 AND has actionable content)
  // vs COMPLETED (score >= 70 OR low score but nothing actionable). A
  // category lacking any flagged bullets AND any related topIssue has no
  // real fix to surface — putting it in TOP FIXES leads to the dead-end
  // "No specific issues found" detail view the user shouldn't have to
  // click through. Honesty alignment with the rewrite-validator: if the
  // category has nothing to do, don't list it as a fix.
  /** Rule-based topIssues are regex-fallback only; hide on LLM runs (incl. saved history). */
  const isLlmTopIssue = (issue: AnalysisResult["topIssues"][number]) =>
    issue.source !== "deterministic";

  const categoryHasActionableContent = (key: string): boolean => {
    if (!result) return false;
    const bullets = getBulletsForCategory(
      key,
      result.bulletAnalysis,
      categoryAssignmentOpts,
    );
    if (bullets.length > 0) return true;
    const related = result.topIssues.filter(
      (issue) => isLlmTopIssue(issue) && issueCategoryOf(issue) === key,
    );
    return related.length > 0;
  };

  const topFixCategories = result
    ? CATEGORY_LABELS
        .filter(({ key }) => {
          const s = result.categoryScores[key];
          if (s === null || s === undefined) return false;
          if (s >= 70) return false;
          return categoryHasActionableContent(key);
        })
        .sort((a, b) => (result.categoryScores[a.key] ?? 100) - (result.categoryScores[b.key] ?? 100))
    : [];

  const completedCategories = result
    ? CATEGORY_LABELS.filter(({ key }) => {
        const s = result.categoryScores[key];
        if (s === null || s === undefined) return false;
        // Score >= 70 OR low-score-with-no-actionable-content (the latter
        // would otherwise be a flagged category the user can't act on).
        return s >= 70 || !categoryHasActionableContent(key);
      })
    : [];

  /** Résumé on the right, suggestions on the left (desktop/tablet split). */
  /** Résumé preview stays on whenever we have a result (no user toggle). */
  const workspaceSplit = !!result;

  // For the active category detail view
  const activeCategoryLabel = CATEGORY_LABELS.find(c => c.key === activeCategory)?.label ?? "";
  const activeCategoryScore = activeCategory && result ? result.categoryScores[activeCategory as keyof AnalysisResult["categoryScores"]] : null;
  const activeBullets = activeCategory && result
    ? getBulletsForCategory(activeCategory, result.bulletAnalysis, categoryAssignmentOpts)
    : [];
  const relatedTopIssues = activeCategory && result
    ? result.topIssues.filter(
        issue => isLlmTopIssue(issue) && issueCategoryOf(issue) === activeCategory,
      )
    : [];

  // Inline copy + editable AI-suggestion drafts (keyed by bulletAnalysis index)
  const [copiedBullet, setCopiedBullet] = useState<number | null>(null);
  const [fetchedCategoryRationales, setFetchedCategoryRationales] = useState<Record<string, string>>({});
  const [explainingCategory, setExplainingCategory] = useState<string | null>(null);
  const explainInflightRef = useRef<Set<string>>(new Set());
  const explainAttemptedRef = useRef<Set<string>>(new Set());

  const activeCategoryRationale = activeCategory && result
    ? (
        result.categoryRationales?.[activeCategory as keyof AnalysisResult["categoryScores"]]
        || fetchedCategoryRationales[activeCategory]
        || ""
      ).trim()
    : "";
  const activeCategoryNeedsExplanation =
    typeof activeCategoryScore === "number"
    && activeCategoryScore < SCORE_NEEDS_EXPLANATION;

  const patchBulletRewrite = useCallback((index: number, value: string | null) => {
    patchRewrite(index, value);
  }, [patchRewrite]);

  const patchPreviewLine = useCallback((index: number, value: string | null) => {
    if (value === null || value === "") {
      useResumeAnalyzeStore.getState().clearLineOverride(index);
      return;
    }
    useResumeAnalyzeStore.getState().setLineOverride(index, value);
  }, []);

  const copyBullet = useCallback(async (text: string, idx: number) => {
    try { await navigator.clipboard.writeText(text); }
    catch { /* ignore */ }
    setCopiedBullet(idx);
    setTimeout(() => setCopiedBullet(null), 2000);
  }, []);

  const explainCategoryScore = useCallback(async (category: string) => {
    if (!result) return;
    if (explainInflightRef.current.has(category)) return;
    const score = result.categoryScores[category as keyof AnalysisResult["categoryScores"]];
    if (score === null || score === undefined) return;
    const resumeText = (result.extractedText || "").trim();
    if (!resumeText) return;

    explainInflightRef.current.add(category);
    setExplainingCategory(category);
    try {
      const resp = await fetch(apiUrl("/api/explain-category-score"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          category_score: score,
          resume_text: resumeText,
          jd,
        }),
      });
      const json = await resp.json() as { rationale?: string; error?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not explain this score.");
      const rationale = (json.rationale ?? "").trim();
      if (rationale) {
        setFetchedCategoryRationales(prev => ({ ...prev, [category]: rationale }));
      }
    } catch (e: unknown) {
      setError(apiErrorFromUnknown(e));
    } finally {
      explainInflightRef.current.delete(category);
      setExplainingCategory(null);
    }
  }, [result, jd]);

  useEffect(() => {
    explainAttemptedRef.current = new Set();
    setFetchedCategoryRationales({});
  }, [result]);

  useEffect(() => {
    if (!activeCategory || !result || !activeCategoryNeedsExplanation) return;
    if (activeCategoryRationale) return;
    if (explainAttemptedRef.current.has(activeCategory)) return;
    if (!(result.extractedText || "").trim()) return;
    explainAttemptedRef.current.add(activeCategory);
    void explainCategoryScore(activeCategory);
  }, [
    activeCategory,
    result,
    activeCategoryNeedsExplanation,
    activeCategoryRationale,
    explainCategoryScore,
  ]);

  const startOverAnalyze = useCallback(() => {
    setResult(null);
    setError(null);
    setExpandedBullets({});
    setJd("");
    setHistoryOpen(false);
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setHistoryRestoreActive(false);
    setActiveEditDraftId(null);
    setEditDraftStatus(null);
    setImprovementPlanVisible(true);
  }, []);

  const saveLocalPreviewDraft = useCallback(() => {
    if (!activeEditDraftId) {
      setEditDraftStatus("Open an analysis first (upload or history).");
      return;
    }
    const lineOverrides = useResumeAnalyzeStore.getState().lineOverrides;
    persistEdits(activeEditDraftId);
    setEditDraftStatus("Saved preview edits in this browser only.");
  }, [activeEditDraftId, rewriteEdits]);

  const clearLocalPreviewDraft = useCallback(() => {
    if (!activeEditDraftId || !result) return;
    clearEditsStore(activeEditDraftId);
    useResumeAnalyzeStore.getState().hydrateFromAnalysis({
      extractedText: result.extractedText,
      bulletAnalysis: result.bulletAnalysis,
      resumeHeader: result.resumeHeader,
      structuredResume: result.structuredResume,
      bulletMap: result.bulletMap,
    });
    
    setEditDraftStatus("Cleared saved draft; preview reset to analysis text.");
  }, [activeEditDraftId, result]);

  /* ── Shared sidebar: pinned strip (score / recent header) + scrollable body ─── */
  const sidebarPinned = !result ? (
    <>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontFamily: "var(--font-sans), Inter, system-ui, sans-serif" }}>
        Recent Analyses
      </div>
      <div style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.45 }}>
        Saves scores and extracted résumé text to your account (not the original PDF file).
      </div>
    </>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 2 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#78909c", textTransform: "uppercase", letterSpacing: 1.15, marginBottom: 10, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        Improvement Plan
      </div>
      <ScoreRing score={result.overallScore} size={96} label="" />
      <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: scoreColor(result.overallScore) }}>
        {scoreLabel(result.overallScore)}
      </div>
      {formatExperienceTenureChip(result.experienceSummary) && (
        <div
          title="Parsed from experience section date ranges (internships included). Overlapping roles are merged."
          style={{
            marginTop: 8,
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--muted)",
            textAlign: "center",
            lineHeight: 1.45,
            padding: "4px 8px",
            borderRadius: 8,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            maxWidth: "100%",
          }}
        >
          {formatExperienceTenureChip(result.experienceSummary)}
        </div>
      )}
    </div>
  );

  const sidebarScroll = !result ? (
    <>
      {loadingHistory ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
              <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                <Skeleton className="h-[11px] rounded w-3/4" />
                <Skeleton className="h-[10px] rounded w-[55%]" />
              </div>
            </div>
          ))}
        </div>
      ) : azHistory.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--dim)", textAlign: "center", paddingTop: 24, lineHeight: 1.7 }}>
          No analyses yet.<br />
          <span style={{ fontSize: 12 }}>Upload a PDF above<br />to get started.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{azHistoryRows}</div>
      )}
    </>
  ) : (
    <>
          {/* Local preview draft — New Scan lives in the pinned sidebar header */}
          <div style={{
            marginBottom: 12,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border)",
          }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>
                Preview edits (local test)
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.45, marginBottom: 10 }}>
                Saves line tweaks + AI draft text in this browser. Re-open the same run from history to verify restore.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button
                  type="button"
                  onClick={saveLocalPreviewDraft}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border-h)",
                    background: "var(--surface3)",
                    color: "var(--text)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Save preview edits
                </button>
                <button
                  type="button"
                  onClick={clearLocalPreviewDraft}
                  style={{
                    width: "100%",
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--muted)",
                    fontSize: 11.5,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Clear saved draft
                </button>
              </div>
              {editDraftStatus ? (
                <div style={{ marginTop: 10, fontSize: 10.5, color: "var(--green)", lineHeight: 1.4 }}>
                  {editDraftStatus}
                </div>
              ) : null}
          </div>

          {/* Hint */}
          <div style={{
            fontSize: 10.5, color: "var(--dim)", marginBottom: 14,
            lineHeight: 1.5, display: "flex", alignItems: "flex-start", gap: 6,
          }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 5.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <circle cx="6" cy="4" r="0.6" fill="currentColor"/>
            </svg>
            Click a category or a bullet; they stay in sync. Copy improved text into your résumé.
          </div>

          {/* TOP FIXES */}
          {topFixCategories.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{
                fontSize: 9, fontWeight: 800, color: "var(--red)",
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)" }} />
                Top Fixes
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {topFixCategories.map(({ key, label }) => {
                  const score = result.categoryScores[key];
                  const isActive = activeCategory === key;
                  const affectedCount = countBulletsInCategory(result.bulletAnalysis, key, categoryAssignmentOpts);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedBulletIndex(null);
                        setActiveCategory(isActive ? null : key);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "9px 10px", borderRadius: 8, width: "100%",
                        border: `1px solid ${isActive ? "rgba(33,150,243,0.45)" : "var(--border)"}`,
                        background: isActive ? "rgba(227,242,253,0.85)" : "var(--surface2)",
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                        transition: "background 0.15s, border-color 0.15s",
                      }}
                      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border-h)"; } }}
                      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.borderColor = "var(--border)"; } }}
                    >
                      <span style={{ color: isActive ? "#1565c0" : "var(--dim)", flexShrink: 0 }}>
                        {CATEGORY_ICONS[key]}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </span>
                      {affectedCount > 0 && (
                        <Badge className="text-[10px] font-semibold px-1.5 py-0 h-4 bg-red/10 text-red border-0 shrink-0">
                          {affectedCount}
                        </Badge>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                        color: scoreColor(score),
                        minWidth: 24, textAlign: "right",
                      }}>
                        {score ?? "–"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* COMPLETED */}
          {completedCategories.length > 0 && (
            <div>
              <div style={{
                fontSize: 9, fontWeight: 800, color: "var(--green)",
                textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)" }} />
                Completed
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {completedCategories.map(({ key, label }) => {
                  const score = result.categoryScores[key];
                  const isActive = activeCategory === key;
                  // A category can land in COMPLETED with score >= 70 yet
                  // still have weak bullets attached (e.g. Achievement 82
                  // with one duty-only line). Surface the bullet count so
                  // the user knows there's still work available — softer
                  // amber styling distinguishes it from the red TOP FIXES
                  // badge so the visual hierarchy stays clear.
                  const affectedCount = countBulletsInCategory(result.bulletAnalysis, key, categoryAssignmentOpts);
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedBulletIndex(null);
                        setActiveCategory(isActive ? null : key);
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: 8, width: "100%",
                        border: `1px solid ${isActive ? "rgba(33,150,243,0.4)" : "var(--border)"}`,
                        background: isActive ? "rgba(227,242,253,0.75)" : "transparent",
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                        transition: "background 0.15s, border-color 0.15s",
                        opacity: isActive ? 1 : 0.8,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--surface2)"; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = isActive ? "1" : "0.8"; e.currentTarget.style.background = isActive ? "rgba(227,242,253,0.75)" : "transparent"; }}
                      title={affectedCount > 0
                        ? `${affectedCount} bullet${affectedCount === 1 ? "" : "s"} flagged in this category`
                        : "No flagged bullets in this category"}
                    >
                      <span
                        style={{
                          color: isActive ? "#1565c0" : "var(--green-ink, var(--green))",
                          flexShrink: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {CATEGORY_ICONS[key]}
                      </span>
                      <span style={{ flex: 1, fontSize: 11.5, fontWeight: 500, color: "var(--muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </span>
                      {affectedCount > 0 && (
                        <Badge className="text-[10px] font-semibold px-1.5 py-0 h-4 bg-amber/10 text-amber border-0 shrink-0">
                          {affectedCount}
                        </Badge>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", flexShrink: 0 }}>
                        {score ?? "–"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {azHistory.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
              <div style={{
                fontSize: 9,
                fontWeight: 800,
                color: "var(--amber)",
                textTransform: "uppercase",
                letterSpacing: 0.9,
                marginBottom: 8,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--amber)" }} aria-hidden />
                Past runs
              </div>
              <div style={{ maxHeight: 220, minHeight: 0, overflowY: "auto" }}>{azHistoryRows}</div>
            </div>
          )}
    </>
  );

  return (
    <div
      className={`az-shell${improvementPlanVisible ? "" : " az-desktop-sidebar-hidden"}${workspaceSplit ? " az-shell-workspace-split" : ""}`}
      style={{
        display: "flex",
        width: "100%",
        ...(workspaceSplit
          ? {
            flex: "1 1 0%",
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }
          : {
            flex: "1 1 0%",
            minHeight: 0,
            overflowX: "hidden" as const,
            overflowY: "auto" as const,
            alignItems: "stretch",
          }),
        background: "var(--bg)",
        position: "relative",
      }}
    >

      {feedbackToast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 16,
            bottom: 18,
            zIndex: 1200,
            maxWidth: "min(440px, calc(100vw - 32px))",
            padding: "12px 14px",
            borderRadius: 12,
            background: "rgba(30,41,59,0.96)",
            border: "1px solid rgba(148,163,184,0.32)",
            boxShadow: "0 14px 30px rgba(2,6,23,0.35)",
            color: "#f8fafc",
            fontSize: 12.5,
            lineHeight: 1.45,
            letterSpacing: -0.15,
          }}
        >
          {feedbackToast}
        </div>
      ) : null}

      {/* ── Mobile backdrop (close history drawer) ─── */}
      {historyOpen && (
        <button
          type="button"
          className="az-sidebar-scrim-mobile"
          aria-label="Close history panel"
          onClick={() => setHistoryOpen(false)}
        />
      )}

      {/* ── Desktop: dim page behind sliding improvement plan — opacity transition (no layout shift) ─── */}
      <button
        type="button"
        className={`az-sidebar-scrim-desktop${improvementPlanVisible ? " is-on" : ""}`}
        aria-label={improvementPlanVisible ? "Close improvement plan" : undefined}
        aria-hidden={!improvementPlanVisible}
        tabIndex={improvementPlanVisible ? 0 : -1}
        onClick={() => setImprovementPlanVisible(false)}
      />

      {/* ── Sidebar: inline sticky column on desktop; mobile keeps slide-over overlay ── */}
      <style>{`
        @keyframes az-scrim-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* ── Desktop: inline sidebar — stretches with shell height (no fixed 100vh) ── */
        .az-sidebar {
          width: min(320px, 40vw);
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          padding: 20px 14px;
          box-sizing: border-box;
          align-self: stretch;
          height: auto;
          min-height: 0;
          flex-grow: 0;
          position: relative;
          transition: width 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                      opacity 0.22s,
                      padding 0.28s,
                      border-color 0.28s;
        }
        .az-shell.az-desktop-sidebar-hidden .az-sidebar {
          width: 0;
          padding-left: 0;
          padding-right: 0;
          opacity: 0;
          overflow: hidden;
          border-right-color: transparent;
          pointer-events: none;
        }

        .az-sidebar-inner {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .az-sidebar-pinned {
          flex-shrink: 0;
          padding-bottom: 12px;
          margin-bottom: 4px;
          border-bottom: 1px solid var(--border);
        }
        .az-sidebar-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          padding-top: 4px;
        }
        @media (min-width: 1025px) {
          .az-sidebar {
            max-height: 100vh;
            max-height: 100dvh;
            display: flex;
            flex-direction: column;
          }
        }

        /* Desktop scrim never shows — sidebar is inline, not overlaying */
        .az-sidebar-scrim-desktop { display: none !important; }
        /* Collapsed score rail: compact affordances that expand the score/fix plan */
        .az-sidebar-restore-fab {
          display: none;
          position: fixed;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          z-index: 1001;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 6px;
          width: 58px;
          min-height: 82px;
          padding: 9px 6px;
          border-radius: 0 16px 16px 0;
          border: 1px solid var(--border);
          border-left: none;
          background: var(--surface);
          box-shadow: 2px 0 14px rgba(0,0,0,0.08);
          cursor: pointer;
          font-family: inherit;
          color: var(--text);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.02em;
          transition: background var(--transition), color var(--transition), box-shadow var(--transition);
        }
        .az-score-fab-score {
          min-width: 28px;
          height: 24px;
          padding: 0 5px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid currentColor;
          background: color-mix(in srgb, currentColor 10%, transparent);
          font-size: 12px;
          font-weight: 800;
          line-height: 1;
        }
        .az-score-fab-label {
          font-size: 9.5px;
          line-height: 1;
          color: var(--dim);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .az-sidebar-scan-fab {
          display: none;
          position: fixed;
          left: 0;
          top: calc(50% + 76px);
          transform: translateY(-50%);
          z-index: 1001;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 5px;
          width: 58px;
          min-height: 66px;
          padding: 8px 6px;
          border-radius: 0 16px 16px 0;
          border: 1px solid var(--border);
          border-left: none;
          background: var(--surface);
          box-shadow: 2px 0 14px rgba(0,0,0,0.08);
          cursor: pointer;
          font-family: inherit;
          color: var(--text);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: -0.02em;
          transition: background var(--transition), color var(--transition), box-shadow var(--transition);
        }
        .az-sidebar-scan-fab span {
          font-size: 9.5px;
          line-height: 1;
          color: var(--dim);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        @media (min-width: 1025px) {
          .az-sidebar-restore-fab.is-visible {
            display: inline-flex;
          }
          .az-sidebar-scan-fab.is-visible {
            display: inline-flex;
          }
        }

        /* Mobile: keep slide-over overlay (screen too narrow for inline) */
        .az-sidebar-scrim-mobile { display: none; }
        @media (max-width: 1024px) {
          .az-sidebar-scrim-mobile {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 999;
            margin: 0; padding: 0; border: none;
            background: rgba(15, 23, 42, 0.32);
            cursor: pointer;
            animation: az-scrim-in 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          .az-resume-panel { display: none !important; }
          .az-sidebar {
            position: fixed;
            top: 0; left: 0; bottom: 0;
            z-index: 1000;
            width: min(296px, 92vw);
            height: auto;
            max-height: 100dvh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 8px 0 32px rgba(15, 23, 42, 0.14);
            transform: translateX(-100%);
            pointer-events: none;
            transition: transform 0.34s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 1;
            border-right: 1px solid var(--border);
          }
          .az-sidebar.open {
            transform: translateX(0);
            pointer-events: auto;
          }
          .az-shell.az-desktop-sidebar-hidden .az-sidebar {
            width: min(296px, 92vw);
            padding: 20px 14px;
            opacity: 1;
            overflow: hidden;
            border-right-color: var(--border);
          }
          .az-main { padding: 20px 16px 60px !important; -webkit-overflow-scrolling: touch; }
        }

        .az-resume-panel {
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          width: min(420px, 38vw);
          position: sticky;
          top: 0;
          height: 100vh;
          overflow: hidden;
          border-left: 1px solid var(--border);
        }
        .az-resume-panel.hidden { display: none !important; }

        .az-desktop-sidebar-toggle {
          display: none;
          align-items: center;
          justify-content: center;
        }
        @media (min-width: 1025px) {
          .az-desktop-sidebar-toggle { display: inline-flex; }
        }

        @media (prefers-reduced-motion: reduce) {
          .az-sidebar { transition-duration: 0.01ms !important; }
          .az-sidebar-scrim-mobile { animation: none !important; opacity: 1; }
        }

        /* Desktop workspace: main area height-bounded so only the work column scrolls */
        @media (min-width: 1025px) {
          .az-shell.az-shell-workspace-split {
            flex: 1 1 0%;
            min-height: 0;
            overflow: hidden;
            align-items: stretch;
          }
        }
        .az-mobile-only { display: flex; }
        @media (min-width: 1025px) { .az-mobile-only { display: none !important; } }
      `}</style>
      <aside className={`az-sidebar${historyOpen ? " open" : ""}`}>
        {result && (
          <button
            type="button"
            onClick={startOverAnalyze}
            title="Go back to Analyze home and start a fresh scan"
            style={{
              width: "100%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "7px 12px",
              marginBottom: 12,
              borderRadius: 8,
              border: "none",
              background: "var(--amber)",
              color: "#fff",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              letterSpacing: -0.05,
              transition: "opacity var(--transition)",
              boxSizing: "border-box",
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "0.92"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 2v9M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
            New Scan
          </button>
        )}
        {/* Sidebar header with close button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.8 }}>
            Improvement Plan
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className="az-desktop-sidebar-toggle"
              onClick={() => setImprovementPlanVisible(false)}
              title="Hide improvement plan for more space"
              style={{
                width: 24, height: 24, borderRadius: 6,
                border: "none", background: "var(--surface2)",
                cursor: "pointer", alignItems: "center", justifyContent: "center",
                color: "var(--dim)", transition: "background var(--transition)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Mobile: close overlay */}
            <button
              onClick={() => setHistoryOpen(false)}
              title="Close panel"
              className="az-mobile-only"
              style={{
                width: 24, height: 24, borderRadius: 6,
                border: "none", background: "var(--surface2)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--dim)", transition: "background var(--transition)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="az-sidebar-inner">
          <div className="az-sidebar-pinned">{sidebarPinned}</div>
          <div className="az-sidebar-scroll">{sidebarScroll}</div>
        </div>
      </aside>

      {/* Desktop: compact score rail — parent action opens the full score/fix plan */}
      <button
        type="button"
        className={`az-sidebar-restore-fab${!improvementPlanVisible ? " is-visible" : ""}`}
        onClick={() => setImprovementPlanVisible(true)}
        title="Open improvement plan: scores, fixes, and past analyses"
        aria-label="Open improvement plan and analysis history"
        onMouseEnter={e => {
          e.currentTarget.style.background = "var(--surface2)";
          e.currentTarget.style.boxShadow = "2px 0 18px rgba(0,0,0,0.1)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "var(--surface)";
          e.currentTarget.style.boxShadow = "";
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.85 }}>
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.35" />
          <path d="M8 8l2.3-2.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
          <path d="M5 10.5h6" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" opacity="0.75" />
        </svg>
        {result ? (
          <span className="az-score-fab-score" style={{ color: scoreColor(result.overallScore) }}>
            {result.overallScore}
          </span>
        ) : null}
        <span className="az-score-fab-label">Scores</span>
      </button>
      <button
        type="button"
        className={`az-sidebar-scan-fab${!improvementPlanVisible && !!result ? " is-visible" : ""}`}
        onClick={startOverAnalyze}
        title="Start a fresh scan from Analyze home"
        aria-label="Start a new scan"
        onMouseEnter={e => {
          e.currentTarget.style.background = "var(--surface2)";
          e.currentTarget.style.boxShadow = "2px 0 18px rgba(0,0,0,0.1)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "var(--surface)";
          e.currentTarget.style.boxShadow = "";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flexShrink: 0, opacity: 0.85 }}>
          <path d="M8 2v9M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
        <span>{"New scan"}</span>
      </button>
      <main
        className={`az-main${workspaceSplit ? " az-main-workspace-split" : ""}`}
        style={{
          ...(workspaceSplit
            ? {
              flex: "1 1 0%",
              minWidth: 0,
              display: "grid",
              gridTemplateColumns: "minmax(260px, 2fr) minmax(280px, 3fr)",
              gridTemplateRows: "minmax(0, 1fr)",
              overflow: "hidden",
              padding: 0,
              minHeight: 0,
              height: "100%",
              alignSelf: "stretch",
              width: "100%",
            }
            : {
              flex: 1,
              overflowY: "auto",
              padding: "28px 36px",
              minHeight: 0,
              minWidth: 0,
            }),
        }}
      >

        <style>{`
          .az-mobile-sticky-head { display: none; }
          @media (max-width: 1024px) {
            .az-mobile-sticky-head {
              display: flex !important;
              flex-direction: column;
              gap: 10px;
              position: sticky;
              top: 0;
              z-index: 8;
              background: var(--bg);
              padding: 0 14px 12px;
              margin: 0 0 12px;
              border-bottom: 1px solid var(--border);
              align-self: stretch;
            }
            .az-main:not(.az-main-workspace-split) {
              padding: 16px 14px 60px !important;
            }
          }
          @media (min-width: 1025px) {
            .az-main.az-main-workspace-split {
              height: 100%;
              max-height: 100%;
              min-height: 0 !important;
            }
            .az-split-work-slot {
              min-height: 0 !important;
            }
            .az-split-resume-slot {
              min-height: 0 !important;
            }
          }
          @media (max-width: 1024px) {
            .az-main.az-main-workspace-split {
              display: flex !important;
              flex-direction: column !important;
              overflow-y: auto !important;
              -webkit-overflow-scrolling: touch;
              padding: 16px 0 60px !important;
            }
            .az-main.az-main-workspace-split .az-mobile-sticky-head {
              order: 1;
              flex-shrink: 0;
            }
            .az-main.az-main-workspace-split .az-split-resume-slot {
              order: 2;
            }
            .az-main.az-main-workspace-split .az-split-work-slot {
              order: 3;
            }
            .az-split-resume-slot {
              height: auto !important;
              min-height: 54vh !important;
              max-height: 72vh !important;
              overflow-y: auto !important;
              border-left: none !important;
              border-bottom: 1px solid var(--border) !important;
            }
            .az-split-work-slot {
              height: auto !important;
              overflow-y: visible !important;
              padding: 12px 16px 48px !important;
            }
            /* Résumé is the focus on small screens — keep the analysis below it
               compact so it reads as supporting context, not the headline. */
            .az-overview-stack {
              gap: 18px !important;
            }
            .az-overview-summary > div {
              padding: 13px 15px !important;
              border-radius: 12px !important;
            }
            .az-overview-summary p {
              font-size: 13px !important;
              line-height: 1.5 !important;
              margin-bottom: 10px !important;
            }
            .az-overview-summary span {
              font-size: 11px !important;
              padding: 3px 9px !important;
            }
          }
        `}</style>

        {/* ── Mobile: score + category pills + history opener — sticky under top bar while scrolling ── */}
        {(result || azHistory.length > 0) && (
          <div className="az-mobile-sticky-head">
            {result ? (
          <>
            {/* Slim collapsed bar — always visible; frees vertical space for the résumé */}
            <button
              type="button"
              onClick={() => setMobileHeadExpanded((v) => !v)}
              aria-expanded={mobileHeadExpanded}
              aria-label={mobileHeadExpanded ? "Hide score details" : "Show score details"}
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "8px 12px", borderRadius: 10, boxSizing: "border-box",
                border: "1px solid var(--border)", background: "var(--surface)",
                cursor: "pointer", fontFamily: "inherit",
                marginBottom: mobileHeadExpanded ? 10 : 0,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor(result.overallScore), lineHeight: 1 }}>
                {result.overallScore}
                <span style={{ fontSize: 11, fontWeight: 500, color: "var(--dim)" }}>/100</span>
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: scoreColor(result.overallScore) }}>
                {scoreLabel(result.overallScore)}
              </span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>· Resume score</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>
                {mobileHeadExpanded ? "Hide" : "Details"}
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden style={{ color: "var(--dim)", transform: mobileHeadExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {mobileHeadExpanded && (
          <div className="az-mobile-score" style={{ marginBottom: 0 }}>
            {/* Score row */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "18px 16px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ScoreRing score={result.overallScore} size={80} label="" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "var(--font-sans), Inter, system-ui, sans-serif", marginBottom: 6 }}>
                    Resume Score
                  </div>
                  {/* Number already lives inside the ScoreRing — show the verdict here, not a duplicate score. */}
                  <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor(result.overallScore), lineHeight: 1.1 }}>
                    {scoreLabel(result.overallScore)}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => {
                    setResult(null); setError(null); setExpandedBullets({});
                    setActiveCategory(null); setSelectedBulletIndex(null);
                    setHistoryRestoreActive(false);
                  }}
                  style={{
                    padding: "8px 14px", borderRadius: 8, border: "none",
                    background: "var(--amber)", color: "#fff",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >New ↑</button>
              </div>
            </div>

            {/* Category bars */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "14px 16px",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px",
            }}>
              {CATEGORY_LABELS.map(({ key, label }) => {
                const score = result.categoryScores[key];
                const color = scoreColor(score);
                const pct = score !== null ? score : 0;
                const isActive = activeCategory === key;
                const clickable = score !== null; // Job Match with no JD has nothing to open
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!clickable}
                    aria-pressed={isActive}
                    onClick={() => {
                      if (!clickable) return;
                      setSelectedBulletIndex(null);
                      setActiveCategory(isActive ? null : key);
                      if (!isActive) {
                        // On mobile the category detail renders in the work slot BELOW
                        // the résumé, so scroll it up just under the sticky head — without
                        // this the tap would silently change content off-screen.
                        setTimeout(() => {
                          const main = document.querySelector(".az-main") as HTMLElement | null;
                          const work = document.querySelector(".az-split-work-slot") as HTMLElement | null;
                          const head = document.querySelector(".az-mobile-sticky-head") as HTMLElement | null;
                          if (main && work) {
                            const headH = head ? head.getBoundingClientRect().height : 0;
                            const top = work.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop - headH - 8;
                            main.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
                          }
                        }, 60);
                      }
                    }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      border: "none", borderRadius: 8, font: "inherit",
                      background: isActive ? "rgba(33,150,243,0.10)" : "transparent",
                      boxShadow: isActive ? "inset 0 0 0 1px rgba(33,150,243,0.32)" : "none",
                      padding: "6px 8px", margin: "-6px -8px",
                      cursor: clickable ? "pointer" : "default",
                      WebkitTapHighlightColor: "transparent",
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--muted)", fontWeight: isActive ? 700 : 500 }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: score === null ? "var(--dim)" : color }}>
                        {score === null ? "–" : score}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: "var(--surface2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: score === null ? "var(--border)" : color, transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)" }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
            )}
          </>
            ) : null}
            {azHistory.length > 0 && (!result || mobileHeadExpanded) ? (
          <div className="az-history-bar" style={{ marginBottom: 0 }}>
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--muted)",
                boxSizing: "border-box",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {`Recent analyses (${azHistory.length})`}
            </button>
          </div>
            ) : null}
          </div>
        )}

        {/* Pre-result upload state */}
        {!result && !loading && (
          <AnalyzeUploadLanding
            jd={jd}
            onJdChange={setJd}
            dragging={dragging}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files[0]);
            }}
            onBrowseClick={() => fileRef.current?.click()}
            error={error}
            scansRemaining={scansRemaining}
          />
        )}

        {/* Loading state */}
        {loading && (
          <AnalyzeCoachLoader stepIndex={loadingMsg} tipIndex={loadingTipIdx} hasJd={!!jd.trim()} />
        )}

        {result && workspaceSplit ? (
          <div
            className="az-split-resume-slot"
            style={{
              gridColumn: 2,
              gridRow: 1,
              minWidth: 0,
              minHeight: 0,
              height: "100%",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              background: "var(--bg)",
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <AnalyzePreviewPane
              analyzeSnapshot={analyzePreviewSnapshot}
              sectionFeedback={result.sectionFeedback}
              activeCategory={activeCategory}
              activeCategoryLabel={activeCategoryLabel}
              rewriteEdits={rewriteEdits}
              patchBulletRewrite={patchBulletRewrite}
              patchPreviewLine={patchPreviewLine}
              selectedBulletIndex={selectedBulletIndex}
              onBulletLinkedSelect={handleBulletSelectFromPreview}
              presentationOnly
              restoredResumeNoPdfHint={historyRestoreActive}
              categoryAssignmentOpts={categoryAssignmentOpts}
            />
            </div>
          </div>
        ) : null}

        {result ? (
          <div
            className={workspaceSplit ? "az-split-work-slot" : undefined}
            style={
              workspaceSplit
                ? {
                    gridColumn: 1,
                    gridRow: 1,
                    overflowY: "auto",
                    minWidth: 0,
                    minHeight: 0,
                    height: "100%",
                    padding: "28px 28px 32px 36px",
                    borderRight: "1px solid var(--border)",
                  }
                : undefined
            }
          >

        {/* ── Issue Detail View (shown when a category is selected) ── */}
        {activeCategory && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 700 }}>

            {/* Back button */}
            <button
              onClick={() => { setActiveCategory(null); setSelectedBulletIndex(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)",
                background: "var(--surface2)", cursor: "pointer", fontFamily: "inherit",
                fontSize: 12.5, fontWeight: 500, color: "var(--muted)", width: "fit-content",
                transition: "background var(--transition)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back to overview
            </button>

            {/* Hero card */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 16,
              padding: "22px 24px",
              background: "var(--surface)",
              border: `1px solid ${(activeCategoryScore ?? 0) >= 80
                ? "rgba(52,211,153,0.3)"
                : (activeCategoryScore ?? 0) >= 60
                  ? "rgba(251,191,36,0.35)"
                  : "rgba(248,113,113,0.3)"}`,
              borderRadius: 16,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 16, flexShrink: 0,
                background: (activeCategoryScore ?? 0) >= 80
                  ? "rgba(52,211,153,0.10)"
                  : (activeCategoryScore ?? 0) >= 60
                    ? "rgba(251,191,36,0.12)"
                    : "rgba(248,113,113,0.10)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 2,
              }}>
                <span style={{
                  fontSize: 22, fontWeight: 800, lineHeight: 1,
                  color: scoreColor(activeCategoryScore ?? 0),
                }}>
                  {activeCategoryScore ?? "–"}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4 }}>/100</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
                  {activeCategoryLabel}
                </div>
                <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.7, margin: 0 }}>
                  {CATEGORY_DESCRIPTIONS[activeCategory] ?? ""}
                </p>
                {activeCategoryNeedsExplanation && (
                  <div style={{
                    marginTop: 12,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--surface2)",
                    borderLeft: "3px solid var(--accent)",
                  }}>
                    <div style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.45,
                      color: "var(--muted)",
                      marginBottom: 6,
                    }}>
                      Why this score
                    </div>
                    {explainingCategory === activeCategory ? (
                      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.65, margin: 0, fontStyle: "italic" }}>
                        Generating explanation…
                      </p>
                    ) : activeCategoryRationale ? (
                      <p style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.65, margin: 0 }}>
                        {activeCategoryRationale}
                      </p>
                    ) : activeCategory ? (
                      <button
                        type="button"
                        onClick={() => explainCategoryScore(activeCategory)}
                        disabled={!(result.extractedText || "").trim()}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", borderRadius: 7,
                          border: "1px solid var(--accent)",
                          background: "rgba(99,102,241,0.10)",
                          color: "var(--accent)",
                          fontSize: 12.5, fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Ask AI why
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {result.bulletAnalysis.length > 0 && (
              <div style={{
                padding: "14px 16px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
              }}>
                <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {activeBullets.length > 0
                    ? `${activeBullets.length} of ${result.bulletAnalysis.length} reviewed bullets flagged`
                    : "No sample bullets flagged here"}
                </p>
                <div style={{
                  height: 8,
                  borderRadius: 6,
                  overflow: "hidden",
                  background: "var(--surface3)",
                }}>
                  <div style={{
                    height: "100%",
                    width: "100%",
                    background: (() => {
                      const t = Math.max(result.bulletAnalysis.length, 1);
                      const mapped = Math.min(activeBullets.length, t);
                      const p = (mapped / t) * 100;
                      return `linear-gradient(90deg, rgba(33,150,243,0.55) 0%, rgba(33,150,243,0.55) ${p}%, var(--surface3) ${p}%, var(--surface3) 100%)`;
                    })(),
                    transition: "background 0.6s cubic-bezier(0.16,1,0.3,1)",
                  }} />
                </div>
              </div>
            )}

            {/* Related top issues — why it matters + what to do */}
            {relatedTopIssues.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
                  Next steps
                </h3>
                {relatedTopIssues.map((issue, i) => (
                  <div key={i} style={{
                    border: "1px solid var(--border)", borderRadius: 12,
                    padding: "12px 14px", background: "var(--surface)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        textTransform: "uppercase", letterSpacing: 0.4,
                        background: severityBg(issue.severity), color: severityColor(issue.severity),
                      }}>
                        {issue.severity}
                      </span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{issue.issue}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
                      {issue.suggestion}
                    </p>
                    {issue.items && issue.items.length > 0 && (() => {
                      // Short tokens (words/phrases) render as chips; long ones (bullets) as lines.
                      const isChips = issue.items.every(it => it.length <= 28);
                      return (
                        <div style={{ marginTop: 10 }}>
                          <div style={{
                            fontSize: 11, fontWeight: 700, color: "var(--muted)",
                            textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6,
                          }}>
                            Found in your résumé
                          </div>
                          {isChips ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {issue.items.map((it, k) => (
                                <span key={k} style={{
                                  fontSize: 12.5, padding: "3px 9px", borderRadius: 8,
                                  background: "var(--red-tint, rgba(248,113,113,0.12))",
                                  color: "var(--red-ink, var(--red))",
                                  border: "1px solid rgba(248,113,113,0.25)",
                                }}>{it}</span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {issue.items.map((it, k) => (
                                <div key={k} style={{
                                  fontSize: 12.5, lineHeight: 1.5, padding: "7px 10px", borderRadius: 8,
                                  background: "var(--red-tint, rgba(248,113,113,0.10))",
                                  color: "var(--text)",
                                  border: "1px solid rgba(248,113,113,0.20)",
                                }}>{it.replace(/^[•\-–*▪▸]\s*/, "")}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}

            {/* Affected bullets with rewrites */}
            {activeBullets.length > 0 && (
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>
                  Flagged Bullets
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeBullets.map((bullet, i) => {
                    const gi = result.bulletAnalysis.indexOf(bullet);
                    const safeIdx = gi >= 0 ? gi : i;
                    const rawCategoryRewrite = activeCategory
                      ? getRewriteForCategory(
                          bullet,
                          activeCategory,
                          undefined,
                          result.bulletAnalysis,
                          safeIdx,
                          categoryAssignmentOpts,
                        )
                      : (bullet.improvedBullet ?? "");
                    // Strip the two big "written by AI" tells from anything we
                    // surface: turn "[X%]" placeholders into concrete example
                    // figures the student swaps for their own, and replace
                    // em-dashes with commas. Never a bracket, never a "—".
                    const { text: categoryRewriteBase, examples: referenceFigures } =
                      cleanAiArtifacts(rawCategoryRewrite);
                    const hasReferenceFigures = referenceFigures.length > 0;
                    const isFirstFlaggedCard = i === 0;
                    const isLanguageMicroEdit = categoryRewriteBase.trim().length > 0
                      && activeCategory === "languageQuality"
                      && isLanguageQualityMicroRewrite(bullet.originalBullet, categoryRewriteBase);
                    const draft = rewriteEdits[safeIdx] ?? categoryRewriteBase;
                    const fixChipLabel = flaggedBulletFixChip(
                      activeCategory as keyof AnalysisResult["categoryScores"] | null,
                      isLanguageMicroEdit,
                    );
                    const coach = activeCategory
                      ? CATEGORY_COACH[activeCategory as keyof AnalysisResult["categoryScores"]] ?? null
                      : null;
                    const previewMain = previewLineOverrides[safeIdx] ?? bullet.originalBullet;
                    const previewLineAppliedHere = previewLineOverrides[safeIdx] !== undefined;
                    const isFlaggedAccordionOpen = expandedFlaggedBulletIdx === safeIdx;
                    const bColor = bullet.score < 50
                      ? "var(--red)"
                      : bullet.score < 70
                        ? "#f59e0b"
                        : "var(--green)";
                    const bBg = bullet.score < 50
                      ? "rgba(248,113,113,0.14)"
                      : bullet.score < 70
                        ? "rgba(245,158,11,0.14)"
                        : "rgba(52,211,153,0.12)";
                    const bBorderSoft = bullet.score < 50
                      ? "rgba(248,113,113,0.28)"
                      : bullet.score < 70
                        ? "rgba(245,158,11,0.28)"
                        : "rgba(52,211,153,0.28)";
                    const bRowBgOpen = bullet.score < 50
                      ? "rgba(248,113,113,0.07)"
                      : bullet.score < 70
                        ? "rgba(245,158,11,0.06)"
                        : "rgba(52,211,153,0.06)";
                    const bRowBgClosed = bullet.score < 50
                      ? "rgba(248,113,113,0.04)"
                      : bullet.score < 70
                        ? "rgba(245,158,11,0.03)"
                        : "rgba(52,211,153,0.04)";
                    const displayBulletLine = stripResumeBulletPrefix(previewMain);
                    const onFlaggedAccordionToggle = () => {
                      handleBulletLinkedSelect(safeIdx);
                      setExpandedFlaggedBulletIdx((prev) => (prev === safeIdx ? null : safeIdx));
                    };
                    return (
                    <div
                      key={safeIdx}
                      data-az-bullet-workspace={safeIdx}
                      style={{
                      border: `1px solid ${bBorderSoft}`,
                      borderLeft: `4px solid ${bColor}`,
                      borderRadius: 10,
                      overflow: "hidden",
                      background: isFlaggedAccordionOpen ? bRowBgOpen : bRowBgClosed,
                    }}>
                      <button
                        type="button"
                        onClick={onFlaggedAccordionToggle}
                        aria-expanded={isFlaggedAccordionOpen}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          padding: "12px 14px",
                          border: "none",
                          background: isFlaggedAccordionOpen ? bRowBgOpen : "transparent",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                          transition: "background 0.12s",
                        }}
                      >
                        <span style={{
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "3px 9px",
                          borderRadius: 20,
                          background: bBg,
                          color: bColor,
                          flexShrink: 0,
                        }}>
                          {bullet.score}
                        </span>
                        <span style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--text)",
                          lineHeight: 1.45,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as const,
                          overflow: "hidden",
                        }} title={previewMain}>
                          <span aria-hidden style={{ color: "var(--muted)", fontWeight: 700, marginRight: "0.35em" }}>•</span>
                          {displayBulletLine}
                          {previewLineAppliedHere && (
                            <span title="Applied to preview." style={{ marginLeft: 6, color: "var(--green)", fontSize: 10, fontWeight: 800 }}>✓</span>
                          )}
                        </span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 8px",
                          borderRadius: 20,
                          flexShrink: 0,
                          background: isLanguageMicroEdit ? "rgba(99,102,241,0.14)" : bBg,
                          color: isLanguageMicroEdit ? "var(--accent)" : bColor,
                          border: `1px solid ${isLanguageMicroEdit ? "rgba(99,102,241,0.28)" : bBorderSoft}`,
                        }}>
                          {fixChipLabel}
                        </span>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                          style={{
                            flexShrink: 0,
                            color: "var(--dim)",
                            transform: isFlaggedAccordionOpen ? "rotate(180deg)" : "none",
                            transition: "transform 0.2s ease",
                          }}
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {isFlaggedAccordionOpen && (
                        <div style={{ padding: "0 14px 14px 14px" }}>
                      {coach && isFirstFlaggedCard && !isLanguageMicroEdit && (
                        <p style={{ ...COACH_BODY_STYLE, marginBottom: 10 }}>
                          <span style={{ fontWeight: 700, color: "var(--accent)" }}>Why&nbsp;&nbsp;</span>
                          {coach.why}
                        </p>
                      )}
                      <BulletImprovedEditor
                        variant="compact"
                        layout="card"
                        suggestionLabel={hasReferenceFigures ? "Suggested · example numbers" : "Suggested"}
                        suggestionNote={hasReferenceFigures ? "Figures below are examples. Swap in your real numbers." : undefined}
                        highlightTerms={hasReferenceFigures ? referenceFigures : undefined}
                        value={draft}
                        onChange={v => patchBulletRewrite(safeIdx, v)}
                        onReset={() => patchBulletRewrite(safeIdx, null)}
                        canReset={rewriteEdits[safeIdx] !== undefined}
                        minHeight={64}
                        previewLineApplied={previewLineAppliedHere}
                        onReplaceInPreview={() => patchPreviewLine(safeIdx, draft.trim())}
                        onRevertPreviewLine={() => patchPreviewLine(safeIdx, null)}
                        onTextareaFocus={() => onBulletWorkspaceTextareaFocus(safeIdx)}
                        onTextareaBlur={e => onBulletWorkspaceTextareaBlur(safeIdx, e)}
                        toolbarRight={(
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              copyBullet(draft, safeIdx);
                            }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "5px 10px", borderRadius: 7,
                              border: `1px solid ${copiedBullet === safeIdx ? "rgba(52,211,153,0.5)" : "rgba(52,211,153,0.3)"}`,
                              background: copiedBullet === safeIdx ? "rgba(52,211,153,0.15)" : "rgba(52,211,153,0.08)",
                              color: "var(--green)", fontSize: 10.5, fontWeight: 600,
                              cursor: "pointer", fontFamily: "inherit",
                              transition: "all 0.15s",
                            }}
                          >
                            {copiedBullet === safeIdx ? "Copied!" : "Copy"}
                          </button>
                        )}
                      />
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* If no related issues or bullets */}
            {activeBullets.length === 0 && relatedTopIssues.length === 0 && (
              <div style={{
                padding: "32px", textAlign: "center",
                border: "1px solid var(--border)", borderRadius: 14,
                background: "var(--surface)",
              }}>
                {(activeCategoryScore ?? 0) >= SCORE_NEEDS_EXPLANATION ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                      No specific issues found
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      This category looks strong in your resume.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                      No flagged bullets in {activeCategoryLabel}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                      {activeCategoryRationale || explainingCategory === activeCategory
                        ? `The ${activeCategoryScore}/100 score is explained above.`
                        : `Scored ${activeCategoryScore ?? "–"}/100. Generating an explanation above.`}
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Full analysis (shown when no category is active) ── */}
        {!activeCategory && (
          <div className="az-overview-stack" style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 760 }}>

            {/* 1. Summary banner */}
            <section className="az-overview-summary">
              <div style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "20px 24px",
              }}>
                <p style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.7, margin: "0 0 16px" }}>
                  {result.summary}
                </p>
                {(formatExperienceTenureChip(result.experienceSummary) || result.topStrengths.length > 0) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {formatExperienceTenureChip(result.experienceSummary) && (
                      <span
                        title="Merged tenure from experience date ranges (internships included)"
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "4px 12px",
                          borderRadius: 20, background: "rgba(99,102,241,0.12)",
                          color: "var(--accent)",
                        }}
                      >
                        {formatExperienceTenureChip(result.experienceSummary)}
                      </span>
                    )}
                    {result.topStrengths.slice(0, 3).map((s, i) => (
                      <span key={i} style={{
                        fontSize: 12, fontWeight: 600, padding: "4px 12px",
                        borderRadius: 20, background: "rgba(52,211,153,0.12)",
                        color: "var(--green-ink)",
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* 1b. Light "reads AI-written" nudge — only when em-dashes are heavy */}
            {(() => {
              const emCount = (result.extractedText || "").split("—").length - 1;
              if (emCount < 4) return null;
              return (
                <section>
                  <div style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-start",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderLeft: "3px solid var(--accent)",
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}>
                    <span aria-hidden style={{ fontSize: 16, lineHeight: 1.4 }}>✍️</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
                        Reads a little AI-written
                      </div>
                      <p style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--muted)", margin: 0 }}>
                        Your résumé uses the em-dash (—) {emCount} times. It&rsquo;s a common AI-writing
                        tell that many recruiters notice. Swapping most of them for commas or periods
                        makes it read more like you. (The fixes this tool suggests already avoid it.)
                      </p>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* 2. Top Issues */}
            {sortedIssues.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Top Issues
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sortedIssues.map((issue, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: "16px 18px",
                      background: "var(--surface)",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "3px 8px",
                          borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.4,
                          background: severityBg(issue.severity),
                          color: severityColor(issue.severity),
                        }}>
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                          {issue.issue}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                        {issue.whyItMatters}
                      </p>
                      <div style={{
                        background: "var(--surface2)",
                        borderRadius: 8,
                        padding: "10px 14px",
                        fontSize: 13,
                        color: "var(--text)",
                        lineHeight: 1.6,
                        borderLeft: "3px solid var(--accent)",
                      }}>
                        {issue.suggestion}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 2b. Structural Flags — deterministic ATS / formatting checks */}
            {Array.isArray(result.structuralFlags) && result.structuralFlags.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 4px" }}>
                  Structural Flags
                </h2>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
                  Formatting and completeness issues an ATS or a quick recruiter scan can trip on, separate from your bullet wording.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {result.structuralFlags.map((flag, i) => {
                    const sev = flag.severity ?? "low";
                    const dot = sev === "high" ? "var(--red)" : sev === "medium" ? "#f59e0b" : "var(--dim)";
                    return (
                      <div key={i} style={{
                        border: "1px solid var(--border)", borderRadius: 12,
                        padding: "14px 16px", background: "var(--surface)",
                        display: "flex", gap: 12, alignItems: "flex-start",
                      }}>
                        <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: dot, marginTop: 6, flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, marginBottom: 3 }}>
                            {flag.issue}
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                            {flag.risk}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 3. ATS Warnings */}
            {result.atsWarnings.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  ATS Warnings
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {result.atsWarnings.map((w, i) => (
                    <div key={i} style={{
                      border: "1px solid rgba(245,158,11,0.3)",
                      borderRadius: 10,
                      padding: "14px 16px",
                      background: "rgba(245,158,11,0.06)",
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>⚠️</span>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#f59e0b", marginBottom: 4 }}>
                            {w.warning}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                            {w.suggestion}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 4. Keyword Analysis */}
            {result.keywordAnalysis.keywordScore !== null && (
              <section>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>
                    Keyword Analysis
                  </h2>
                  <span style={{
                    fontSize: 13, fontWeight: 700, padding: "3px 12px",
                    borderRadius: 20,
                    background: scoreColor(result.keywordAnalysis.keywordScore) === "var(--green)"
                      ? "rgba(52,211,153,0.12)"
                      : scoreColor(result.keywordAnalysis.keywordScore) === "var(--yellow)"
                      ? "rgba(245,158,11,0.12)"
                      : "rgba(248,113,113,0.12)",
                    color: scoreColor(result.keywordAnalysis.keywordScore),
                  }}>
                    {result.keywordAnalysis.keywordScore}/100
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  {/* Matched */}
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 12,
                    padding: "14px 16px", background: "var(--surface)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                      Matched Keywords
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.keywordAnalysis.matchedKeywords.length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>None found</span>
                      ) : result.keywordAnalysis.matchedKeywords.map((kw, i) => (
                        <span key={i} style={{
                          fontSize: 11, fontWeight: 500, padding: "3px 9px",
                          borderRadius: 20, background: "rgba(52,211,153,0.12)", color: "var(--green)",
                        }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Missing */}
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 12,
                    padding: "14px 16px", background: "var(--surface)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 10 }}>
                      Missing Keywords
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {result.keywordAnalysis.missingKeywords.length === 0 ? (
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>None. Great coverage!</span>
                      ) : result.keywordAnalysis.missingKeywords.map((kw, i) => (
                        <span key={i} style={{
                          fontSize: 11, fontWeight: 500, padding: "3px 9px",
                          borderRadius: 20, background: "rgba(248,113,113,0.12)", color: "var(--red)",
                        }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {result.keywordAnalysis.suggestions.length > 0 && (
                  <div style={{
                    border: "1px solid var(--border)", borderRadius: 10,
                    padding: "14px 16px", background: "var(--surface2)",
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                      Suggestions
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                      {result.keywordAnalysis.suggestions.map((s, i) => (
                        <li key={i} style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* 5. Bullet Analysis */}
            {result.bulletAnalysis.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Weakest Bullets · AI Rewrites
                </h2>
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  {result.bulletAnalysis.map((bullet, i) => {
                    const isExpanded = !!expandedBullets[i];
                    const bColor = bullet.score < 50
                      ? "var(--red)"
                      : bullet.score < 70
                      ? "#f59e0b"
                      : "var(--green)";
                    const bBg = bullet.score < 50
                      ? "rgba(248,113,113,0.12)"
                      : bullet.score < 70
                      ? "rgba(245,158,11,0.12)"
                      : "rgba(52,211,153,0.12)";
                    const baseImp = isTrivialRewrite(bullet.originalBullet, bullet.improvedBullet)
                      ? ""
                      : (bullet.improvedBullet ?? "");
                    const previewAcc = previewLineOverrides[i] ?? bullet.originalBullet;
                    const hasAccordionRewrite = baseImp.trim().length > 0;
                    const draftAcc = hasAccordionRewrite
                      ? (rewriteEdits[i] ?? baseImp)
                      : (rewriteEdits[i] ?? previewAcc);
                    const previewLineAppliedAcc = previewLineOverrides[i] !== undefined;
                    return (
                      <div
                        key={i}
                        data-az-bullet-workspace={i}
                        style={{ borderBottom: i === result.bulletAnalysis.length - 1 ? "none" : "1px solid var(--border)" }}
                      >
                        {/* Accordion header */}
                        <div
                          onClick={() => setExpandedBullets(e => ({ ...e, [i]: !e[i] }))}
                          style={{
                            display: "flex", alignItems: "center", gap: 12,
                            padding: "14px 18px", cursor: "pointer",
                            background: isExpanded ? "var(--surface2)" : "var(--surface)",
                            transition: "background 0.1s",
                          }}
                        >
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 8px",
                            borderRadius: 20, background: bBg, color: bColor, flexShrink: 0,
                          }}>
                            {bullet.score}
                          </span>
                          <span style={{
                            fontSize: 13, color: "var(--muted)", flex: 1, minWidth: 0,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }} title={previewAcc}>
                            <span aria-hidden style={{ color: "var(--dim)", fontWeight: 700, marginRight: "0.35em" }}>•</span>
                            {stripResumeBulletPrefix(previewAcc)}
                          </span>
                          <svg
                            width="16" height="16" viewBox="0 0 16 16" fill="none"
                            style={{
                              flexShrink: 0,
                              transition: "transform 0.2s",
                              transform: isExpanded ? "rotate(180deg)" : "none",
                            }}
                          >
                            <path d="M4 6l4 4 4-4" stroke="var(--dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>

                        {/* Accordion body */}
                        {isExpanded && (
                          <div style={{ padding: "12px 18px 16px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 10 }}>
                            {bullet.issues.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {bullet.issues.map((issue, j) => (
                                  <span key={j} style={{
                                    fontSize: 11, fontWeight: 500, padding: "2px 8px",
                                    borderRadius: 20, background: "rgba(248,113,113,0.10)", color: "var(--red)",
                                  }}>
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            )}
                            <div style={{
                              fontSize: 13, color: "var(--muted)", fontStyle: "italic",
                              borderLeft: "3px solid var(--border)", paddingLeft: 12,
                              lineHeight: 1.6,
                            }}>
                              {previewAcc}
                              {previewLineAppliedAcc && (
                                <span style={{ marginLeft: 6, color: "#fbbf24", fontSize: 11, fontWeight: 700 }} title="Preview line replaced for this session">●</span>
                              )}
                            </div>
                            {hasAccordionRewrite ? (
                              <BulletImprovedEditor
                                layout="plain"
                                value={draftAcc}
                                onChange={v => patchBulletRewrite(i, v)}
                                onReset={() => patchBulletRewrite(i, null)}
                                canReset={rewriteEdits[i] !== undefined}
                                previewLineApplied={previewLineAppliedAcc}
                                onReplaceInPreview={() => patchPreviewLine(i, draftAcc.trim())}
                                onRevertPreviewLine={() => patchPreviewLine(i, null)}
                                onTextareaFocus={() => onBulletWorkspaceTextareaFocus(i)}
                                onTextareaBlur={e => onBulletWorkspaceTextareaBlur(i, e)}
                                toolbarRight={(
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      copyBullet(draftAcc, i);
                                    }}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 4,
                                      padding: "3px 9px", borderRadius: 6,
                                      border: `1px solid ${copiedBullet === i ? "rgba(52,211,153,0.5)" : "rgba(52,211,153,0.3)"}`,
                                      background: copiedBullet === i ? "rgba(52,211,153,0.15)" : "rgba(52,211,153,0.08)",
                                      color: "var(--green)", fontSize: 10.5, fontWeight: 600,
                                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                                    }}
                                  >
                                    {copiedBullet === i ? "✓ Copied" : "Copy"}
                                  </button>
                                )}
                              />
                            ) : (
                              <BulletImprovedEditor
                                layout="plain"
                                value={draftAcc}
                                onChange={v => patchBulletRewrite(i, v)}
                                onReset={() => patchBulletRewrite(i, null)}
                                canReset={rewriteEdits[i] !== undefined}
                                eyebrow="Manual edit"
                                helperText="Start from the original"
                                resetLabel="Reset to original"
                                accentColor="var(--amber)"
                                previewLineApplied={previewLineAppliedAcc}
                                onReplaceInPreview={() => patchPreviewLine(i, draftAcc.trim())}
                                onRevertPreviewLine={() => patchPreviewLine(i, null)}
                                onTextareaFocus={() => onBulletWorkspaceTextareaFocus(i)}
                                onTextareaBlur={e => onBulletWorkspaceTextareaBlur(i, e)}
                                toolbarRight={(
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      copyBullet(draftAcc, i);
                                    }}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 4,
                                      padding: "3px 9px", borderRadius: 6,
                                      border: `1px solid ${copiedBullet === i ? "rgba(251,191,36,0.55)" : "rgba(251,191,36,0.34)"}`,
                                      background: copiedBullet === i ? "rgba(251,191,36,0.16)" : "rgba(251,191,36,0.08)",
                                      color: "var(--amber)", fontSize: 10.5, fontWeight: 600,
                                      cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                                    }}
                                  >
                                    {copiedBullet === i ? "✓ Copied" : "Copy draft"}
                                  </button>
                                )}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 6. Section Feedback */}
            {result.sectionFeedback.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Section Feedback
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                  {result.sectionFeedback.map((sf, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)", borderRadius: 12,
                      padding: "14px 16px", background: "var(--surface)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{sf.section}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(sf.score) }}>{sf.score}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "var(--surface2)", overflow: "hidden", marginBottom: 8 }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          width: `${sf.score}%`,
                          background: scoreColor(sf.score),
                          transition: "width 0.6s ease",
                        }} />
                      </div>
                      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>{sf.feedback}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 7. Rewrite Suggestions */}
            {result.rewriteSuggestions.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Suggested Rewrites
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {result.rewriteSuggestions.map((rw, i) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)", borderRadius: 12,
                      padding: "16px 18px", background: "var(--surface)",
                    }}>
                      <div style={{
                        fontSize: 13, color: "var(--muted)", fontStyle: "italic",
                        borderLeft: "3px solid var(--border)", paddingLeft: 12,
                        lineHeight: 1.6, marginBottom: 10,
                      }}>
                        {rw.before}
                      </div>
                      <div style={{
                        fontSize: 13, color: "var(--green)",
                        borderLeft: "3px solid var(--green)", paddingLeft: 12,
                        lineHeight: 1.6, marginBottom: 10,
                      }}>
                        {rw.after}
                      </div>
                      <div style={{
                        fontSize: 11, color: "var(--dim)", fontStyle: "italic",
                        paddingLeft: 15,
                      }}>
                        {rw.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 8. Final Recommendations */}
            {result.finalRecommendations.length > 0 && (
              <section>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "0 0 14px" }}>
                  Final Recommendations
                </h2>
                <div style={{
                  border: "1px solid var(--border)", borderRadius: 12,
                  padding: "18px 20px", background: "var(--surface2)",
                }}>
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                    {result.finalRecommendations.map((rec, i) => (
                      <li key={i} style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6 }}>
                        {rec}
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            )}

            {/* ── Analyze another CTA ───────────────────── */}
            <section>
              <div style={{
                borderTop: "1px solid var(--border)",
                paddingTop: 32,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                textAlign: "center",
              }}>
                <div>
                  <div style={{
                    fontFamily: "var(--font-sans), Inter, system-ui, sans-serif",
                    fontSize: 26, fontWeight: 600, letterSpacing: -0.5,
                    color: "var(--text)", marginBottom: 6,
                  }}>
                    Ready to analyze another?
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                    Upload a new résumé PDF or paste a different job description<br />to get a fresh score and set of recommendations.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                  {/* Primary — go back to Analyze home */}
                  <button
                    type="button"
                    onClick={startOverAnalyze}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "11px 22px", borderRadius: 10,
                      background: "var(--amber)", border: "none", color: "#fff",
                      fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                      transition: "opacity var(--transition)",
                      letterSpacing: -0.2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <path d="M8 2v9M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                    New scan
                  </button>

                  {/* Secondary — clear and start over */}
                  <button
                    type="button"
                    onClick={startOverAnalyze}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "11px 20px", borderRadius: 10,
                      background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--muted)",
                      fontSize: 13.5, fontWeight: 500, cursor: "pointer",
                      transition: "background var(--transition), border-color var(--transition)",
                      letterSpacing: -0.2,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border-h)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    ← Start over
                  </button>
                </div>
              </div>
            </section>

          </div>
        )}
        {/* end !activeCategory full-analysis block */}
          </div>
        ) : null}

      </main>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{ display: "none" }}
        onChange={e => onFile(e.target.files?.[0])}
      />
    </div>
  );
}
