"use client";
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useId, useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source, ChangeRationale, ParsedSection } from "@/lib/types";
import { buildResumeFileStem } from "@/lib/resumeFileName";
import { apiUrl, isResumeUploadFile, parseJsonOrThrow, scoreColor } from "@/lib/utils";
import { toUserFriendlyErrorMessage, messageForNonJsonApiFailure } from "@/lib/userFriendlyError";
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
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { useSuggestionsStore } from "@/store/suggestionsStore";
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
import DiffView     from "./DiffView";
import SourcesPanel from "./SourcesPanel";
import AtsPanel, { type AtsResult } from "./AtsPanel";

import ResumePublicLinkSettings from "./ResumePublicLinkSettings";

const BuilderPdfSuggestionHighlights = dynamic(
  () => import("@/components/BuilderPdfSuggestionHighlights"),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>Loading PDF viewer…</div>
    ),
  },
);

type Suggestion = {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: "high" | "medium" | "low";
};

/** Rotating coach lines while “Analyze & get suggestions” runs (Resume Builder). */
const SUGGEST_LOADER_TIPS = [
  "Matching bullets to keywords from the posting…",
  "Looking for vague metrics and weak verbs…",
  "Checking impact lines vs plain responsibilities…",
  "Spotting gaps between your story and this role…",
  "Prioritizing what recruiters skim in the first pass…",
] as const;

/** Rotating coach lines while a résumé file is uploaded and text is extracted. */
const UPLOAD_LOADER_TIPS = [
  "PDF and Word (.docx) both work — we pull plain text for tailoring.",
  "Clean, selectable text scans better than image-only PDFs.",
  "We keep your file on this device until you generate a tailored version.",
  "Headings and bullet order help the coach match suggestions to sections.",
  "After upload, you can merge contact fields into Profile in one click.",
] as const;

/** Accent swatches — template “Customize preview” (preview chrome only; PDF uses LaTeX template). */
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

const SS_KEY = "rn_builder_draft";
function loadDraft() {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY) ?? "{}"); } catch { return {}; }
}
function saveDraft(patch: Record<string, unknown>) {
  try {
    const prev = loadDraft();
    sessionStorage.setItem(SS_KEY, JSON.stringify({ ...prev, ...patch }));
  } catch { /* quota / SSR */ }
}

const BUILDER_SESSION_KEY = "builderSession";

/** Survives sidebar view switches (ResumeBuilder unmounts when leaving ?view=builder). */
type BuilderSessionV1 = {
  v: 1;
  candidateProfile: string | null;
  uploadedFileName: string | null;
  baseFolder: string | null;
  studioHandoff: boolean;
  suggestions: Suggestion[] | null;
  suggestSummary: string;
  acceptedSuggestionIds: string[];
  rejectedSuggestionIds: string[];
  result: GenerationResult | null;
  /** Web research digest from GET suggestions (reused for PDF — no second search). */
  suggestResearchDigest: string;
  suggestResearchQueries: string[];
  suggestResearchSources: { title: string | null; url: string }[];
};

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
    baseFolder: typeof o.baseFolder === "string" ? o.baseFolder : null,
    studioHandoff: o.studioHandoff === true,
    suggestions,
    suggestSummary: typeof o.suggestSummary === "string" ? o.suggestSummary : "",
    acceptedSuggestionIds,
    rejectedSuggestionIds,
    result: parseResultFromDraft(o.result),
    suggestResearchDigest: typeof o.suggestResearchDigest === "string" ? o.suggestResearchDigest : "",
    suggestResearchQueries: Array.isArray(o.suggestResearchQueries)
      ? o.suggestResearchQueries.filter((x): x is string => typeof x === "string")
      : [],
    suggestResearchSources: suggestResearchSourcesParsed,
  };
}

