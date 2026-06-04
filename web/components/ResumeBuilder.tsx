"use client";
import React, { useState, useCallback, useRef, useEffect, useLayoutEffect, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source, ChangeRationale, ParsedSection } from "@/lib/types";
import { buildResumeFileStem } from "@/lib/resumeFileName";
import { saveTailorMatchToLibrary, tailorMatchFolder } from "@/lib/tailorAnalyzeLibrary";
import { accentCardBorder } from "@/lib/accentCardBorder";
import { getBaseResumeBanner } from "@/lib/libraryFolderLabel";
import { apiUrl, isResumeUploadFile, parseJsonOrThrow, scoreColor } from "@/lib/utils";
import { toUserFriendlyErrorMessage, messageForNonJsonApiFailure } from "@/lib/userFriendlyError";
import { Button } from "@/components/ui/button";
import { upsertResume, getSupabaseClient, upsertUserProfile } from "@/lib/supabase";
import { TAILOR_PREFILL_JD, TAILOR_PREFILL_COMPANY, TAILOR_PREFILL_ROLE } from "@/lib/tailorPrefill";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_REFERENCE_FOLDER,
  distinctStyleTemplates,
  hasMultipleStyleTemplates,
  isValidResumeStyleFolder,
} from "@/lib/resumeTemplates";
import {
  loadProfile,
  saveProfile,
  mergeProfilePreferEmpty,
  getProfileAutofillFromUpload,
  setProfileAutofillFromUpload,
} from "@/lib/profileStorage";
import { extractProfileHintsFromResumeText } from "@/lib/profileFromResumeText";
import {
  resumeLineMatchesSuggestionOriginal,
  resumeLineMatchesAcceptedSuggestionHighlight,
  computeCombinedMatchTextByLineIndex,
} from "@/lib/suggestionResumeMatch";
import {
  gapFixTargetBulletIndices,
  matchOriginalToBulletIndex,
  resolveBulletIndexForGapFix,
  synthesizeProfileWithBulletOverrides,
  type LiveBulletItem,
} from "@/lib/resumeBulletMatch";
import {
  applyAddressedGapsToRatings,
  applyOptimisticGapAddressed,
  isGapAddressed,
  makeStableGapId,
  mergeRescorePreservingAddressedGaps,
  remapLineOverrides,
  suggestionsWithDrafts,
} from "@/lib/tailorGapFix";
import type { AddressedGapAction } from "@/lib/types";
import { mergeAnalyzeApiJson } from "@/lib/mergeAnalyzeApiJson";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { useSuggestionsStore } from "@/store/suggestionsStore";
import type { StructuredResume } from "@/store/resumeAnalyzeStore";
import { normalizeStructuredResume } from "@/store/resumeAnalyzeStore";
import { isStructuredUsable } from "@/components/AnalyzeLiveResumeBody";
import {
  PRIORITY_BG,
  PRIORITY_COLOR,
  PRIORITY_STRIPE,
  priorityLabel,
  stripeStyleForPriority,
} from "@/lib/suggestionPriorityStyles";
import { useUploadResume } from "@/hooks/useUploadResume";
import {
  nameAndSubtitleLineIndices,
  isPlaceholderResumeHeaderLine,
  dedupeRepeatedLeadingResumeHeader,
  stripBareLocationSuffixFromNameLine,
  isBareLocationLabelLine,
} from "@/lib/resumePreviewNameLine";

import ScoreRing    from "./ScoreRing";
import MatchBreakdownCards from "./MatchBreakdownCards";
import { TailorMatchSidebar, TailorMatchDetail } from "./DetailedRatingsView";
import TailorRecentJobs from "./TailorRecentJobs";
import TailorPreviewPane from "./TailorPreviewPane";
import CategoryFixPanel from "./CategoryFixPanel";
import { isDetailedRatings } from "@/lib/types";
import type { DetailedRatingItem } from "@/lib/types";
import DiffView     from "./DiffView";
import SourcesPanel from "./SourcesPanel";
import AtsPanel, { normalizeAtsResult, type AtsResult } from "./AtsPanel";

import ResumePublicLinkSettings from "./ResumePublicLinkSettings";
import {
  LandingPreviewStyles,
  VariantC,
} from "@/components/LandingFeatureShowcase";
import { useAppShellSidebar } from "@/contexts/AppShellSidebarContext";

const TailoredPdfPreview = dynamic(
  () => import("@/components/TailoredPdfPreview"),
  { ssr: false, loading: () => <div style={{ padding: 24, color: "var(--muted)", fontSize: 12 }}>Loading preview…</div> },
);


type Suggestion = {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: "high" | "medium" | "low";
};

/** Rotating coach lines while "Analyze & get suggestions" runs (Resume Builder). */
const SUGGEST_LOADER_TIPS = [
  "Matching bullets to keywords from the posting…",
  "Looking for vague metrics and weak verbs…",
  "Checking impact lines vs plain responsibilities…",
  "Spotting gaps between your story and this role…",
  "Prioritizing what recruiters skim in the first pass…",
] as const;

/** Rotating coach lines while "Generate tailored PDF" runs (Resume Builder). */
const GENERATE_LOADER_TIPS = [
  "Tailoring your experience to this job posting…",
  "Applying your template layout and ATS structure…",
  "Strengthening bullets with role-specific keywords…",
  "Compiling LaTeX to a print-ready PDF…",
  "Scoring how well your résumé matches the role…",
] as const;

/** Rotating coach lines while a résumé file is uploaded and text is extracted. */
const UPLOAD_LOADER_TIPS = [
  "PDF and Word (.docx) both work — we pull plain text for tailoring.",
  "Clean, selectable text scans better than image-only PDFs.",
  "We keep your file on this device until you generate a tailored version.",
  "Headings and bullet order help the coach match suggestions to sections.",
  "After upload, you can merge contact fields into Profile in one click.",
] as const;

/** Accent swatches — template "Customize preview" (preview chrome only; PDF uses LaTeX template). */
const CUSTOMIZE_ACCENT_SWATCHES: { id: string; hex: string }[] = [
  { id: "ink", hex: "#0f172a" },
  { id: "navy", hex: "#1e3a5f" },
  { id: "blue", hex: "#1d4ed8" },
  { id: "purple", hex: "#6d28d9" },
  { id: "orange", hex: "#ea580c" },
];

/** Labels for Profile keys when we merge from résumé extract */
const PROFILE_FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  tagline: "Subtitle",
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  portfolio: "Portfolio / GitHub",
  headline: "Headline",
  roles: "Target roles",
  locations: "Locations",
  school: "School",
  degree: "Degree",
  graduation: "Graduation",
  gpa: "GPA",
};

function extractJdKeywords(jdText: string): string[] {
  const STOP = new Set([
    "the","and","or","for","with","that","this","will","have","from","they",
    "your","our","are","been","can","has","its","not","but","you","all","any",
    "may","some","such","use","used","using","must","also","well","very","more",
    "most","than","each","into","about","other","their","which","when","what",
    "how","who","where","why","able","need","work","team","role","join","help",
    "make","both","then","there","these","those","would","could","should","shall",
    "being","having","doing","made","take","come","became","strong","experience",
    "including","required","preferred","position","years","skills","ability",
    "knowledge","understanding","familiar","working","across","within","ensure",
    "support","manage","build","design","develop","data",
  ]);
  const seen = new Map<string, string>();
  const re = /\b([A-Z][A-Za-z0-9+#.]*(?:[-\/][A-Za-z0-9+#.]+)*|[a-z]{3,}(?:\.js|\.ts|\.py)?)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jdText)) !== null) {
    const w = m[1];
    if (w.length < 2 || STOP.has(w.toLowerCase())) continue;
    const k = w.toLowerCase();
    if (!seen.has(k)) seen.set(k, w);
  }
  return [...seen.values()].sort((a, b) => b.length - a.length);
}

const EMPTY_RESULT: GenerationResult = {
  folder: null, baseFolder: null, baseLoaded: null, texPath: null, pdfUrl: null,
  ratings: null, diff: [], adds: 0, removes: 0, rationales: [],
  sources: [], latexPreview: "", status: "",
};

/** Resolved PDF URL + folder after a successful `generate()` stream (for save/download UX). */
type GeneratePdfOutcome = { pdfUrl: string; folder: string | null };

/** Fetch PDF as a blob and trigger a file download (same-origin / CORS permitting). */
async function fetchPdfAsDownload(url: string, downloadBaseName: string): Promise<void> {
  const res = await fetch(url, { credentials: "include", mode: "cors" });
  if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`);
  const blob = await res.blob();
  const safe = (downloadBaseName || "resume").replace(/[^\w.-]+/g, "_").slice(0, 80) || "resume";
  const a = document.createElement("a");
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = `${safe}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

async function downloadBlobFromApiResponse(resp: Response, fallbackFilename: string): Promise<void> {
  const disposition = resp.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const SS_KEY = "rn_builder_draft";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadDraft(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(SS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Expire drafts older than TTL
    if (typeof parsed._ts === "number" && Date.now() - parsed._ts > DRAFT_TTL_MS) {
      localStorage.removeItem(SS_KEY);
      return {};
    }
    return parsed;
  } catch { return {}; }
}
function saveDraft(patch: Record<string, unknown>) {
  try {
    const prev = loadDraft();
    localStorage.setItem(SS_KEY, JSON.stringify({ ...prev, ...patch, _ts: Date.now() }));
  } catch { /* quota / SSR */ }
}
function clearDraft() {
  try { localStorage.removeItem(SS_KEY); } catch { /* SSR */ }
}

const BUILDER_SESSION_KEY = "builderSession";

/** Survives sidebar view switches (ResumeBuilder unmounts when leaving ?view=builder). */
type BuilderSessionV1 = {
  v: 1;
  candidateProfile: string | null;
  uploadedFileName: string | null;
  /** Base64 data URL of the original uploaded PDF — persisted so preview survives page refresh. */
  uploadedPdfDataUrl?: string | null;
  baseFolder: string | null;
  studioHandoff: boolean;
  suggestions: Suggestion[] | null;
  suggestSummary: string;
  strategicTips: string[];
  interviewQuestions: string[];
  acceptedSuggestionIds: string[];
  rejectedSuggestionIds: string[];
  result: GenerationResult | null;
  /** Web research digest from GET suggestions (reused for PDF — no second search). */
  suggestResearchDigest: string;
  suggestResearchQueries: string[];
  suggestResearchSources: { title: string | null; url: string }[];
  /** Structured resume from the upload step — persisted so the Tailor preview
   *  renders from typed fields after a reload (refs reset; candidateProfile is
   *  restored, so without this the preview falls back to text-parsing). */
  structuredUpload?: { profile: string; structured: StructuredResume } | null;
};

function parseStrategicTips(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string" && t.trim().length >= 24)
    .map(t => t.trim())
    .slice(0, 4);
}

function parseInterviewQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is string => typeof q === "string" && q.trim().length >= 15)
    .map(q => q.trim())
    .slice(0, 8);
}

function isSuggestionRecord(x: unknown): x is Suggestion {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.original === "string" &&
    typeof o.suggested === "string" &&
    typeof o.reason === "string" &&
    typeof o.section === "string" &&
    (o.priority === "high" || o.priority === "medium" || o.priority === "low")
  );
}

function parseResultFromDraft(x: unknown): GenerationResult | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Partial<GenerationResult>;
  return {
    ...EMPTY_RESULT,
    folder: r.folder ?? null,
    baseFolder: r.baseFolder ?? null,
    baseLoaded: r.baseLoaded ?? null,
    texPath: r.texPath ?? null,
    pdfUrl: typeof r.pdfUrl === "string" ? r.pdfUrl : null,
    ratings: r.ratings ?? null,
    diff: Array.isArray(r.diff) ? r.diff : [],
    adds: typeof r.adds === "number" ? r.adds : 0,
    removes: typeof r.removes === "number" ? r.removes : 0,
    rationales: Array.isArray(r.rationales) ? r.rationales : [],
    sources: Array.isArray(r.sources) ? r.sources : [],
    latexPreview: typeof r.latexPreview === "string" ? r.latexPreview : "",
    status: typeof r.status === "string" ? r.status : "",
  };
}

function parseBuilderSessionFromDraft(d: Record<string, unknown>): BuilderSessionV1 | null {
  const raw = d[BUILDER_SESSION_KEY];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;

  let suggestions: Suggestion[] | null = null;
  if (o.suggestions === null) suggestions = null;
  else if (Array.isArray(o.suggestions)) {
    const list = o.suggestions.filter(isSuggestionRecord);
    suggestions = list.length ? list : null;
  }

  const acceptedSuggestionIds = Array.isArray(o.acceptedSuggestionIds)
    ? o.acceptedSuggestionIds.filter((x): x is string => typeof x === "string")
    : [];
  const rejectedSuggestionIds = Array.isArray(o.rejectedSuggestionIds)
    ? o.rejectedSuggestionIds.filter((x): x is string => typeof x === "string")
    : [];

  const suggestResearchSourcesParsed = Array.isArray(o.suggestResearchSources)
    ? o.suggestResearchSources.filter(
        (s): s is { title?: string | null; url: string } =>
          s && typeof s === "object" && typeof (s as { url?: unknown }).url === "string",
      ).map(s => ({ title: typeof (s as { title?: unknown }).title === "string" ? (s as { title: string }).title : null, url: s.url }))
    : [];

  return {
    v: 1,
    candidateProfile: typeof o.candidateProfile === "string" ? o.candidateProfile : null,
    uploadedFileName: typeof o.uploadedFileName === "string" ? o.uploadedFileName : null,
    uploadedPdfDataUrl: typeof o.uploadedPdfDataUrl === "string" ? o.uploadedPdfDataUrl : null,
    baseFolder: typeof o.baseFolder === "string" ? o.baseFolder : null,
    studioHandoff: o.studioHandoff === true,
    suggestions,
    suggestSummary: typeof o.suggestSummary === "string" ? o.suggestSummary : "",
    strategicTips: Array.isArray(o.strategicTips)
      ? o.strategicTips.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 4)
      : [],
    interviewQuestions: Array.isArray(o.interviewQuestions)
      ? o.interviewQuestions.filter((q): q is string => typeof q === "string" && q.trim().length > 0).slice(0, 8)
      : [],
    acceptedSuggestionIds,
    rejectedSuggestionIds,
    result: parseResultFromDraft(o.result),
    suggestResearchDigest: typeof o.suggestResearchDigest === "string" ? o.suggestResearchDigest : "",
    suggestResearchQueries: Array.isArray(o.suggestResearchQueries)
      ? o.suggestResearchQueries.filter((x): x is string => typeof x === "string")
      : [],
    suggestResearchSources: suggestResearchSourcesParsed,
    structuredUpload:
      o.structuredUpload
      && typeof o.structuredUpload === "object"
      && typeof (o.structuredUpload as { profile?: unknown }).profile === "string"
      && (o.structuredUpload as { structured?: unknown }).structured
        ? (o.structuredUpload as { profile: string; structured: StructuredResume })
        : null,
  };
}

function saveBuilderSessionToDraft(session: BuilderSessionV1) {
  try {
    const prev = loadDraft();
    localStorage.setItem(SS_KEY, JSON.stringify({ ...prev, [BUILDER_SESSION_KEY]: session, _ts: Date.now() }));
  } catch {
    try {
      const slim: BuilderSessionV1 = {
        ...session,
        result: session.result ? { ...session.result, latexPreview: "" } : null,
      };
      const prev = loadDraft();
      localStorage.setItem(SS_KEY, JSON.stringify({ ...prev, [BUILDER_SESSION_KEY]: slim, _ts: Date.now() }));
    } catch { /* quota */ }
  }
}

