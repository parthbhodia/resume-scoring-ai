"use client";
import { useState, useCallback, useRef, useEffect, useLayoutEffect, useId, useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source, ChangeRationale, ParsedSection } from "@/lib/types";
import { apiUrl, parseJsonOrThrow, scoreColor } from "@/lib/utils";
import { upsertResume, getSupabaseClient, upsertUserProfile } from "@/lib/supabase";
import { TAILOR_PREFILL_JD, TAILOR_PREFILL_COMPANY, TAILOR_PREFILL_ROLE } from "@/lib/tailorPrefill";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_REFERENCE_FOLDER,
  distinctStyleTemplates,
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
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { nameAndSubtitleLineIndices, isPlaceholderResumeHeaderLine } from "@/lib/resumePreviewNameLine";

import ScoreRing    from "./ScoreRing";
import MatchBreakdownCards from "./MatchBreakdownCards";
import DiffView     from "./DiffView";
import SourcesPanel from "./SourcesPanel";
import AtsPanel, { type AtsResult } from "./AtsPanel";
import ShareButton   from "./ShareButton";
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
  const model = "gemini-2.5-flash";
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
  const [storageFailures, setStorageFailures] = useState<{ artifact: "pdf" | "tex"; reason: string }[]>([]);
  /** Right-panel “Save to library” re-upsert (compile already upserts; this is explicit retry). */
  const [libraryReSaveBusy, setLibraryReSaveBusy] = useState(false);
  const [libraryToast, setLibraryToast] = useState<string | null>(null);
  /** Toast for template customize flow (Save / Download with fresh compile). */
  const [customizeExportToast, setCustomizeExportToast] = useState<string | null>(null);
  const hasWebResearch = searchQueries.length > 0 || searchSources.length > 0;
  /** After Template gallery / content picker / manual form — compile PDF from layout + extract only (no JD UI). */
  const [studioHandoff, setStudioHandoff] = useState(() => builderSession0?.studioHandoff ?? false);

  // ── Suggestions state ──────────────────────────────────────────────────────
  const [suggestions,    setSuggestions]    = useState<Suggestion[] | null>(() => builderSession0?.suggestions ?? null);
  const [suggestSummary, setSuggestSummary] = useState(() => builderSession0?.suggestSummary ?? "");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError,   setSuggestError]   = useState<string | null>(null);
  /** Phased checklist while suggestions API runs: 0 → 1 → 2 (timed), then hidden when done. */
  const [suggestLoaderStepsDone, setSuggestLoaderStepsDone] = useState(0);
  const [suggestLoaderTipIdx, setSuggestLoaderTipIdx] = useState(0);
  const [acceptedIds,    setAcceptedIds]    = useState<Set<string>>(
    () => new Set(builderSession0?.acceptedSuggestionIds ?? []),
  );
  const [rejectedIds,    setRejectedIds]    = useState<Set<string>>(
    () => new Set(builderSession0?.rejectedSuggestionIds ?? []),
  );
  /** Linked selection: click a highlighted résumé line → scroll/highlight matching suggestion card (Analyze-style). */
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);

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
  const [uploadingPdf,        setUploadingPdf]        = useState(false);
  const [uploadError,         setUploadError]         = useState<string | null>(null);
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
  ]);

  useEffect(() => {
    setProfileAutofillUpload(getProfileAutofillFromUpload());
  }, []);

  useEffect(() => {
    if (!suggestLoading) {
      setSuggestLoaderStepsDone(0);
      setSuggestLoaderTipIdx(0);
      return;
    }
    const t0 = Date.now();
    const phaseTicker = setInterval(() => {
      const elapsed = Date.now() - t0;
      setSuggestLoaderStepsDone(prev => {
        if (elapsed >= 2800) return Math.max(prev, 2);
        if (elapsed >= 1400) return Math.max(prev, 1);
        return prev;
      });
    }, 100);
    const tipTicker = setInterval(() => {
      setSuggestLoaderTipIdx(i => (i + 1) % SUGGEST_LOADER_TIPS.length);
    }, 2600);
    return () => {
      clearInterval(phaseTicker);
      clearInterval(tipTicker);
    };
  }, [suggestLoading]);

  // Prefill from Analyze (`fromAnalyze=1`) or Template Studio (`fromTemplateStudio=1`).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(searchParams.toString());
    const intentJob = sp.get("intent") === "job";
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

    const fromAnalyze = sp.get("fromAnalyze") === "1";
    const fromTemplateStudio = sp.get("fromTemplateStudio") === "1";
    const flow = (sp.get("flow") || "tailor").toLowerCase();
    let layoutOnly = false;
    try {
      layoutOnly = sessionStorage.getItem(RN_BUILDER_LAYOUT_ONLY_KEY) === "1";
    } catch { /* ignore */ }

    try {
      const profile = sessionStorage.getItem("rn_builder_profile_prefill");
      const jdPre = sessionStorage.getItem(TAILOR_PREFILL_JD);
      const companyPre = sessionStorage.getItem(TAILOR_PREFILL_COMPANY);
      const rolePre = sessionStorage.getItem(TAILOR_PREFILL_ROLE);
      if ((fromAnalyze || fromTemplateStudio) && profile) {
        setCandidateProfile(profile);
        setUploadedFileName(fromTemplateStudio ? "From template studio" : "From Analyze");
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
      try {
        sessionStorage.setItem(RN_BUILDER_LAYOUT_ONLY_KEY, "1");
      } catch { /* ignore */ }
      sp.delete("fromTemplateStudio");
      const qs = sp.toString();
      router.replace(qs ? `/?${qs}` : "/?view=builder&flow=tailor");
    }

    // If we land on the tailor flow (from Analyze or plain navigation),
    // do not keep a stale "template studio" UI mode from a previous run.
    if (!fromTemplateStudio && flow === "tailor") {
      if (!layoutOnly) {
        setStudioHandoff(false);
      }
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
      if (!resp.ok) throw new Error(json.error ?? "Couldn't extract JD from that URL.");
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
      if (!resp.ok) throw new Error(json.error ?? "ATS check failed.");
      setAtsResult(json);
    } catch (e: unknown) {
      setAtsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAtsLoading(false);
    }
  }, [jd, user, role]);

  // Drop ATS when signed out (API requires a real user id).
  useEffect(() => {
    if (!authReady) return;
    if (!user?.id) {
      setAtsResult(null);
      setAtsError(null);
    }
  }, [authReady, user?.id]);

  // Auto-run ATS after generation completes (signed-in users only). Skip for template/layout handoff.
  useEffect(() => {
    if (studioHandoff) return;
    if (!authReady || !user?.id || !result?.folder || atsLoading || atsResult || atsError) return;
    void runAtsCheck(result.folder);
  }, [authReady, user?.id, result?.folder, atsLoading, atsResult, atsError, runAtsCheck]);

  // Reset ATS when a new generation starts
  useEffect(() => {
    setAtsResult(null);
    setAtsError(null);
  }, [result?.folder]);

  const getSuggestions = useCallback(async () => {
    let effJd = jd.trim();
    if (!effJd && studioHandoff) {
      effJd = (candidateProfile ?? "").trim()
        ? "No specific job — optimize structure and measurable impact for a general application."
        : "No specific job posting yet.";
    }
    if (!effJd) { setSuggestError("Please paste a job description first."); return; }
    if (!candidateProfile) { setSuggestError("Please upload your resume first."); return; }

    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestions(null);
    setAcceptedIds(new Set());
    setRejectedIds(new Set());

    try {
      const resp = await fetch(apiUrl("/api/suggest-changes"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_profile: candidateProfile, job_description: effJd }),
      });
      const json = await parseJsonOrThrow<{ error?: string; summary?: string; suggestions?: Suggestion[] }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "Could not get suggestions.");
      setSuggestions(json.suggestions ?? []);
      setSuggestSummary(json.summary ?? "");
      // User explicitly accepts suggestions before generate — nothing pre-selected.
    } catch (e: unknown) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggestLoading(false);
    }
  }, [jd, candidateProfile, studioHandoff]);

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
    if (!file.type.includes("pdf")) { setUploadError("Please upload a PDF file."); return; }
    setUploadingPdf(true);
    setUploadError(null);
    setProfileSyncUpsell(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: formData });
      const json = await parseJsonOrThrow<{ error?: string; text?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "Upload failed");
      const text = json.text ?? "";
      setCandidateProfile(text);
      setUploadedFileName(file.name);
      lastResumeExtractRef.current = text;

      if (sourcePdfBlobUrlRef.current) {
        URL.revokeObjectURL(sourcePdfBlobUrlRef.current);
        sourcePdfBlobUrlRef.current = null;
      }
      const blobUrl = URL.createObjectURL(file);
      sourcePdfBlobUrlRef.current = blobUrl;
      setSourcePdfBlobUrl(blobUrl);

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
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingPdf(false);
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
          reference_folder: studioHandoff ? styleReferenceFolder : DEFAULT_REFERENCE_FOLDER,
          candidate_profile: candidateProfile ?? "",
          accepted_suggestions: acceptedList.length > 0 ? acceptedList : undefined,
          user_id: user?.id ?? null,
          layout_compile: studioHandoff,
        }),
      });

      if (!resp.ok) throw new Error(`Backend error: ${resp.status}`);
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
                    acc.folder, effCompany, effRole, model, acc.texPath ?? "", acc.pdfUrl, acc.ratings, effJd,
                  );
                } catch (e: unknown) {
                  console.error("upsertResume (library row)", e);
                  const msg = e instanceof Error ? e.message : String(e);
                  setError(`Résumé generated, but saving to your library failed: ${msg}`);
                }
                setBaseFolder(acc.folder);
              }
              setResult({ ...acc });
              setGenerating(false);
              setStatusMsg("");
              break;
            case "error": throw new Error(ev.msg);
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
      setError(e instanceof Error ? e.message : String(e));
      setGenerating(false);
      setStatusMsg("");
      return null;
    }
  }, [company, role, jd, jobUrl, importFromUrl, baseFolder, candidateProfile, user, styleReferenceFolder, studioHandoff, suggestions, acceptedIds, result]);

  /** Template customize: run full compile, then optional blob download + toast. */
  const finalizeLayoutPdf = useCallback(
    async (mode: "save" | "download") => {
      if (generating) return;
      const out = await generate();
      if (!out?.pdfUrl) {
        setCustomizeExportToast(null);
        return;
      }
      const base = (out.folder ?? "resume").replace(/[^\w.-]+/g, "_").slice(0, 80) || "resume";
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
    [generating, generate],
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
    setSelectedSuggestionId(null);
    setSuggestError(null);
    void getSuggestions();
  }, [getSuggestions]);

  const ratings = result?.ratings;
  const score   = ratings?.match_score ?? 0;

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
    Boolean(suggestions && suggestions.length > 0 && !generating && !result);
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
            studioHandoff ? (
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
                  marginBottom: 28, maxWidth: 520, letterSpacing: -0.1,
                }}>
                  Upload your résumé, paste the job description, review JD-aligned suggestions, then generate a tailored LaTeX résumé and ATS-safe PDF. Layout uses our default professional template — change layout only from{" "}
                  <strong style={{ color: "var(--text)" }}>Résumé Builder → Template &amp; PDF</strong>{" "}
                  (template studio).
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
            )
          )}

          {/* ── Inputs (hidden once results are shown, or while reviewing suggestions) ── */}
          {showBuilderInputs && (<>

          {studioHandoff && (
          <>
          {/* ── Template studio: output layout (LaTeX on server) ── */}
          <StepCard
            step={1}
            title="Output layout"
            subtitle="Sections, typography, and spacing for your PDF (pdflatex). Layout only — not job-description tailoring."
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {distinctStyleTemplates().map((t) => {
                  const selected = styleReferenceFolder === t.referenceFolder;
                  const isAts = true; // all current templates are ATS-safe
                  const isModern = t.id === "harshibar-ats";
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
                      {/* Mini resume thumbnail */}
                      <div style={{
                        background: "#f8fafc",
                        borderBottom: "1px solid var(--border)",
                        padding: "8px 8px 0",
                      }}>
                        <div style={{
                          background: "#fff",
                          borderRadius: "2px 2px 0 0",
                          boxShadow: "0 1px 4px rgba(15,23,42,0.10)",
                          overflow: "hidden",
                          aspectRatio: "8.5 / 11",
                        }}>
                          {isModern ? (
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
                          ) : (
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
                          )}
                        </div>
                      </div>
                      {/* Card footer */}
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
                          }}>
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
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                More layouts: register a folder in{" "}
                <code style={{ fontSize: 10 }}>web/lib/resumeTemplates.ts</code>.
              </div>
            </div>
          </StepCard>
          </>
          )}

          {/* ── Your résumé (tailor + template studio) ── */}
          <StepCard step={studioHandoff ? 2 : 1} title="Your resume" subtitle="Upload your current resume as a PDF">
            <input
              ref={fileInputRef} type="file" accept=".pdf,application/pdf"
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
                  border: "1.5px dashed var(--border-h)", borderRadius: 10,
                  padding: "28px 20px", textAlign: "center",
                  cursor: uploadingPdf ? "not-allowed" : "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                  background: "var(--surface2)",
                }}
                onMouseEnter={e => { if (!uploadingPdf) { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-bg)"; }}}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-h)"; e.currentTarget.style.background = "var(--surface2)"; }}
              >
                {uploadingPdf ? (
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>Extracting text…</div>
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
          </StepCard>

          {/* ── Target job (JD tailor flow only) ── */}
          {!studioHandoff && (
          <StepCard
            step={2}
            title="Target job"
            subtitle="Tell us what you're applying for"
          >
            {/* URL import — auto-fills company/role/JD */}
            <Field label="Job posting link (optional)">
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={jobUrl}
                  onChange={e => setJobUrl(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !extractingJd) { e.preventDefault(); importFromUrl(); } }}
                  placeholder="https://jobs.lever.co/..., https://boards.greenhouse.io/..., company career page"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={importFromUrl}
                  disabled={extractingJd || !jobUrl.trim()}
                  style={{
                    padding: "0 18px", minHeight: 44, fontSize: 13, fontWeight: 600, letterSpacing: -0.2,
                    background: extractingJd ? "var(--surface2)" : "var(--accent)",
                    color: extractingJd ? "var(--dim)" : "#fff",
                    border: "none", borderRadius: 8, cursor: extractingJd || !jobUrl.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit", opacity: !jobUrl.trim() ? 0.55 : 1,
                    whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {extractingJd ? (
                    <>
                      <span style={{ width: 10, height: 10, border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                      Extracting…
                    </>
                  ) : "Import"}
                </button>
              </div>
            </Field>
            {extractError && (
              <div style={{ marginTop: -6, marginBottom: 12, color: "var(--red)", fontSize: 12 }}>{extractError}</div>
            )}

            <div className="rb-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12, marginTop: 12 }}>
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
                  placeholder="Paste the full job description here — or import from a link above."
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
                  JD-focused edits only — you choose what to apply before generating the PDF.
                </p>
              )}
            </>
          )}

          </>)} {/* end !result && !generating inputs block */}

          {/* ── Suggestions review panel (JD tailor flow only) ── */}
          {!studioHandoff && suggestions && !generating && !result && (
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
              onSelectSuggestionCard={setSelectedSuggestionId}
              onToggleAccept={id => setAcceptedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) { next.delete(id); } else { next.add(id); setRejectedIds(r => { const rn = new Set(r); rn.delete(id); return rn; }); }
                return next;
              })}
              onToggleReject={id => setRejectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) { next.delete(id); } else { next.add(id); setAcceptedIds(a => { const an = new Set(a); an.delete(id); return an; }); }
                return next;
              })}
              onAcceptAll={() => {
                if (!suggestions?.length) return;
                setAcceptedIds(new Set(suggestions.map(s => s.id)));
                setRejectedIds(new Set());
              }}
              onClearAccepts={() => setAcceptedIds(new Set())}
              onGenerate={generate}
              generating={generating}
              error={error}
              onBackToInputs={() => {
                setSelectedSuggestionId(null);
                setSuggestions(null);
                setSuggestSummary("");
                setSuggestError(null);
                setAcceptedIds(new Set());
                setRejectedIds(new Set());
              }}
            />
          )}

          {/* During generation, show explicit progress */}
          {generating && !result && (
            <div
              className="fade-in"
              role="status"
              aria-live="polite"
              aria-busy="true"
              style={{
                marginBottom: 28,
                padding: "28px 24px",
                borderRadius: 16,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 14,
                textAlign: "center",
              }}
            >
              <Spinner size={28} />
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text)", letterSpacing: -0.3 }}>
                {statusMsg || (studioHandoff ? "Formatting your résumé…" : "Tailoring your resume…")}
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, maxWidth: 480, margin: 0 }}>
                {studioHandoff ? (
                  <>
                    Applying your selected layout and typography. LaTeX streams below when generation starts. This pass does not run live web
                    research or job-match scoring — use <strong>Tailor to a job</strong> from the sidebar when you want a posting-specific version.
                  </>
                ) : (
                  <>
                    Analyzing the job description and drafting your tailored résumé. LaTeX streams below when AI starts writing. When this run
                    uses live web research, search queries and sources show up in the web research panel as they arrive (sometimes only after a
                    short delay).
                  </>
                )}
              </p>
            </div>
          )}

          {/* Web research: only while no results card yet — ratings sets `result` before `done`, so hide once the results view is up */}
          {generating && !result && !hasWebResearch && !studioHandoff && (
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
                This panel only updates if the model runs a live search. For résumé + JD tailoring, that often doesn’t happen — your PDF can still finish normally.
              </div>
            </div>
          )}

          {/* Live web search — hide after results appear so Phase 3 isn’t stacked under streaming chrome */}
          {hasWebResearch && !result && !studioHandoff && (
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
                    animation: "pulse-bg 1.4s ease-in-out infinite",
                  }} />
                  {generating ? "Researching the web" : "Research used"}
                </span>
              </div>
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
                      Still tailoring…
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.45, marginTop: 2 }}>
                      {statusMsg || "Saving PDF and finishing your score — almost there."}
                    </div>
                  </div>
                </div>
              )}

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
                    Your tailored résumé is ready
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
                  onClick={() => setResult(null)}
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
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--dim)" }}>Analysing match…</div>
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
                        <a
                          href={result.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
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
                            textDecoration: "none",
                            fontFamily: "inherit",
                          }}
                        >
                          Download PDF
                        </a>
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
                    Each card is one JD requirement. For edits the model already made to your résumé text, use{" "}
                    <a href="#rb-results-diff" style={{ color: "var(--accent)", fontWeight: 600 }}>
                      line-by-line changes
                    </a>{" "}
                    below. To improve what we send next time, open the matching{" "}
                    <strong style={{ color: "var(--text)" }}>Profile</strong> section from a card — then run{" "}
                    <strong style={{ color: "var(--text)" }}>Improve this résumé</strong> again.
                  </p>
                  <MatchBreakdownCards criteria={ratings.criteria} hasLineDiff={result.diff.length > 0} />
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
                    Your PDF already includes these edits — tailoring runs when you use{" "}
                    <strong style={{ color: "var(--text)" }}>Improve this résumé</strong>. Each card explains a line-level change. Use{" "}
                    <strong style={{ color: "var(--text)" }}>Keep this update</strong> or{" "}
                    <strong style={{ color: "var(--text)" }}>I&apos;ll change wording myself</strong> to note what you want to revisit (your
                    choices do not alter or revert the file). To steer the model <em>before</em> tailoring, run{" "}
                    <strong style={{ color: "var(--text)" }}>Analyze &amp; get suggestions</strong>, accept or reject suggestions there, then
                    run <strong style={{ color: "var(--text)" }}>Improve this résumé</strong> again.
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
                    reviewAcknowledgement
                    editAnchorHref="#rb-customize-preview"
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
                  onClick={() => { setResult(null); setSuggestions(null); setJd(""); setCompany(""); setRole(""); setPreview(""); }}
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
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 12, letterSpacing: -0.2 }}>
                      {selectedTemplateLabel}
                    </div>
                    {result.pdfUrl ? (
                      <div
                        style={{
                          borderRadius: 12,
                          overflow: "hidden",
                          border: "1px solid var(--border)",
                          background: "#525659",
                          boxShadow: "var(--shadow-sm)",
                          aspectRatio: "8.5 / 11",
                          maxHeight: 520,
                          minHeight: 280,
                        }}
                      >
                        <iframe
                          title="Résumé PDF preview"
                          src={result.pdfUrl.includes("#") ? result.pdfUrl : `${result.pdfUrl}#view=FitH`}
                          loading="lazy"
                          style={{ width: "100%", height: "100%", minHeight: 360, border: "none", display: "block" }}
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
                    {result.pdfUrl ? (
                      <p style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.45, marginTop: 10, marginBottom: 0 }}>
                        If the preview is blank,{" "}
                        <a
                          href={result.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--accent)", fontWeight: 600 }}
                        >
                          open the PDF
                        </a>
                        .
                      </p>
                    ) : null}
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
                      <a
                        href={result.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
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
                          textDecoration: "none",
                          fontFamily: "inherit",
                        }}
                      >
                        Download PDF
                      </a>
                    ) : null}
                    {result.folder && result.pdfUrl && !generating ? (
                      <div style={{ display: "flex", justifyContent: "stretch" }}>
                        <ShareButton
                          folder={result.folder}
                          pdfUrl={result.pdfUrl}
                          userId={user?.id ?? null}
                          ensureLibraryRow={syncLibraryRowForShare}
                        />
                      </div>
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
                          setError(e instanceof Error ? e.message : String(e));
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

/** Align resume lines with suggestion `original` strings (bullets / spacing often differ). */
function normalizeResumeLineKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^[\s\u2022\u00b7\u2023\u2024\u2043\u2219\-\–\—\*‧·.]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildResumeHighlightMatcher(highlightOriginals: string[]): (line: string) => boolean {
  const keys = new Set<string>();
  const normOriginals: string[] = [];
  for (const o of highlightOriginals) {
    const ot = o.trim();
    if (!ot) continue;
    keys.add(ot.toLowerCase());
    const nk = normalizeResumeLineKey(ot);
    keys.add(nk);
    normOriginals.push(nk);
  }
  return (line: string) => {
    const t = line.trim();
    if (!t) return false;
    const raw = t.toLowerCase();
    const normLine = normalizeResumeLineKey(t);
    if (keys.has(raw) || keys.has(normLine)) return true;
    for (const on of normOriginals) {
      if (on.length < 12) continue;
      if (normLine.includes(on) || on.includes(normLine)) return true;
    }
    return false;
  };
}

/** First suggestion in list order whose `original` matches the résumé line (same rules as highlight). */
function firstSuggestionMatchingLine(
  line: string,
  suggestions: Suggestion[],
  predicate: (s: Suggestion) => boolean,
): Suggestion | null {
  for (const s of suggestions) {
    if (!predicate(s)) continue;
    if (buildResumeHighlightMatcher([s.original])(line)) return s;
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
            {result.pdfUrl ? (
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
            ) : (
              <button
                type="button"
                disabled
                style={{
                  padding: "10px 20px",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "none",
                  background: "#e2e8f0",
                  color: "var(--muted)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "not-allowed",
                  fontFamily: "inherit",
                }}
              >
                Download PDF →
              </button>
            )}
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
        <span style={{ fontSize: 12, color: "var(--dim)" }}>Style controls update the live paper instantly</span>
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
            This paper reflects your Style tab (fast, client-side). It is not pixel-identical to LaTeX.
          </p>

          {result.pdfUrl ? (
            <div style={{ marginTop: 20 }}>
              <div
                style={{
                  borderRadius: 12,
                  overflow: "hidden",
                  border: "1px solid #e2e8f0",
                  background: "#525659",
                  boxShadow: "0 4px 16px rgba(15,23,42,0.1)",
                  width: "100%",
                  height: "clamp(480px, 80vh, 960px)",
                  minHeight: 420,
                }}
              >
                <iframe
                  title="Exported résumé PDF"
                  src={result.pdfUrl.includes("#") ? result.pdfUrl : `${result.pdfUrl}#view=FitH`}
                  loading="lazy"
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                />
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.45, marginTop: 10, marginBottom: 0 }}>
              Your PDF will appear here when the compile step finishes.
            </p>
          )}
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
            {result.folder && result.pdfUrl && !generating ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <ShareButton
                  folder={result.folder}
                  pdfUrl={result.pdfUrl}
                  userId={user?.id ?? null}
                  ensureLibraryRow={ensureLibraryRow}
                />
              </div>
            ) : null}
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

/** Distinct left-border tints per suggestion (pending lines) — pairs with list order / card index. */
const RB_SUGGESTION_STRIPE_PALETTE: ReadonlyArray<{ border: string; bg: string }> = [
  { border: "#d97706", bg: "rgba(217, 119, 6, 0.11)" },
  { border: "#7c3aed", bg: "rgba(124, 58, 237, 0.09)" },
  { border: "#2563eb", bg: "rgba(37, 99, 235, 0.09)" },
  { border: "#db2777", bg: "rgba(219, 39, 119, 0.08)" },
  { border: "#0d9488", bg: "rgba(13, 148, 136, 0.10)" },
  { border: "#c2410c", bg: "rgba(194, 65, 12, 0.10)" },
  { border: "#4f46e5", bg: "rgba(79, 70, 229, 0.09)" },
  { border: "#ca8a04", bg: "rgba(202, 138, 4, 0.11)" },
];

function stripeStyleForSuggestion(sug: Suggestion | null, all: Suggestion[]): CSSProperties {
  if (!sug || !all.length) return {};
  const idx = Math.max(0, all.findIndex(s => s.id === sug.id));
  const c = RB_SUGGESTION_STRIPE_PALETTE[idx % RB_SUGGESTION_STRIPE_PALETTE.length];
  return {
    background: c.bg,
    borderLeft: `3px solid ${c.border}`,
    paddingLeft: 6,
    marginLeft: -9,
    borderRadius: "0 3px 3px 0",
  };
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
  const nameCenteredCaps = !isMalta && !isHarshibar;
  const fontFamily =
    isMalta || isHarshibar
      ? "'Inter', 'Helvetica Neue', Arial, sans-serif"
      : "'Georgia', 'Times New Roman', serif";
  const lines = text.split("\n");
  const lineMatchesHighlight = buildResumeHighlightMatcher(highlightOriginals);
  const ic = interactiveSuggestions;

  const { nameLineIndex, subtitleLineIndex } = nameAndSubtitleLineIndices(lines);

  const isAllCaps = (t: string) => t.length > 2 && t === t.toUpperCase() && /[A-Z]/.test(t) && !/^[•\-–*\u2022\u00b7]/.test(t);
  const isBullet  = (t: string) => /^[•\-–*\u2022\u00b7]/.test(t);

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
      padding: `${paperPaddingY}px ${paperPaddingX}px`,
      fontFamily,
      fontSize: baseFontPx,
      lineHeight,
      color: "#1e293b",
      minHeight: 480,
    }}>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 7 }} />;
        if (isPlaceholderResumeHeaderLine(line) && i !== nameLineIndex) return null;

        const acceptedSug = ic
          ? firstSuggestionMatchingLine(line, ic.suggestions, s => ic.acceptedIds.has(s.id))
          : null;
        const linkSug = ic
          ? firstSuggestionMatchingLine(line, ic.suggestions, s => !ic.rejectedIds.has(s.id))
          : null;
        const pendingHighlight = ic && linkSug && !ic.acceptedIds.has(linkSug.id);
        const highlightedPlain = !ic && lineMatchesHighlight(line);

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
        else if (pendingHighlight && linkSug && ic) hlStyle = stripeStyleForSuggestion(linkSug, ic.suggestions);
        else if (pendingHighlight || highlightedPlain) hlStyle = amber;

        if (i === nameLineIndex) {
          if (nameCenteredCaps) {
            return (
              <div key={i} style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2, textAlign: "center", textTransform: "uppercase" }}>
                {t}
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
              {t}
            </div>
          );
        }
        if (subtitleLineIndex >= 0 && i === subtitleLineIndex && !isAllCaps(t)) {
          return (
            <div key={i} style={{ fontSize: 9.5, color: "#64748b", textAlign: nameCenteredCaps ? "center" : "left", marginBottom: 8 }}>
              {t}
            </div>
          );
        }
        if (isAllCaps(t)) {
          return (
            <div key={i} style={{ marginTop: 12, marginBottom: 3 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: sectionAccentColor }}>{t}</div>
              <div style={{ height: 0.8, background: sectionAccentColor, marginTop: 2 }} />
            </div>
          );
        }
        const stripped = t.replace(/^[•\-–*\u2022\u00b7]\s*/, "");
        const innerFromAccepted = acceptedSug
          ? (acceptedSug.suggested.trim().replace(/^[•\-–*\u2022\u00b7]\s*/, "").split("\n")[0]?.trim() || stripped)
          : stripped;

        if (isBullet(t)) {
          const base: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 2, paddingLeft: 6, ...hlStyle };
          const p = rowInteractiveProps(line, base, linkSug, acceptedSug);
          const lineMark = linkSug ? ({ "data-rb-sug-line": linkSug.id } as React.HTMLAttributes<HTMLDivElement>) : {};
          return (
            <div key={i} {...p} {...lineMark}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{innerFromAccepted}</span>
            </div>
          );
        }
        const base: React.CSSProperties = { marginBottom: 2, ...hlStyle };
        const p = rowInteractiveProps(line, base, linkSug, acceptedSug);
        const lineMark = linkSug ? ({ "data-rb-sug-line": linkSug.id } as React.HTMLAttributes<HTMLDivElement>) : {};
        return <div key={i} {...p} {...lineMark}>{acceptedSug ? innerFromAccepted : t}</div>;
      })}
    </div>
  );
}