function saveBuilderSessionToDraft(session: BuilderSessionV1) {
  try {
    const prev = loadDraft();
    sessionStorage.setItem(SS_KEY, JSON.stringify({ ...prev, [BUILDER_SESSION_KEY]: session }));
  } catch {
    try {
      const slim: BuilderSessionV1 = {
        ...session,
        result: session.result ? { ...session.result, latexPreview: "" } : null,
      };
      const prev = loadDraft();
      sessionStorage.setItem(SS_KEY, JSON.stringify({ ...prev, [BUILDER_SESSION_KEY]: slim }));
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
  /** Right-panel “Save to library” re-upsert (compile already upserts; this is explicit retry). */
  const [libraryReSaveBusy, setLibraryReSaveBusy] = useState(false);
  const [libraryToast, setLibraryToast] = useState<string | null>(null);
  /** Toast for template customize flow (Save / Download with fresh compile). */
  const [customizeExportToast, setCustomizeExportToast] = useState<string | null>(null);
  const hasWebResearch = searchQueries.length > 0 || searchSources.length > 0;
  /** After Template gallery / content picker / manual form — compile PDF from layout + extract only (no JD UI). */
  const [studioHandoff, setStudioHandoff] = useState(() => builderSession0?.studioHandoff ?? false);

  // ── Suggestions state (via useSuggestionsStore) ────────────────────────────
  const suggestions        = useSuggestionsStore((s) => s.suggestions);
  const suggestSummary     = useSuggestionsStore((s) => s.summary);
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
    setAiJobFitWithoutTicks(false);
  }, [resetSuggestions, selectSuggestion]);
  const tryAnotherJob = useCallback(() => {
    clearSuggestionsState();
    setResult(null);
    setPreview("");
    setJd("");
    setCompany("");
    setRole("");
    setAtsResult(null);
    setAtsError(null);
  }, [clearSuggestionsState]);
  const suggestStreamAbortRef = useRef<AbortController | null>(null);
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
  const [uploadLoaderStep, setUploadLoaderStep] = useState(0);
  const [uploadLoaderTipIdx, setUploadLoaderTipIdx] = useState(0);
  /** Linked selection: click a highlighted résumé line → scroll/highlight matching suggestion card (Analyze-style). */
  /**
   * When false (default), Generate after the coach uses the base library LaTeX body as-is (no model rewrite)
   * unless the user ticks structured edits. When true, the model may reword for the JD even with zero ticks.
   */
  const [aiJobFitWithoutTicks, setAiJobFitWithoutTicks] = useState(false);
  /** Beta path: deterministic backend renderer scaffold (Jinja2 + structured model). */
  const [useStructuredRenderer, setUseStructuredRenderer] = useState(true);

  /**
   * Only the legacy LaTeX stream tends to emit live `search_query` / `search_source` SSE during PDF generation.
   * Structured + digest-reuse runs should not show a second “waiting for web search” panel above the main progress card.
   */
  const pdfGenExpectsLiveWebSearch =
    !studioHandoff && !useStructuredRenderer && !reusingSuggestWebForPdf;

  /** Template handoff — post-compile UI: HTML live paper (instant Style tab) + exported PDF; Save / Download run a fresh compile. */
  const [customizeTab, setCustomizeTab] = useState<"style" | "sections" | "add">("style");
  const [previewAccentHex, setPreviewAccentHex] = useState("#1d4ed8");
  const [previewFontSize, setPreviewFontSize] = useState<"small" | "standard" | "large">("standard");
  const [previewSpacing, setPreviewSpacing] = useState<"compact" | "balanced" | "spacious">("balanced");

  const [candidateProfile,    setCandidateProfile]    = useState<string | null>(
    () => builderSession0?.candidateProfile ?? null,
  );
  const [uploadedFileName,    setUploadedFileName]    = useState<string | null>(
    () => builderSession0?.uploadedFileName ?? null,
  );
  const { upload: uploadResume, loading: uploadingPdf, error: uploadError, clearError: clearUploadError } = useUploadResume();
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Latest PDF extract text — used to merge into saved Profile */
  const lastResumeExtractRef = useRef<string>("");
  /** Object URL for the last uploaded PDF — powers true PDF highlights in suggestions (revoked on replace / unmount). */
  const sourcePdfBlobUrlRef = useRef<string | null>(null);
  const [sourcePdfBlobUrl, setSourcePdfBlobUrl] = useState<string | null>(null);
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
      baseFolder,
      studioHandoff,
      suggestions,
      suggestSummary,
      acceptedSuggestionIds: [...acceptedIds],
      rejectedSuggestionIds: [...rejectedIds],
      result,
      suggestResearchDigest,
      suggestResearchQueries,
      suggestResearchSources,
    });
  }, [
    candidateProfile,
    uploadedFileName,
    baseFolder,
    studioHandoff,
    suggestions,
    suggestSummary,
    acceptedDepsKey,
    rejectedDepsKey,
    result,
    suggestResearchDigest,
    suggestResearchQueries,
    suggestResearchSources,
  ]);

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
      setStudioHandoff(true);
      setResult(null);
      setPreview("");
      try {
        sessionStorage.setItem(RN_BUILDER_LAYOUT_ONLY_KEY, "1");
      } catch { /* ignore */ }
      sp.delete("fromTemplateStudio");
      const qs = sp.toString();
      router.replace(qs ? `/?${qs}` : "/?view=builder&flow=tailor");
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

  const runAtsCheck = useCallback(async (folder: string) => {
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
          setAtsResult(json);
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

  const getSuggestions = useCallback(async () => {
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

    setSuggestLoading(true);
    setSuggestError(null);
    resetSuggestions();
    setAiJobFitWithoutTicks(false);
    
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
              hydrateSuggestions(list, typeof ev.summary === "string" ? ev.summary : "");
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
  }, [jd, candidateProfile, studioHandoff, hydrateSuggestions, appendSuggestStream, setSuggestLoading, setSuggestError, resetSuggestions]);

  const patchSuggestionSuggested = useCallback((id: string, suggested: string) => {
    const updated = suggestions.map((s) => (s.id === id ? { ...s, suggested } : s));
    hydrateSuggestions(updated, suggestSummary);
  }, [suggestions, suggestSummary, hydrateSuggestions]);

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
      // useUploadResume surfaces the error; show inline via uploadError
      return;
    }
    setProfileSyncUpsell(null);
    try {
      const { text } = await uploadResume(file);
      setCandidateProfile(text);
      setUploadedFileName(file.name);
      lastResumeExtractRef.current = text;

      if (sourcePdfBlobUrlRef.current) {
        URL.revokeObjectURL(sourcePdfBlobUrlRef.current);
        sourcePdfBlobUrlRef.current = null;
      }
      if (file.type.includes("pdf")) {
        const blobUrl = URL.createObjectURL(file);
        sourcePdfBlobUrlRef.current = blobUrl;
        setSourcePdfBlobUrl(blobUrl);
      } else {
        setSourcePdfBlobUrl(null);
      }

      const hints = extractProfileHintsFromResumeText(text);
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
      setError(null);
      setStatusMsg("Reading the job posting…");
      setGenerating(true);
      const extracted = await importFromUrl();
      setGenerating(false);
      setStatusMsg("");
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
      return null;
    }

    setGenerating(true);
    setError(null);
    // Clearing `result` here used to unmount the template customize screen entirely (because the
    // results branch is `result ? … : inputs`). Keep the last successful payload visible during
    // studioHandoff recompiles so PDF/controls stay on-screen while SSE runs.
    if (!studioHandoff) {
      setResult(null);
    }
    setPreview("");
    setStatusMsg("Connecting…");
    setJdKeywords(extractJdKeywords(effJd));
    const digestTrim = suggestResearchDigest.trim();
    setSearchQueries([]);
    setSearchSources([]);
    setStorageFailures([]);

    const acceptedList = (suggestions ?? []).filter(s => acceptedIds.has(s.id)).map(s => ({
      id: s.id,
      section: s.section,
      original: s.original,
      suggested: s.suggested,
      reason: s.reason,
    }));
    const tailorBodyWithAi = acceptedList.length > 0 || aiJobFitWithoutTicks;
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
                      renderer: useStructuredRenderer ? "structured" : "legacy",
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
      setError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : String(e)));
      setGenerating(false);
      setStatusMsg("");
      return null;
    }
  }, [company, role, jd, jobUrl, importFromUrl, baseFolder, candidateProfile, user, styleReferenceFolder, studioHandoff, suggestions, acceptedIds, result, suggestResearchDigest, suggestResearchQueries, suggestResearchSources, aiJobFitWithoutTicks, useStructuredRenderer]);

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
    setResult(null);
    setPreview("");
    selectSuggestion(null);
    setSuggestError(null);
    void getSuggestions();
  }, [getSuggestions, selectSuggestion, setSuggestError]);

  const ratings = result?.ratings;
  const score   = ratings?.match_score ?? 0;

  const resumeDownloadStem = useMemo(
    () => (result?.folder ? result.folder : buildResumeFileStem(company, role, candidateProfile)),
    [result?.folder, company, role, candidateProfile],
  );

  const downloadResultPdf = useCallback(async () => {
    if (!result?.pdfUrl) return;
    try {
      await fetchPdfAsDownload(result.pdfUrl, resumeDownloadStem);
    } catch {
      window.open(result.pdfUrl, "_blank", "noopener,noreferrer");
    }
  }, [result?.pdfUrl, resumeDownloadStem]);

  const selectedTemplateLabel = useMemo(() => {
    return distinctStyleTemplates().find((t) => t.referenceFolder === styleReferenceFolder)?.label ?? "Template";
  }, [styleReferenceFolder]);

  const customizePaperFont =
    previewFontSize === "small" ? 9.85 : previewFontSize === "large" ? 11.2 : 10.5;
  const customizePaperLH =
    previewSpacing === "compact" ? 1.42 : previewSpacing === "spacious" ? 1.72 : 1.55;
  const customizePaperPadY =
    previewSpacing === "compact" ? 22 : previewSpacing === "spacious" ? 36 : 28;

  /** Full-width suggestions review: hide hero + form so the two-column panel can use the width. */
  const suggestionsReviewMode =
    !studioHandoff &&
    Boolean(suggestions && suggestions.length > 0 && !result);
  const showBuilderInputs = !result && !generating && !suggestionsReviewMode;

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

      {/* ── Main — landmark + busy state for assistive tech (WCAG 4.1.3) */}
      <main
        id="resume-builder-main"
        aria-busy={generating}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}
      >

        {/* Page content */}
        <div
          className="rb-page"
          style={{
            padding: "clamp(20px, 4vw, 44px) clamp(16px, 4vw, 48px) max(72px, 12vh)",
            maxWidth:
              result && studioHandoff
                ? "min(1440px, 98vw)"
                : result
                  ? 1180
                  : suggestionsReviewMode
                    ? 1180
                    : studioHandoff
                      ? 920
                      : 820,
            margin: "0 auto",
            width: "100%",
            boxSizing: "border-box",
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

          {/* ── Hero (pre-generation) ── */}
          {showBuilderInputs && (
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
              ) : (
                <div style={{ marginBottom: 40 }} className="rb-hero">
                  <div className="fade-in rb-hero-title" style={{
                    fontSize: 52, fontWeight: 800, lineHeight: 1.05,
                    letterSpacing: -2, marginBottom: 14, color: "var(--text)",
                  }}>
                    Tailor your résumé to{" "}
                    <span style={{ color: "var(--accent)" }}>any</span>
                    <br />job description.
                  </div>
                  <p className="fade-in stagger-1" style={{
                    fontSize: 15, color: "var(--muted)", lineHeight: 1.65,
                    marginBottom: 28, maxWidth: 560, letterSpacing: -0.1,
                  }}>
                    Upload your résumé, paste the job description, review suggestions (with an optional web-research pass), then generate an ATS-friendly PDF.
                    This path <strong style={{ color: "var(--text)" }}>rebuilds</strong> your content using the <strong style={{ color: "var(--text)" }}>template style</strong> you select under Your résumé — it will not look identical to your uploaded PDF.
                    To start from the <strong style={{ color: "var(--text)" }}>template gallery</strong> instead, open <strong style={{ color: "var(--text)" }}>Résumé Builder → Template gallery</strong> in the sidebar.
                  </p>
                  <div className="fade-in stagger-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[
                      { n: 1, label: "Upload résumé" },
                      { n: 2, label: "Paste job posting" },
                      { n: 3, label: "Review JD suggestions" },
                      { n: 4, label: "Generate PDF" },
                    ].map(({ n, label }) => (
                      <div key={n} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 12px 6px 8px",
                        background: "var(--surface)", border: "1px solid var(--border)",
                        borderRadius: 24, fontSize: 12.5, color: "var(--muted)",
                        letterSpacing: -0.1,
                      }}>
                        <span style={{
                          width: 20, height: 20, borderRadius: "50%",
                          background: "var(--accent)",
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0,
                        }}>{n}</span>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                <div style={{
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
                      border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--accent)",
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

            {uploadError && (
              <div style={{ marginTop: 8, color: "var(--red)", fontSize: 12 }}>{uploadError}</div>
            )}

            {!candidateProfile && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)", letterSpacing: -0.1 }}>
                No resume? We&apos;ll use a default profile to generate a starting point.
              </div>
            )}

            {!studioHandoff && hasMultipleStyleTemplates() && (
              <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", letterSpacing: -0.2, marginBottom: 4 }}>
                  Template style
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                  LaTeX reference for your tailored PDF — pick before you get suggestions or generate.
                </p>
                <ResumeStyleTemplateGrid
                  styleReferenceFolder={styleReferenceFolder}
                  setStyleReferenceFolder={setStyleReferenceFolder}
                />
              </div>
            )}
          </StepCard>

          {/* ── Target job (JD tailor flow only) ── */}
          {!studioHandoff && (
          <StepCard
            step={2}
            title="Target job"
            subtitle="Tell us what you're applying for"
          >
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
          {baseFolder && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              marginBottom: 12, padding: "8px 12px",
              background: "var(--surface2)", borderRadius: 8,
              fontSize: 12, letterSpacing: -0.2,
            }}>
              <span style={{ color: "var(--dim)" }}>Comparing against</span>
              <span style={{ color: "var(--text)", fontWeight: 500, flex: 1 }}>{baseFolder}</span>
              <button
                type="button"
                onClick={() => setBaseFolder(null)}
                aria-label="Clear base résumé comparison"
                style={{
                  background: "none", border: "none", color: "var(--dim)", cursor: "pointer",
                  fontSize: 18, lineHeight: 1, minWidth: 44, minHeight: 44,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  borderRadius: 8, margin: "-8px -6px -8px 0",
                }}
                title="Clear base"
              >×</button>
            </div>
          )}

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
              {suggestError && (
                <div role="alert" style={{ marginBottom: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, color: "var(--red)", fontSize: 12 }}>
                  {suggestError}
                </div>
              )}
              {suggestLoading && (
                <BuilderSuggestAnalysisLoader
                  stepsDone={suggestLoaderStepsDone}
                  tipIdx={suggestLoaderTipIdx}
                  coachStreamText={suggestCoachStreamText}
                />
              )}
              <button
                type="button"
                onClick={getSuggestions}
                disabled={suggestLoading || generating}
                style={{
                  width: "100%", padding: "14px 20px", marginBottom: 8, minHeight: 48,
                  background: suggestLoading ? "var(--surface2)" : "var(--accent)",
                  color: suggestLoading ? "var(--muted)" : "#fff",
                  border: "none", borderRadius: 12,
                  fontSize: 16, fontWeight: 500, fontFamily: "inherit",
                  cursor: suggestLoading || generating ? "not-allowed" : "pointer",
                  letterSpacing: -0.4, transition: "background 0.2s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                onMouseEnter={e => { if (!suggestLoading && !generating) e.currentTarget.style.background = "var(--accent-h)"; }}
                onMouseLeave={e => { if (!suggestLoading && !generating) e.currentTarget.style.background = "var(--accent)"; }}
              >
                {suggestLoading ? (
                  <><Spinner size={16} />Comparing your résumé to this job…</>
                ) : (
                  "Get suggestions for this job →"
                )}
              </button>
              {!suggestLoading && (
                <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginBottom: 24, letterSpacing: -0.1 }}>
                  The first pass runs live web research on the posting, then compares your résumé to the job and lists edits.
                  When you generate the PDF after that, we <strong style={{ color: "var(--text)" }}>reuse</strong> the same research digest — no second live search.
                </p>
              )}
            </>
          )}

          </>)} {/* end !result && !generating inputs block */}

          {/* ── Web research used for suggestions (API runs search before coach JSON) ── */}
          {!studioHandoff && hasSuggestResearch && suggestions && !result && suggestionsReviewMode && (
            <div style={{ marginBottom: 16 }} className="fade-in">
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontWeight: 600, color: "var(--dim)",
                letterSpacing: -0.1, marginBottom: 8, textTransform: "uppercase",
              }}>
                <span>Live web research</span>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 999,
                  background: "rgba(52,211,153,0.12)", color: "var(--green)",
                  letterSpacing: 0, textTransform: "none",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", background: "var(--green)",
                  }} />
                  Used before suggestions
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45, margin: "0 0 10px", letterSpacing: -0.05 }}>
                Public employer and role wording gathered <strong style={{ color: "var(--text)" }}>before</strong> your suggestion cards were built. The coach still only edits facts that appear in your résumé.
              </p>
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "12px 14px",
                maxHeight: 220, overflow: "auto",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {suggestResearchQueries.map((q, i) => (
                  <div key={`srq-${i}`} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    fontSize: 12, color: "var(--text)", lineHeight: 1.45,
                  }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}>🔍</span>
                    <span>
                      <span style={{ color: "var(--dim)" }}>Searching:</span>{" "}
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>&ldquo;{q}&rdquo;</span>
                    </span>
                  </div>
                ))}
                {suggestResearchSources.length > 0 && (
                  <div style={{
                    borderTop: suggestResearchQueries.length ? "1px solid var(--border)" : "none",
                    paddingTop: suggestResearchQueries.length ? 10 : 0,
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>
                      Citing
                    </div>
                    {suggestResearchSources.map((s, i) => {
                      let domain = s.url;
                      try { domain = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* leave */ }
                      return (
                        <a
                          key={`srs-${i}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 8,
                            fontSize: 11, color: "var(--accent)",
                            textDecoration: "none", lineHeight: 1.45,
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
          )}

          {/* ── Suggestions review panel (JD tailor flow only) ── */}
          {!studioHandoff && suggestionsReviewMode && (
            <SuggestionsPanel
              key={sourcePdfBlobUrl ?? "rb-sug-no-pdf"}
              summary={suggestSummary}
              suggestions={suggestions}
              acceptedIds={acceptedIds}
              rejectedIds={rejectedIds}
              candidateProfile={candidateProfile ?? ""}
              pdfBlobUrl={sourcePdfBlobUrl}
              pdfFileName={uploadedFileName}
              pdfDocumentKey={suggestionPdfDocKey}
              selectedSuggestionId={selectedSuggestionId}
              onSelectSuggestionCard={selectSuggestion}
              onToggleAccept={id => acceptedIds.has(id) ? undoAcceptSuggestion(id) : acceptSuggestion(id)}
              onToggleReject={id => rejectedIds.has(id) ? undoRejectSuggestion(id) : rejectSuggestion(id)}
              onAcceptAll={() => suggestions.forEach(s => acceptSuggestion(s.id))}
              onClearAccepts={() => suggestions.forEach(s => undoAcceptSuggestion(s.id))}
              onEditSuggested={patchSuggestionSuggested}
              onGenerate={generate}
              generating={generating}
              generateStatusMsg={statusMsg}
              error={error}
              styleReferenceFolder={styleReferenceFolder}
              setStyleReferenceFolder={setStyleReferenceFolder}
              previewSectionAccentHex={previewAccentHex}
              aiJobFitWithoutTicks={aiJobFitWithoutTicks}
              setAiJobFitWithoutTicks={setAiJobFitWithoutTicks}
              useStructuredRenderer={useStructuredRenderer}
              setUseStructuredRenderer={setUseStructuredRenderer}
              onBackToInputs={clearSuggestionsState}
            />
          )}

          {/* During generation (before results): one primary progress card — status line is technical detail, not the headline */}
          {generating && !result && (
            <div
              className="fade-in"
              role="status"
              aria-live="polite"
              aria-busy="true"
              style={{
                marginBottom: 24,
                padding: "24px 22px",
                borderRadius: 16,
                background: "linear-gradient(180deg, var(--surface) 0%, var(--surface2) 100%)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-card)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                textAlign: "center",
              }}
            >
              <Spinner size={28} />
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: -0.4, lineHeight: 1.25 }}>
                {studioHandoff ? "Applying your template" : "Building your résumé"}
              </div>
              {statusMsg ? (
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--muted)",
                    lineHeight: 1.5,
                    maxWidth: 520,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    wordBreak: "break-word",
                  }}
                >
                  {statusMsg}
                </div>
              ) : null}
              <p style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.55, maxWidth: 500, margin: 0 }}>
                {studioHandoff ? (
                  <>Layout and typography only — no job match or live web research on this path.</>
                ) : reusingSuggestWebForPdf ? (
                  <>Research from <strong>Get suggestions</strong> is already included; the PDF step does not run a second web search.</>
                ) : useStructuredRenderer ? (
                  <>Structured PDF path: compile and scoring run on the server. A live LaTeX preview appears below when the stream starts.</>
                ) : (
                  <>The model may still run a live web search during this step if the server requests it. Otherwise your file finishes from résumé + job text alone.</>
                )}
              </p>
            </div>
          )}

          {/* Legacy PDF path only: placeholder until first search SSE arrives (structured/digest paths skip — see pdfGenExpectsLiveWebSearch). */}
          {generating && !result && !hasWebResearch && pdfGenExpectsLiveWebSearch && (
            <div style={{ marginBottom: 16 }} className="fade-in">
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontWeight: 600, color: "var(--dim)",
                letterSpacing: -0.1, marginBottom: 8, textTransform: "uppercase",
              }}>
                <span>Web research</span>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 999,
                  background: "var(--surface2)", color: "var(--muted)",
                  letterSpacing: 0, textTransform: "none",
                }}>
                  Waiting for search signals…
                </span>
              </div>
              <div style={{
                background: "var(--surface)", border: "1px dashed var(--border)",
                borderRadius: 10, padding: "14px 16px",
                fontSize: 12, color: "var(--dim)", lineHeight: 1.55,
              }}>
                {hasSuggestResearch ? (
                  <>No live searches from <strong>Generate PDF</strong> yet. Your suggestions step may already list queries above.</>
                ) : (
                  <>This panel fills in when the model runs web search during PDF generation.</>
                )}
              </div>
            </div>
          )}

          {/* Live web search during PDF generation (SSE), or the same queries/sources reused from suggestions */}
          {hasWebResearch && !result && !studioHandoff && !reusingSuggestWebForPdf && (
            <div style={{ marginBottom: 16 }} className="fade-in">
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 11, fontWeight: 600, color: "var(--dim)",
                letterSpacing: -0.1, marginBottom: 8, textTransform: "uppercase",
              }}>
                <span>Live web research</span>
                <span style={{
                  fontSize: 9, padding: "2px 7px", borderRadius: 999,
                  background: "rgba(52,211,153,0.12)", color: "var(--green)",
                  letterSpacing: 0, textTransform: "none",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {reusingSuggestWebForPdf ? (
                    <>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%", background: "var(--green)",
                      }} />
                      Reused from suggestions
                    </>
                  ) : (
                    <>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%", background: "var(--green)",
                        animation: generating ? "pulse-bg 1.4s ease-in-out infinite" : undefined,
                      }} />
                      {generating ? "Researching the web" : "Research used"}
                    </>
                  )}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45, margin: "0 0 10px", letterSpacing: -0.05 }}>
                {reusingSuggestWebForPdf ? (
                  <>
                    These queries and sources are the same pass as <strong style={{ color: "var(--text)" }}>Get suggestions</strong>.
                    PDF generation applies that digest again and does <strong>not</strong> run an extra web search.
                  </>
                ) : hasSuggestResearch ? (
                  <>
                    These queries and citations are from the <strong style={{ color: "var(--text)" }}>Generate PDF</strong> step — an additional live pass beyond the research shown above your suggestions.
                  </>
                ) : (
                  <>These queries and citations are from the <strong style={{ color: "var(--text)" }}>Generate PDF</strong> step (streaming), not from the earlier &ldquo;Get suggestions&rdquo; call.</>
                )}
              </p>
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "12px 14px",
                maxHeight: 220, overflow: "auto",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                {/* Live search queries from this run */}
                {searchQueries.map((q, i) => (
                  <div key={`q-${i}`} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    fontSize: 12, color: "var(--text)", lineHeight: 1.45,
                  }}>
                    <span style={{ flexShrink: 0, marginTop: 1 }}>🔍</span>
                    <span>
                      <span style={{ color: "var(--dim)" }}>Searching:</span>{" "}
                      <span style={{ color: "var(--text)", fontWeight: 500 }}>&ldquo;{q}&rdquo;</span>
                    </span>
                  </div>
                ))}

                {/* Pages cited from those queries */}
                {searchSources.length > 0 && (
                  <div style={{
                    borderTop: searchQueries.length ? "1px solid var(--border)" : "none",
                    paddingTop: searchQueries.length ? 10 : 0,
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600 }}>
                      Citing
                    </div>
                    {searchSources.map((s, i) => {
                      let domain = s.url;
                      try { domain = new URL(s.url).hostname.replace(/^www\./, ""); } catch { /* leave as-is */ }
                      return (
                        <a
                          key={`s-${i}`}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 8,
                            fontSize: 11, color: "var(--accent)",
                            textDecoration: "none", lineHeight: 1.45,
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

              <header
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 14,
                  marginBottom: 20,
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                  <h2 id="rb-results-heading" style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.75, color: "var(--text)", marginBottom: 6, lineHeight: 1.15 }}>
                    {generating ? "Almost there — finishing PDF and match score" : "Your tailored résumé is ready"}
                  </h2>
                  <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.5, letterSpacing: -0.15 }}>
                    {[role, company].map((s) => s.trim()).filter(Boolean).join(" · ") || "Match results for this run"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--dim)", margin: "8px 0 0", lineHeight: 1.45 }}>
                    Review match quality and gaps on the left, keep the preview visible while you scroll, then export or share.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={tryAnotherJob}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 16px",
                    minHeight: 44,
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--muted)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    letterSpacing: -0.2,
                    whiteSpace: "nowrap",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--surface2)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--surface)";
                    e.currentTarget.style.color = "var(--muted)";
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                    <path d="M1 6a5 5 0 109.9-1M1 6V2m0 4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Try another job
                </button>
              </header>

              <style>{`
                .rb-results-phase3 {
                  display: grid;
                  grid-template-columns: minmax(0, 1fr) minmax(280px, 400px);
                  gap: 24px;
                  align-items: start;
                }
                .rb-results-phase3-preview {
                  position: sticky;
                  top: 12px;
                  align-self: start;
                }
                @media (max-width: 960px) {
                  .rb-results-phase3 { grid-template-columns: 1fr; }
                  .rb-results-phase3-preview { position: static; }
                }
              `}</style>
              <section className="rb-results-phase3" aria-labelledby="rb-results-heading">
                <div className="rb-results-phase3-detail" style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
              {/* Score hero card */}
              <div className="rb-score-card" style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: "var(--radius-xl)", padding: "28px 28px 24px",
                marginBottom: 16,
                position: "relative", overflow: "hidden",
                boxShadow: "var(--shadow-card)",
              }}>
                {/* Subtle accent glow behind score */}
                <div style={{
                  position: "absolute", top: -40, left: -40, width: 200, height: 200,
                  background: score >= 75 ? "rgba(52,211,153,0.06)" : score >= 55 ? "rgba(251,191,36,0.06)" : "rgba(248,113,113,0.06)",
                  borderRadius: "50%", pointerEvents: "none",
                }} />

                <div className="rb-score-row" style={{ display: "flex", alignItems: "flex-start", gap: 20, position: "relative", flexWrap: "wrap" }}>
                  {ratings ? (
                    <ScoreRing score={score} size={120} />
                  ) : (
                    <div style={{ width: 120, height: 120, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Spinner size={28} />
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 200, paddingTop: 2 }}>
                    {ratings ? (
                      <>
                        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.65, color: scoreColor(score), marginBottom: 4, lineHeight: 1.2 }}>
                          {score >= 80 ? "Strong match" : score >= 65 ? "Good match" : score >= 50 ? "Moderate match" : "Needs work"}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 10 }}>
                          Match score · {score}/100
                        </div>
                        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, letterSpacing: -0.2, margin: "0 0 16px", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                          {ratings.verdict}
                        </p>
                        {generating ? (
                          <div
                            role="status"
                            aria-live="polite"
                            aria-busy="true"
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              marginBottom: 16,
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: "var(--accent-bg)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <Spinner size={18} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", letterSpacing: -0.05 }}>Finishing up</div>
                              <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>
                                {statusMsg || "Saving PDF and uploading…"}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Analysing match…</div>
                        {generating && statusMsg ? (
                          <div style={{
                            fontSize: 11,
                            color: "var(--muted)",
                            lineHeight: 1.5,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            wordBreak: "break-word",
                          }}
                          >
                            {statusMsg}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.45 }}>Scoring how your résumé lines up with the role…</div>
                        )}
                      </div>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                      <button
                        type="button"
                        onClick={improveResumeAfterResult}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          padding: "12px 20px",
                          minHeight: 46,
                          borderRadius: 10,
                          border: "none",
                          background: "var(--accent)",
                          color: "#fff",
                          fontSize: 14,
                          fontWeight: 700,
                          letterSpacing: -0.35,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          boxShadow: "var(--shadow-sm)",
                        }}
                      >
                        Improve this résumé
                        <span aria-hidden style={{ fontSize: 16 }}>→</span>
                      </button>
                      <a
                        href="#rb-results-gaps"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "10px 16px",
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "var(--surface2)",
                          color: "var(--text)",
                          fontSize: 13,
                          fontWeight: 600,
                          textDecoration: "none",
                          fontFamily: "inherit",
                        }}
                      >
                        View gaps
                      </a>
                      <Link
                        href="/?view=builder&flow=template&fromResume=1"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "10px 16px",
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          color: "var(--accent)",
                          fontSize: 13,
                          fontWeight: 600,
                          textDecoration: "none",
                          fontFamily: "inherit",
                        }}
                      >
                        Customize template
                      </Link>
                      {result.pdfUrl ? (
                        <button
                          type="button"
                          onClick={() => { void downloadResultPdf(); }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "10px 16px",
                            minHeight: 44,
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            color: "var(--muted)",
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: "inherit",
                            background: "var(--surface2)",
                            cursor: "pointer",
                          }}
                        >
                          Download PDF
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Strengths + Gaps */}
              {ratings && (ratings.whats_working?.length > 0 || ratings.gaps?.length > 0) && (
                <div id="rb-results-gaps" className="rb-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                  {ratings.whats_working?.length > 0 && (
                    <div style={{
                      background: "var(--surface)", border: "1px solid rgba(52,211,153,0.2)",
                      borderRadius: "var(--radius-xl)", padding: "18px 20px",
                      boxShadow: "var(--shadow-card)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 12 }}>
                        What&apos;s working
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ratings.whats_working.map((w, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.2, alignItems: "flex-start" }}>
                            <span style={{ color: "var(--green)", flexShrink: 0, marginTop: 3 }}>✓</span>
                            <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ratings.gaps?.length > 0 && (
                    <div style={{
                      background: "var(--surface)", border: "1px solid rgba(251,191,36,0.22)",
                      borderRadius: "var(--radius-xl)", padding: "18px 20px",
                      boxShadow: "var(--shadow-card)",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--orange)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 12 }}>
                        Gaps to address
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ratings.gaps.map((g, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.2 }}>
                            <span style={{ color: "var(--orange)", flexShrink: 0, marginTop: 1 }}>→</span>
                            <span>{g}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* JD requirement breakdown (was under Analysis tab) */}
              {ratings && ratings.criteria.length > 0 && (
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
                    Each card is one JD requirement compared to your profile and the latest generated résumé.
                  </p>
                  <MatchBreakdownCards criteria={ratings.criteria} />
                </div>
              )}

              {/* Inline diff — line-by-line edits below analysis */}
              {result.diff.length > 0 && (
                <div
                  id="rb-results-diff"
                  style={{
                    marginBottom: 16,
                    borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    boxShadow: "var(--shadow-card)",
                    padding: "18px 20px 20px",
                    scrollMarginTop: 24,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 8 }}>
                    Changes to your résumé{" "}
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>+{result.adds}</span>
                    <span style={{ color: "var(--dim)" }}> / </span>
                    <span style={{ color: "var(--red)", fontWeight: 600 }}>−{result.removes}</span>
                  </div>
                  <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
                    Your PDF already reflects these line-level edits from the last generate. This list is a{" "}
                    <strong style={{ color: "var(--text)" }}>read-only summary</strong> — not a second approval step. The small{" "}
                    <strong style={{ color: "var(--text)" }}>?</strong> on each card opens &quot;why this change&quot; from the model. To control what
                    goes into the <em>next</em> PDF, use{" "}
                    <strong style={{ color: "var(--text)" }}>Analyze &amp; get suggestions</strong>, tick the edits you want, then{" "}
                    <strong style={{ color: "var(--text)" }}>Improve this résumé</strong> again.
                  </p>
                  <DiffView
                    key={result.folder ?? "diff"}
                    diff={result.diff}
                    adds={result.adds}
                    removes={result.removes}
                    rationales={result.rationales}
                    baseFolder={result.baseFolder}
                    baseLoaded={result.baseLoaded}
                    jdKeywords={jdKeywords}
                  />
                </div>
              )}

              {/* Sources */}
              {result.sources.length > 0 && (
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
                  <SourcesPanel sources={result.sources} embedded />
                </div>
              )}

              {/* Storage failure banner — surfaces silent upload errors so the
                  user knows this resume can't be used as a base for diff/edit
                  later. */}
              {storageFailures.length > 0 && (
                <div style={{
                  marginBottom: 16, padding: "14px 18px",
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.35)",
                  borderRadius: "var(--radius-xl)", fontSize: 12, color: "var(--text)",
                  letterSpacing: -0.1, lineHeight: 1.5,
                  boxShadow: "var(--shadow-card)",
                }}>
                  <div style={{ fontWeight: 600, color: "var(--orange)", marginBottom: 4, fontSize: 11, letterSpacing: 0.3, textTransform: "uppercase" }}>
                    ⚠ Cloud backup incomplete
                  </div>
                  {storageFailures.map((f, i) => (
                    <div key={i} style={{ color: "var(--muted)" }}>
                      <strong style={{ color: "var(--text)" }}>{f.artifact === "tex" ? ".tex source" : "PDF"}</strong> didn&apos;t upload to Supabase: <span style={{ color: "var(--dim)" }}>{f.reason}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 11, color: "var(--dim)" }}>
                    The resume is saved locally and you can still edit it now, but it may
                    not be selectable as a base for future runs. Re-generating usually fixes this.
                  </div>
                </div>
              )}

              {/* ATS panel — auto-runs after generation */}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 12 }}>
                  ATS &amp; job match{user?.id && atsResult ? ` — ${atsResult.score}` : ""}
                </div>
                {!user?.id ? (
                  <ResumeBuilderAtsSignInPrompt oauthBusy={atsOAuthBusy} onSignInWithGoogle={signInForAts} />
                ) : (
                  <>
                {atsLoading && (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
                    Running ATS &amp; job match…
                  </div>
                )}
                {atsError && !atsLoading && (
                  <div style={{ padding: 12, color: "var(--red)", fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
                    Couldn&apos;t run ATS analysis: {atsError}
                    {result.folder && (
                      <button
                        type="button"
                        onClick={() => runAtsCheck(result.folder!)}
                        style={{
                          fontSize: 12, fontWeight: 600, padding: "10px 16px", minHeight: 44,
                          background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
                          color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        Retry
                      </button>
                    )}
                  </div>
                )}
                {atsResult && !atsLoading && (
                  <AtsPanel result={atsResult} rechecking={atsLoading} onRecheck={() => result.folder && runAtsCheck(result.folder)} />
                )}
                  </>
                )}
              </div>

              {/* Start over nudge */}
              <div
                style={{
                  marginTop: 28,
                  padding: "16px 20px",
                  borderRadius: "var(--radius-xl)",
                  border: "1px solid var(--border)",
                  background: "var(--surface2)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontSize: 13, color: "var(--muted)", letterSpacing: -0.15, lineHeight: 1.45 }}>
                  Want to tailor another posting? Clear the form and keep your layout template.
                </span>
                <button
                  type="button"
                  onClick={tryAnotherJob}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    padding: "12px 18px",
                    minHeight: 44,
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  Start over
                </button>
              </div>
                </div>

                <aside
                  className="rb-results-phase3-preview"
                  aria-label="Résumé preview and export"
                  style={{
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-xl)",
                      padding: "16px 16px 14px",
                      boxShadow: "var(--shadow-card)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--dim)",
                        letterSpacing: 0.35,
                        textTransform: "uppercase",
                        marginBottom: 6,
                      }}
                    >
                      Résumé preview
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--dim)",
                        marginBottom: 12,
                        letterSpacing: -0.1,
                      }}
                    >
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{resumeDownloadStem}.pdf</span>
                      {" · "}Template:{" "}
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{selectedTemplateLabel}</span>
                    </div>
                    {result.pdfUrl ? (
                      <div
                        className="rb-pdf-preview-frame"
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "1px solid var(--border)",
                          background: "var(--surface2)",
                          boxShadow: "var(--shadow-sm)",
                          height: "min(78vh, 880px)",
                          maxHeight: "min(78vh, 880px)",
                        }}
                      >
                        <iframe
                          title="Résumé PDF preview"
                          src={
                            result.pdfUrl.includes("#")
                              ? result.pdfUrl
                              : `${result.pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`
                          }
                          loading="lazy"
                          style={{
                            width: "100%",
                            height: "100%",
                            border: "none",
                            display: "block",
                            background: "#fff",
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: 28,
                          textAlign: "center",
                          color: "var(--dim)",
                          fontSize: 13,
                          borderRadius: 12,
                          border: "1px dashed var(--border)",
                          background: "var(--surface2)",
                        }}
                      >
                        PDF preview appears when the compile step finishes.
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-xl)",
                      padding: "14px 16px 16px",
                      boxShadow: "var(--shadow-card)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 2,
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 13 13" fill="none" aria-hidden style={{ flexShrink: 0, color: "var(--accent)" }}>
                        <circle cx="3" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
                        <circle cx="10" cy="3" r="1.7" stroke="currentColor" strokeWidth="1.4" />
                        <circle cx="10" cy="10" r="1.7" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M4.5 5.6 L8.5 3.7  M4.5 7.4 L8.5 9.3" stroke="currentColor" strokeWidth="1.4" />
                      </svg>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--dim)",
                          letterSpacing: 0.35,
                          textTransform: "uppercase",
                        }}
                      >
                        Actions
                      </span>
                    </div>
                    <Link
                      href="/?view=builder&flow=template&fromResume=1"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "11px 14px",
                        minHeight: 44,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface2)",
                        color: "var(--accent)",
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: "none",
                        fontFamily: "inherit",
                        textAlign: "center",
                      }}
                    >
                      Customize template
                    </Link>
                    {result.pdfUrl ? (
                      <button
                        type="button"
                        onClick={() => { void downloadResultPdf(); }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 8,
                          padding: "11px 14px",
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "var(--surface2)",
                          color: "var(--text)",
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        Download PDF
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={libraryReSaveBusy || !user?.id || !result.folder}
                      onClick={async () => {
                        if (!user?.id) {
                          setError("Sign in to save this résumé to your library.");
                          return;
                        }
                        setLibraryReSaveBusy(true);
                        setError(null);
                        setLibraryToast(null);
                        try {
                          await syncLibraryRowForShare();
                          setLibraryToast("Saved to your account.");
                          window.setTimeout(() => setLibraryToast(null), 6000);
                        } catch (e: unknown) {
                          setError(toUserFriendlyErrorMessage(e instanceof Error ? e.message : String(e)));
                        } finally {
                          setLibraryReSaveBusy(false);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        padding: "11px 14px",
                        minHeight: 44,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface2)",
                        color: "var(--text)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: libraryReSaveBusy || !user?.id || !result.folder ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        opacity: !user?.id || !result.folder ? 0.55 : 1,
                      }}
                    >
                      {libraryReSaveBusy ? "Saving…" : "Save to library"}
                    </button>
                    {libraryToast ? (
                      <p style={{ margin: 0, fontSize: 12, color: "var(--green)", lineHeight: 1.45 }}>
                        {libraryToast}{" "}
                        <Link href="/?view=library" style={{ color: "var(--accent)", fontWeight: 600 }}>
                          Open Library →
                        </Link>
                      </p>
                    ) : null}
                  </div>

                  {result.folder && result.pdfUrl && !generating ? (
                    <ResumePublicLinkSettings
                      folder={result.folder}
                      userId={user?.id ?? null}
                      templateFlow={studioHandoff}
                      collapseAsDetails
                      ensureLibraryRow={syncLibraryRowForShare}
                    />
                  ) : null}
                </aside>
              </section>
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

/** Template-studio handoff — post-compile screen aligned with Resunova “Customize preview” (Figma). */
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
  runAtsCheck: (folder: string) => void;
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
        <Link href="/?view=builder&flow=template" style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>
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
                router.push("/?view=builder&flow=template");
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
                onClick={() => router.push("/?view=builder&flow=template")}
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
}: {
  text: string;
  highlightOriginals: string[];
  /** When set, paper mirrors Analyze: clickable rows, accepted text replaces line, accent ring on linked card. */
  interactiveSuggestions?: BuilderPaperInteractive;
  /** LaTeX `reference_folder` — selects sans vs serif and name treatment to approximate the gallery template. */
  templateFolder?: string | null;
  /** Optional typography for template “Customize preview” (does not affect exported PDF). */
  baseFontPx?: number;
  lineHeight?: number;
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
          let hlStyle: React.CSSProperties = {};
          if (acceptedSug) hlStyle = green;
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

function SuggestionsPanel({
  summary, suggestions, acceptedIds, rejectedIds, candidateProfile,
  pdfBlobUrl, pdfFileName, pdfDocumentKey,
  selectedSuggestionId, onSelectSuggestionCard,
  onToggleAccept, onToggleReject, onAcceptAll, onClearAccepts, onEditSuggested, onGenerate, generating, generateStatusMsg, error, onBackToInputs,
  styleReferenceFolder, setStyleReferenceFolder,
  previewSectionAccentHex, aiJobFitWithoutTicks, setAiJobFitWithoutTicks,
  useStructuredRenderer, setUseStructuredRenderer,
}: {
  summary: string;
  suggestions: Suggestion[];
  acceptedIds: Set<string>;
  rejectedIds: Set<string>;
  candidateProfile: string;
  /** When set, user can switch to true PDF highlights (same file as upload). */
  pdfBlobUrl: string | null;
  pdfFileName: string | null;
  /** Remount PDF text layer when accept/reject sets change so tints stay correct. */
  pdfDocumentKey: string;
  selectedSuggestionId: string | null;
  onSelectSuggestionCard: (id: string | null) => void;
  onToggleAccept: (id: string) => void;
  onToggleReject: (id: string) => void;
  onAcceptAll: () => void;
  onClearAccepts: () => void;
  onEditSuggested: (id: string, suggested: string) => void;
  onGenerate: () => void | Promise<unknown>;
  generating: boolean;
  generateStatusMsg?: string;
  error: string | null;
  onBackToInputs: () => void;
  styleReferenceFolder: string;
  setStyleReferenceFolder: (folder: string) => void;
  previewSectionAccentHex: string;
  aiJobFitWithoutTicks: boolean;
  setAiJobFitWithoutTicks: (v: boolean) => void;
  useStructuredRenderer: boolean;
  setUseStructuredRenderer: (v: boolean) => void;
}) {
  /** Prefer styled HTML preview: it follows `styleReferenceFolder` and dedupes repeated headers. Raw PDF is the upload as printed (often different fonts / duplicate header blocks). */
  const [resumePreviewTab, setResumePreviewTab] = useState<"pdf" | "text">(() => {
    if (!pdfBlobUrl) return "text";
    return (candidateProfile ?? "").trim().length > 0 ? "text" : "pdf";
  });

  const accepted = suggestions.filter(s => acceptedIds.has(s.id));
  const highlightOriginals = suggestions.map(s => s.original);
  const panelScrollMax = "min(720px, calc(100vh - 220px))";
  const textPreviewScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!selectedSuggestionId) return;
    const esc =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(selectedSuggestionId)
        : selectedSuggestionId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    try {
      const lineEl = textPreviewScrollRef.current?.querySelector(`[data-rb-sug-line="${esc}"]`);
      lineEl?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    } catch {
      /* ignore invalid selector */
    }
    document.getElementById(`rb-sug-${selectedSuggestionId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedSuggestionId, resumePreviewTab]);

  return (
    <div className="fade-in" style={{ marginBottom: 32 }}>
      <style>{`
        .rb-suggestions-grid {
          display: grid;
          grid-template-columns: minmax(300px, 1fr) minmax(280px, 1.08fr);
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .rb-suggestions-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", letterSpacing: -0.1 }}>
          Tick edits to send them as structured instructions — or compile your saved LaTeX without changing the body (default below).
        </span>
        <button
          type="button"
          onClick={onBackToInputs}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--accent)",
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
            padding: "8px 4px",
            minHeight: 44,
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          ← Edit inputs
        </button>
      </div>
      {/* Summary banner */}
      {summary && (
        <div style={{
          marginBottom: 16, padding: "12px 16px",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg, 12px)", fontSize: 13, color: "var(--muted)", lineHeight: 1.55,
          borderLeft: "3px solid var(--accent)",
          boxShadow: "var(--shadow-card)",
        }}>
          <strong style={{ color: "var(--text)" }}>Key gap: </strong>{summary}
        </div>
      )}

      {/* Two-panel layout: suggestions left, résumé preview right */}
      <div className="rb-suggestions-grid">

        {/* Left: suggestion cards */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
            {suggestions.length} suggested improvements
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: panelScrollMax, overflowY: "auto" }}>
            {suggestions.map(s => {
              const isAccepted = acceptedIds.has(s.id);
              const isRejected = rejectedIds.has(s.id);
              const isLinked = selectedSuggestionId === s.id;
              const stripe = PRIORITY_STRIPE[s.priority] ?? PRIORITY_STRIPE.medium;
              return (
                <div
                  key={s.id}
                  id={`rb-sug-${s.id}`}
                  onClick={() => onSelectSuggestionCard(s.id)}
                  style={{
                  borderRadius: "var(--radius-lg, 12px)",
                  border: `1.5px solid ${isLinked ? "var(--accent)" : isAccepted ? "rgba(52,211,153,0.45)" : isRejected ? "var(--border)" : "var(--border)"}`,
                  background: isAccepted ? "rgba(52,211,153,0.06)" : isRejected ? "var(--surface2)" : "var(--surface)",
                  padding: "12px 14px",
                  opacity: isRejected ? 0.55 : 1,
                  transition: "border-color 0.18s ease, background 0.18s ease, opacity 0.18s ease, box-shadow 0.18s ease",
                  boxShadow: isLinked ? "inset 0 0 0 2px rgba(47,129,247,0.2), var(--shadow-card)" : "var(--shadow-card)",
                  cursor: "pointer",
                }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      title={`${priorityLabel(s.priority)} severity — same tint on the matching line in the preview`}
                      aria-hidden
                      style={{
                        width: 5,
                        minHeight: 26,
                        borderRadius: 3,
                        background: stripe.border,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: 0.06, textTransform: "uppercase",
                      padding: "3px 9px", borderRadius: "var(--radius-pill, 99px)",
                      color: PRIORITY_COLOR[s.priority] ?? "var(--muted)",
                      background: PRIORITY_BG[s.priority] ?? "transparent",
                    }}>{priorityLabel(s.priority)}</span>
                    <span style={{ fontSize: 10.5, color: "var(--dim)", letterSpacing: -0.1 }}>{s.section}</span>
                  </div>

                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, lineHeight: 1.5, fontStyle: "italic", textDecoration: isAccepted ? "line-through" : "none", opacity: isAccepted ? 0.6 : 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {s.original}
                  </div>
                  <div
                    style={{ marginBottom: 8 }}
                    onClick={e => { e.stopPropagation(); }}
                    onKeyDown={e => { e.stopPropagation(); }}
                    role="presentation"
                  >
                    <label
                      htmlFor={`rb-sug-edit-${s.id}`}
                      style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)", display: "block", marginBottom: 4, letterSpacing: 0.02 }}
                    >
                      Suggested text (editable)
                    </label>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span style={{ color: "var(--green)", fontSize: 11, flexShrink: 0, marginTop: 8 }} aria-hidden>→</span>
                      <textarea
                        id={`rb-sug-edit-${s.id}`}
                        value={s.suggested}
                        onChange={e => { onEditSuggested(s.id, e.target.value); }}
                        onClick={e => { e.stopPropagation(); }}
                        rows={4}
                        style={{
                          flex: 1,
                          minHeight: 88,
                          resize: "vertical",
                          fontSize: 12,
                          lineHeight: 1.45,
                          fontFamily: "inherit",
                          color: "var(--text)",
                          fontWeight: isAccepted ? 500 : 400,
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          background: "var(--bg)",
                          boxSizing: "border-box",
                          width: "100%",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.45, marginBottom: 10, paddingLeft: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {s.reason}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onToggleAccept(s.id); }}
                      style={{
                        flex: 1, padding: "12px 14px", minHeight: 44, fontSize: 12, fontWeight: 600,
                        borderRadius: "var(--radius, 8px)", border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: isAccepted ? "var(--green-bg)" : "var(--surface2)",
                        color: isAccepted ? "var(--green)" : "var(--muted)",
                        transition: "background 0.12s ease, color 0.12s ease",
                      }}
                    >
                      {isAccepted ? "Accepted" : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); onToggleReject(s.id); }}
                      style={{
                        flex: 1, padding: "12px 14px", minHeight: 44, fontSize: 12, fontWeight: 600,
                        borderRadius: "var(--radius, 8px)", border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: isRejected ? "var(--red-bg)" : "var(--surface2)",
                        color: isRejected ? "var(--red)" : "var(--muted)",
                        transition: "background 0.12s ease, color 0.12s ease",
                      }}
                    >
                      {isRejected ? "Skipped" : "Skip"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: scanned PDF or extracted-text résumé */}
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase" }}>
              Your résumé
            </div>
            {pdfBlobUrl ? (
              <div style={{ display: "flex", gap: 4, background: "var(--surface2)", padding: 3, borderRadius: 10, border: "1px solid var(--border)" }}>
                <button
                  type="button"
                  onClick={() => setResumePreviewTab("text")}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: resumePreviewTab === "text" ? "var(--surface)" : "transparent",
                    color: resumePreviewTab === "text" ? "var(--text)" : "var(--muted)",
                    boxShadow: resumePreviewTab === "text" ? "var(--shadow-sm)" : "none",
                  }}
                  title="Uses your extracted text with the template selected below (same idea as the generated PDF)."
                >
                  Styled preview
                </button>
                <button
                  type="button"
                  onClick={() => setResumePreviewTab("pdf")}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: resumePreviewTab === "pdf" ? "var(--surface)" : "transparent",
                    color: resumePreviewTab === "pdf" ? "var(--text)" : "var(--muted)",
                    boxShadow: resumePreviewTab === "pdf" ? "var(--shadow-sm)" : "none",
                  }}
                  title="Your uploaded PDF as printed — layout and fonts match the file, not the LaTeX template."
                >
                  Original PDF
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 10, color: "var(--dim)" }}>Styled preview — upload a PDF to add an original-file tab</span>
            )}
          </div>
          {pdfBlobUrl && resumePreviewTab === "pdf" ? (
            <div
              style={{
                overflow: "hidden",
                maxHeight: panelScrollMax,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  lineHeight: 1.45,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface2)",
                }}
              >
                This is your <strong style={{ color: "var(--text)" }}>uploaded file</strong> as it was authored (fonts, spacing, duplicate headers). For the same visual language as your selected template and generate step, use{" "}
                <strong style={{ color: "var(--text)" }}>Styled preview</strong>.
              </div>
              <BuilderPdfSuggestionHighlights
                key={pdfDocumentKey}
                pdfBlobUrl={pdfBlobUrl}
                filename={pdfFileName ?? "resume.pdf"}
                suggestions={suggestions.map(s => ({ id: s.id, original: s.original, priority: s.priority }))}
                acceptedIds={acceptedIds}
                rejectedIds={rejectedIds}
                selectedSuggestionId={selectedSuggestionId}
                onSelectSuggestion={id => onSelectSuggestionCard(id)}
              />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6, lineHeight: 1.45 }}>
                Same layout family as Generate (Style tab). Line tints follow severity (red = high, amber = medium, gray = low) — click a line to focus the matching suggestion.
              </div>
              <div ref={textPreviewScrollRef} style={{ overflowY: "auto", maxHeight: panelScrollMax }}>
                <ResumePaperView
                  text={candidateProfile}
                  highlightOriginals={highlightOriginals}
                  interactiveSuggestions={{
                    suggestions,
                    acceptedIds,
                    rejectedIds,
                    selectedSuggestionId,
                    onLineSelectSuggestion: id => onSelectSuggestionCard(id),
                  }}
                  templateFolder={styleReferenceFolder}
                  sectionAccentColor={previewSectionAccentHex}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {hasMultipleStyleTemplates() && (
      <div
        style={{
          marginTop: 20,
          padding: "14px 16px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
          Template style (before generate)
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
          Your selection is sent to the server as the LaTeX reference for this run. You can change it here without going back to the form.
        </p>
        <div style={{ maxHeight: "min(320px, 40vh)", overflowY: "auto" }}>
          <ResumeStyleTemplateGrid
            styleReferenceFolder={styleReferenceFolder}
            setStyleReferenceFolder={setStyleReferenceFolder}
          />
        </div>
      </div>
      )}

      {/* Generate CTA */}
      {error && (
        <div role="alert" style={{ marginTop: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <button
            type="button"
            onClick={onAcceptAll}
            disabled={generating}
            style={{
              padding: "8px 14px", minHeight: 40, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)",
              color: "var(--text)", cursor: generating ? "not-allowed" : "pointer",
            }}
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={onClearAccepts}
            disabled={generating || acceptedIds.size === 0}
            style={{
              padding: "8px 14px", minHeight: 40, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)",
              color: acceptedIds.size === 0 ? "var(--dim)" : "var(--muted)",
              cursor: generating || acceptedIds.size === 0 ? "not-allowed" : "pointer",
            }}
          >
            Clear accepts
          </button>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.45,
            cursor: generating || accepted.length > 0 ? "default" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={aiJobFitWithoutTicks}
            onChange={e => { setAiJobFitWithoutTicks(e.target.checked); }}
            disabled={generating || accepted.length > 0}
            style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, flexShrink: 0, marginTop: 2 }}
          />
          <span>
            <strong style={{ color: "var(--text)", fontWeight: 600 }}>Allow AI job-fit pass</strong> without ticking cards (the model may reword bullets for the JD).
            {accepted.length > 0
              ? " Disabled while you have ticked edits — those always run through the model."
              : " Leave off to compile the LaTeX body from your base library file as-is."}
          </span>
        </label>
        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.45,
            cursor: generating ? "default" : "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={useStructuredRenderer}
            onChange={e => { setUseStructuredRenderer(e.target.checked); }}
            disabled={generating}
            style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, flexShrink: 0, marginTop: 2 }}
          />
          <span>
            <strong style={{ color: "var(--text)", fontWeight: 600 }}>Use structured renderer (beta)</strong>.
            Deterministic backend LaTeX path (Jinja scaffold) for cleaner, stable formatting.
          </span>
        </label>
        <button
          type="button"
          onClick={() => { void onGenerate(); }}
          disabled={generating}
          aria-busy={generating}
          style={{
            width: "100%", padding: "14px 20px", minHeight: 48,
            background: generating ? "var(--accent)" : "var(--accent)",
            color: "#fff",
            border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 600, fontFamily: "inherit",
            cursor: generating ? "wait" : "pointer",
            letterSpacing: -0.3, transition: "background 0.2s, opacity 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            opacity: generating ? 0.92 : 1,
            boxShadow: generating ? "0 0 0 3px rgba(47,129,247,0.25)" : "none",
          }}
          onMouseEnter={e => { if (!generating) e.currentTarget.style.background = "var(--accent-h)"; }}
          onMouseLeave={e => { if (!generating) e.currentTarget.style.background = "var(--accent)"; }}
        >
          {generating ? (
            <><Spinner size={16} />Generating your résumé PDF…</>
          ) : (
            accepted.length > 0
              ? `Apply ${accepted.length} accepted edit${accepted.length > 1 ? "s" : ""} & generate PDF →`
              : aiJobFitWithoutTicks
                ? "Generate PDF (AI may adjust wording for this job) →"
                : "Compile PDF from your base LaTeX (no AI body rewrite) →"
          )}
        </button>
        {generating && (
          <div
            role="status"
            aria-live="polite"
            className="fade-in"
            style={{
              padding: "12px 14px",
              borderRadius: 10,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--muted)",
              lineHeight: 1.5,
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            <Spinner size={14} />
            <span>
              <strong style={{ color: "var(--text)", fontWeight: 600 }}>Building your tailored PDF.</strong>
              {generateStatusMsg ? (
                <> <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 11 }}>{generateStatusMsg}</span></>
              ) : (
                <> This usually takes a minute — keep this tab open.</>
              )}
            </span>
          </div>
        )}
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>
        {accepted.length} of {suggestions.length} accepted — ticked edits are sent to the server as structured instructions.
        {accepted.length === 0 ? (
          <>
            {" "}
            With none ticked and AI job-fit off, the server skips rewriting and runs pdflatex on your base document body. Use{" "}
            <strong style={{ color: "var(--text)" }}>Accept all</strong> or the checkbox above when you want the model involved.
          </>
        ) : null}{" "}
        <strong style={{ color: "var(--text)" }}>Empty suggested text</strong> counts as a <strong style={{ color: "var(--text)" }}>delete</strong> (that bullet is omitted from the PDF).
      </p>
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
          Hang tight — we&apos;re reading both sides before listing improvements.
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