export default function ResumeBuilder({
  initialBaseFolder,
}: {
  initialBaseFolder?: string | null;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draft0: Record<string, unknown> = loadDraft();
  const builderSession0 = parseBuilderSessionFromDraft(draft0);
  const [company,    setCompanyRaw]    = useState<string>(String(draft0.company ?? ""));
  const [role,       setRoleRaw]       = useState<string>(String(draft0.role ?? ""));
  const [jd,         setJdRaw]         = useState<string>(String(draft0.jd ?? ""));
  const [jobUrl,     setJobUrlRaw]     = useState<string>(String(draft0.jobUrl ?? ""));
  const model = (process.env.NEXT_PUBLIC_GEMINI_FLASH_MODEL ?? "").trim() || "gemini-2.5-flash-lite";
  const [baseFolder, setBaseFolder] = useState<string | null>(() => {
    const fromUrl = (initialBaseFolder ?? "").trim() || null;
    if (fromUrl) return fromUrl;
    const fromSession = builderSession0?.baseFolder?.trim() || null;
    return fromSession;
  });
  // Wrap setters to also persist to sessionStorage
  const setCompany = (v: string) => { setCompanyRaw(v); saveDraft({ company: v }); };
  const setRole    = (v: string) => { setRoleRaw(v);    saveDraft({ role: v }); };
  const setJd      = (v: string) => { setJdRaw(v);      saveDraft({ jd: v }); };
  const setJobUrl  = (v: string) => { setJobUrlRaw(v);  saveDraft({ jobUrl: v }); };

  const [generating, setGenerating] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState("");
  const [result,     setResult]     = useState<GenerationResult | null>(() => builderSession0?.result ?? null);
  const appShellSidebar = useAppShellSidebar();
  const [error,      setError]      = useState<string | null>(null);
  const [preview,    setPreview]    = useState(() => builderSession0?.result?.latexPreview ?? "");
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [searchSources, setSearchSources] = useState<{ title: string | null; url: string }[]>([]);
  /** Grounding from POST /api/suggest-changes-stream (research event, then coach SSE). */
  const [suggestResearchQueries, setSuggestResearchQueries] = useState<string[]>(
    () => builderSession0?.suggestResearchQueries ?? [],
  );
  const [suggestResearchSources, setSuggestResearchSources] = useState<{ title: string | null; url: string }[]>(
    () => builderSession0?.suggestResearchSources ?? [],
  );
  /** Same digest the server injected before suggestions — sent back on generate-stream to skip a second web search. */
  const [suggestResearchDigest, setSuggestResearchDigest] = useState(
    () => builderSession0?.suggestResearchDigest ?? "",
  );
  const hasSuggestResearch = suggestResearchQueries.length > 0 || suggestResearchSources.length > 0;
  const reusingSuggestWebForPdf = suggestResearchDigest.trim().length > 0;
  const [storageFailures, setStorageFailures] = useState<{ artifact: "pdf" | "tex"; reason: string }[]>([]);
  /** Right-panel "Save to library" re-upsert (compile already upserts; this is explicit retry). */
  const [libraryReSaveBusy, setLibraryReSaveBusy] = useState(false);
  const [docxExportBusy, setDocxExportBusy] = useState(false);
  const [libraryToast, setLibraryToast] = useState<string | null>(null);
  /** Toast for template customize flow (Save / Download with fresh compile). */
  const [customizeExportToast, setCustomizeExportToast] = useState<string | null>(null);
  /** Generic feedback toast (for API policy responses like scan limits). */
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  /** Feedback after /api/apply-suggestions completes. */
  const [applyFeedback, setApplyFeedback] = useState<{
    patchesApplied: number;
    patchesFailed: number;
    rescoring: boolean;
  } | null>(null);
  const [applyBusy, setApplyBusy] = useState(false);
  /** Incremented each time apply-suggestions succeeds — forces PDF viewer remount even if URL is unchanged. */
  const [applySeq, setApplySeq] = useState(0);
  /** Active tab in the results-phase DetailedRatingsView — lifted so clicking a resume line can switch tabs. */
  const [resultsActiveTab, setResultsActiveTab] = useState<import("@/components/DetailedRatingsView").Tab>("overall");
  /** Fast pre-analysis via /api/analyze — shows scoring before PDF compile. */
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  /** Index-based preview overrides (same model as Analyze). */
  const [tailorBulletAnalysis, setTailorBulletAnalysis] = useState<LiveBulletItem[]>([]);
  const [tailorLineOverrides, setTailorLineOverrides] = useState<Record<number, string>>({});
  const [tailorAppliedBulletIndices, setTailorAppliedBulletIndices] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    if (!feedbackToast) return;
    const t = window.setTimeout(() => setFeedbackToast(null), 5200);
    return () => window.clearTimeout(t);
  }, [feedbackToast]);
  const hasWebResearch = searchQueries.length > 0 || searchSources.length > 0;
  /** After Template gallery / content picker / manual form — compile PDF from layout + extract only (no JD UI). */
  const [studioHandoff, setStudioHandoff] = useState(() => builderSession0?.studioHandoff ?? false);

  // ── Suggestions state (via useSuggestionsStore) ────────────────────────────
  const suggestions        = useSuggestionsStore((s) => s.suggestions);
  const suggestSummary     = useSuggestionsStore((s) => s.summary);
  const strategicTips      = useSuggestionsStore((s) => s.strategicTips);
  const interviewQuestions = useSuggestionsStore((s) => s.interviewQuestions);
  const suggestLoading     = useSuggestionsStore((s) => s.loading);
  const suggestCoachStreamText = useSuggestionsStore((s) => s.streamText);
  const suggestError       = useSuggestionsStore((s) => s.error);
  const suggestLoaderStepsDone = useSuggestionsStore((s) => s.stepsDone);
  const acceptedIds        = useSuggestionsStore((s) => s.acceptedIds);
  const rejectedIds        = useSuggestionsStore((s) => s.rejectedIds);
  const selectedSuggestionId = useSuggestionsStore((s) => s.selectedId);
  const hydrateSuggestions = useSuggestionsStore((s) => s.hydrate);
  const appendSuggestStream = useSuggestionsStore((s) => s.appendStream);
  const setSuggestLoading = useSuggestionsStore((s) => s.setLoading);
  const setSuggestError = useSuggestionsStore((s) => s.setError);
  const acceptSuggestion = useSuggestionsStore((s) => s.accept);
  const rejectSuggestion = useSuggestionsStore((s) => s.reject);
  const undoAcceptSuggestion = useSuggestionsStore((s) => s.undoAccept);
  const undoRejectSuggestion = useSuggestionsStore((s) => s.undoReject);
  const selectSuggestion = useSuggestionsStore((s) => s.select);
  const resetSuggestions = useSuggestionsStore((s) => s.reset);
  /** Clear coach suggestions without re-applying the current list (reset + hydrate was re-opening review). */
  const clearSuggestionsState = useCallback(() => {
    selectSuggestion(null);
    resetSuggestions();
    setSuggestError(null);
    setSuggestResearchDigest("");
    setSuggestResearchQueries([]);
    setSuggestResearchSources([]);
  }, [resetSuggestions, selectSuggestion, setSuggestError]);
  const suggestStreamAbortRef = useRef<AbortController | null>(null);
  const generateStreamAbortRef = useRef<AbortController | null>(null);
  const resetActiveTailorWork = useCallback(() => {
    suggestStreamAbortRef.current?.abort();
    suggestStreamAbortRef.current = null;
    generateStreamAbortRef.current?.abort();
    generateStreamAbortRef.current = null;
    setSuggestLoading(false);
    setGenerating(false);
    setStatusMsg("");
  }, [setSuggestLoading]);
  const tryAnotherJob = useCallback(() => {
    resetActiveTailorWork();
    clearSuggestionsState();
    setResult(null);
    setPreview("");
    setJd("");
    setCompany("");
    setRole("");
    setAtsResult(null);
    setAtsError(null);
    clearDraft();
  }, [clearSuggestionsState, resetActiveTailorWork]);

  useEffect(() => {
    return () => {
      suggestStreamAbortRef.current?.abort();
      generateStreamAbortRef.current?.abort();
    };
  }, []);

  const builderMainScrollRef = useRef<HTMLElement | null>(null);
  const scrollBuilderToTop = useCallback((behavior: ScrollBehavior = "auto") => {
    builderMainScrollRef.current?.scrollTo({ top: 0, behavior });
    if (typeof document !== "undefined") {
      document.getElementById("resume-builder-main")?.scrollTo({ top: 0, behavior });
    }
  }, []);
  /** Avoid re-running Analyze/Template session prefill + router.replace on every searchParams tick. */
  const builderPrefillAppliedRef = useRef(false);
  /** When JD text matches ``jd``, a second coach call can POST ``reuse_research_*`` to skip another web search. */
  const suggestResearchReuseGateRef = useRef<{
    jd: string;
    digest: string;
    queries: string[];
    sources: { title: string | null; url: string }[];
  } | null>(null);
  const [suggestLoaderTipIdx, setSuggestLoaderTipIdx] = useState(0);
  const [generateLoaderTipIdx, setGenerateLoaderTipIdx] = useState(0);
  const [generateLoaderStepsDone, setGenerateLoaderStepsDone] = useState(0);
  const [uploadLoaderStep, setUploadLoaderStep] = useState(0);
  const [uploadLoaderTipIdx, setUploadLoaderTipIdx] = useState(0);
  /** Linked selection: click a highlighted résumé line → scroll/highlight matching suggestion card (Analyze-style). */

  /** Template handoff — post-compile UI: HTML live paper (instant Style tab) + exported PDF; Save / Download run a fresh compile. */
  const [customizeTab, setCustomizeTab] = useState<"style" | "sections" | "add">("style");
  const [previewAccentHex, setPreviewAccentHex] = useState("#1d4ed8");
  const [previewFontSize, setPreviewFontSize] = useState<"small" | "standard" | "large">("standard");
  const [previewSpacing, setPreviewSpacing] = useState<"compact" | "balanced" | "spacious">("balanced");

  // Gap-fix micro-suggestion panel state (Phase 1)
  const [gapFixLoading, setGapFixLoading] = useState<string | null>(null); // gap name being fetched
  type GapFixSuggestion = { id: string; section: string; original: string; suggested: string; reason: string; priority: string };
  const [gapFixPanel, setGapFixPanel] = useState<{
    gapName: string;
    gapNotes: string;
    suggestions: GapFixSuggestion[];
    gapType: AddressedGapAction["type"];
  } | null>(null);
  const [gapFixError, setGapFixError] = useState<string | null>(null);
  /** True while a gap-fix suggestion is being applied + PDF compiled + rescored. */
  const [gapApplyBusy, setGapApplyBusy] = useState(false);

  // Phase 3 — Gap status tracking: which gap names have been addressed
  const [addressedGaps, setAddressedGaps] = useState<Set<string>>(new Set());
  const [addressedGapActions, setAddressedGapActions] = useState<AddressedGapAction[]>([]);
  const [gapFixDrafts, setGapFixDrafts] = useState<Record<string, string>>({});
  const [tailorRescoring, setTailorRescoring] = useState(false);
  /** True after a gap fix is applied locally — the displayed match score is now
   *  optimistic and a real /api/analyze re-check is available on demand. */
  const [scoreStale, setScoreStale] = useState(false);

  useEffect(() => {
    if (!gapFixPanel?.gapName) {
      setGapFixDrafts({});
      return;
    }
    const next: Record<string, string> = {};
    for (const s of gapFixPanel.suggestions) {
      next[s.id] = s.suggested;
    }
    setGapFixDrafts(next);
  }, [gapFixPanel?.gapName, gapFixPanel?.suggestions]);

  // Phase 2 — Inline bullet editor state
  const [bulletEditorOpen, setBulletEditorOpen] = useState(false);
  const [bulletEdits, setBulletEdits] = useState<Map<number, string>>(new Map());

  const [candidateProfile,    setCandidateProfile]    = useState<string | null>(
    () => builderSession0?.candidateProfile ?? null,
  );
  const [resumeHeaderLines, setResumeHeaderLines] = useState<string[]>([]);
  const [matchSidebarCollapsed, setMatchSidebarCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900,
  );
  const [uploadedFileName,    setUploadedFileName]    = useState<string | null>(
    () => builderSession0?.uploadedFileName ?? null,
  );
  const { upload: uploadResume, loading: uploadingPdf, error: uploadError, clearError: clearUploadError } = useUploadResume();
  const [uploadTypeError, setUploadTypeError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Latest PDF extract text — used to merge into saved Profile */
  const lastResumeExtractRef = useRef<string>("");
  /** Structured resume from upload / generate-stream — drives Tailor WYSIWYG preview (not text parse). */
  const [structuredUpload, setStructuredUpload] = useState<{
    profile: string;
    structured: StructuredResume;
  } | null>(() => builderSession0?.structuredUpload ?? null);
  /** Object URL for the last uploaded PDF — powers true PDF highlights in suggestions (revoked on replace / unmount). */
  const sourcePdfBlobUrlRef = useRef<string | null>(null);
  const [uploadedPdfDataUrl, setUploadedPdfDataUrl] = useState<string | null>(
    () => builderSession0?.uploadedPdfDataUrl ?? null,
  );
  /** Displayed PDF URL: prefer fresh blob URL from current session, fall back to persisted data URL. */
  const [sourcePdfBlobUrl, setSourcePdfBlobUrl] = useState<string | null>(
    () => builderSession0?.uploadedPdfDataUrl ?? null,
  );
  const [profileSyncUpsell, setProfileSyncUpsell] = useState<{
    autoFilled: boolean;
    filledLabels: string[];
    hintedCount: number;
  } | null>(null);
  const [profileAutofillUpload, setProfileAutofillUpload] = useState(false);
  const profileAutofillCheckboxId = useId();

  const [extractingJd, setExtractingJd] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const acceptedDepsKey = [...acceptedIds].sort().join("\0");
  const rejectedDepsKey = [...rejectedIds].sort().join("\0");
  const suggestionPdfDocKey = useMemo(
    () => `${sourcePdfBlobUrl ?? ""}\u001e${acceptedDepsKey}\u001e${rejectedDepsKey}`,
    [sourcePdfBlobUrl, acceptedDepsKey, rejectedDepsKey],
  );

  useEffect(() => {
    lastResumeExtractRef.current = (candidateProfile ?? "").trim();
  }, [candidateProfile]);

  useEffect(() => () => {
    if (sourcePdfBlobUrlRef.current) {
      URL.revokeObjectURL(sourcePdfBlobUrlRef.current);
      sourcePdfBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    saveBuilderSessionToDraft({
      v: 1,
      candidateProfile,
      uploadedFileName,
      uploadedPdfDataUrl,
      baseFolder,
      studioHandoff,
      suggestions,
      suggestSummary,
      strategicTips,
      interviewQuestions,
      acceptedSuggestionIds: [...acceptedIds],
      rejectedSuggestionIds: [...rejectedIds],
      result,
      suggestResearchDigest,
      suggestResearchQueries,
      suggestResearchSources,
      // Ref, not state — persisted opportunistically whenever another field
      // changes. On upload, candidateProfile changes in the same tick the ref is
      // set, so this captures it; restored into the ref on next mount.
      structuredUpload,
    });
  }, [
    candidateProfile,
    uploadedFileName,
    uploadedPdfDataUrl,
    baseFolder,
    studioHandoff,
    suggestions,
    suggestSummary,
    strategicTips,
    interviewQuestions,
    acceptedDepsKey,
    rejectedDepsKey,
    result,
    suggestResearchDigest,
    suggestResearchQueries,
    suggestResearchSources,
    structuredUpload,
  ]);

  // Restore suggestions store from localStorage on mount (survives page refresh)
  useEffect(() => {
    const s0 = builderSession0;
    if (s0?.suggestions && s0.suggestions.length > 0) {
      hydrateSuggestions(
        s0.suggestions,
        s0.suggestSummary,
        s0.strategicTips,
        s0.interviewQuestions,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount only

  useEffect(() => {
    setProfileAutofillUpload(getProfileAutofillFromUpload());
  }, []);

  useEffect(() => {
    if (!suggestLoading) {
      setSuggestLoaderTipIdx(0);
      return;
    }
    const phaseTicker = setInterval(() => {
      useSuggestionsStore.getState().incrementStep();
    }, 2800);
    const tipTicker = setInterval(() => {
      setSuggestLoaderTipIdx((i) => (i + 1) % SUGGEST_LOADER_TIPS.length);
    }, 2600);
    return () => {
      clearInterval(phaseTicker);
      clearInterval(tipTicker);
    };
  }, [suggestLoading]);

  useEffect(() => {
    if (!generating) {
      setGenerateLoaderTipIdx(0);
      setGenerateLoaderStepsDone(0);
      return;
    }
    const phaseTicker = setInterval(() => {
      setGenerateLoaderStepsDone((s) => Math.min(s + 1, 3));
    }, 3200);
    const tipTicker = setInterval(() => {
      setGenerateLoaderTipIdx((i) => (i + 1) % GENERATE_LOADER_TIPS.length);
    }, 2800);
    return () => {
      clearInterval(phaseTicker);
      clearInterval(tipTicker);
    };
  }, [generating]);

  useEffect(() => {
    if (!uploadingPdf) {
      setUploadLoaderStep(0);
      setUploadLoaderTipIdx(0);
      return;
    }
    const stepTicker = setInterval(() => {
      setUploadLoaderStep((s) => Math.min(s + 1, 2));
    }, 2200);
    const tipTicker = setInterval(() => {
      setUploadLoaderTipIdx((i) => (i + 1) % UPLOAD_LOADER_TIPS.length);
    }, 3000);
    return () => {
      clearInterval(stepTicker);
      clearInterval(tipTicker);
    };
  }, [uploadingPdf]);

  // Prefill from Analyze (`fromAnalyze=1`) or Template Studio (`fromTemplateStudio=1`) — run once.
  useEffect(() => {
    if (typeof window === "undefined" || builderPrefillAppliedRef.current) return;
    const sp = new URLSearchParams(searchParams.toString());
    const intentJob = sp.get("intent") === "job";
    const fromAnalyze = sp.get("fromAnalyze") === "1";
    const fromTemplateStudio = sp.get("fromTemplateStudio") === "1";
    const flow = (sp.get("flow") || "tailor").toLowerCase();

    if (!intentJob && !fromAnalyze && !fromTemplateStudio) return;

    builderPrefillAppliedRef.current = true;

    if (intentJob) {
      setStudioHandoff(false);
      try {
        sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
        const profile = sessionStorage.getItem("rn_builder_profile_prefill");
        const structRaw = sessionStorage.getItem("rn_builder_structured_prefill");
        const jdPre = sessionStorage.getItem(TAILOR_PREFILL_JD);
        const companyPre = sessionStorage.getItem(TAILOR_PREFILL_COMPANY);
        const rolePre = sessionStorage.getItem(TAILOR_PREFILL_ROLE);
        if (profile) {
          setCandidateProfile(profile);
          setUploadedFileName("From library");
          setResult(null);
          setPreview("");
        }
        if (profile && structRaw) {
          try {
            const parsed = normalizeStructuredResume(JSON.parse(structRaw) as StructuredResume);
            if (parsed && isStructuredUsable(parsed)) {
              setStructuredUpload({ profile, structured: parsed });
            }
          } catch { /* ignore */ }
        }
        if (jdPre) {
          setJdRaw(jdPre);
          saveDraft({ jd: jdPre });
        }
        if (companyPre) {
          setCompanyRaw(companyPre);
          saveDraft({ company: companyPre });
        }
        if (rolePre) {
          setRoleRaw(rolePre);
          saveDraft({ role: rolePre });
        }
        sessionStorage.removeItem(TAILOR_PREFILL_JD);
        sessionStorage.removeItem(TAILOR_PREFILL_COMPANY);
        sessionStorage.removeItem(TAILOR_PREFILL_ROLE);
      } catch { /* ignore */ }
      sp.delete("intent");
      const qs = sp.toString();
      router.replace(qs ? `/?${qs}` : "/?view=builder&flow=tailor");
      return;
    }

    try {
      const profile = sessionStorage.getItem("rn_builder_profile_prefill");
      const jdPre = sessionStorage.getItem(TAILOR_PREFILL_JD);
      const companyPre = sessionStorage.getItem(TAILOR_PREFILL_COMPANY);
      const rolePre = sessionStorage.getItem(TAILOR_PREFILL_ROLE);
      if ((fromAnalyze || fromTemplateStudio) && profile) {
        setCandidateProfile(profile);
        setUploadedFileName(fromTemplateStudio ? "From template studio" : "From Analyze");
        setResult(null);
        setPreview("");
        try {
          const structRaw = sessionStorage.getItem("rn_builder_structured_prefill");
          if (structRaw) {
            const parsed = normalizeStructuredResume(JSON.parse(structRaw) as StructuredResume);
            if (parsed && isStructuredUsable(parsed)) {
              setStructuredUpload({ profile, structured: parsed });
            }
            sessionStorage.removeItem("rn_builder_structured_prefill");
          }
        } catch { /* ignore */ }
      }
      if (jdPre) {
        setJdRaw(jdPre);
        saveDraft({ jd: jdPre });
      }
      if (companyPre) {
        setCompanyRaw(companyPre);
        saveDraft({ company: companyPre });
      }
      if (rolePre) {
        setRoleRaw(rolePre);
        saveDraft({ role: rolePre });
      }
      if (fromAnalyze) {
        sessionStorage.removeItem("rn_builder_profile_prefill");
        sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
      }
      sessionStorage.removeItem(TAILOR_PREFILL_JD);
      sessionStorage.removeItem(TAILOR_PREFILL_COMPANY);
      sessionStorage.removeItem(TAILOR_PREFILL_ROLE);
      sessionStorage.removeItem("rn_builder_from_analyze");
      if (fromTemplateStudio) sessionStorage.removeItem("rn_builder_profile_prefill");
    } catch { /* ignore */ }

    if (fromAnalyze && flow === "tailor") {
      setStudioHandoff(false);
      const baseQ = sp.get("base");
      const styleRef = sp.get("styleRef");
      let next = "/?view=builder&flow=tailor";
      if (baseQ) next += `&base=${encodeURIComponent(baseQ)}`;
      if (styleRef) next += `&styleRef=${encodeURIComponent(styleRef)}`;
      router.replace(next);
    } else if (fromTemplateStudio) {
      try {
        sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
      } catch { /* ignore */ }
      router.replace("/template-builder/");
    }
  }, [router, searchParams]);

  // ── ATS state — populated lazily when the user opens the ATS panel. ──
  const [atsResult,    setAtsResult]    = useState<AtsResult | null>(null);
  const [atsLoading,   setAtsLoading]   = useState(false);
  const [atsError,     setAtsError]     = useState<string | null>(null);
  const [atsOAuthBusy, setAtsOAuthBusy] = useState(false);

  const importFromUrl = useCallback(async (): Promise<{ company?: string; role?: string; job_description?: string } | null> => {
    const url = jobUrl.trim();
    if (!url) { setExtractError("Paste a job posting URL first."); return null; }
    setExtractingJd(true);
    setExtractError(null);
    try {
      const resp = await fetch(apiUrl("/api/extract-jd"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await parseJsonOrThrow<{ error?: string; company?: string; role?: string; job_description?: string }>(resp);
      if (!resp.ok) throw new Error(toUserFriendlyErrorMessage(json.error ?? "Couldn't extract JD from that URL."));
      if (json.company) setCompany(json.company);
      if (json.role)    setRole(json.role);
      if (json.job_description) setJd(json.job_description);
      return {
        company: json.company,
        role: json.role,
        job_description: json.job_description,
      };
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setExtractingJd(false);
    }
  }, [jobUrl]);

  const [user, setUser] = useState<User | null>(null);
  /** After first getSession completes — avoids auto-ATS racing before user is known. */
  const [authReady, setAuthReady] = useState(false);
  const [styleReferenceFolder, setStyleReferenceFolderState] = useState(DEFAULT_REFERENCE_FOLDER);

  const setStyleReferenceFolder = useCallback((folder: string) => {
    const next = isValidResumeStyleFolder(folder) ? folder : DEFAULT_REFERENCE_FOLDER;
    setStyleReferenceFolderState(next);
    saveDraft({ styleReferenceFolder: next });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let next: string | null = null;
    const q = new URLSearchParams(window.location.search).get("styleRef");
    if (q && isValidResumeStyleFolder(q)) next = q;
    if (!next) {
      try {
        const s = sessionStorage.getItem("rn_builder_style_ref");
        if (s && isValidResumeStyleFolder(s)) next = s;
      } catch { /* ignore */ }
    }
    if (!next) {
      try {
        const d = loadDraft();
        if (typeof d.styleReferenceFolder === "string" && isValidResumeStyleFolder(d.styleReferenceFolder)) {
          next = d.styleReferenceFolder;
        }
      } catch { /* ignore */ }
    }
    if (next) setStyleReferenceFolderState(next);
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setUser(data.session?.user ?? null);
      })
      .finally(() => {
        if (!cancelled) setAuthReady(true);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user ?? null));
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signInForAts = useCallback(async () => {
    setAtsOAuthBusy(true);
    setAtsError(null);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
          : undefined;
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setAtsError(error.message);
    } catch (e: unknown) {
      setAtsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAtsOAuthBusy(false);
    }
  }, []);

  const runAtsCheck = useCallback(async (folder: string, updateMatchScore = false) => {
    if (!user?.id) {
      setAtsError("Sign in to run ATS and job match.");
      return;
    }
    setAtsLoading(true);
    setAtsError(null);
    try {
      const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      let parsedSlim: { sections: ParsedSection[] } | undefined;
      try {
        const uid = user.id;
        const parseUrl =
          apiUrl(`/api/resume/${encodeURIComponent(folder)}`) +
          `?user_id=${encodeURIComponent(uid)}`;
        const pr = await fetch(parseUrl);
        if (pr.ok) {
          const parsed = await parseJsonOrThrow<{ sections?: ParsedSection[]; error?: string }>(pr);
          if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
            parsedSlim = { sections: parsed.sections };
          }
        }
      } catch {
        /* optional — ATS falls back to PDF line heuristics for bullets */
      }

      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const resp = await fetch(apiUrl(`/api/ats-check/${encodeURIComponent(folder)}`), {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            jd: jd.slice(0, 8000),
            user_id: user.id,
            target_role: role.trim(),
            ...(parsedSlim ? { parsed: parsedSlim } : {}),
          }),
        });
        const json = await parseJsonOrThrow<AtsResult & { error?: string }>(resp);
        if (resp.ok) {
          const normalized = normalizeAtsResult(json);
          setAtsResult(normalized);
          // When called after applying suggestions, also update the match score in ratings
          if (updateMatchScore && normalized.score > 0) {
            setResult((prev) => {
              if (!prev?.ratings || !("overall_score" in prev.ratings)) return prev;
              return {
                ...prev,
                ratings: {
                  ...prev.ratings,
                  overall_score: normalized.score,
                  match_score: normalized.score,
                },
              };
            });
          }
          lastErr = null;
          break;
        }
        const msg = toUserFriendlyErrorMessage(json.error ?? "ATS check failed.");
        lastErr = new Error(msg);
        const retryableNotFound =
          resp.status === 404 && /not found locally or in storage/i.test(msg);
        if (!retryableNotFound || attempt === 1) break;
        await delay(1400);
      }
      if (lastErr) throw lastErr;
    } catch (e: unknown) {
      setAtsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAtsLoading(false);
    }
  }, [jd, user, role]);

  const atsAutoRanForRef = useRef<string | null>(null);

  // Drop ATS when signed out (API requires a real user id).
  useEffect(() => {
    if (!authReady) return;
    if (!user?.id) {
      atsAutoRanForRef.current = null;
      setAtsResult(null);
      setAtsError(null);
    }
  }, [authReady, user?.id]);

  // Reset ATS when a new résumé folder is generated
  useEffect(() => {
    atsAutoRanForRef.current = null;
    setAtsResult(null);
    setAtsError(null);
  }, [result?.folder]);

  // Auto-run ATS once per folder + PDF (signed-in users only). Skip for template/layout handoff.
  useEffect(() => {
    if (studioHandoff) return;
    if (!authReady || !user?.id || !result?.folder || !result?.pdfUrl || atsLoading) return;
    const runKey = `${result.folder}|${result.pdfUrl}`;
    if (atsAutoRanForRef.current === runKey) return;
    atsAutoRanForRef.current = runKey;
    void runAtsCheck(result.folder);
  }, [authReady, user?.id, result?.folder, result?.pdfUrl, atsLoading, studioHandoff, runAtsCheck]);

  const tailorStructuredResume = useMemo<StructuredResume | null>(() => {
    const normalized = normalizeStructuredResume(structuredUpload?.structured ?? null);
    return isStructuredUsable(normalized) ? normalized : null;
  }, [structuredUpload]);

  const applyStructuredFromAnalyze = useCallback((raw: Record<string, unknown>, profile?: string) => {
    const sr = normalizeStructuredResume(
      (raw.structuredResume ?? raw.structured_resume) as StructuredResume | null | undefined,
    );
    if (!sr || !isStructuredUsable(sr)) return;
    const prof = (profile ?? candidateProfile ?? "").trim();
    if (!prof) return;
    setStructuredUpload({ profile: prof, structured: sr });
  }, [candidateProfile]);

  const handleAnalyze = useCallback(async () => {
    const effJd = jd.trim();
    const profile = (candidateProfile ?? "").trim();
    if (!effJd) { setAnalyzeError("Please paste a job description first."); return; }
    if (!profile) { setAnalyzeError("Please upload your résumé first."); return; }
    const canUseClientStructured = Boolean(
      tailorStructuredResume
      && profile === (structuredUpload?.profile ?? "").trim(),
    );
    setAnalyzing(true);
    setAnalyzeError(null);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_profile: profile,
          job_description: effJd,
          include_bullet_analysis: true,
          include_structured_resume: true,
          ...(canUseClientStructured ? { structured_resume: tailorStructuredResume } : {}),
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        let msg = `Analysis failed (HTTP ${resp.status})`;
        try {
          const j = JSON.parse(body) as { error?: string; code?: string; limit?: number };
          if (j?.error) msg = j.error;
          if (resp.status === 429 && j?.code === "daily_scan_limit_reached") {
            const freeLimit = Number.isFinite(Number(j?.limit)) && Number(j.limit) > 0 ? Number(j.limit) : 5;
            setFeedbackToast(
              `Daily limit reached. UMBC students get unlimited scans. Other users get ${freeLimit} scans/day for free.`,
            );
          }
        } catch {
          /* */
        }
        throw new Error(toUserFriendlyErrorMessage(msg));
      }
      const raw = await resp.json() as Record<string, unknown>;
      const data = mergeAnalyzeApiJson(raw) as { ratings?: RatingsData; error?: string; bulletAnalysis?: LiveBulletItem[] };
      if (data.error || !data.ratings) throw new Error(data.error ?? "Analysis returned no ratings");
      applyStructuredFromAnalyze(raw, candidateProfile ?? undefined);
      setTailorBulletAnalysis(Array.isArray(data.bulletAnalysis) ? data.bulletAnalysis : []);
      setTailorLineOverrides({});
      setTailorAppliedBulletIndices(new Set());
      setAddressedGaps(new Set());
      setAddressedGapActions([]);
      setScoreStale(false);

      const effCompany = company.trim() || "—";
      const effRole = role.trim() || "—";
      const matchFolder = tailorMatchFolder(effCompany, effRole);
      let nextResult: GenerationResult = {
        ...EMPTY_RESULT,
        ratings: data.ratings,
        folder: matchFolder,
      };

      if (user?.id) {
        try {
          await saveTailorMatchToLibrary({
            folder: matchFolder,
            company: effCompany,
            role: effRole,
            model,
            ratings: data.ratings,
            jobDescription: effJd,
            candidateProfile,
            structuredResume: normalizeStructuredResume(
              (raw.structuredResume ?? raw.structured_resume) as StructuredResume | null,
            ),
          });
        } catch (e) {
          console.warn("saveTailorMatchToLibrary failed", e);
        }
      }

      setResult(nextResult);
    } catch (e: unknown) {
      setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [jd, candidateProfile, company, role, model, user?.id, tailorStructuredResume, structuredUpload?.profile, applyStructuredFromAnalyze]);

  /** Re-run JD match ratings on updated plain text (no LaTeX / no ATS folder).
   * Pass bulletsAtApply/overridesAtApply/appliedAtApply when calling from applyGapFixes
   * to avoid stale-closure clobbering the just-applied overrides. */
  const rescoreTailorRatings = useCallback(async (
    profileOverride?: string,
    bulletsAtApply?: LiveBulletItem[],
    overridesAtApply?: Record<number, string>,
    appliedAtApply?: ReadonlySet<number>,
  ) => {
    const effectiveBullets  = bulletsAtApply   ?? tailorBulletAnalysis;
    const effectiveOverrides = overridesAtApply ?? tailorLineOverrides;
    const effectiveApplied   = appliedAtApply   ?? tailorAppliedBulletIndices;
    const prof = (
      profileOverride
      ?? synthesizeProfileWithBulletOverrides(
        candidateProfile ?? "",
        effectiveBullets,
        effectiveOverrides,
      )
    ).trim();
    if (!prof || !jd.trim()) return false;
    const canUseClientStructured = Boolean(
      tailorStructuredResume
      && prof === (structuredUpload?.profile ?? "").trim(),
    );
    setTailorRescoring(true);
    try {
      const resp = await fetch(apiUrl("/api/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_profile: prof,
          job_description: jd.trim(),
          include_bullet_analysis: true,
          include_structured_resume: true,
          ...(canUseClientStructured ? { structured_resume: tailorStructuredResume } : {}),
          addressed_gaps: addressedGapActions,
        }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => "");
        try {
          const j = JSON.parse(body) as { code?: string; limit?: number };
          if (resp.status === 429 && j?.code === "daily_scan_limit_reached") {
            const freeLimit = Number.isFinite(Number(j?.limit)) && Number(j.limit) > 0 ? Number(j.limit) : 5;
            setFeedbackToast(
              `Daily limit reached. UMBC students get unlimited scans. Other users get ${freeLimit} scans/day for free.`,
            );
          }
        } catch {
          /* */
        }
        return false;
      }
      const raw = await resp.json() as Record<string, unknown>;
      const data = mergeAnalyzeApiJson(raw) as {
        ratings?: RatingsData;
        error?: string;
        bulletAnalysis?: LiveBulletItem[];
      };
      if (data.error || !data.ratings) return false;

      applyStructuredFromAnalyze(raw, prof);

      const mergedRatings = mergeRescorePreservingAddressedGaps(
        data.ratings,
        addressedGaps,
        addressedGapActions,
      );

      const matchFolder =
        result?.folder ?? tailorMatchFolder(company.trim() || "—", role.trim() || "—");
      if (user?.id && matchFolder) {
        try {
          const sr = normalizeStructuredResume(
            (raw.structuredResume ?? raw.structured_resume) as StructuredResume | null,
          );
          await saveTailorMatchToLibrary({
            folder: matchFolder,
            company: company.trim() || "—",
            role: role.trim() || "—",
            model,
            ratings: mergedRatings,
            jobDescription: jd.trim(),
            candidateProfile: prof,
            structuredResume: sr,
          });
        } catch (e) {
          console.warn("saveTailorMatchToLibrary (rescore) failed", e);
        }
      }

      setResult((prev) => (
        prev ? { ...prev, ratings: mergedRatings, folder: matchFolder ?? prev.folder } : prev
      ));

      if (Array.isArray(data.bulletAnalysis) && data.bulletAnalysis.length > 0) {
        const newBullets = data.bulletAnalysis;
        const remappedOverrides = remapLineOverrides(
          effectiveOverrides,
          effectiveBullets,
          newBullets,
        );
        const remappedApplied = new Set<number>();
        for (const oldIdx of effectiveApplied) {
          const oldOrig = effectiveBullets[oldIdx]?.originalBullet ?? "";
          const overrideText = effectiveOverrides[oldIdx] ?? "";
          let newIdx = oldOrig
            ? matchOriginalToBulletIndex(oldOrig, newBullets, prof)
            : -1;
          if (newIdx < 0 && overrideText.trim()) {
            newIdx = matchOriginalToBulletIndex(overrideText, newBullets, prof);
          }
          if (newIdx >= 0) remappedApplied.add(newIdx);
        }
        setTailorBulletAnalysis(newBullets);
        setTailorLineOverrides(remappedOverrides);
        setTailorAppliedBulletIndices(remappedApplied);
      }
      setScoreStale(false);
      return true;
    } catch {
      return false;
    } finally {
      setTailorRescoring(false);
    }
  }, [
    candidateProfile, jd, company, role, model, user?.id, result?.folder,
    tailorBulletAnalysis, tailorLineOverrides, addressedGaps, addressedGapActions,
    tailorAppliedBulletIndices, tailorStructuredResume, structuredUpload?.profile, applyStructuredFromAnalyze,
  ]);

  /** Plain text with tailor bullet overrides applied (for gap-fix API + rescoring). */
  const effectiveCandidateProfile = useMemo(
    () => synthesizeProfileWithBulletOverrides(
      candidateProfile ?? "",
      tailorBulletAnalysis,
      tailorLineOverrides,
    ),
    [candidateProfile, tailorBulletAnalysis, tailorLineOverrides],
  );

  const tailorPreviewBullets = tailorBulletAnalysis;

  const tailorGapFixHighlights = useMemo(
    () => (gapFixPanel?.suggestions ?? []).map((s) => s.original).filter(Boolean),
    [gapFixPanel?.suggestions],
  );

  const gapFixTargetIndices = useMemo(() => {
    if (!gapFixPanel?.suggestions.length) return [];
    return gapFixTargetBulletIndices(
      gapFixPanel.suggestions,
      tailorBulletAnalysis,
      effectiveCandidateProfile,
    );
  }, [gapFixPanel, tailorBulletAnalysis, effectiveCandidateProfile]);

  const getSuggestions = useCallback(async (
    focusGaps?: Array<{ name: string; score: number }>,
  ) => {
    let effJd = jd.trim();
    if (!effJd && studioHandoff) {
      effJd = (candidateProfile ?? "").trim()
        ? "No specific job — optimize structure and measurable impact for a general application."
        : "No specific job posting yet.";
    }
    if (!effJd) { setSuggestError("Please paste a job description first."); return; }
    if (!candidateProfile) { setSuggestError("Please upload your resume first."); return; }

    const jdKey = effJd.trim();
    const reuseGate = suggestResearchReuseGateRef.current;
    const canReuseResearch =
      !!reuseGate &&
      reuseGate.jd === jdKey &&
      reuseGate.digest.trim().length >= 40;
    const reuseResearchBody = canReuseResearch
      ? {
          reuse_research_digest: reuseGate.digest.slice(0, 4800),
          reuse_research_queries: reuseGate.queries,
          reuse_research_sources: reuseGate.sources,
        }
      : {};

    suggestStreamAbortRef.current?.abort();
    const ac = new AbortController();
    suggestStreamAbortRef.current = ac;

    resetSuggestions();       // reset first — clears stale data (also resets loading to false)
    setSuggestLoading(true);  // set loading AFTER reset so it isn't wiped
    setSuggestError(null);
    scrollBuilderToTop("auto");

    setSuggestResearchQueries([]);
    setSuggestResearchSources([]);
    setSuggestResearchDigest("");

    try {
      const resp = await fetch(apiUrl("/api/suggest-changes-stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate_profile: candidateProfile,
          job_description: effJd,
          ...reuseResearchBody,
          ...(focusGaps && focusGaps.length > 0 ? { focus_gaps: focusGaps } : {}),
        }),
        signal: ac.signal,
      });

      if (!resp.ok) {
        const ct = resp.headers.get("content-type") ?? "";
        const body = await resp.text().catch(() => "");
        if (!ct.includes("application/json")) {
          throw new Error(messageForNonJsonApiFailure(resp.status, body));
        }
        let msg = `HTTP ${resp.status}`;
        try {
          const j = JSON.parse(body) as { error?: string };
          if (j?.error) msg = j.error;
          else if (body.trim()) msg = body.trim().slice(0, 400);
        } catch {
          if (body.trim()) msg = body.trim().slice(0, 400);
        }
        throw new Error(toUserFriendlyErrorMessage(msg));
      }
      if (!resp.body) throw new Error("No response body");

      let sawCoachDone = false;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let ev: {
            event?: string;
            msg?: string;
            text?: string;
            summary?: string;
            strategic_tips?: unknown;
            interview_questions?: unknown;
            suggestions?: unknown;
            research_queries?: string[];
            research_sources?: { title?: string | null; url?: string }[];
            research_digest?: string;
          };
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }

          switch (ev.event) {
            case "status":
              break;
            case "research": {
              const rq = Array.isArray(ev.research_queries)
                ? ev.research_queries.filter((q): q is string => typeof q === "string")
                : [];
              const rs = Array.isArray(ev.research_sources)
                ? ev.research_sources
                    .filter((s): s is { title?: string | null; url: string } => s && typeof s.url === "string")
                    .map(s => ({ title: s.title ?? null, url: s.url }))
                : [];
              setSuggestResearchQueries(rq);
              setSuggestResearchSources(rs);
              setSuggestResearchDigest(typeof ev.research_digest === "string" ? ev.research_digest : "");
              useSuggestionsStore.getState().incrementStep();
              useSuggestionsStore.getState().incrementStep();
              useSuggestionsStore.getState().incrementStep();
              break;
            }
            case "coach_delta": {
              const t = typeof ev.text === "string" ? ev.text : "";
              if (!t) break;
              appendSuggestStream(t);
              break;
            }
            case "coach_done": {
              sawCoachDone = true;
              const list = Array.isArray(ev.suggestions)
                ? ev.suggestions.filter(isSuggestionRecord)
                : [];
              hydrateSuggestions(
                list,
                typeof ev.summary === "string" ? ev.summary : "",
                parseStrategicTips(ev.strategic_tips),
                parseInterviewQuestions(ev.interview_questions),
              );
              const rq = Array.isArray(ev.research_queries)
                ? ev.research_queries.filter((q): q is string => typeof q === "string")
                : [];
              const rs = Array.isArray(ev.research_sources)
                ? ev.research_sources
                    .filter((s): s is { title?: string | null; url: string } => s && typeof s.url === "string")
                    .map(s => ({ title: s.title ?? null, url: s.url }))
                : [];
              setSuggestResearchQueries(rq);
              setSuggestResearchSources(rs);
              const digestDone = typeof ev.research_digest === "string" ? ev.research_digest : "";
              setSuggestResearchDigest(digestDone);
              if (digestDone.trim().length >= 40) {
                suggestResearchReuseGateRef.current = {
                  jd: jdKey,
                  digest: digestDone.trim(),
                  queries: rq,
                  sources: rs,
                };
              }
              break;
            }
            case "error":
              throw new Error(toUserFriendlyErrorMessage(typeof ev.msg === "string" ? ev.msg : "Suggestions failed."));
            default:
              break;
          }
        }
      }
      if (!sawCoachDone && !ac.signal.aborted) {
        throw new Error("The suggestions stream ended unexpectedly. Please try again.");
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      setSuggestError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      if (suggestStreamAbortRef.current === ac) suggestStreamAbortRef.current = null;
      setSuggestLoading(false);
    }
  }, [jd, candidateProfile, studioHandoff, hydrateSuggestions, appendSuggestStream, setSuggestLoading, setSuggestError, resetSuggestions, scrollBuilderToTop]);

  const patchSuggestionSuggested = useSuggestionsStore((s) => s.updateSuggested);

  const mergeProfileFromLastExtract = useCallback(() => {
    const text = lastResumeExtractRef.current.trim();
    if (!text) return;
    const hints = extractProfileHintsFromResumeText(text);
    const cur = loadProfile();
    const { next } = mergeProfilePreferEmpty(cur, hints);
    saveProfile(next);
    void upsertUserProfile(next);
    router.push("/?view=profile");
  }, [router]);

  const handlePdfUpload = useCallback(async (file: File) => {
    if (!isResumeUploadFile(file)) {
      clearUploadError();
      const ext = (file.name || "").split(".").pop()?.toLowerCase() ?? "";
      setUploadTypeError(ext
        ? `"${ext.toUpperCase()}" files aren't supported — please upload a PDF or Word document.`
        : "Please upload a PDF or Word document (.pdf, .docx).");
      return;
    }
    setUploadTypeError(null);
    setProfileSyncUpsell(null);
    try {
      const { text, extractedText, resumeHeader, structuredResume } = await uploadResume(file);
      const previewText = (extractedText || text).trim();
      setCandidateProfile(previewText);
      setResumeHeaderLines(resumeHeader);
      setUploadedFileName(file.name);
      lastResumeExtractRef.current = previewText;
      const normalized = normalizeStructuredResume(structuredResume);
      setStructuredUpload(
        normalized && isStructuredUsable(normalized)
          ? { profile: previewText, structured: normalized }
          : null,
      );

      if (sourcePdfBlobUrlRef.current) {
        URL.revokeObjectURL(sourcePdfBlobUrlRef.current);
        sourcePdfBlobUrlRef.current = null;
      }
      if (file.type.includes("pdf")) {
        const blobUrl = URL.createObjectURL(file);
        sourcePdfBlobUrlRef.current = blobUrl;
        setSourcePdfBlobUrl(blobUrl);

        // Persist as base64 data URL so the preview survives page refresh
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result;
          if (typeof dataUrl === "string") {
            setUploadedPdfDataUrl(dataUrl);  // triggers session save via useEffect
          }
        };
        reader.readAsDataURL(file);
      } else {
        setSourcePdfBlobUrl(null);
        setUploadedPdfDataUrl(null);
      }

      const hints = extractProfileHintsFromResumeText(previewText);
      const hintedKeys = Object.keys(hints).filter(k => String((hints as Record<string, unknown>)[k] ?? "").trim());
      const hintedCount = hintedKeys.length;
      if (hintedCount === 0) {
        setProfileSyncUpsell(null);
      } else if (getProfileAutofillFromUpload()) {
        const cur = loadProfile();
        const { next, filled } = mergeProfilePreferEmpty(cur, hints);
        saveProfile(next);
        void upsertUserProfile(next);
        const filledLabels = filled.map(f => PROFILE_FIELD_LABELS[f] ?? String(f));
        setProfileSyncUpsell({ autoFilled: true, filledLabels, hintedCount });
      } else {
        setProfileSyncUpsell({ autoFilled: false, filledLabels: [], hintedCount });
      }
    } catch {
      // uploadError is set by useUploadResume hook automatically
    } finally {
      void 0; // loading managed by useUploadResume
    }
  }, []);

  const generate = useCallback(async (): Promise<GeneratePdfOutcome | null> => {
    generateStreamAbortRef.current?.abort();
    const ac = new AbortController();
    generateStreamAbortRef.current = ac;

    setGenerating(true);
    setError(null);
    setStatusMsg("Connecting…");
    if (!(suggestions?.length)) scrollBuilderToTop("smooth");

    let effCompany = company.trim();
    let effRole    = role.trim();
    let effJd      = jd.trim();

    if (studioHandoff) {
      if (!effCompany) effCompany = "General application";
      if (!effRole) effRole = "Open role";
      if (!effJd) {
        const cp = (candidateProfile ?? "").trim();
        effJd = cp
          ? `Layout pass: apply the selected résumé template to the profile below. Preserve employers, titles, and dates; tighten wording only where needed for clarity. Output complete LaTeX for the document body.\n\n---\n${cp.slice(0, 6000)}`
          : "Layout pass: produce a polished résumé from the uploaded profile text using the selected template.";
      }
    }

    // If the user pasted a URL but any of the fields is empty, auto-import first.
    if (jobUrl.trim() && (!effCompany || !effRole || !effJd)) {
      setStatusMsg("Reading the job posting…");
      const extracted = await importFromUrl();
      if (extracted) {
        if (!effCompany && extracted.company)         effCompany = extracted.company.trim();
        if (!effRole    && extracted.role)            effRole    = extracted.role.trim();
        if (!effJd      && extracted.job_description) effJd      = extracted.job_description.trim();
      }
    }

    // If company/role are still missing but we have a JD, try to infer them from the text.
    if (!effCompany && effJd) {
      const m = effJd.match(/\bat\s+([A-Z][A-Za-z0-9\s&.,'-]{1,40}?)(?:\s*[,\n(]|$)/);
      effCompany = m?.[1]?.trim() ?? "";
      if (effCompany) setCompany(effCompany);
    }
    if (!effRole && effJd) {
      const firstLine = effJd.split(/\n/)[0]?.trim() ?? "";
      const m = effJd.match(/(?:role|position|title|job)[:\s]+([A-Za-z][A-Za-z\s/-]{2,50}?)(?:\s*[,\n(]|$)/i);
      effRole = m?.[1]?.trim() || (firstLine.length < 60 ? firstLine : "");
      if (effRole) setRole(effRole);
    }

    // Collect whatever's still missing and ask for just those.
    const missing: string[] = [];
    if (!effCompany) missing.push("company");
    if (!effRole)    missing.push("role");
    if (!effJd)      missing.push("job description");
    if (missing.length) {
      const label =
        missing.length === 1 ? missing[0]
        : missing.length === 2 ? `${missing[0]} and ${missing[1]}`
        : `${missing.slice(0, -1).join(", ")}, and ${missing[missing.length - 1]}`;
      setError(
        jobUrl.trim()
          ? `We couldn't pull the ${label} from that link — please fill it in manually.`
          : `Please fill in the ${label}.`
      );
      if (!studioHandoff) setResult(null);
      setGenerating(false);
      setStatusMsg("");
      return null;
    }

    setStatusMsg("Connecting…");
    setPreview("");
    setJdKeywords(extractJdKeywords(effJd));
    const digestTrim = suggestResearchDigest.trim();
    setSearchQueries([]);
    setSearchSources([]);
    setStorageFailures([]);

    if (!studioHandoff) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      setResult({ ...EMPTY_RESULT, baseFolder, baseLoaded: baseFolder ? null : false });
    }

    const acceptedList = (suggestions ?? []).filter(s => acceptedIds.has(s.id)).map(s => ({
      id: s.id,
      section: s.section,
      original: s.original,
      suggested: s.suggested,
      reason: s.reason,
    }));
    const tailorBodyWithAi = acceptedList.length > 0;
    const acc: GenerationResult =
      studioHandoff && result?.folder
        ? {
            ...result,
            latexPreview: "",
            diff: [],
            adds: 0,
            removes: 0,
            rationales: [],
            sources: [],
          }
        : { ...EMPTY_RESULT, baseFolder, baseLoaded: baseFolder ? null : false };

    try {
      const resp = await fetch(apiUrl("/api/generate-stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          company: effCompany, role: effRole, job_description: effJd,
          model, base_folder: baseFolder,
          // JD tailor flow uses one fixed ATS layout on the server — layout choice is only for template / PDF studio.
          reference_folder: styleReferenceFolder,
          candidate_profile: candidateProfile ?? "",
          accepted_suggestions: acceptedList.length > 0 ? acceptedList : undefined,
          user_id: user?.id ?? null,
          layout_compile: studioHandoff,
          ...(digestTrim ? { suggest_research_digest: suggestResearchDigest } : {}),
          post_suggestion_coach_run: !studioHandoff && Array.isArray(suggestions) && suggestions.length > 0,
          tailor_body_with_ai: tailorBodyWithAi,
          use_jinja_renderer: true,
          user_email: user?.email ?? null,
          // Pass the pre-parsed structured resume from the upload step so the backend
          // can skip redundant LLM re-extraction when the profile text is the same.
          ...(tailorStructuredResume ? { structured_resume: tailorStructuredResume } : {}),
        }),
      });

      if (!resp.ok) {
        const ct = resp.headers.get("content-type") ?? "";
        const body = await resp.text().catch(() => "");
        if (!ct.includes("application/json")) {
          throw new Error(messageForNonJsonApiFailure(resp.status, body));
        }
        let msg = `HTTP ${resp.status}`;
        try {
          const j = JSON.parse(body) as { error?: string };
          if (j?.error) msg = j.error;
          else if (body.trim()) msg = body.trim().slice(0, 400);
        } catch {
          if (body.trim()) msg = body.trim().slice(0, 400);
        }
        throw new Error(toUserFriendlyErrorMessage(msg));
      }
      if (!resp.body)  throw new Error("No response body");

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let ev: SSEEvent;
          try { ev = JSON.parse(line.slice(6)); } catch { continue; }

          switch (ev.event) {
            case "status":  setStatusMsg(ev.msg); break;
            case "chunk":   acc.latexPreview += ev.text; setPreview(p => p + ev.text); break;
            case "structured_doc": {
              if (ev.data && typeof ev.data === "object") {
                const normalized = normalizeStructuredResume(ev.data as unknown as StructuredResume);
                if (normalized && isStructuredUsable(normalized)) {
                  setStructuredUpload({
                    profile: (candidateProfile ?? "").trim(),
                    structured: normalized,
                  });
                }
              }
              break;
            }
            case "sources": {
              const urls = ev.urls as Source[];
              acc.sources = urls;
              // Grounding sometimes arrives only in the final `sources` bundle — mirror into
              // the live web research panel so users still see cited pages when SSE had no search_source chunks.
              for (const u of urls) {
                if (u?.url) {
                  setSearchSources(ss =>
                    ss.some(s => s.url === u.url) ? ss : [...ss, { title: u.title ?? null, url: u.url }],
                  );
                }
              }
              break;
            }
            case "search_query":
              setSearchQueries(qs => qs.includes(ev.query) ? qs : [...qs, ev.query]);
              break;
            case "search_source":
              setSearchSources(ss => ss.some(s => s.url === ev.url) ? ss : [...ss, { title: ev.title, url: ev.url }]);
              break;
            case "base":
              acc.baseFolder = ev.folder;
              acc.baseLoaded = ev.loaded;
              break;
            case "diff":    acc.diff = ev.data as DiffLine[]; acc.adds = ev.adds; acc.removes = ev.removes; break;
            case "rationales": acc.rationales = ev.data as ChangeRationale[]; break;
            case "ratings":
              acc.ratings = ev.data as RatingsData;
              setResult({ ...acc });
              break;
            case "saved":
              acc.folder = ev.folder; acc.texPath = ev.tex_path;
              setResult({ ...acc }); // Show result card immediately
              break;
            case "pdf":
              acc.pdfUrl = /^https?:\/\//.test(ev.url) ? ev.url : apiUrl(ev.url);
              setResult({ ...acc }); // Update PDF button in-place
              break;
            case "storage":
              if (!ev.stored) {
                console.warn(`Supabase Storage did not store ${ev.artifact}: ${ev.reason ?? "unknown reason"}`);
                setStorageFailures(fs => [...fs, { artifact: ev.artifact, reason: ev.reason ?? "unknown reason" }]);
              }
              break;
            case "done":
              if (acc.folder) {
                try {
                  // Wait for library row so Share and /api/share/{folder} succeed immediately after.
                  await upsertResume(
                    acc.folder,
                    effCompany,
                    effRole,
                    model,
                    acc.texPath ?? "",
                    acc.pdfUrl,
                    acc.ratings,
                    effJd,
                    {
                      renderer: "structured",
                      schemaVersion: 1,
                      appliedPatch: acceptedList.length > 0
                        ? { edits: acceptedList, source: "accepted_suggestions" }
                        : null,
                    },
                  );
                } catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  const isDuplicateFolder =
                    /duplicate key value/i.test(msg) && /resumes_folder_key/i.test(msg);

                  // Non-fatal: row already exists for this folder; keep generation success path.
                  if (isDuplicateFolder) {
                    console.warn("upsertResume duplicate resumes.folder; continuing", {
                      folder: acc.folder,
                    });
                  } else {
                    console.error("upsertResume (library row)", e);
                    setError("Resume generated, but we couldn't refresh your library right now. Please try again.");
                  }
                }
                setBaseFolder(acc.folder);
              }
              setResult({ ...acc });
              setGenerating(false);
              setStatusMsg("");
              break;
            case "error": throw new Error(toUserFriendlyErrorMessage(typeof ev.msg === "string" ? ev.msg : String(ev.msg ?? "")));
          }
        }
      }
      setGenerating(false);
      setStatusMsg("");
      if (acc.pdfUrl) {
        const pdfUrl = /^https?:\/\//.test(acc.pdfUrl) ? acc.pdfUrl : apiUrl(acc.pdfUrl);
        return { pdfUrl, folder: acc.folder ?? null };
      }
      return null;
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        return null;
      }
      setError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : String(e)));
      if (!studioHandoff) {
        setResult((r) => (r && !r.ratings && !r.pdfUrl ? null : r));
      }
      setGenerating(false);
      setStatusMsg("");
      return null;
    } finally {
      if (generateStreamAbortRef.current === ac) {
        generateStreamAbortRef.current = null;
      }
    }
  }, [company, role, jd, jobUrl, importFromUrl, baseFolder, candidateProfile, user, styleReferenceFolder, studioHandoff, suggestions, acceptedIds, result, suggestResearchDigest, suggestResearchQueries, suggestResearchSources, scrollBuilderToTop, tailorStructuredResume]);

  /** Template customize: run full compile, then optional blob download + toast. */
  const finalizeLayoutPdf = useCallback(
    async (mode: "save" | "download") => {
      if (generating) return;
      const out = await generate();
      if (!out?.pdfUrl) {
        setCustomizeExportToast(null);
        return;
      }
      const base = out.folder ?? buildResumeFileStem(company, role, candidateProfile);
      if (mode === "download") {
        try {
          await fetchPdfAsDownload(out.pdfUrl, base);
          setCustomizeExportToast("Latest PDF downloaded.");
        } catch {
          window.open(out.pdfUrl, "_blank", "noopener,noreferrer");
          setCustomizeExportToast("Latest PDF opened in a new tab.");
        }
      } else {
        setCustomizeExportToast("PDF saved with your latest layout.");
      }
      window.setTimeout(() => setCustomizeExportToast(null), 5500);
    },
    [generating, generate, company, role, candidateProfile],
  );

  /** Re-upsert library row so POST /api/share/{folder} finds resumes (fixes race or retry after a hiccup). */
  const syncLibraryRowForShare = useCallback(async () => {
    if (!user?.id || !result?.folder) return;
    await upsertResume(
      result.folder,
      company.trim(),
      role.trim(),
      model,
      result.texPath ?? "",
      result.pdfUrl ?? null,
      result.ratings,
      jd.trim() || null,
    );
  }, [user?.id, result, company, role, model, jd]);

  /** Clear result and re-run JD suggestions so user can iterate before re-downloading. */
  const improveResumeAfterResult = useCallback(() => {
    const weakCriteria = (result?.ratings?.criteria ?? [])
      .filter((c) => typeof c.score === "number" && c.score <= 5)
      .map((c) => ({ name: c.name, score: c.score }))
      .slice(0, 8);
    setResult(null);
    setPreview("");
    selectSuggestion(null);
    setSuggestError(null);
    void getSuggestions(weakCriteria.length > 0 ? weakCriteria : undefined);
  }, [getSuggestions, selectSuggestion, setSuggestError, result?.ratings?.criteria]);

  /** Call /api/suggest-gap-fix for a single criterion, show micro-panel with targeted bullet rewrites. */
  const handleFixGap = useCallback(async (gap: {
    name: string;
    notes: string;
    type?: AddressedGapAction["type"];
  }) => {
    if (!jd.trim()) return;
    const prof = effectiveCandidateProfile.trim();
    if (!tailorStructuredResume && !prof) {
      setGapFixError(
        "Fix with AI needs résumé text. Upload a PDF or paste your profile, then try again.",
      );
      return;
    }
    if (isGapAddressed(gap.name, addressedGaps, addressedGapActions)) return;
    setGapFixLoading(gap.name);
    setGapFixError(null);
    setGapFixPanel(null);
    try {
      const resp = await fetch(apiUrl("/api/suggest-gap-fix"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gap_name: gap.name,
          gap_notes: gap.notes,
          job_description: jd.trim(),
          ...(tailorStructuredResume ? { structured_resume: tailorStructuredResume } : {}),
          ...(prof ? { candidate_profile: prof } : {}),
        }),
      });
      const data = await resp.json() as { suggestions?: unknown[]; error?: string };
      if (!resp.ok || data.error) throw new Error(data.error ?? "Gap fix failed");
      const suggs = (Array.isArray(data.suggestions) ? data.suggestions : []) as Array<{
        id: string; section: string; original: string; suggested: string; reason: string; priority: string;
      }>;
      const eligible = suggs.filter((s) => s.original?.trim() && s.suggested?.trim());
      setGapFixPanel({
        gapName: gap.name,
        gapNotes: gap.notes,
        suggestions: eligible,
        gapType: gap.type ?? "qualification",
      });
      setResultsActiveTab("gapfix");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not get gap fixes. Please try again.";
      setGapFixError(msg);
      setGapFixPanel({
        gapName: gap.name,
        gapNotes: gap.notes,
        suggestions: [],
        gapType: gap.type ?? "qualification",
      });
      setResultsActiveTab("gapfix");
    } finally {
      setGapFixLoading(null);
    }
  }, [jd, addressedGaps, addressedGapActions, tailorStructuredResume, effectiveCandidateProfile]);

  /**
   * Apply one or more gap-fix suggestions to the HTML preview (Chromium export path — no LaTeX).
   * Patches synthesized plain text, updates the Fixes tab queue, rescoring via /api/analyze.
   */
  const applyGapFixes = useCallback(async (
    items: Array<{ id: string; section: string; original: string; suggested: string; reason: string; priority: string }>,
    gapNameOverride?: string,
  ) => {
    if (items.length === 0) return;
    const gapName = gapNameOverride ?? gapFixPanel?.gapName ?? "";

    const gapType: AddressedGapAction["type"] = gapFixPanel?.gapType ?? "qualification";
    const draftedItems = suggestionsWithDrafts(items, gapFixDrafts);
    const appliedText = draftedItems.map((s) => s.suggested).filter(Boolean).join("\n");

    if (gapName) {
      setAddressedGaps((prev) => new Set([...prev, gapName]));
      setAddressedGapActions((prev) => {
        const id = makeStableGapId(gapName, gapType);
        if (prev.some((a) => a.id === id)) return prev;
        return [...prev, { id, label: gapName, type: gapType, appliedText }];
      });
    }
    setGapFixPanel(null);
    // Clearing gapFixPanel removes the "gapfix" tab from the nav — if it was the
    // active tab, the detail panel would render blank. Switch back to the gap's
    // originating category (or Overall) so the user lands on real content.
    setResultsActiveTab((prev) => {
      if (prev !== "gapfix") return prev;
      if (gapType === "responsibility") return "responsibilities";
      if (gapType === "keyword") return "keywords";
      if (gapType === "qualification") return "qualifications";
      return "overall";
    });

    setGapApplyBusy(true);
    try {
      let bullets = tailorBulletAnalysis;
      const nextOverrides = { ...tailorLineOverrides };
      const appliedIndices = new Set<number>();
      const newSuggestions: Array<{
        id: string;
        section: string;
        original: string;
        suggested: string;
        reason: string;
        priority: "high" | "medium" | "low";
        category: "strengthen_impact";
      }> = [];

      for (const s of draftedItems) {
        if (!s.original?.trim() || !s.suggested?.trim()) continue;
        const fixId = `gf_${Date.now()}_${s.id}`;
        newSuggestions.push({
          ...s,
          id: fixId,
          priority: (s.priority ?? "high") as "high" | "medium" | "low",
          category: "strengthen_impact",
        });

        const profileForMatch = synthesizeProfileWithBulletOverrides(
          candidateProfile ?? "",
          bullets,
          nextOverrides,
        );
        const resolved = resolveBulletIndexForGapFix(
          s.original,
          s.suggested,
          bullets,
          profileForMatch,
        );
        bullets = resolved.bullets;
        if (resolved.index >= 0) {
          nextOverrides[resolved.index] = s.suggested.trim();
          appliedIndices.add(resolved.index);
        }
      }

      setTailorBulletAnalysis(bullets);
      setTailorLineOverrides(nextOverrides);
      if (appliedIndices.size > 0) {
        setTailorAppliedBulletIndices(appliedIndices);
      }

      if (newSuggestions.length > 0) {
        const existing = suggestions ?? [];
        hydrateSuggestions(
          [...newSuggestions, ...existing],
          suggestSummary,
          strategicTips,
          interviewQuestions,
        );
        for (const s of newSuggestions) acceptSuggestion(s.id);
      }

      // Apply is now LOCAL ONLY — mirror the Analyze flow. The override paints
      // the suggested text into the preview instantly and the gap moves
      // optimistically missing→covered. We do NOT rescore here: the per-apply
      // /api/analyze rescore (with its bullet-index remap + structured
      // re-extract) is what blanked the preview. The user re-runs the real
      // score on demand via the "Re-check match" button (scoreStale below).
      if (gapName) {
        setResult((prev) => {
          if (!prev?.ratings) return prev;
          return { ...prev, ratings: applyOptimisticGapAddressed(prev.ratings, gapName, gapType) };
        });
      }
      if (appliedIndices.size > 0 || gapName) setScoreStale(true);

      // Clear the green flash after a moment.
      if (appliedIndices.size > 0) {
        window.setTimeout(() => setTailorAppliedBulletIndices(new Set()), 3000);
      }
    } catch {
      /* best effort */
    } finally {
      setGapApplyBusy(false);
    }
  }, [candidateProfile, tailorBulletAnalysis, tailorLineOverrides, suggestions, suggestSummary,
      strategicTips, interviewQuestions, hydrateSuggestions, acceptSuggestion, gapFixPanel, gapFixDrafts,
      addressedGapActions, jd]);

  const applyGapFix = useCallback(async (s: {
    id: string; section: string; original: string; suggested: string; reason: string; priority: string;
  }) => {
    await applyGapFixes([s]);
  }, [applyGapFixes]);

  const applyAllGapFixes = useCallback(async (
    items: Array<{ id: string; section: string; original: string; suggested: string; reason: string; priority: string }>,
  ) => {
    await applyGapFixes(items);
  }, [applyGapFixes]);

  const ratings = result?.ratings;
  const displayRatings = useMemo(() => {
    if (!ratings) return ratings;
    return applyAddressedGapsToRatings(ratings, addressedGaps, addressedGapActions);
  }, [ratings, addressedGaps, addressedGapActions]);
  const score   = displayRatings?.match_score ?? ratings?.match_score ?? 0;

  /** Phase 2 — Parse candidateProfile into typed lines for the bullet editor. */
  const parsedProfileLines = useMemo(() => {
    if (!candidateProfile) return [];
    const SECTION_RE = /^(?:[A-Z][A-Z &/\-]{2,}|(?:experience|education|skills|projects|summary|work|professional|employment|certifications|awards|publications|volunteer|languages|interests)\s*:?\s*)$/i;
    const BULLET_RE  = /^[-•·*▪▸→>]\s|^\d+\.\s/;
    return candidateProfile.split("\n").map((text, idx) => {
      const t = text.trim();
      const isHeader = t.length > 0 && t.length < 80 && SECTION_RE.test(t);
      const isBullet = t.length > 0 && BULLET_RE.test(t);
      return { idx, text, isHeader, isBullet };
    });
  }, [candidateProfile]);

  /** Phase 2 — Rebuild profile from original lines + edits, update state, trigger generate. */
  const saveBulletEdits = useCallback(() => {
    if (bulletEdits.size === 0) { setBulletEditorOpen(false); return; }
    const lines = (candidateProfile ?? "").split("\n");
    bulletEdits.forEach((newText, idx) => { if (idx < lines.length) lines[idx] = newText; });
    const newProfile = lines.join("\n");
    setCandidateProfile(newProfile);
    setBulletEdits(new Map());
    setBulletEditorOpen(false);
    if (jd.trim()) void rescoreTailorRatings(newProfile);
  }, [candidateProfile, bulletEdits, jd, rescoreTailorRatings]);

  // Download filename should ALWAYS be built from the user's actual data
  // (candidate name + company + role) — not from result.folder, which is the
  // backend's template-named storage folder (e.g. "Harshibar_Template1_structured_xxx").
  // result.folder is a server-side ID, not a display name; users were getting PDFs
  // named after a LaTeX template instead of themselves.
  const resumeDownloadStem = useMemo(
    () => buildResumeFileStem(company, role, candidateProfile),
    [company, role, candidateProfile],
  );

  const downloadResultPdf = useCallback(async () => {
    if (!result?.pdfUrl) return;
    try {
      await fetchPdfAsDownload(result.pdfUrl, resumeDownloadStem);
    } catch {
      window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
    }
  }, [result?.pdfUrl, resumeDownloadStem]);

  const downloadResultDocx = useCallback(async () => {
    if (!result?.folder) return;
    const acceptedList = (suggestions ?? [])
      .filter((s) => acceptedIds.has(s.id))
      .map((s) => ({
        id: s.id,
        section: s.section,
        original: s.original,
        suggested: s.suggested,
        reason: s.reason,
      }));
    setDocxExportBusy(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl("/api/builder-export-docx"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder: result.folder,
          user_id: user?.id ?? null,
          accepted_suggestions: acceptedList.length > 0 ? acceptedList : undefined,
          download_name: resumeDownloadStem,
        }),
      });
      if (!resp.ok) {
        const json = await resp.json().catch(() => ({})) as { error?: string };
        throw new Error(json.error ?? "DOCX export failed");
      }
      const safe = (resumeDownloadStem || "resume").replace(/[^\w.-]+/g, "_").slice(0, 80) || "resume";
      await downloadBlobFromApiResponse(resp, `${safe}.docx`);
    } catch (e: unknown) {
      setError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : String(e)));
    } finally {
      setDocxExportBusy(false);
    }
  }, [result?.folder, suggestions, acceptedIds, user?.id, resumeDownloadStem]);

  /**
   * Apply accepted suggestions to the HTML preview (Chromium export path — no LaTeX).
   */
  const applySelectedSuggestions = useCallback(async () => {
    const acceptedList = suggestions
      .filter((s) => acceptedIds.has(s.id))
      .map((s) => ({
        id: s.id,
        section: s.section,
        original: s.original,
        suggested: s.suggested,
        reason: s.reason,
        category: s.category ?? "strengthen_impact",
      }));

    if (acceptedList.length === 0) {
      setError("No suggestions selected — tick at least one checkbox in the Fixes tab to apply changes.");
      return;
    }

    setApplyBusy(true);
    setApplyFeedback(null);
    setError(null);
    try {
      let bullets = tailorBulletAnalysis;
      const nextOverrides = { ...tailorLineOverrides };
      let applied = 0;
      let failed = 0;
      const appliedIndices = new Set<number>();

      for (const s of acceptedList) {
        if (!s.original?.trim() || !s.suggested?.trim()) {
          failed += 1;
          continue;
        }
        const profileForMatch = synthesizeProfileWithBulletOverrides(
          candidateProfile ?? "",
          bullets,
          nextOverrides,
        );
        const resolved = resolveBulletIndexForGapFix(
          s.original,
          s.suggested,
          bullets,
          profileForMatch,
        );
        bullets = resolved.bullets;
        if (resolved.index < 0) {
          failed += 1;
          continue;
        }
        nextOverrides[resolved.index] = s.suggested.trim();
        appliedIndices.add(resolved.index);
        applied += 1;
      }

      setTailorBulletAnalysis(bullets);
      setTailorLineOverrides(nextOverrides);
      if (appliedIndices.size > 0) {
        setTailorAppliedBulletIndices(appliedIndices);
        window.setTimeout(() => setTailorAppliedBulletIndices(new Set()), 3000);
      }

      setApplyFeedback({ patchesApplied: applied, patchesFailed: failed, rescoring: true });

      if (jd.trim()) {
        try {
          const updatedProfile = synthesizeProfileWithBulletOverrides(
            candidateProfile ?? "",
            bullets,
            nextOverrides,
          );
          await rescoreTailorRatings(updatedProfile);
        } catch { /* rescore is best-effort */ }
      }
      setApplyFeedback((prev) => prev ? { ...prev, rescoring: false } : null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(toUserFriendlyErrorMessage(msg));
      setApplyFeedback(null);
    } finally {
      setApplyBusy(false);
    }
  }, [suggestions, acceptedIds, candidateProfile, tailorBulletAnalysis, tailorLineOverrides, jd,
      rescoreTailorRatings]);

  const selectedTemplateLabel = useMemo(() => {
    return distinctStyleTemplates().find((t) => t.referenceFolder === styleReferenceFolder)?.label ?? "Template";
  }, [styleReferenceFolder]);

  const customizePaperFont =
    previewFontSize === "small" ? 9.85 : previewFontSize === "large" ? 11.2 : 10.5;
  const customizePaperLH =
    previewSpacing === "compact" ? 1.42 : previewSpacing === "spacious" ? 1.72 : 1.55;
  const customizePaperPadY =
    previewSpacing === "compact" ? 22 : previewSpacing === "spacious" ? 36 : 28;

  const showBuilderInputs =
    !result && !generating && !analyzing && !suggestLoading;
  /** Live research streaming removed. */
  const showSuggestResearchPanel = false;
  const showGenerateWebResearchPanel =
    !studioHandoff &&
    !reusingSuggestWebForPdf &&
    (generating || hasWebResearch);
  const showReusedSuggestResearchOnResults =
    !studioHandoff &&
    result &&
    reusingSuggestWebForPdf &&
    hasSuggestResearch &&
    !generating;
  const tailorResultsBuilding = !studioHandoff && Boolean(result) && generating;
  /** Pin loaders at top of the page — form CTAs sit at the bottom and scroll-to-top hid them. */
  const showSuggestLoaderAtTop = !studioHandoff && (suggestLoading || analyzing);
  /** Show full generate loader at top for all generation paths that have no PDF yet. */
  const showGenerateLoaderAtTop = generating && !result?.pdfUrl;

  useLayoutEffect(() => {
    if (showSuggestLoaderAtTop) scrollBuilderToTop("auto");
  }, [showSuggestLoaderAtTop, scrollBuilderToTop]);

  useLayoutEffect(() => {
    if (showGenerateLoaderAtTop) scrollBuilderToTop("auto");
  }, [showGenerateLoaderAtTop, scrollBuilderToTop]);

  // Collapse the outer sidebar when analysis (ratings) first loads so the
  // DetailedRatingsView gets the full width as the "second navbar".
  useEffect(() => {
    const r = result?.ratings;
    if (r && isDetailedRatings(r)) {
      appShellSidebar?.collapseSidebar();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!result?.ratings]);

  useLayoutEffect(() => {
    if (generating && result && !studioHandoff) scrollBuilderToTop("smooth");
  }, [generating, result, studioHandoff, scrollBuilderToTop]);

  return (
    <div
      className="rb-root"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: result && studioHandoff ? "#f8fafc" : "var(--bg)",
        overflow: "hidden",
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

      {/* ── Main — landmark + busy state for assistive tech (WCAG 4.1.3) */}
      <main
        ref={builderMainScrollRef}
        id="resume-builder-main"
        aria-busy={generating || suggestLoading}
        style={{ flex: 1, minHeight: 0, overflowY: generating || suggestLoading ? "hidden" : "auto", display: "flex", flexDirection: "column", position: "relative" }}
      >
        {/* ── Full-page blur overlay + loading card while generating / suggesting ── */}
        {generating && <GenerateOverlay mode="generate" />}
        {suggestLoading && !generating && <GenerateOverlay mode="suggest" />}

        {/* Page content */}
        <div
          className="rb-page"
          style={{
            padding: result
              ? "0"
              : "clamp(20px, 4vw, 44px) clamp(16px, 4vw, 48px) max(72px, 12vh)",
            maxWidth:
              result && studioHandoff
                ? "min(1440px, 98vw)"
                : result
                  ? "100%"
                  : studioHandoff
                    ? 920
                    : 820,
            margin: result ? 0 : "0 auto",
            width: "100%",
            boxSizing: "border-box",
            display: result ? "flex" : undefined,
            flexDirection: result ? "column" as const : undefined,
            flex: result ? 1 : undefined,
            minHeight: result ? 0 : undefined,
          }}
        >
          <style>{`
            .rb-page button:focus-visible,
            .rb-page a:focus-visible {
              outline: 2px solid var(--accent);
              outline-offset: 2px;
            }
            .rb-page button:focus:not(:focus-visible) {
              outline: none;
            }
            .rb-page input:not([type="checkbox"]),
            .rb-page textarea {
              min-height: 44px;
              font-size: 16px;
            }
            .rb-page textarea[data-rb-jd="1"] {
              min-height: 140px;
            }
            @media (min-width: 768px) {
              .rb-page input:not([type="checkbox"]),
              .rb-page textarea {
                font-size: 14px;
              }
            }
            .rb-page input[type="checkbox"] {
              width: 18px;
              height: 18px;
              min-width: 18px;
              min-height: 18px;
              flex-shrink: 0;
              margin: 0;
              accent-color: var(--accent);
              cursor: pointer;
              align-self: flex-start;
              margin-top: 2px;
            }
            @media (prefers-reduced-motion: reduce) {
              .rb-page .fade-in,
              .rb-page .fade-in-up,
              .rb-page [class^="stagger-"] {
                animation: none !important;
                transition-duration: 0.01ms !important;
              }
            }
            .rb-page {
              touch-action: manipulation;
            }
          `}</style>

          {/* Loaders are shown via GenerateOverlay (fixed full-screen blur card) — no duplicate step lists */}

          {/* ── Analyze loader ── */}
          {analyzing && !studioHandoff && (
            <div
              className="fade-in"
              role="status"
              aria-live="polite"
              style={{
                marginBottom: 24, borderRadius: 16, border: "1px solid var(--border)",
                background: "var(--surface)", boxShadow: "var(--shadow-card)", padding: "24px 24px 20px",
                display: "flex", flexDirection: "column", gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Spinner size={16} />
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: "var(--text)" }}>
                  Analysing your résumé…
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                Scoring your match, extracting gaps, and identifying missing keywords. This takes about 20 seconds.
              </p>
            </div>
          )}

          {/* ── Hero (pre-generation) ── */}
          {showBuilderInputs && !showSuggestLoaderAtTop && (
            <>
              {studioHandoff ? (
                <div
                  style={{
                    marginBottom: 22,
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--surface2)",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 6, letterSpacing: -0.2 }}>
                    Template &amp; PDF — layout only
                  </div>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
                    Choose the <strong style={{ color: "var(--text)" }}>output layout</strong> (LaTeX style: sections, typography, spacing on the server).
                    This path is <strong style={{ color: "var(--text)" }}>not</strong> for job-description tailoring — no JD analysis here.
                    Upload or confirm your content, then compile. For fonts/header fine-tuning beyond these presets, use the gallery editor, then return here.
                  </p>
                </div>
              ) : null}
            </>
          )}

          {/* ── Inputs (hidden once results are shown, or while reviewing suggestions) ── */}
          {showBuilderInputs && (<>

          {studioHandoff && hasMultipleStyleTemplates() && (
          <>
          {/* ── Template studio: output layout (LaTeX on server) ── */}
          <StepCard
            step={1}
            title="Output layout"
            subtitle="Sections, typography, and spacing for your PDF (pdflatex). Layout only — not job-description tailoring."
          >
            <ResumeStyleTemplateGrid
              styleReferenceFolder={styleReferenceFolder}
              setStyleReferenceFolder={setStyleReferenceFolder}
            />
          </StepCard>
          </>
          )}

          {/* ── Your résumé (tailor + template studio) ── */}
          <StepCard step={studioHandoff ? 2 : 1} title="Your resume" subtitle="Upload your current résumé as PDF or Word (.doc/.docx)">
            <input
              ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }}
            />

            {candidateProfile ? (
              <>
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePdfUpload(f); }}
                  title="Drop a new resume to replace"
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px",
                    background: "var(--green-bg)", border: "1px solid rgba(52,211,153,0.2)",
                    borderRadius: 10,
                  }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: "rgba(52,211,153,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 2h7l3 3v9H3V2z" stroke="var(--green)" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M10 2v3h3" stroke="var(--green)" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M5.5 8.5l1.5 1.5 3-3" stroke="var(--green)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {uploadedFileName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--green)", marginTop: 2 }}>Ready to use</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (sourcePdfBlobUrlRef.current) {
                        URL.revokeObjectURL(sourcePdfBlobUrlRef.current);
                        sourcePdfBlobUrlRef.current = null;
                      }
                      setSourcePdfBlobUrl(null);
                      setUploadedPdfDataUrl(null);
                      setCandidateProfile(null);
                      setUploadedFileName(null);
                      lastResumeExtractRef.current = "";
                      setProfileSyncUpsell(null);
                    }}
                    style={{
                      background: "none", border: "none", color: "var(--dim)",
                      cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px",
                    }}
                    title="Remove"
                  >×</button>
                </div>

                {profileSyncUpsell && profileSyncUpsell.hintedCount > 0 && !studioHandoff && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "18px 20px 16px",
                      borderRadius: "var(--radius-xl)",
                      ...accentCardBorder("var(--accent)"),
                      background: "var(--surface)",
                      boxShadow: "var(--shadow-card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: -0.25, lineHeight: 1.35, flex: 1, minWidth: 0 }}>
                        Keep Profile in sync?
                      </div>
                      <InfoTip label="How profile sync works">
                        We scan the extracted text for obvious contact signals (email, phone, LinkedIn,
                        links, name, headline, light education cues). Only{" "}
                        <strong style={{ color: "var(--text)" }}>empty</strong> fields in your saved
                        Profile are filled — nothing is overwritten without you reviewing on the
                        Profile page. Everything stays on this device until we add cloud sync.
                      </InfoTip>
                    </div>
                    <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, letterSpacing: -0.1 }}>
                      Fill empty Profile fields from this resume — nothing gets overwritten.
                    </p>
                    {profileSyncUpsell.autoFilled && profileSyncUpsell.filledLabels.length > 0 ? (
                      <p style={{ margin: 0, fontSize: 12, color: "var(--green)", fontWeight: 600, lineHeight: 1.5 }}>
                        Auto-updated Profile ({profileSyncUpsell.filledLabels.join(", ")}) — open Profile to verify.
                      </p>
                    ) : profileSyncUpsell.autoFilled ? (
                      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                        Auto-fill is on, but your Profile already had those values — nothing changed.
                      </p>
                    ) : null}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        padding: "12px 0 2px",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <input
                        id={profileAutofillCheckboxId}
                        type="checkbox"
                        checked={profileAutofillUpload}
                        onChange={e => {
                          const v = e.target.checked;
                          setProfileAutofillUpload(v);
                          setProfileAutofillFromUpload(v);
                        }}
                      />
                      <label
                        htmlFor={profileAutofillCheckboxId}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: 13,
                          color: "var(--text)",
                          cursor: "pointer",
                          lineHeight: 1.5,
                          letterSpacing: -0.15,
                          paddingTop: 1,
                        }}
                      >
                        Auto-merge future uploads into my Profile (this device only).
                      </label>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        paddingTop: 4,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                        <button
                          type="button"
                          onClick={mergeProfileFromLastExtract}
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            padding: "10px 18px",
                            minHeight: 44,
                            borderRadius: "var(--radius)",
                            border: "none",
                            background: "var(--accent)",
                            color: "#fff",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {profileSyncUpsell.autoFilled ? "Open Profile" : "Merge into Profile & review"}
                        </button>
                        <Link
                          href="/?view=manual-form"
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--accent)",
                            textDecoration: "none",
                            padding: "10px 4px",
                            minHeight: 44,
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          Step-by-step instead →
                        </Link>
                      </div>
                      <button
                        type="button"
                        onClick={() => setProfileSyncUpsell(null)}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          padding: "10px 16px",
                          minHeight: 44,
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          background: "var(--surface2)",
                          color: "var(--muted)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                onClick={() => !uploadingPdf && fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePdfUpload(f); }}
                style={{
                  border: uploadingPdf ? "1.5px solid rgba(47,129,247,0.35)" : "1.5px dashed var(--border-h)",
                  borderRadius: 12,
                  padding: uploadingPdf ? 0 : "28px 20px",
                  textAlign: uploadingPdf ? "left" : "center",
                  cursor: uploadingPdf ? "not-allowed" : "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  background: uploadingPdf ? "var(--surface)" : "var(--surface2)",
                  overflow: "hidden",
                }}
                onMouseEnter={e => { if (!uploadingPdf) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-bg)"; }}}
                onMouseLeave={e => { if (!uploadingPdf) { e.currentTarget.style.borderColor = "var(--border-h)"; e.currentTarget.style.background = "var(--surface2)"; }}}
              >
                {uploadingPdf ? (
                  <BuilderUploadExtractLoader stepsDone={uploadLoaderStep} tipIdx={uploadLoaderTipIdx} />
                ) : (
                  <>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: "var(--surface3)", margin: "0 auto 12px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <path d="M9 3v9M6 9l3 3 3-3" stroke="var(--dim)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M3 14h12" stroke="var(--dim)" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 4, letterSpacing: -0.2 }}>
                      Drop your resume PDF here
                    </div>
                    <div style={{ fontSize: 12, color: "var(--dim)" }}>or click to browse</div>
                  </>
                )}
              </div>
            )}

            {(uploadError || uploadTypeError) && (
              <div style={{ marginTop: 8, color: "var(--red)", fontSize: 12 }}>
                {uploadTypeError || uploadError}
              </div>
            )}

            {!candidateProfile && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)", letterSpacing: -0.1 }}>
                No resume? We&apos;ll use a default profile to generate a starting point.
              </div>
            )}

          </StepCard>

          {/* ── Target job (JD tailor flow only) ── */}
          {!studioHandoff && (
          <StepCard
            step={2}
            title="Target job"
            subtitle="Company, role, and job text"
          >
            <TailorRecentJobs currentFolder={(result as { folder?: string } | null)?.folder ?? baseFolder} />
            <div className="rb-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <Field label="Company">
                <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Google" />
              </Field>
              <Field label="Role">
                <input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Fullstack Engineer" />
              </Field>
            </div>
            {!result && (
              <Field label="Job description">
                <textarea
                  data-rb-jd="1"
                  value={jd}
                  onChange={e => setJd(e.target.value)}
                  placeholder="Paste the full job description here."
                  style={{ minHeight: 140, lineHeight: 1.55 }}
                />
              </Field>
            )}
          </StepCard>
          )}

          {/* Base resume indicator */}
          {baseFolder && (() => {
            const baseBanner = getBaseResumeBanner(baseFolder);
            if (!baseBanner) return null;
            return (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              marginBottom: 12, padding: "10px 12px",
              background: "var(--surface2)", borderRadius: 10,
              fontSize: 12, letterSpacing: -0.2,
              border: "1px solid var(--border)",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", marginBottom: 2 }}>
                  {baseBanner.heading}
                </div>
                <div style={{ color: "var(--text)", fontWeight: 600, lineHeight: 1.35 }}>
                  {baseBanner.detail}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBaseFolder(null)}
                aria-label="Clear base résumé"
                style={{
                  background: "none", border: "none", color: "var(--dim)", cursor: "pointer",
                  fontSize: 18, lineHeight: 1, minWidth: 44, minHeight: 44,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, margin: "-8px -6px -8px 0",
                }}
                title="Use a fresh start (no prior version)"
              >×</button>
            </div>
            );
          })()}

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              style={{
                marginBottom: 16, padding: "12px 16px",
                background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 10, color: "var(--red)", fontSize: 13, letterSpacing: -0.2,
              }}
            >
              {error}
            </div>
          )}

          {/* ── Primary CTA: template handoff = compile PDF only; tailor flow = suggestions first ── */}
          {studioHandoff ? (
            <>
              <button
                type="button"
                onClick={() => { void finalizeLayoutPdf("save"); }}
                disabled={generating || !(candidateProfile ?? "").trim()}
                style={{
                  width: "100%", padding: "14px 20px", marginBottom: 8, minHeight: 48,
                  background: generating || !(candidateProfile ?? "").trim() ? "var(--surface2)" : "var(--accent)",
                  color: generating || !(candidateProfile ?? "").trim() ? "var(--muted)" : "#fff",
                  border: "none", borderRadius: 12,
                  fontSize: 16, fontWeight: 600, fontFamily: "inherit",
                  cursor: generating || !(candidateProfile ?? "").trim() ? "not-allowed" : "pointer",
                  letterSpacing: -0.35, transition: "background 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                onMouseEnter={e => {
                  if (!generating && (candidateProfile ?? "").trim()) {
                    e.currentTarget.style.background = "var(--accent-h)";
                  }
                }}
                onMouseLeave={e => {
                  if (!generating && (candidateProfile ?? "").trim()) {
                    e.currentTarget.style.background = "var(--accent)";
                  }
                }}
              >
                {generating ? (
                  <><Spinner size={16} />Generating your résumé PDF…</>
                ) : (
                  "Generate résumé PDF →"
                )}
              </button>
              <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginBottom: 24, letterSpacing: -0.1 }}>
                Uses your template layout and extracted text only — no job posting or tailoring step.
              </p>
            </>
          ) : (
            <>
              {(analyzeError || suggestError) && (
                <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, color: "var(--red)", fontSize: 12 }}>
                  {analyzeError || suggestError}
                </div>
              )}
              <button
                type="button"
                onClick={() => { void handleAnalyze(); }}
                disabled={analyzing || generating || !(candidateProfile ?? "").trim() || !jd.trim()}
                aria-busy={analyzing}
                style={{
                  width: "100%", padding: "14px 20px", marginBottom: 8, minHeight: 48,
                  background: "var(--accent)", color: "#fff",
                  border: "none", borderRadius: 12,
                  fontSize: 16, fontWeight: 500, fontFamily: "inherit",
                  cursor: analyzing || generating ? "wait" : (!(candidateProfile ?? "").trim() || !jd.trim() ? "not-allowed" : "pointer"),
                  letterSpacing: -0.4, transition: "background 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: !(candidateProfile ?? "").trim() || !jd.trim() ? 0.5 : 1,
                  boxShadow: analyzing ? "0 0 0 3px rgba(47,129,247,0.25)" : "none",
                }}
                onMouseEnter={e => { if (!analyzing && !generating && (candidateProfile ?? "").trim() && jd.trim()) e.currentTarget.style.background = "var(--accent-h)"; }}
                onMouseLeave={e => { if (!analyzing && !generating) e.currentTarget.style.background = "var(--accent)"; }}
              >
                {analyzing ? (
                  <><SpinnerWhite size={16} />Analysing your résumé…</>
                ) : (
                  "Analyze fit →"
                )}
              </button>
              {!analyzing && !generating && (
                <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginBottom: 12, letterSpacing: -0.1 }}>
                  See your match score, gaps, and keywords before generating a PDF.
                </p>
              )}
            </>
          )}

          </>)} {/* end !result && !generating inputs block */}

          {/* ── Web research for suggestions (streams in during Get suggestions) ── */}
          {showSuggestResearchPanel && (
            <BuilderWebResearchPanel
              queries={suggestResearchQueries}
              sources={suggestResearchSources}
              live={suggestLoading}
              badgeLabel={suggestLoading ? "Researching the web" : "Used before suggestions"}
              intro={
                suggestLoading ? (
                  <>Researching the role. Suggestions come next.</>
                ) : (
                  <>Used to build your suggestion cards.</>
                )
              }
            />
          )}

          {/* ── Streaming LaTeX preview (only before results card; avoids concatenated-looking UI above scores) ── */}
          {generating && !result && preview && (
            <div style={{ marginBottom: 28 }} className="fade-in">
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: -0.1, marginBottom: 8, textTransform: "uppercase" }}>
                Live preview
              </div>
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "14px 16px",
                maxHeight: 200, overflow: "auto",
              }}>
                <pre style={{ fontSize: 11, lineHeight: 1.65, color: "var(--green)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                  {preview}
                </pre>
              </div>
            </div>
          )}

          {/* ── Results: template path = customize preview; tailor = match + export ── */}
          {result ? (
            studioHandoff ? (
              <TemplateCustomizePostResult
                generating={generating}
                statusMsg={statusMsg}
                router={router}
                setResult={setResult}
                setPreview={setPreview}
                result={result}
                atsLoading={atsLoading}
                atsResult={atsResult}
                atsError={atsError}
                runAtsCheck={runAtsCheck}
                acceptedCount={acceptedIds.size}
                selectedTemplateLabel={selectedTemplateLabel}
                company={company}
                role={role}
                customizeTab={customizeTab}
                setCustomizeTab={setCustomizeTab}
                previewAccentHex={previewAccentHex}
                setPreviewAccentHex={setPreviewAccentHex}
                previewFontSize={previewFontSize}
                setPreviewFontSize={setPreviewFontSize}
                previewSpacing={previewSpacing}
                setPreviewSpacing={setPreviewSpacing}
                customizePaperFont={customizePaperFont}
                customizePaperLH={customizePaperLH}
                customizePaperPadY={customizePaperPadY}
                styleReferenceFolder={styleReferenceFolder}
                candidateProfile={candidateProfile}
                user={user}
                signInForAts={signInForAts}
                atsOAuthBusy={atsOAuthBusy}
                storageFailures={storageFailures}
                customizeExportToast={customizeExportToast}
                onExportLayoutPdf={finalizeLayoutPdf}
                ensureLibraryRow={syncLibraryRowForShare}
              />
            ) : (
            <div className="fade-in">
              {error && (
                <div
                  role="alert"
                  style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    background: "var(--red-bg)",
                    border: "1px solid rgba(248,113,113,0.2)",
                    borderRadius: 10,
                    color: "var(--red)",
                    fontSize: 13,
                    letterSpacing: -0.2,
                  }}
                >
                  {error}
                </div>
              )}

              {/* ── Results top bar — sticky, full width ── */}
              <header
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 14,
                  paddingTop: 14,
                  paddingBottom: 14,
                  paddingLeft: "clamp(64px, 6vw, 80px)",
                  paddingRight: "clamp(16px, 3vw, 36px)",
                  background: "var(--bg)",
                  borderBottom: "1px solid var(--border)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <h2 id="rb-results-heading" style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: "var(--text)", margin: 0, lineHeight: 1.2 }}>
                    {generating ? "Building your PDF…" : result?.folder ? "Your tailored résumé is ready" : "Analysis ready — review gaps & download PDF"}
                  </h2>
                  <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "2px 0 0", letterSpacing: -0.1 }}>
                    {[role, company].map((s) => s.trim()).filter(Boolean).join(" · ") || "Match results"}
                  </p>
                </div>
                {/* Header action buttons */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <Button variant="outline" size="sm" onClick={tryAnotherJob} style={{ color: "var(--muted)" }}>
                    Try another job
                  </Button>
                </div>
              </header>

              {tailorResultsBuilding && (
                <TailorBuildProgressBanner statusMsg={statusMsg} />
              )}

              {showGenerateWebResearchPanel && result && !tailorResultsBuilding && (
                <BuilderWebResearchPanel
                  queries={searchQueries}
                  sources={searchSources}
                  live={generating}
                  badgeLabel={generating ? "Researching the web" : "Research used"}
                  intro={
                    hasSuggestResearch
                      ? <>Extra web research during PDF generation.</>
                      : <>Updates as we generate your PDF.</>
                  }
                />
              )}
              {tailorResultsBuilding && showGenerateWebResearchPanel && (searchQueries.length > 0 || searchSources.length > 0) && (
                <BuilderWebResearchPanel
                  queries={searchQueries}
                  sources={searchSources}
                  live
                  badgeLabel="Researching the web"
                  intro={<>Live search during this generate step.</>}
                />
              )}

              <style>{`
                .rb-results-body {
                  flex: 1;
                  min-height: 0;
                  display: flex;
                  flex-direction: column;
                  overflow: hidden;
                }
                .rb-tailor-workspace {
                  flex: 1;
                  min-height: 0;
                  display: grid;
                  grid-template-columns: auto minmax(260px, 2fr) minmax(280px, 3fr);
                  grid-template-rows: minmax(0, 1fr);
                  overflow: hidden;
                }
                .tb-split-work-slot {
                  min-height: 0;
                  overflow-y: auto;
                  border-right: 1px solid var(--border);
                  display: flex;
                  flex-direction: column;
                }
                .tb-split-preview-slot {
                  min-height: 0;
                  overflow: hidden;
                  display: flex;
                  flex-direction: column;
                  background: var(--bg);
                }
                @media (max-width: 960px) {
                  .rb-tailor-workspace {
                    grid-template-columns: 1fr;
                    grid-template-rows: auto auto minmax(42vh, 1fr);
                    overflow-y: auto;
                  }
                  .tb-split-preview-slot { order: 2; min-height: 42vh; max-height: 60vh; }
                  .tb-split-work-slot { order: 3; border-right: none; }
                }
              `}</style>
              <div className="rb-results-body">
              {/* ── Gap-fix apply spinner — shown while a single fix is being applied to the preview ── */}

              {/* ── Stale-score banner — applies are local (like Analyze); the real
                     match score is re-checked on demand here. ── */}
              {scoreStale && !gapApplyBusy && (
                <div style={{ marginBottom: 12, padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(52,211,153,0.4)", background: "rgba(52,211,153,0.08)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green, #34d399)", flex: 1, minWidth: 0 }}>
                    ✓ Fixes applied to your preview. Match score shown is provisional.
                  </span>
                  <button
                    type="button"
                    disabled={tailorRescoring}
                    onClick={() => { void rescoreTailorRatings(); }}
                    style={{
                      padding: "6px 14px", borderRadius: 8, border: "none",
                      background: "var(--accent)", color: "#fff",
                      fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      cursor: tailorRescoring ? "not-allowed" : "pointer",
                      opacity: tailorRescoring ? 0.6 : 1, flexShrink: 0,
                    }}
                  >
                    {tailorRescoring ? "Re-checking…" : "Re-check match score →"}
                  </button>
                </div>
              )}

              {/* ── Apply feedback banner — shown above phase3 for visibility (only while busy) ── */}
              {(applyBusy || applyFeedback) && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: "14px 18px",
                    borderRadius: 12,
                    border: applyFeedback && !applyBusy
                      ? "1px solid rgba(52,211,153,0.4)"
                      : "1px solid rgba(99,102,241,0.3)",
                    background: applyFeedback && !applyBusy
                      ? "rgba(52,211,153,0.06)"
                      : "rgba(99,102,241,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  {applyBusy ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden>
                        <circle cx="9" cy="9" r="7" stroke="rgba(99,102,241,0.3)" strokeWidth="2.5"/>
                        <path d="M9 2a7 7 0 017 7" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#818cf8" }}>Applying changes to your résumé…</span>
                    </>
                  ) : applyFeedback ? (
                    <>
                      <span style={{ fontSize: 18 }}>✅</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                          {applyFeedback.patchesApplied} change{applyFeedback.patchesApplied !== 1 ? "s" : ""} applied to your résumé
                          {applyFeedback.patchesFailed > 0 && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--orange)", fontWeight: 600 }}>
                              ({applyFeedback.patchesFailed} couldn&apos;t be matched — bullets may have varied slightly)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                          {applyFeedback.rescoring
                            ? "Updating your match score…"
                            : "Score updated. Section counts refresh after re-analysis."}
                        </div>
                      </div>
                      {applyFeedback.rescoring ? (
                        <svg width="14" height="14" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }} aria-hidden>
                          <circle cx="9" cy="9" r="7" stroke="rgba(52,211,153,0.3)" strokeWidth="2.5"/>
                          <path d="M9 2a7 7 0 017 7" stroke="var(--green,#34d399)" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setApplyFeedback(null); void rescoreTailorRatings(); }}
                          title="Re-run match analysis on your updated preview text"
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "5px 12px", borderRadius: 7,
                            border: "1px solid rgba(52,211,153,0.4)",
                            background: "rgba(52,211,153,0.08)",
                            color: "var(--green, #34d399)",
                            fontSize: 11.5, fontWeight: 600, fontFamily: "inherit",
                            cursor: "pointer",
                            whiteSpace: "nowrap", flexShrink: 0,
                          }}
                        >
                          ↺ Re-analyze
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setApplyFeedback(null)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", fontSize: 16, padding: 4, flexShrink: 0 }}
                      >✕</button>
                    </>
                  ) : null}
                </div>
              )}

              <section className="rb-tailor-workspace" aria-labelledby="rb-results-heading" style={{ position: "relative" }}>
              {(tailorRescoring || gapApplyBusy) && <RescanOverlay />}
              {displayRatings && isDetailedRatings(displayRatings) ? (
                <>
                  <TailorMatchSidebar
                    ratings={displayRatings}
                    hasSuggestions={suggestions.length > 0 && !generating}
                    strategicTips={strategicTips.length > 0 ? strategicTips : undefined}
                    interviewQuestions={interviewQuestions.length > 0 ? interviewQuestions : undefined}
                    activeTab={resultsActiveTab}
                    onActiveTabChange={setResultsActiveTab}
                    collapsed={matchSidebarCollapsed}
                    onCollapsedChange={setMatchSidebarCollapsed}
                  />
                  <div className="tb-split-work-slot">
                    <TailorMatchDetail
                      ratings={displayRatings}
                      onFixGap={(item: DetailedRatingItem, gapType) => {
                        void handleFixGap({
                          name: item.text,
                          notes: item.analysis ?? "",
                          type: gapType,
                        });
                      }}
                      onFixKeyword={(kw) => {
                        void handleFixGap({
                          name: kw,
                          notes: `This keyword is missing from the resume. Rewrite one of the most relevant existing bullets to naturally incorporate "${kw}" without fabricating experience.`,
                          type: "keyword",
                        });
                      }}
                      fixingGapName={gapFixLoading}
                      gapFixPanel={gapFixPanel}
                      gapFixError={gapFixError}
                      onApplyFix={applyGapFix}
                      onApplyAllGapFixes={applyAllGapFixes}
                      onDismissFix={() => setGapFixPanel(null)}
                      addressedGaps={addressedGaps}
                      addressedGapActions={addressedGapActions}
                      gapFixDrafts={gapFixDrafts}
                      onGapFixDraftChange={(id, text) => {
                        setGapFixDrafts((prev) => ({ ...prev, [id]: text }));
                      }}
                      keyGap={suggestSummary || undefined}
                      strategicTips={strategicTips.length > 0 ? strategicTips : undefined}
                      interviewQuestions={interviewQuestions.length > 0 ? interviewQuestions : undefined}
                      onGetSuggestions={() => { void getSuggestions(); }}
                      suggestionsLoading={generating}
                      hasSuggestions={suggestions.length > 0 && !generating}
                      onApplyAllSuggestions={() => { void applySelectedSuggestions(); }}
                      applyBusy={applyBusy}
                      activeTab={resultsActiveTab}
                      onActiveTabChange={setResultsActiveTab}
                    />
                    {result.diff.length > 0 && (
                      <div id="rb-results-diff" style={{ margin: "16px 20px", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--surface)", padding: "18px 20px" }}>
                        <DiffView key={result.folder ?? "diff"} diff={result.diff} adds={result.adds} removes={result.removes} rationales={result.rationales} baseFolder={result.baseFolder} baseLoaded={result.baseLoaded} jdKeywords={jdKeywords} />
                      </div>
                    )}
                    {result.sources.length > 0 && (
                      <div style={{ margin: "0 20px 16px", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--surface)", padding: "18px 20px" }}>
                        <SourcesPanel sources={result.sources} embedded />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="tb-split-work-slot" style={{ gridColumn: "1 / 3" }}>

              {/* Legacy flat criteria breakdown (old schema fallback) */}
              {ratings && !isDetailedRatings(ratings) && ratings.criteria.length > 0 && (
                <div
                  style={{
                    marginBottom: 16,
                    borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    boxShadow: "var(--shadow-card)",
                    padding: "18px 20px 20px",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 10 }}>
                    Match breakdown
                  </div>
                  <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--dim)", lineHeight: 1.45 }}>
                    One row per job requirement.
                  </p>
                  <MatchBreakdownCards
                    criteria={ratings.criteria}
                    onImprove={improveResumeAfterResult}
                    onFixGap={(gap) => void handleFixGap({ name: gap.name, notes: gap.notes })}
                    fixingGap={gapFixLoading}
                    addressedGaps={addressedGaps}
                    gapFixPanel={gapFixPanel}
                    gapFixError={gapFixError}
                    onApplyFix={applyGapFix}
                    onDismissFix={() => setGapFixPanel(null)}
                    generating={generating}
                    gapFixDrafts={gapFixDrafts}
                    onGapFixDraftChange={(id, text) => {
                      setGapFixDrafts((prev) => ({ ...prev, [id]: text }));
                    }}
                  />
                  {/* Phase 3 — Re-score button when gaps have been addressed */}
                  {addressedGaps.size > 0 && (
                    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "var(--green, #34d399)", fontWeight: 600 }}>
                        ✓ {addressedGaps.size} gap{addressedGaps.size > 1 ? "s" : ""} addressed
                      </span>
                      <button
                        type="button"
                        disabled={tailorRescoring}
                        onClick={() => { void rescoreTailorRatings(); }}
                        style={{
                          padding: "5px 12px",
                          borderRadius: 7,
                          border: "1px solid rgba(52,211,153,0.4)",
                          background: "rgba(52,211,153,0.08)",
                          color: "var(--green, #34d399)",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: "inherit",
                          cursor: tailorRescoring ? "not-allowed" : "pointer",
                          opacity: tailorRescoring ? 0.6 : 1,
                        }}
                      >
                        {tailorRescoring ? "Scoring…" : "Re-score match →"}
                      </button>
                    </div>
                  )}

                </div>
              )}

              {result.diff.length > 0 && (
                <div id="rb-results-diff" style={{ margin: "16px 20px", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--surface)", padding: "18px 20px" }}>
                  <DiffView key={result.folder ?? "diff"} diff={result.diff} adds={result.adds} removes={result.removes} rationales={result.rationales} baseFolder={result.baseFolder} baseLoaded={result.baseLoaded} jdKeywords={jdKeywords} />
                </div>
              )}

              {result.sources.length > 0 && (
                <div style={{ margin: "0 20px 16px", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--surface)", padding: "18px 20px" }}>
                  <SourcesPanel sources={result.sources} embedded />
                </div>
              )}

              </div>
              )}

                <div className="tb-split-preview-slot">
                  <TailorPreviewPane
                    extractedText={(candidateProfile ?? "").trim()}
                    resumeHeader={resumeHeaderLines}
                    company={company}
                    role={role}
                    bulletAnalysis={tailorPreviewBullets}
                    structuredResume={tailorStructuredResume}
                    previewLineOverrides={tailorLineOverrides}
                    gapFixTargetBulletIndices={gapFixTargetIndices}
                    tailorGapFixHighlights={tailorGapFixHighlights}
                    tailorAppliedBulletIndices={tailorAppliedBulletIndices}
                  />
                </div>
              </section>

              </div>{/* rb-results-body */}
            </div>
            )
          ) : null}


        </div>
      </main>

    </div>
  );
}