/* ── Suggestions panel ───────────────────────────────────────────────────── */

const PRIORITY_COLOR: Record<string, string> = {
  high: "var(--red)", medium: "var(--amber)", low: "var(--muted)",
};
const PRIORITY_BG: Record<string, string> = {
  high: "var(--red-bg)", medium: "var(--amber-bg)", low: "rgba(148,163,184,0.12)",
};

function priorityLabel(p: Suggestion["priority"]): string {
  if (p === "high") return "HIGH";
  if (p === "medium") return "MEDIUM";
  return "LOW";
}

function SuggestionsPanel({
  summary, suggestions, acceptedIds, rejectedIds, candidateProfile,
  pdfBlobUrl, pdfFileName, pdfDocumentKey,
  selectedSuggestionId, onSelectSuggestionCard,
  onToggleAccept, onToggleReject, onAcceptAll, onClearAccepts, onGenerate, generating, error, onBackToInputs,
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
  onGenerate: () => void | Promise<unknown>;
  generating: boolean;
  error: string | null;
  onBackToInputs: () => void;
}) {
  const [leftPreviewTab, setLeftPreviewTab] = useState<"pdf" | "text">(() => (pdfBlobUrl ? "pdf" : "text"));

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
  }, [selectedSuggestionId, leftPreviewTab]);

  return (
    <div className="fade-in" style={{ marginBottom: 32 }}>
      <style>{`
        .rb-suggestions-grid {
          display: grid;
          grid-template-columns: minmax(260px, 1.15fr) minmax(280px, 1fr);
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .rb-suggestions-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", letterSpacing: -0.1 }}>
          Accept suggestions first — only accepted items are sent as structured edits to LaTeX generation
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

      {/* Two-panel layout (View 5 — Phase 2); stacks on narrow screens */}
      <div className="rb-suggestions-grid">

        {/* Left: scanned PDF (when available) or extracted-text paper */}
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
                  onClick={() => setLeftPreviewTab("pdf")}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: leftPreviewTab === "pdf" ? "var(--surface)" : "transparent",
                    color: leftPreviewTab === "pdf" ? "var(--text)" : "var(--muted)",
                    boxShadow: leftPreviewTab === "pdf" ? "var(--shadow-sm)" : "none",
                  }}
                >
                  Scanned PDF
                </button>
                <button
                  type="button"
                  onClick={() => setLeftPreviewTab("text")}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "none",
                    cursor: "pointer",
                    background: leftPreviewTab === "text" ? "var(--surface)" : "transparent",
                    color: leftPreviewTab === "text" ? "var(--text)" : "var(--muted)",
                    boxShadow: leftPreviewTab === "text" ? "var(--shadow-sm)" : "none",
                  }}
                >
                  Extracted text
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 10, color: "var(--dim)" }}>Text preview — upload a PDF to unlock scanned view</span>
            )}
          </div>
          {pdfBlobUrl && leftPreviewTab === "pdf" ? (
            <div
              style={{
                overflow: "hidden",
                maxHeight: panelScrollMax,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "#fff",
              }}
            >
              <BuilderPdfSuggestionHighlights
                key={pdfDocumentKey}
                pdfBlobUrl={pdfBlobUrl}
                filename={pdfFileName ?? "resume.pdf"}
                suggestions={suggestions.map(s => ({ id: s.id, original: s.original }))}
                acceptedIds={acceptedIds}
                rejectedIds={rejectedIds}
                selectedSuggestionId={selectedSuggestionId}
                onSelectSuggestion={id => onSelectSuggestionCard(id)}
              />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6, lineHeight: 1.45 }}>
                Tinted lines match cards on the right — click a line to focus the matching suggestion.
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
                />
              </div>
            </>
          )}
        </div>

        {/* Right: suggestion cards */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
            {suggestions.length} suggested improvements
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: panelScrollMax, overflowY: "auto" }}>
            {suggestions.map(s => {
              const isAccepted = acceptedIds.has(s.id);
              const isRejected = rejectedIds.has(s.id);
              const isLinked = selectedSuggestionId === s.id;
              const si = suggestions.findIndex(x => x.id === s.id);
              const stripe = RB_SUGGESTION_STRIPE_PALETTE[Math.max(0, si) % RB_SUGGESTION_STRIPE_PALETTE.length];
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
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      title="Same color as the matching line in the preview"
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

                  {/* Original → Suggested */}
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, lineHeight: 1.5, fontStyle: "italic", textDecoration: isAccepted ? "line-through" : "none", opacity: isAccepted ? 0.6 : 1, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {s.original}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
                    <span style={{ color: "var(--green)", fontSize: 11, flexShrink: 0, marginTop: 2 }} aria-hidden>→</span>
                    <span style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.5, fontWeight: isAccepted ? 500 : 400, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{s.suggested}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.45, marginBottom: 10, paddingLeft: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {s.reason}
                  </div>

                  {/* Accept / Reject — min 44px tap height (HIG / Material touch) */}
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
      </div>

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
        <button
          type="button"
          onClick={() => { void onGenerate(); }}
          disabled={generating}
          aria-busy={generating}
          style={{
            width: "100%", padding: "14px 20px", minHeight: 48,
            background: generating ? "var(--surface2)" : "var(--accent)",
            color: generating ? "var(--muted)" : "#fff",
            border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 500, fontFamily: "inherit",
            cursor: generating ? "not-allowed" : "pointer",
            letterSpacing: -0.3, transition: "background 0.2s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
          onMouseEnter={e => { if (!generating) e.currentTarget.style.background = "var(--accent-h)"; }}
          onMouseLeave={e => { if (!generating) e.currentTarget.style.background = "var(--accent)"; }}
        >
          {generating ? (
            <><Spinner size={16} />Generating your resume…</>
          ) : (
            accepted.length > 0
              ? `Apply ${accepted.length} accepted edit${accepted.length > 1 ? "s" : ""} & generate PDF →`
              : "Generate tailored PDF (no accepted bullet edits) →"
          )}
        </button>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>
        {accepted.length} of {suggestions.length} accepted — the profile text stays unchanged; accepted rows are passed as a separate structured list to the model before LaTeX is written.
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

/** Full-width analysis loader: shimmer card + phased steps + rotating tips (tailor flow). */
function BuilderSuggestAnalysisLoader({ stepsDone, tipIdx }: { stepsDone: number; tipIdx: number }) {
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
          {stepRow("Build tailored suggestions", 2, true)}
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