/* ── Resume paper preview (plain text → paper-style render) ─────────────── */

function buildResumeHighlightMatcher(
  highlightOriginals: string[],
  combinedByLineIndex: string[],
): (lineIndex: number) => boolean {
  const originals = highlightOriginals.map((o) => o.trim()).filter(Boolean);
  return (lineIndex: number) => {
    const block = (combinedByLineIndex[lineIndex] ?? "").trim();
    if (!block) return false;
    return originals.some((o) => resumeLineMatchesSuggestionOriginal(block, o));
  };
}

/** First accepted suggestion matching this line (stricter than pending highlights on merged blocks). */
function firstAcceptedSuggestionMatchingLine(
  line: string,
  suggestions: Suggestion[],
  acceptedIds: ReadonlySet<string>,
): Suggestion | null {
  for (const s of suggestions) {
    if (!acceptedIds.has(s.id)) continue;
    if (resumeLineMatchesAcceptedSuggestionHighlight(line, s.original)) return s;
  }
  return null;
}

/** First suggestion in list order whose `original` matches the résumé line (same rules as highlight). */
function firstSuggestionMatchingLine(
  line: string,
  suggestions: Suggestion[],
  predicate: (s: Suggestion) => boolean,
): Suggestion | null {
  for (const s of suggestions) {
    if (!predicate(s)) continue;
    if (resumeLineMatchesSuggestionOriginal(line, s.original)) return s;
  }
  return null;
}

/** Signed-out gate for ATS — API requires a real Supabase `user_id`. */
function ResumeBuilderAtsSignInPrompt({
  oauthBusy,
  onSignInWithGoogle,
  compact,
}: {
  oauthBusy: boolean;
  onSignInWithGoogle: () => void | Promise<void>;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        padding: compact ? "4px 0 2px" : "4px 0 8px",
        fontSize: 13,
        color: "var(--muted)",
        lineHeight: 1.55,
      }}
    >
      <p style={{ margin: "0 0 12px", color: "var(--text)" }}>
        ATS and job match requires a signed-in account — the server ties your PDF and source to your user id.
      </p>
      <button
        type="button"
        onClick={() => void onSignInWithGoogle()}
        disabled={oauthBusy}
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: "10px 18px",
          minHeight: 44,
          borderRadius: "var(--radius)",
          border: "1px solid var(--border)",
          background: "var(--accent)",
          color: "#fff",
          cursor: oauthBusy ? "wait" : "pointer",
          fontFamily: "inherit",
          opacity: oauthBusy ? 0.7 : 1,
        }}
      >
        {oauthBusy ? "Opening Google…" : "Sign in with Google"}
      </button>
    </div>
  );
}

/** Template-studio handoff — post-compile screen aligned with Resunova "Customize preview" (Figma). */
function TemplateCustomizePostResult({
  generating,
  statusMsg,
  router,
  setResult,
  setPreview,
  result,
  atsLoading,
  atsResult,
  atsError,
  runAtsCheck,
  acceptedCount,
  selectedTemplateLabel,
  company,
  role,
  customizeTab,
  setCustomizeTab,
  previewAccentHex,
  setPreviewAccentHex,
  previewFontSize,
  setPreviewFontSize,
  previewSpacing,
  setPreviewSpacing,
  customizePaperFont,
  customizePaperLH,
  customizePaperPadY,
  styleReferenceFolder,
  candidateProfile,
  user,
  signInForAts,
  atsOAuthBusy,
  storageFailures,
  customizeExportToast,
  onExportLayoutPdf,
  ensureLibraryRow,
}: {
  generating: boolean;
  statusMsg: string;
  router: { push: (href: string) => void };
  setResult: (v: GenerationResult | null) => void;
  setPreview: (v: string) => void;
  result: GenerationResult;
  atsLoading: boolean;
  atsResult: AtsResult | null;
  atsError: string | null;
  runAtsCheck: (folder: string, updateMatchScore?: boolean) => void;
  acceptedCount: number;
  selectedTemplateLabel: string;
  company: string;
  role: string;
  customizeTab: "style" | "sections" | "add";
  setCustomizeTab: (t: "style" | "sections" | "add") => void;
  previewAccentHex: string;
  setPreviewAccentHex: (h: string) => void;
  previewFontSize: "small" | "standard" | "large";
  setPreviewFontSize: (s: "small" | "standard" | "large") => void;
  previewSpacing: "compact" | "balanced" | "spacious";
  setPreviewSpacing: (s: "compact" | "balanced" | "spacious") => void;
  customizePaperFont: number;
  customizePaperLH: number;
  customizePaperPadY: number;
  styleReferenceFolder: string;
  candidateProfile: string | null;
  user: User | null;
  signInForAts: () => Promise<void>;
  atsOAuthBusy: boolean;
  storageFailures: { artifact: "pdf" | "tex"; reason: string }[];
  customizeExportToast: string | null;
  onExportLayoutPdf: (mode: "save" | "download") => Promise<void>;
  ensureLibraryRow: () => Promise<void>;
}) {
  const roleCompany = [role, company].map((s) => s.trim()).filter(Boolean).join(" · ") || "Your résumé";
  const fitsOne =
    !atsLoading && atsResult ? atsResult.stats.page_count <= 1 : null;

  return (
    <div className="fade-in rb-template-customize" style={{ marginBottom: 12 }}>
      <style>{`
        .rb-template-customize-grid {
          display: grid;
          grid-template-columns: minmax(280px, 2.55fr) minmax(252px, 0.52fr);
          gap: clamp(16px, 2.2vw, 28px);
          align-items: start;
        }
        @media (max-width: 1100px) {
          .rb-template-customize-grid {
            grid-template-columns: minmax(260px, 2.1fr) minmax(240px, 0.62fr);
          }
        }
        @media (max-width: 960px) {
          .rb-template-customize-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {generating && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 20,
            padding: "16px 20px",
            borderRadius: "var(--radius-xl)",
            background: "var(--accent-bg)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <Spinner size={22} />
          <div style={{ minWidth: 0, flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2 }}>
              Still compiling…
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>
              {statusMsg || "Saving PDF — almost there."}
            </div>
          </div>
        </div>
      )}

      {customizeExportToast ? (
        <div
          role="status"
          style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: "var(--radius-xl)",
            background: "rgba(52,211,153,0.12)",
            border: "1px solid rgba(52,211,153,0.35)",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.45,
          }}
        >
          {customizeExportToast}
        </div>
      ) : null}

      <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: "var(--dim)", marginBottom: 14 }}>
        <Link href="/?view=builder&flow=tailor&intent=job" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
          Resume Builder
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.45 }} aria-hidden>›</span>
        <Link href="/template-builder/" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
          Templates
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.45 }} aria-hidden>›</span>
        <span style={{ color: "var(--text)", fontWeight: 700 }}>Customize</span>
      </nav>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 20,
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <h2
            id="rb-results-heading"
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: -0.65,
              color: "var(--text)",
              margin: "0 0 8px",
              lineHeight: 1.15,
            }}
          >
            Review the final resume before export
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55, maxWidth: 540 }}>
            Adjust layout-safe options only. Your accepted improvements stay intact and ATS-friendly.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, minWidth: 200 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2, textAlign: "right" }}>
              {selectedTemplateLabel} — {roleCompany}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(52,211,153,0.14)",
                color: "var(--green)",
                whiteSpace: "nowrap",
              }}
            >
              ATS safe
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setPreview("");
                router.push("/template-builder/");
              }}
              style={{
                padding: "10px 18px",
                minHeight: 44,
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Back to templates
            </button>
            <button
              type="button"
              disabled={
                generating
                || (!(candidateProfile ?? "").trim() && !result.folder)
              }
              onClick={() => { void onExportLayoutPdf("download"); }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                minHeight: 44,
                borderRadius: 10,
                border: "none",
                background:
                  generating || (!(candidateProfile ?? "").trim() && !result.folder)
                    ? "#94a3b8"
                    : "#1d4ed8",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  generating || (!(candidateProfile ?? "").trim() && !result.folder)
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "inherit",
              }}
            >
              {generating ? "Working…" : "Download PDF →"}
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 16px",
          borderRadius: 12,
          background: "#fff",
          border: "1px solid #e2e8f0",
          marginBottom: 22,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {atsLoading ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Checking page length…</span>
          ) : atsResult ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: fitsOne ? "rgba(52,211,153,0.14)" : "rgba(251,191,36,0.16)",
                color: fitsOne ? "var(--green)" : "var(--orange)",
              }}
            >
              {atsResult.stats.page_count === 1 ? "Fits 1 page" : `${atsResult.stats.page_count} pages`}
            </span>
          ) : atsError ? (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--orange)" }}>Length check unavailable</span>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>PDF ready</span>
          )}
          {acceptedCount > 0 ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 10px",
                borderRadius: 999,
                background: "rgba(59,130,246,0.12)",
                color: "#1d4ed8",
              }}
            >
              {acceptedCount} improvements applied
            </span>
          ) : null}
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Template: <strong style={{ color: "var(--text)", fontWeight: 600 }}>{selectedTemplateLabel}</strong>
          </span>
        </div>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>
          Style controls update the live preview instantly. <strong style={{ color: "var(--text)", fontWeight: 600 }}>Download PDF</strong> exports the compiled LaTeX file (not shown here).
        </span>
      </div>

      <div className="rb-template-customize-grid">
        <div id="rb-customize-preview" style={{ minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--dim)",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              Live preview (HTML)
            </span>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Accent, size, spacing</span>
          </div>
          <div
            style={{
              borderRadius: 12,
              overflow: "auto",
              maxHeight: 580,
              border: `1px solid ${previewAccentHex}33`,
              background: "#f1f5f9",
              boxShadow: "0 8px 28px rgba(15,23,42,0.08)",
            }}
          >
            <ResumePaperView
              text={(candidateProfile ?? "").trim() || "—"}
              highlightOriginals={[]}
              templateFolder={styleReferenceFolder}
              baseFontPx={customizePaperFont}
              lineHeight={customizePaperLH}
              paperPaddingY={customizePaperPadY}
              sectionAccentColor={previewAccentHex}
            />
          </div>
          <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.45, marginTop: 10, marginBottom: 0 }}>
            This paper reflects your Style tab (fast, client-side). It is not pixel-identical to LaTeX. Use{" "}
            <strong style={{ color: "var(--text)" }}>Download PDF</strong> or <strong style={{ color: "var(--text)" }}>Save</strong> for the real exported file.
          </p>
        </div>

        <aside
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            padding: "18px 16px 16px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
            minWidth: 0,
          }}
        >
          <div
            role="tablist"
            aria-label="Customize"
            style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e2e8f0", paddingBottom: 12 }}
          >
            {(
              [
                ["style", "Style"],
                ["sections", "Sections"],
                ["add", "Add details"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={customizeTab === id}
                onClick={() => setCustomizeTab(id)}
                style={{
                  flex: 1,
                  padding: "8px 6px",
                  borderRadius: 8,
                  border: "none",
                  background: customizeTab === id ? "rgba(29,78,216,0.1)" : "transparent",
                  color: customizeTab === id ? "#1d4ed8" : "var(--muted)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {customizeTab === "style" && (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--dim)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 0.35,
                }}
              >
                Accent color
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                {CUSTOMIZE_ACCENT_SWATCHES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={`Accent ${s.id}`}
                    aria-pressed={previewAccentHex === s.hex}
                    onClick={() => setPreviewAccentHex(s.hex)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: s.hex,
                      border: previewAccentHex === s.hex ? "3px solid #fff" : "2px solid #e2e8f0",
                      boxShadow: previewAccentHex === s.hex ? `0 0 0 2px ${s.hex}` : "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--dim)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: 0.35,
                }}
              >
                Font size
              </div>
              <div
                style={{
                  display: "flex",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                  marginBottom: 18,
                }}
              >
                {(["small", "standard", "large"] as const).map((sz, i) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setPreviewFontSize(sz)}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      border: "none",
                      borderLeft: i ? "1px solid #e2e8f0" : "none",
                      background: previewFontSize === sz ? "#f1f5f9" : "#fff",
                      fontWeight: 600,
                      fontSize: 12,
                      color: previewFontSize === sz ? "var(--text)" : "var(--muted)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {sz === "small" ? "Small" : sz === "standard" ? "Standard" : "Large"}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: fitsOne === true ? "rgba(52,211,153,0.14)" : fitsOne === false ? "rgba(251,191,36,0.14)" : "rgba(148,163,184,0.12)",
                    color: fitsOne === true ? "var(--green)" : fitsOne === false ? "var(--orange)" : "var(--muted)",
                  }}
                >
                  {atsLoading ? "Checking fit…" : fitsOne === true ? "Fits 1 page" : fitsOne === false ? "Multi-page" : "Page fit"}
                </span>
                <div
                  style={{
                    display: "flex",
                    flex: "1 1 160px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    overflow: "hidden",
                    minWidth: 0,
                  }}
                >
                  {(["compact", "balanced", "spacious"] as const).map((sp, i) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setPreviewSpacing(sp)}
                      style={{
                        flex: 1,
                        padding: "8px 6px",
                        border: "none",
                        borderLeft: i ? "1px solid #e2e8f0" : "none",
                        background: previewSpacing === sp ? "#f1f5f9" : "#fff",
                        fontWeight: 600,
                        fontSize: 11,
                        color: previewSpacing === sp ? "var(--text)" : "var(--muted)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      {sp === "compact" ? "Compact" : sp === "balanced" ? "Balanced" : "Spacious"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => document.getElementById("rb-customize-preview")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  marginBottom: 18,
                  borderRadius: 10,
                  border: "1px dashed #cbd5e1",
                  background: "#f8fafc",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Auto-fit
              </button>

              <div
                style={{
                  borderTop: "1px solid #e2e8f0",
                  paddingTop: 14,
                  marginTop: 4,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                  Add missing details
                </div>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, margin: "0 0 10px" }}>
                  Use this when the resume lacks important info.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => setCustomizeTab("add")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Add skill +
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomizeTab("add")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Add experience +
                  </button>
                </div>
                <span style={{ fontSize: 11, color: "var(--dim)" }}>Structured fields only — switch to the Add details tab.</span>
              </div>

            </div>
          )}

          {customizeTab === "sections" && (
            <div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 12px" }}>
                Reorder sections in the template gallery before you compile. Drag-and-drop here is limited to section order — not arbitrary
                page layout — so exports stay ATS-safe.
              </p>
              <button
                type="button"
                onClick={() => router.push("/template-builder/")}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: "1px solid #1d4ed8",
                  background: "#fff",
                  color: "#1d4ed8",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Open Templates
              </button>
            </div>
          )}

          {customizeTab === "add" && (
            <div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, margin: "0 0 12px" }}>
                Add content only through structured résumé fields (profile, upload, or manual form) — not free-form canvas edits.
              </p>
              <Link
                href="/?view=profile"
                style={{
                  display: "inline-block",
                  padding: "10px 16px",
                  borderRadius: 10,
                  background: "#1d4ed8",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: "inherit",
                }}
              >
                Edit profile
              </Link>
            </div>
          )}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={() => { void onExportLayoutPdf("save"); }}
              disabled={
                generating
                || (!(candidateProfile ?? "").trim() && !result.folder)
              }
              style={{
                width: "100%",
                padding: "12px 16px",
                minHeight: 44,
                borderRadius: 10,
                border: "none",
                background:
                  generating || (!(candidateProfile ?? "").trim() && !result.folder)
                    ? "#e2e8f0"
                    : "var(--surface2)",
                color: "var(--text)",
                fontSize: 13,
                fontWeight: 600,
                cursor:
                  generating || (!(candidateProfile ?? "").trim() && !result.folder)
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "inherit",
              }}
            >
              {generating ? "Saving…" : "Save PDF"}
            </button>
          </div>
        </aside>
      </div>

      {storageFailures.length > 0 && (
        <div
          style={{
            marginTop: 18,
            padding: "14px 18px",
            background: "rgba(251,191,36,0.08)",
            border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: 12,
            fontSize: 12,
            color: "var(--text)",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--orange)", marginBottom: 6, fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" }}>
            Cloud backup incomplete
          </div>
          {storageFailures.map((f, i) => (
            <div key={i} style={{ color: "var(--muted)" }}>
              <strong style={{ color: "var(--text)" }}>{f.artifact === "tex" ? ".tex source" : "PDF"}</strong> didn&apos;t upload:{" "}
              {f.reason}
            </div>
          ))}
        </div>
      )}

      {result.folder && result.pdfUrl && !generating ? (
        <div style={{ marginTop: 16 }}>
          <ResumePublicLinkSettings
            folder={result.folder}
            userId={user?.id ?? null}
            templateFlow
            collapseAsDetails
            ensureLibraryRow={ensureLibraryRow}
          />
        </div>
      ) : null}

      <div
        style={{
          marginTop: 18,
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          background: "#fff",
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 10 }}>
          ATS &amp; job match{user?.id && atsResult ? ` — ${atsResult.score}` : ""}
        </div>
        {!user?.id ? (
          <ResumeBuilderAtsSignInPrompt oauthBusy={atsOAuthBusy} onSignInWithGoogle={signInForAts} compact />
        ) : (
          <>
        {atsLoading && (
          <div style={{ padding: 12, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>Running ATS &amp; job match…</div>
        )}
        {atsError && !atsLoading && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12, color: "var(--red)" }}>
            Couldn&apos;t run ATS analysis: {atsError}
            {result.folder ? (
              <button
                type="button"
                onClick={() => runAtsCheck(result.folder!)}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 14px",
                  minHeight: 40,
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Retry
              </button>
            ) : null}
          </div>
        )}
        {atsResult && !atsLoading && (
          <AtsPanel result={atsResult} rechecking={atsLoading} onRecheck={() => result.folder && runAtsCheck(result.folder)} />
        )}
          </>
        )}
      </div>
    </div>
  );
}

type BuilderPaperInteractive = {
  suggestions: Suggestion[];
  acceptedIds: Set<string>;
  rejectedIds: Set<string>;
  selectedSuggestionId: string | null;
  onLineSelectSuggestion: (id: string) => void;
};

/** HTML paper: fix glued tokens, space before `**`, render `**x**` as <strong> */
function normalizePaperLineDisplayString(raw: string): string {
  let s = raw.replace(/([A-Za-z0-9)])(\*\*)/g, "$1 $2");
  // Month after lowercase letter (ScienceAug) — word boundary does not sit between e and A.
  s = s.replace(
    /([a-z])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=\d|[\s,;–—]|$)/gi,
    "$1 $2",
  );
  s = s.replace(
    /([A-Z])(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?=\d|[\s,;–—]|$)/g,
    "$1 $2",
  );
  s = s.replace(/([a-z])(May)(?=\d)/gi, "$1 $2");
  // Year run into school name (2024University)
  s = s.replace(/(\d{4})(University|College|School|Institute)\b/gi, "$1 $2");
  // CountyBaltimore-style glue; skip McDonald (single lc after uppercase)
  s = s.replace(/([a-z])([A-Z][a-z]{3,})\b/g, (m, a: string, b: string, offset: number, str: string) => {
    const prev = offset > 0 ? str[offset - 1] : "";
    if (/[A-Z]/.test(prev) && a.length === 1) return m;
    return `${a} ${b}`;
  });
  s = s.replace(/\|(?=[A-Za-z])/g, "| ");
  return s;
}

function paperLineDisplayContent(text: string): ReactNode {
  const s = normalizePaperLineDisplayString(text);
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    const m = /^\*\*(.+)\*\*$/.exec(part);
    if (m) return <strong key={idx}>{m[1]}</strong>;
    return <span key={idx}>{part}</span>;
  });
}

function ResumePaperView({
  text,
  highlightOriginals,
  interactiveSuggestions,
  templateFolder,
  baseFontPx = 10.5,
  lineHeight = 1.55,
  paperPaddingY = 28,
  paperPaddingX = 32,
  sectionAccentColor = "#0f172a",
  gapFixHighlights = [],
  appliedHighlights = [],
}: {
  text: string;
  highlightOriginals: string[];
  /** When set, paper mirrors Analyze: clickable rows, accepted text replaces line, accent ring on linked card. */
  interactiveSuggestions?: BuilderPaperInteractive;
  /** LaTeX `reference_folder` — selects sans vs serif and name treatment to approximate the gallery template. */
  templateFolder?: string | null;
  /** Optional typography for template "Customize preview" (does not affect exported PDF). */
  baseFontPx?: number;
  lineHeight?: number;
  /** Bullets currently being targeted by the open gap-fix panel — shown with purple highlight. */
  gapFixHighlights?: string[];
  /** Bullets that were just applied via gap fix — shown with green highlight. */
  appliedHighlights?: string[];
  paperPaddingY?: number;
  paperPaddingX?: number;
  /** Section titles + rules (accent swatch in customize preview). */
  sectionAccentColor?: string;
}) {
  const folder = templateFolder ?? "";
  const isMalta = folder === "MaltaCV_Modern";
  const isHarshibar = folder === "Harshibar_Template1";
  /** Match canonical Harshibar PDF density in the HTML paper preview (github.com/harshibar/resume). */
  const harshibarCompactPreview = isHarshibar;
  const resolvedLineHeight = harshibarCompactPreview ? Math.min(lineHeight, 1.42) : lineHeight;
  const nameCenteredCaps = !isMalta && !isHarshibar;
  const fontFamily =
    isMalta || isHarshibar
      ? "'Inter', 'Helvetica Neue', Arial, sans-serif"
      : "'Georgia', 'Times New Roman', serif";
  const { paperLines, combinedMatchByLine } = useMemo(() => {
    const raw = text.split("\n");
    const paperLines = dedupeRepeatedLeadingResumeHeader(raw);
    return {
      paperLines,
      combinedMatchByLine: computeCombinedMatchTextByLineIndex(paperLines),
    };
  }, [text]);
  const lineMatchesHighlight = useMemo(
    () => buildResumeHighlightMatcher(highlightOriginals, combinedMatchByLine),
    [highlightOriginals, combinedMatchByLine],
  );
  const lineMatchesGapFix = useMemo(
    () => buildResumeHighlightMatcher(gapFixHighlights, combinedMatchByLine),
    [gapFixHighlights, combinedMatchByLine],
  );
  const lineMatchesApplied = useMemo(
    () => buildResumeHighlightMatcher(appliedHighlights, combinedMatchByLine),
    [appliedHighlights, combinedMatchByLine],
  );
  const ic = interactiveSuggestions;

  const { nameLineIndex, subtitleLineIndex } = nameAndSubtitleLineIndices(paperLines);

  const isAllCaps = (t: string) =>
    t.length > 2 &&
    t === t.toUpperCase() &&
    /[A-Z]/.test(t) &&
    !/^[•\-–*|\u2022\u00b7]/.test(t) &&
    !/^\.\s+\S/.test(t);
  const isBullet = (t: string) => /^[•\-–*|\u2022\u00b7]/.test(t) || /^\.\s+\S/.test(t.trim());
  const stripPaperBulletPrefix = (body: string) =>
    body
      .replace(/^[•\-–*|\u2022\u00b7]\s*/, "")
      .replace(/^\.\s+(?=\S)/, "")
      .trim();
  const isSectionHeadingLike = (t: string) =>
    /^(technical skills|skills|experience|work experience|professional experience|education|projects|summary|profile|certifications|awards|publications|languages)$/i.test(t.trim());
  const splitLabelAndValue = (t: string): { label: string; value: string } | null => {
    const m = t.match(/^([^:]{2,42}):(\s*)(.+)$/);
    if (!m) return null;
    const label = m[1].trim();
    const value = m[3].trim();
    if (label.split(/\s+/).length > 5) return null;
    return { label, value };
  };

  const rowInteractiveProps = (
    _line: string,
    baseStyle: React.CSSProperties,
    linkSug: Suggestion | null,
    acceptedSug: Suggestion | null,
  ): React.HTMLAttributes<HTMLDivElement> => {
    if (!ic || !linkSug) return { style: baseStyle };
    const linked = ic.selectedSuggestionId === linkSug.id;
    return {
      role: "button",
      tabIndex: 0,
      "aria-label": `Suggestion: ${acceptedSug ? "accepted change" : "pending improvement"}. Press to show in list.`,
      style: {
        ...baseStyle,
        cursor: "pointer",
        ...(linked ? { boxShadow: "inset 0 0 0 2px var(--accent)" } : {}),
      },
      onClick: () => ic.onLineSelectSuggestion(linkSug.id),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          ic.onLineSelectSuggestion(linkSug.id);
        }
      },
    };
  };

  return (
    <div style={{
      background: "#fff",
      borderRadius: 6,
      boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
      padding: `${paperPaddingY}px ${paperPaddingX}px ${Math.max(28, paperPaddingY + 18)}px`,
      fontFamily,
      fontSize: baseFontPx,
      lineHeight: resolvedLineHeight,
      color: "#1e293b",
      minHeight: 480,
    }}>
      {(() => {
        const renderedAcceptedSuggestionIds = new Set<string>();
        return paperLines.map((line, i) => {
          const t = line.trim();
          if (!t) return <div key={i} style={{ height: harshibarCompactPreview ? 4 : 7 }} />;
          if (isPlaceholderResumeHeaderLine(line) && i !== nameLineIndex) return null;

          const matchText = (combinedMatchByLine[i] ?? "").trim() || t;
          const acceptedSug = ic
            ? firstAcceptedSuggestionMatchingLine(t, ic.suggestions, ic.acceptedIds) ??
              (matchText.trim() !== t.trim()
                ? firstAcceptedSuggestionMatchingLine(matchText, ic.suggestions, ic.acceptedIds)
                : null)
            : null;

          // Guardrail: one accepted suggestion should render once in the preview.
          if (acceptedSug) {
            if (renderedAcceptedSuggestionIds.has(acceptedSug.id)) {
              return <div key={i} style={{ display: "none" }} aria-hidden />;
            }
            renderedAcceptedSuggestionIds.add(acceptedSug.id);
          }

          const linkSug = ic
            ? firstSuggestionMatchingLine(matchText, ic.suggestions, s => !ic.rejectedIds.has(s.id))
            : null;
          const pendingHighlight = ic && linkSug && !ic.acceptedIds.has(linkSug.id);
          const highlightedPlain = !ic && lineMatchesHighlight(i);
          const suggestionRowLinked = Boolean(ic && linkSug && ic.selectedSuggestionId === linkSug.id);

          const amber: React.CSSProperties = {
            background: "rgba(245,158,11,0.12)",
            borderLeft: "3px solid #f59e0b",
            paddingLeft: 6,
            marginLeft: -9,
            borderRadius: "0 3px 3px 0",
          };
          const green: React.CSSProperties = {
            background: "rgba(52,211,153,0.14)",
            borderLeft: "3px solid rgb(34, 197, 94)",
            paddingLeft: 6,
            marginLeft: -9,
            borderRadius: "0 3px 3px 0",
          };
          // Purple: currently targeted by an open gap-fix panel
          const purple: React.CSSProperties = {
            background: "rgba(139,92,246,0.12)",
            borderLeft: "3px solid #8b5cf6",
            paddingLeft: 6,
            marginLeft: -9,
            borderRadius: "0 3px 3px 0",
            transition: "background 0.3s, border-color 0.3s",
          };

          const isGapFixTarget = lineMatchesGapFix(i);
          const isJustApplied  = lineMatchesApplied(i);

          let hlStyle: React.CSSProperties = {};
          // Gap-fix targets take highest priority so they're clearly visible
          if (isGapFixTarget)       hlStyle = purple;
          else if (isJustApplied)   hlStyle = green;
          else if (acceptedSug)     hlStyle = green;
          else if (pendingHighlight && linkSug) hlStyle = stripeStyleForPriority(linkSug.priority);
          else if (pendingHighlight || highlightedPlain) hlStyle = amber;

          if (i === nameLineIndex) {
            if (nameCenteredCaps) {
              return (
                <div key={i} style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2, textAlign: "center", textTransform: "uppercase" }}>
                  {paperLineDisplayContent(stripBareLocationSuffixFromNameLine(t))}
                </div>
              );
            }
            const nameSize = isMalta ? 18 : 19;
            return (
              <div
                key={i}
                style={{
                  fontSize: nameSize,
                  fontWeight: 700,
                  letterSpacing: -0.35,
                  marginBottom: 2,
                  lineHeight: 1.15,
                  textAlign: "left",
                  color: "#0f172a",
                  textTransform: "none",
                }}
              >
                {paperLineDisplayContent(stripBareLocationSuffixFromNameLine(t))}
              </div>
            );
          }
          if (subtitleLineIndex >= 0 && i === subtitleLineIndex && !isAllCaps(t)) {
            if (isBareLocationLabelLine(t)) return null;
            return (
              <div key={i} style={{ fontSize: 9.5, color: "#64748b", textAlign: nameCenteredCaps ? "center" : "left", marginBottom: harshibarCompactPreview ? 5 : 8 }}>
                {paperLineDisplayContent(t)}
              </div>
            );
          }
          if (isAllCaps(t) || isSectionHeadingLike(t)) {
            const headingText = isAllCaps(t) ? t : t.toUpperCase();
            return (
              <div key={i} style={{ marginTop: harshibarCompactPreview ? 9 : 14, marginBottom: harshibarCompactPreview ? 3 : 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: sectionAccentColor, marginBottom: harshibarCompactPreview ? 3 : 5 }}>{headingText}</div>
                <div
                  role="presentation"
                  aria-hidden
                  style={{
                    height: 1,
                    background: sectionAccentColor,
                    opacity: 0.5,
                    borderRadius: 1,
                    marginBottom: harshibarCompactPreview ? 6 : 10,
                  }}
                />
              </div>
            );
          }
          /* One logical paragraph / bullet is often split across lines with the same combined match text.
             Render only one visual row for that logical line to avoid stacked highlight strips and extra gaps. */
          const mergedCur = (combinedMatchByLine[i] ?? "").trim();
          const mergedPrevLine = i > 0 ? (combinedMatchByLine[i - 1] ?? "").trim() : "";
          const mergedNextLine = i + 1 < paperLines.length ? (combinedMatchByLine[i + 1] ?? "").trim() : "";
          const mergedGroupContinuation = i > 0 && mergedCur !== "" && mergedCur === mergedPrevLine;
          const mergedGroupStart = mergedCur !== "" && mergedCur !== mergedPrevLine && mergedCur === mergedNextLine;
          if (mergedGroupContinuation) {
            return <div key={i} style={{ display: "none" }} aria-hidden />;
          }
          const mergedDisplay = mergedGroupStart
            ? stripPaperBulletPrefix(mergedCur)
            : null;

          const strippedPhysical = stripPaperBulletPrefix(t);
          const strippedMerged = mergedCur ? stripPaperBulletPrefix(mergedCur) : strippedPhysical;
          /** Wrapped bullets hide continuation rows; display must use the merged block so text is not cut off. */
          const bulletBodyDefault = strippedMerged.trim() ? strippedMerged : strippedPhysical;
          const innerFromAccepted = acceptedSug
            ? (stripPaperBulletPrefix(acceptedSug.suggested.trim()).split("\n")[0]?.trim() ||
                bulletBodyDefault)
            : bulletBodyDefault;

          if (isBullet(t)) {
            if (!innerFromAccepted.trim()) return null;
            const base: React.CSSProperties = {
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              marginBottom: harshibarCompactPreview ? 2 : 4,
              paddingLeft: 6,
              paddingTop: suggestionRowLinked ? 2 : 0,
              paddingBottom: suggestionRowLinked ? 2 : 0,
              overflow: "visible",
              ...hlStyle,
            };
            const p = rowInteractiveProps(line, base, linkSug, acceptedSug);
            const lineMark = linkSug ? ({ "data-rb-sug-line": linkSug.id } as React.HTMLAttributes<HTMLDivElement>) : {};
            return (
              <div key={i} {...p} {...lineMark}>
                <span style={{ flexShrink: 0, marginTop: 1 }}>•</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{paperLineDisplayContent(innerFromAccepted)}</span>
              </div>
            );
          }
          const renderText = mergedDisplay ?? t;
          const labelSplit = splitLabelAndValue(renderText);
          const lineNode = acceptedSug
            ? paperLineDisplayContent(innerFromAccepted)
            : labelSplit
              ? (
                <>
                  <strong>{labelSplit.label}:</strong>{" "}
                  {paperLineDisplayContent(labelSplit.value)}
                </>
              )
              : paperLineDisplayContent(renderText);
          const base: React.CSSProperties = { marginBottom: harshibarCompactPreview ? 2 : 4, ...hlStyle };
          const p = rowInteractiveProps(line, base, linkSug, acceptedSug);
          const lineMark = linkSug ? ({ "data-rb-sug-line": linkSug.id } as React.HTMLAttributes<HTMLDivElement>) : {};
          return <div key={i} {...p} {...lineMark}>{lineNode}</div>;
        });
      })()}
    </div>
  );
}

/* ── Suggestions panel ───────────────────────────────────────────────────── */

/** Thumbnail art matches `referenceFolder` sent to the server — not hardcoded to one style. */
type TemplateThumbKind = "classic" | "harshibar" | "malta";

function templateThumbKindFromFolder(referenceFolder: string): TemplateThumbKind {
  if (referenceFolder === "Harshibar_Template1") return "harshibar";
  if (referenceFolder === "MaltaCV_Modern") return "malta";
  return "classic";
}

function TemplateStyleThumbSvg({ kind }: { kind: TemplateThumbKind }) {
  if (kind === "harshibar") {
    return (
      <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="260" fill="#fff" />
        <text x="12" y="21" fontSize="10.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif">John A. Smith</text>
        <text x="12" y="31" fontSize="5.5" fill="#475569" fontFamily="Arial,sans-serif">john@email.com · (555) 123-4567 · San Francisco</text>
        <line x1="12" y1="36" x2="188" y2="36" stroke="#0f172a" strokeWidth="0.8" />
        <text x="12" y="47" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif" letterSpacing="1">EXPERIENCE</text>
        <line x1="12" y1="50" x2="188" y2="50" stroke="#cbd5e1" strokeWidth="0.4" />
        <text x="12" y="59" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif">Software Engineer</text>
        <text x="188" y="59" fontSize="5.5" fill="#64748b" fontFamily="Arial,sans-serif" textAnchor="end">2022–Present</text>
        <text x="12" y="67" fontSize="6" fill="#475569" fontFamily="Arial,sans-serif">Google, Inc. · Mountain View, CA</text>
        <rect x="16" y="72" width="164" height="3" rx="1" fill="#e2e8f0" />
        <rect x="16" y="77" width="148" height="3" rx="1" fill="#e2e8f0" />
        <text x="12" y="90" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif" letterSpacing="1">EDUCATION</text>
        <line x1="12" y1="93" x2="188" y2="93" stroke="#cbd5e1" strokeWidth="0.4" />
        <text x="12" y="102" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif">B.S. Computer Science</text>
        <text x="12" y="110" fontSize="6" fill="#475569" fontFamily="Arial,sans-serif">Stanford University</text>
        <text x="12" y="123" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif" letterSpacing="1">SKILLS</text>
        <line x1="12" y1="126" x2="188" y2="126" stroke="#cbd5e1" strokeWidth="0.4" />
        <rect x="12" y="132" width="40" height="7" rx="2" fill="#dbeafe" />
        <rect x="56" y="132" width="35" height="7" rx="2" fill="#dbeafe" />
        <rect x="95" y="132" width="45" height="7" rx="2" fill="#dbeafe" />
      </svg>
    );
  }
  if (kind === "malta") {
    const accent = "#E25822";
    return (
      <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="260" fill="#fff" />
        <text x="12" y="22" fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif" letterSpacing="-0.2">Alex Rivera</text>
        <text x="12" y="32" fontSize="5.5" fill="#64748b" fontFamily="Arial,sans-serif">alex@email.com · Boston, MA</text>
        <rect x="12" y="37" width="56" height="2.5" rx="0.5" fill={accent} />
        <text x="12" y="52" fontSize="6.5" fontWeight="700" fill={accent} fontFamily="Arial,sans-serif" letterSpacing="0.5">EXPERIENCE</text>
        <rect x="12" y="55" width="176" height="0.9" fill={accent} opacity="0.35" />
        <text x="12" y="66" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif">Product Analyst</text>
        <text x="188" y="66" fontSize="5.5" fill="#64748b" fontFamily="Arial,sans-serif" textAnchor="end">2019–2023</text>
        <text x="12" y="74" fontSize="5.8" fill="#555" fontFamily="Arial,sans-serif">Northwind · Remote</text>
        <rect x="16" y="79" width="152" height="2.8" rx="0.5" fill="#f1f5f9" />
        <text x="12" y="94" fontSize="6.5" fontWeight="700" fill={accent} fontFamily="Arial,sans-serif" letterSpacing="0.5">SKILLS</text>
        <rect x="12" y="97" width="176" height="0.9" fill={accent} opacity="0.35" />
        <rect x="12" y="104" width="82" height="22" rx="3" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.9" />
        <rect x="98" y="104" width="82" height="22" rx="3" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.9" />
        <rect x="18" y="110" width="56" height="2.5" rx="0.5" fill="#fed7aa" />
        <rect x="18" y="115" width="48" height="2.5" rx="0.5" fill="#fed7aa" />
        <rect x="104" y="110" width="52" height="2.5" rx="0.5" fill="#fed7aa" />
        <rect x="104" y="115" width="44" height="2.5" rx="0.5" fill="#fed7aa" />
        <text x="12" y="140" fontSize="6.5" fontWeight="700" fill={accent} fontFamily="Arial,sans-serif" letterSpacing="0.5">EDUCATION</text>
        <rect x="12" y="143" width="176" height="0.9" fill={accent} opacity="0.35" />
        <text x="12" y="154" fontSize="6.2" fontWeight="700" fill="#0f172a" fontFamily="Arial,sans-serif">B.S. Economics</text>
        <text x="12" y="162" fontSize="5.8" fill="#555" fontFamily="Arial,sans-serif">State University</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 200 260" width="100%" xmlns="http://www.w3.org/2000/svg">
      <rect width="200" height="260" fill="#fff" />
      <text x="100" y="20" fontSize="11" fontWeight="700" fill="#0f172a" fontFamily="Georgia,serif" textAnchor="middle" letterSpacing="1">JENNIFER SMITH</text>
      <text x="100" y="29" fontSize="5.5" fill="#475569" fontFamily="Georgia,serif" textAnchor="middle">jennifer@email.com · (555) 010-2030 · New York</text>
      <rect x="12" y="34" width="176" height="1.2" fill="#0f172a" />
      <text x="100" y="45" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia,serif" textAnchor="middle" letterSpacing="0.8">PROFESSIONAL SUMMARY</text>
      <rect x="12" y="49" width="176" height="3" rx="0.5" fill="#e2e8f0" />
      <rect x="12" y="54" width="160" height="3" rx="0.5" fill="#e2e8f0" />
      <text x="12" y="67" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia,serif" letterSpacing="0.8">WORK EXPERIENCE</text>
      <rect x="12" y="70" width="176" height="0.8" fill="#0f172a" />
      <text x="12" y="79" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia,serif">Senior Product Designer</text>
      <text x="188" y="79" fontSize="5.5" fill="#64748b" fontFamily="Georgia,serif" textAnchor="end">2021–Present</text>
      <text x="12" y="87" fontSize="6" fill="#475569" fontFamily="Georgia,serif" fontStyle="italic">Acme Labs, San Francisco, CA</text>
      <rect x="16" y="92" width="160" height="2.8" rx="0.5" fill="#e2e8f0" />
      <rect x="16" y="97" width="148" height="2.8" rx="0.5" fill="#e2e8f0" />
      <text x="12" y="110" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia,serif" letterSpacing="0.8">EDUCATION</text>
      <rect x="12" y="113" width="176" height="0.8" fill="#0f172a" />
      <text x="12" y="122" fontSize="6.5" fontWeight="700" fill="#0f172a" fontFamily="Georgia,serif">BFA, Graphic Design</text>
      <text x="12" y="130" fontSize="6" fill="#475569" fontFamily="Georgia,serif" fontStyle="italic">State University, Boston</text>
    </svg>
  );
}

function ResumeStyleTemplateGrid({
  styleReferenceFolder,
  setStyleReferenceFolder,
}: {
  styleReferenceFolder: string;
  setStyleReferenceFolder: (folder: string) => void;
}) {
  const templates = useMemo(() => distinctStyleTemplates(), []);
  const defaultFolder = templates[0]?.referenceFolder;

  useEffect(() => {
    if (defaultFolder && styleReferenceFolder !== defaultFolder) {
      setStyleReferenceFolder(defaultFolder);
    }
  }, [defaultFolder, styleReferenceFolder, setStyleReferenceFolder]);

  if (!hasMultipleStyleTemplates()) {
    const t = templates[0];
    if (!t) return null;
    return (
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
        PDF layout: <strong style={{ color: "var(--text)" }}>{t.label}</strong> (ATS-friendly).
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {templates.map((t) => {
          const selected = styleReferenceFolder === t.referenceFolder;
          const isAts = true;
          const thumbKind = templateThumbKindFromFolder(t.referenceFolder);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setStyleReferenceFolder(t.referenceFolder)}
              style={{
                flex: "1 1 160px",
                textAlign: "left",
                padding: 0,
                borderRadius: 10,
                border: selected ? "2.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: "var(--surface2)",
                cursor: "pointer",
                fontFamily: "inherit",
                overflow: "hidden",
                boxShadow: selected ? "0 0 0 3px rgba(47,129,247,0.15)" : "none",
                transition: "border-color 0.15s, box-shadow 0.15s",
              }}
            >
              <div style={{
                background: "#f8fafc",
                borderBottom: "1px solid var(--border)",
                padding: "8px 8px 0",
              }}
              >
                <div style={{
                  background: "#fff",
                  borderRadius: "2px 2px 0 0",
                  boxShadow: "0 1px 4px rgba(15,23,42,0.10)",
                  overflow: "hidden",
                  aspectRatio: "8.5 / 11",
                }}
                >
                  <TemplateStyleThumbSvg kind={thumbKind} />
                </div>
              </div>
              <div style={{ padding: "9px 12px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.label}
                  </div>
                </div>
                {isAts && (
                  <span style={{
                    flexShrink: 0,
                    padding: "2px 6px", borderRadius: 99,
                    border: "1px solid rgba(52,211,153,0.35)",
                    background: "rgba(52,211,153,0.08)",
                    color: "var(--green)",
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.2,
                  }}>ATS</span>
                )}
                {selected && (
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%",
                    background: "var(--accent)", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4l1.8 1.8L6.5 2.5" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}
/* ── Sub-components ─────────────────────────────────────── */

function StepCard({ step, title, subtitle, children }: {
  step: number; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <div className={`fade-in-up stagger-${step}`} style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 14, padding: "20px 22px", marginBottom: 12,
      transition: "border-color var(--transition), box-shadow var(--transition)",
    }}
    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-h)"; }}
    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {/* Blue filled step circle */}
        <div style={{
          width: 22, height: 22, borderRadius: "50%",
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
        }}>{step}</div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: -0.3, color: "var(--text)", lineHeight: 1 }}>
            {title}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3, letterSpacing: -0.1 }}>
            {subtitle}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId}>
      <div
        id={labelId}
        style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dim)", marginBottom: 6, letterSpacing: -0.1, textTransform: "uppercase" }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

/**
 * Small "i" info icon with a hover/focus tooltip popover.
 *
 * Used to hide longer explanatory copy behind an unobtrusive icon so panels
 * stay short and scannable. Opens on hover, focus, or click; click toggles so
 * touch users (no hover) can still pin it open.
 */
function InfoTip({ children, label }: { children: React.ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        aria-label={label ?? "More info"}
        aria-expanded={open}
        style={{
          minWidth: 44, minHeight: 44, borderRadius: "50%",
          border: "1px solid var(--dim)", background: "transparent",
          color: "var(--dim)", fontSize: 10, fontWeight: 700, lineHeight: 1,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          cursor: "help", padding: 0, fontFamily: "inherit",
          fontStyle: "italic",
        }}
      >
        i
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 20,
            minWidth: 240,
            maxWidth: 320,
            padding: "10px 12px",
            background: "var(--surface3)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-card)",
            fontSize: 11.5,
            lineHeight: 1.5,
            letterSpacing: -0.1,
            fontWeight: 400,
            whiteSpace: "normal",
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

/** Prominent progress while tailor PDF generate runs on the results page. */
function RescanOverlay() {
  const steps = [
    "CHECKING QUALIFICATIONS",
    "ANALYZING RESPONSIBILITIES",
    "MATCHING KEYWORDS",
  ];
  return (
    <div
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        background: "rgba(255,255,255,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 20,
          boxShadow: "0 8px 40px rgba(0,0,0,0.14)",
          padding: "36px 40px",
          width: 340,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {/* spinner icon */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#f1f5f9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width={28}
            height={28}
            viewBox="0 0 28 28"
            fill="none"
            style={{ animation: "spin 0.9s linear infinite" }}
            aria-hidden
          >
            <circle cx={14} cy={14} r={11} stroke="#e2e8f0" strokeWidth={3} />
            <path d="M14 3a11 11 0 0111 11" stroke="#6366f1" strokeWidth={3} strokeLinecap="round" />
          </svg>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", letterSpacing: -0.4, marginBottom: 6 }}>
            Refining Your Match
          </div>
          <div style={{ fontSize: 12.5, color: "#64748b", lineHeight: 1.5 }}>
            Analyzing your updated résumé against the job description…
          </div>
        </div>

        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
          {steps.map((step, i) => (
            <div
              key={step}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 14px",
                borderRadius: 10,
                background: "#f8fafc",
                fontSize: 11,
                fontWeight: 700,
                color: "#475569",
                letterSpacing: 0.4,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  flexShrink: 0,
                  background: i === 0 ? "#6366f1" : i === 1 ? "#a855f7" : "#3b82f6",
                  animation: `pulse ${0.9 + i * 0.3}s ease-in-out infinite`,
                }}
              />
              {step}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10.5, color: "#94a3b8", letterSpacing: 0.3, fontWeight: 600 }}>
          USUALLY TAKES 3–8 SECONDS
        </div>
      </div>
    </div>
  );
}

function TailorBuildProgressBanner({ statusMsg }: { statusMsg: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fade-in"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 14,
        marginBottom: 16,
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid rgba(47,129,247,0.35)",
        background: "var(--accent-bg)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <Spinner size={24} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: -0.3, marginBottom: 4 }}>
          Generating your tailored PDF
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
          {statusMsg.trim() || "Tailoring content, compiling PDF, and scoring match…"}
        </div>
      </div>
    </div>
  );
}

/** Live web research queries + citation sources (suggestions or generate stream). */
function BuilderWebResearchPanel({
  queries,
  sources,
  live,
  badgeLabel,
  intro,
}: {
  queries: string[];
  sources: { title: string | null; url: string }[];
  live?: boolean;
  badgeLabel: string;
  intro: ReactNode;
}) {
  const pending = live && queries.length === 0 && sources.length === 0;
  if (!live && queries.length === 0 && sources.length === 0) return null;

  return (
    <div style={{ marginBottom: 16 }} className="fade-in">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          color: "var(--dim)",
          letterSpacing: -0.1,
          marginBottom: 8,
          textTransform: "uppercase",
        }}
      >
        <span>Live web research</span>
        <span
          style={{
            fontSize: 9,
            padding: "2px 7px",
            borderRadius: 999,
            background: "rgba(52,211,153,0.12)",
            color: "var(--green)",
            letterSpacing: 0,
            textTransform: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--green)",
              animation: live ? "pulse-bg 1.4s ease-in-out infinite" : undefined,
            }}
          />
          {badgeLabel}
        </span>
      </div>
      <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45, margin: "0 0 10px", letterSpacing: -0.05 }}>
        {intro}
      </p>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "12px 14px",
          maxHeight: 220,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {pending ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--muted)" }}>
            <Spinner size={16} />
            <span>Starting web search…</span>
          </div>
        ) : null}
        {queries.map((q, i) => (
          <div
            key={`wrq-${i}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              color: "var(--text)",
              lineHeight: 1.45,
            }}
          >
            <span style={{ flexShrink: 0, marginTop: 1 }}>🔍</span>
            <span>
              <span style={{ color: "var(--dim)" }}>Searching:</span>{" "}
              <span style={{ color: "var(--text)", fontWeight: 500 }}>&ldquo;{q}&rdquo;</span>
            </span>
          </div>
        ))}
        {sources.length > 0 && (
          <div
            style={{
              borderTop: queries.length ? "1px solid var(--border)" : "none",
              paddingTop: queries.length ? 10 : 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--dim)",
                letterSpacing: 0.3,
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              Citing
            </div>
            {sources.map((s, i) => {
              let domain = s.url;
              try {
                domain = new URL(s.url).hostname.replace(/^www\./, "");
              } catch {
                /* leave */
              }
              return (
                <a
                  key={`wrs-${i}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 11,
                    color: "var(--accent)",
                    textDecoration: "none",
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: 1, color: "var(--dim)" }}>↳</span>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ color: "var(--text)" }}>{s.title || domain}</span>
                    <span style={{ color: "var(--dim)" }}> — {domain}</span>
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Drop-zone loader while résumé PDF/DOCX is read and text is extracted. */
function BuilderUploadExtractLoader({
  stepsDone,
  tipIdx,
}: {
  stepsDone: number;
  tipIdx: number;
}) {
  const tip = UPLOAD_LOADER_TIPS[tipIdx % UPLOAD_LOADER_TIPS.length];
  const stepRow = (label: string, stepIndex: number, isLast: boolean) => {
    const done = stepsDone > stepIndex;
    const active = stepsDone === stepIndex;
    return (
      <div
        key={label}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 0",
          borderBottom: isLast ? "none" : "1px solid var(--border)",
          color: done || active ? "var(--text)" : "var(--dim)",
        }}
      >
        <span style={{ width: 20, height: 20, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done ? (
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="rgba(52,211,153,0.2)" stroke="rgb(34,197,94)" strokeWidth="1.5" />
              <path d="M6 10l2.5 2.5L14 7" stroke="rgb(22,101,52)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : active ? (
            <Spinner size={16} />
          ) : (
            <span style={{
              width: 16, height: 16, borderRadius: "50%",
              border: "2px solid var(--border)",
              background: "var(--surface2)",
            }} aria-hidden />
          )}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: active || done ? 600 : 500, letterSpacing: -0.2, flex: 1 }}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div
      className="fade-in rb-suggest-loader-card"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rb-suggest-loader-topshine" aria-hidden />
      <div style={{ padding: "16px 18px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: "var(--accent-bg)",
            border: "1px solid rgba(47,129,247,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          >
            <Spinner size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.35, color: "var(--text)", marginBottom: 3 }}>
              Reading your résumé
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.45, letterSpacing: -0.1 }}>
              Extracting text so we can compare it to the job posting.
            </p>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          {stepRow("Open and read your file", 0, false)}
          {stepRow("Extract sections and bullets", 1, false)}
          {stepRow("Prepare for tailoring", 2, true)}
        </div>
        <div
          className="rb-upload-loader-skeleton"
          aria-hidden
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--surface2)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="rb-upload-skel-line" style={{ width: "42%", height: 7 }} />
          <div className="rb-upload-skel-line" style={{ width: "88%", height: 6 }} />
          <div className="rb-upload-skel-line" style={{ width: "76%", height: 6 }} />
          <div className="rb-upload-skel-line" style={{ width: "64%", height: 6 }} />
        </div>
        <div
          key={tipIdx}
          className="fade-in"
          style={{
            fontSize: 12,
            color: "var(--accent)",
            fontWeight: 500,
            lineHeight: 1.5,
            letterSpacing: -0.12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--accent-bg)",
            border: "1px solid rgba(47,129,247,0.18)",
          }}
        >
          <span style={{ fontWeight: 700, marginRight: 6 }}>Tip:</span>
          {tip}
        </div>
      </div>
    </div>
  );
}

/** Full-width loader while generate-stream runs (tailor / template compile). */
function BuilderGeneratePdfLoader({
  statusMsg,
  tipIdx,
  stepsDone,
  reusingSuggestResearch,
  studioHandoff = false,
  acceptedCount = 0,
}: {
  statusMsg: string;
  tipIdx: number;
  stepsDone: number;
  reusingSuggestResearch: boolean;
  studioHandoff?: boolean;
  acceptedCount?: number;
}) {
  const tip = GENERATE_LOADER_TIPS[tipIdx % GENERATE_LOADER_TIPS.length];
  const stepRow = (label: string, stepIndex: number, isLast: boolean) => {
    const done = stepsDone > stepIndex;
    const active = stepsDone === stepIndex;
    return (
      <div
        key={label}
        className="rb-suggest-loader-step"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 0",
          borderBottom: isLast ? "none" : "1px solid var(--border)",
          color: done ? "var(--text)" : active ? "var(--text)" : "var(--dim)",
        }}
      >
        <span style={{ width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="rgba(52,211,153,0.2)" stroke="rgb(34,197,94)" strokeWidth="1.5" />
              <path d="M6 10l2.5 2.5L14 7" stroke="rgb(22,101,52)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : active ? (
            <Spinner size={18} />
          ) : (
            <span style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "2px solid var(--border)",
              background: "var(--surface2)",
            }} aria-hidden />
          )}
        </span>
        <span style={{ fontSize: 13, fontWeight: active || done ? 600 : 500, letterSpacing: -0.2, flex: 1 }}>
          {label}
        </span>
      </div>
    );
  };

  const title = studioHandoff ? "Compiling your résumé PDF" : "Building your tailored résumé";
  const subtitle = studioHandoff
    ? "Applying your template layout and typography — no job tailoring on this path."
    : reusingSuggestResearch
      ? "Using research from Get suggestions — no second live web search during this step."
      : acceptedCount > 0
        ? `Applying ${acceptedCount} accepted edit${acceptedCount > 1 ? "s" : ""}, then compiling PDF and match score.`
        : "Tailoring to the job from your profile, then compiling PDF and match score.";

  return (
    <div
      className="fade-in rb-suggest-loader-card"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "relative",
        marginBottom: 24,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <div className="rb-suggest-loader-topshine" aria-hidden />
      <div style={{ padding: "18px 20px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.45, color: "var(--text)", marginBottom: 4 }}>
          {title}
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.1 }}>
          {subtitle}
        </p>
        <div style={{ marginBottom: 14 }}>
          {stepRow(studioHandoff ? "Load profile into template" : "Tailor content to job posting", 0, false)}
          {stepRow(acceptedCount > 0 && !studioHandoff ? "Apply accepted edits" : "Apply template & ATS layout", 1, false)}
          {stepRow("Compile PDF on server", 2, false)}
          {stepRow("Score match & save", 3, true)}
        </div>
        {statusMsg.trim() ? (
          <div
            style={{
              fontSize: 11,
              color: "var(--muted)",
              lineHeight: 1.45,
              marginBottom: 12,
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              wordBreak: "break-word",
            }}
          >
            {statusMsg}
          </div>
        ) : null}
        <div
          key={tipIdx}
          className="fade-in"
          style={{
            fontSize: 12.5,
            color: "var(--accent)",
            fontWeight: 500,
            lineHeight: 1.5,
            letterSpacing: -0.12,
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--accent-bg)",
            border: "1px solid rgba(47,129,247,0.18)",
          }}
        >
          <span style={{ fontWeight: 700, marginRight: 6 }}>Working:</span>
          {tip}
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--dim)", lineHeight: 1.45 }}>
          This usually takes about a minute — keep this tab open.
        </p>
      </div>
    </div>
  );
}

/** Full-width analysis loader: shimmer card + phased steps + rotating tips (tailor flow). */
function BuilderSuggestAnalysisLoader({
  stepsDone,
  tipIdx,
  coachStreamText,
}: {
  stepsDone: number;
  tipIdx: number;
  coachStreamText?: string;
}) {
  const tip = SUGGEST_LOADER_TIPS[tipIdx % SUGGEST_LOADER_TIPS.length];
  const stepRow = (label: string, stepIndex: number, isLast: boolean) => {
    const done = stepsDone > stepIndex;
    const active = stepsDone === stepIndex;
    return (
      <div
        key={label}
        className="rb-suggest-loader-step"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 0",
          borderBottom: isLast ? "none" : "1px solid var(--border)",
          color: done ? "var(--text)" : active ? "var(--text)" : "var(--dim)",
        }}
      >
        <span style={{ width: 22, height: 22, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {done ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <circle cx="10" cy="10" r="9" fill="rgba(52,211,153,0.2)" stroke="rgb(34,197,94)" strokeWidth="1.5" />
              <path d="M6 10l2.5 2.5L14 7" stroke="rgb(22,101,52)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : active ? (
            <Spinner size={18} />
          ) : (
            <span style={{
              width: 18, height: 18, borderRadius: "50%",
              border: "2px solid var(--border)",
              background: "var(--surface2)",
            }} aria-hidden />
          )}
        </span>
        <span style={{ fontSize: 13, fontWeight: active || done ? 600 : 500, letterSpacing: -0.2, flex: 1 }}>
          {label}
        </span>
      </div>
    );
  };

  return (
    <div
      className="fade-in rb-suggest-loader-card"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "relative",
        marginBottom: 16,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        overflow: "hidden",
      }}
    >
      <div className="rb-suggest-loader-topshine" aria-hidden />
      <div style={{ padding: "18px 20px 16px" }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: -0.45, color: "var(--text)", marginBottom: 4 }}>
          Comparing your résumé to this role
        </div>
        <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.1 }}>
          Reading your résumé and the job posting.
        </p>
        <div style={{ marginBottom: 14 }}>
          {stepRow("Read your résumé text", 0, false)}
          {stepRow("Read the job posting", 1, false)}
          {stepRow("Live web research on the role", 2, false)}
          {stepRow("Build tailored suggestions", 3, true)}
        </div>
        <div
          key={tipIdx}
          className="fade-in"
          style={{
            fontSize: 12.5,
            color: "var(--accent)",
            fontWeight: 500,
            lineHeight: 1.5,
            letterSpacing: -0.15,
            padding: "12px 14px",
            borderRadius: 10,
            background: "var(--accent-bg)",
            border: "1px solid rgba(47,129,247,0.18)",
          }}
        >
          {tip}
        </div>
        {coachStreamText && coachStreamText.trim().length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--dim)",
                letterSpacing: 0.04,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Coach response (live)
            </div>
            <pre
              className="fade-in"
              style={{
                margin: 0,
                maxHeight: 200,
                overflow: "auto",
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--surface3)",
                border: "1px solid var(--border)",
                fontSize: 11,
                lineHeight: 1.45,
                letterSpacing: -0.05,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
            >
              {coachStreamText}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="9" cy="9" r="7" stroke="var(--border)" strokeWidth="2.5" />
      <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Generate overlay — blurs the page + shows a centred loading card ─────────

const GENERATE_TIPS = [
  "Analysing the job description against your experience…",
  "Tailoring bullet points to match key requirements…",
  "Weaving in JD keywords without changing your facts…",
  "Optimising ATS keyword density…",
  "Scoring your resume against the role criteria…",
  "Compiling your tailored PDF via LaTeX…",
  "Running final quality checks…",
  "Almost done — polishing the output…",
];

const SUGGEST_TIPS = [
  "Reading the job description carefully…",
  "Identifying gaps between your resume and the role…",
  "Generating targeted bullet rewrites…",
  "Grouping improvements by category…",
  "Crafting interview coaching tips…",
  "Predicting likely interview questions for this role…",
  "Scoring keyword coverage against the JD…",
  "Finalising your personalised suggestions…",
];

function GenerateOverlay({ mode = "generate" }: { mode?: "generate" | "suggest" }) {
  const tips = mode === "suggest" ? SUGGEST_TIPS : GENERATE_TIPS;
  const title = mode === "suggest" ? "Analysing your résumé…" : "Building your résumé…";
  const [tipIdx, setTipIdx] = useState(0);
  const [visible, setVisible] = useState(false);

  // Fade in after 1 frame so the transition is smooth
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Cycle tips every 3 s
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % tips.length), 3000);
    return () => clearInterval(id);
  }, [tips.length]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        background: "rgba(var(--bg-rgb, 15,15,20), 0.55)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
        pointerEvents: "all",
      }}
    >
      {/* Loading card */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "36px 40px",
          maxWidth: 380,
          width: "90%",
          textAlign: "center",
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        {/* Animated rings */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <div style={{ position: "relative", width: 56, height: 56 }}>
            {/* Outer ring */}
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ position: "absolute", inset: 0, animation: "spin 1.4s linear infinite" }} aria-hidden>
              <circle cx="28" cy="28" r="24" stroke="rgba(59,130,246,0.15)" strokeWidth="3" />
              <path d="M28 4a24 24 0 0124 24" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            </svg>
            {/* Inner ring */}
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ position: "absolute", inset: 10, animation: "spin 0.9s linear infinite reverse" }} aria-hidden>
              <circle cx="18" cy="18" r="14" stroke="rgba(59,130,246,0.1)" strokeWidth="2.5" />
              <path d="M18 4a14 14 0 0114 14" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
            </svg>
            {/* Centre dot */}
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--accent)", animation: "pulse-cta 1.4s ease-in-out infinite" }} />
            </div>
          </div>
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 10, letterSpacing: -0.3 }}>
          {title}
        </div>

        {/* Cycling tip */}
        <div
          key={tipIdx}
          style={{
            fontSize: 12.5,
            color: "var(--muted)",
            lineHeight: 1.55,
            minHeight: 40,
            animation: "fadeSlideIn 0.35s ease",
          }}
        >
          {tips[tipIdx]}
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 20 }}>
          {tips.slice(0, 5).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === tipIdx % 5 ? 20 : 6,
                height: 6,
                borderRadius: 3,
                background: i === tipIdx % 5 ? "var(--accent)" : "rgba(148,163,184,0.25)",
                transition: "width 0.3s ease, background 0.3s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** White spinner — for use on blue/accent backgrounds (buttons). */
function SpinnerWhite({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}
      aria-hidden
    >
      <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" />
      <path d="M9 2a7 7 0 017 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
