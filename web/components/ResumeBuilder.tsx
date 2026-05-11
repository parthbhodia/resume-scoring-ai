"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { GenerationResult, SSEEvent, RatingsData, DiffLine, Source, ChangeRationale } from "@/lib/types";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";
import { upsertResume, getSupabaseClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";
import {
  DEFAULT_REFERENCE_FOLDER,
  distinctStyleTemplates,
  isValidResumeStyleFolder,
} from "@/lib/resumeTemplates";

import ScoreRing    from "./ScoreRing";
import CriteriaTable from "./CriteriaTable";
import DiffView     from "./DiffView";
import SourcesPanel from "./SourcesPanel";
import AtsPanel, { type AtsResult } from "./AtsPanel";
import ShareButton   from "./ShareButton";

type Suggestion = {
  id: string;
  section: string;
  original: string;
  suggested: string;
  reason: string;
  priority: "high" | "medium" | "low";
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

export default function ResumeBuilder({
  initialBaseFolder,
  scratchStart = false,
}: {
  initialBaseFolder?: string | null;
  /** When true, start a clean builder session (no draft carry-over, no base resume). */
  scratchStart?: boolean;
} = {}) {
  const router = useRouter();
  const draft0: Record<string, unknown> = scratchStart ? {} : loadDraft();
  const [company,    setCompanyRaw]    = useState<string>(String(draft0.company ?? ""));
  const [role,       setRoleRaw]       = useState<string>(String(draft0.role ?? ""));
  const [jd,         setJdRaw]         = useState<string>(String(draft0.jd ?? ""));
  const [jobUrl,     setJobUrlRaw]     = useState<string>(String(draft0.jobUrl ?? ""));
  const model = "gemini-2.5-flash";
  const [baseFolder, setBaseFolder] = useState<string | null>(scratchStart ? null : (initialBaseFolder ?? null));
  // Wrap setters to also persist to sessionStorage
  const setCompany = (v: string) => { setCompanyRaw(v); saveDraft({ company: v }); };
  const setRole    = (v: string) => { setRoleRaw(v);    saveDraft({ role: v }); };
  const setJd      = (v: string) => { setJdRaw(v);      saveDraft({ jd: v }); };
  const setJobUrl  = (v: string) => { setJobUrlRaw(v);  saveDraft({ jobUrl: v }); };

  const [generating, setGenerating] = useState(false);
  const [statusMsg,  setStatusMsg]  = useState("");
  const [result,     setResult]     = useState<GenerationResult | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [preview,    setPreview]    = useState("");
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [searchQueries, setSearchQueries] = useState<string[]>([]);
  const [searchSources, setSearchSources] = useState<{ title: string | null; url: string }[]>([]);
  const [storageFailures, setStorageFailures] = useState<{ artifact: "pdf" | "tex"; reason: string }[]>([]);
  const hasWebResearch = searchQueries.length > 0 || searchSources.length > 0;
  /** After Résumé Template Studio — hide JD wizard chrome; optional job + generate only. */
  const [studioHandoff, setStudioHandoff] = useState(false);

  // ── Suggestions state ──────────────────────────────────────────────────────
  const [suggestions,    setSuggestions]    = useState<Suggestion[] | null>(null);
  const [suggestSummary, setSuggestSummary] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError,   setSuggestError]   = useState<string | null>(null);
  const [acceptedIds,    setAcceptedIds]    = useState<Set<string>>(new Set());
  const [rejectedIds,    setRejectedIds]    = useState<Set<string>>(new Set());

  const [candidateProfile,    setCandidateProfile]    = useState<string | null>(null);
  const [uploadedFileName,    setUploadedFileName]    = useState<string | null>(null);
  const [uploadingPdf,        setUploadingPdf]        = useState(false);
  const [uploadError,         setUploadError]         = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [extractingJd, setExtractingJd] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  useEffect(() => {
    if (!scratchStart) return;
    try {
      sessionStorage.removeItem(SS_KEY);
    } catch { /* ignore */ }
  }, [scratchStart]);

  // Prefill from Analyze (`fromAnalyze=1`) or Template Studio (`fromTemplateStudio=1`).
  useEffect(() => {
    if (typeof window === "undefined" || scratchStart) return;
    const sp = new URLSearchParams(window.location.search);
    const fromAnalyze = sp.get("fromAnalyze") === "1";
    const fromTemplateStudio = sp.get("fromTemplateStudio") === "1";
    const flow = (sp.get("flow") || "tailor").toLowerCase();
    try {
      const profile = sessionStorage.getItem("rn_builder_profile_prefill");
      const jdPre = sessionStorage.getItem("rn_builder_jd_prefill");
      if ((fromAnalyze || fromTemplateStudio) && profile) {
        setCandidateProfile(profile);
        setUploadedFileName(fromTemplateStudio ? "From template studio" : "From Analyze");
      }
      if (jdPre) {
        setJdRaw(jdPre);
        saveDraft({ jd: jdPre });
      }
      if (fromAnalyze) sessionStorage.removeItem("rn_builder_profile_prefill");
      sessionStorage.removeItem("rn_builder_jd_prefill");
      sessionStorage.removeItem("rn_builder_from_analyze");
      if (fromTemplateStudio) sessionStorage.removeItem("rn_builder_profile_prefill");
    } catch { /* ignore */ }

    if (fromAnalyze && flow === "tailor") {
      const baseQ = sp.get("base");
      const styleRef = sp.get("styleRef");
      let next = "/?view=builder&flow=tailor";
      if (baseQ) next += `&base=${encodeURIComponent(baseQ)}`;
      if (styleRef) next += `&styleRef=${encodeURIComponent(styleRef)}`;
      router.replace(next);
    } else if (fromTemplateStudio) {
      setStudioHandoff(true);
      sp.delete("fromTemplateStudio");
      const qs = sp.toString();
      router.replace(qs ? `/?${qs}` : "/?view=builder&flow=tailor");
    }
  }, [router, scratchStart]);

  // ── ATS state — populated lazily when the user opens the ATS panel. ──
  const [atsResult,    setAtsResult]    = useState<AtsResult | null>(null);
  const [atsLoading,   setAtsLoading]   = useState(false);
  const [atsError,     setAtsError]     = useState<string | null>(null);

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
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, s) => setUser(s?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const runAtsCheck = useCallback(async (folder: string) => {
    setAtsLoading(true); setAtsError(null);
    try {
      const resp = await fetch(apiUrl(`/api/ats-check/${encodeURIComponent(folder)}`), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ jd: jd.slice(0, 8000), user_id: user?.id ?? "local" }),
      });
      const json = await parseJsonOrThrow<AtsResult & { error?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "ATS check failed.");
      setAtsResult(json);
    } catch (e: unknown) {
      setAtsError(e instanceof Error ? e.message : String(e));
    } finally {
      setAtsLoading(false);
    }
  }, [jd, user]);

  // Auto-run ATS after generation completes
  useEffect(() => {
    if (!result?.folder || atsLoading || atsResult || atsError) return;
    void runAtsCheck(result.folder);
  }, [result?.folder, atsLoading, atsResult, atsError, runAtsCheck]);

  // Reset ATS when a new generation starts
  useEffect(() => {
    setAtsResult(null);
    setAtsError(null);
  }, [result?.folder]);

  const getSuggestions = useCallback(async () => {
    let effJd = jd.trim();
    if (!effJd && studioHandoff) {
      effJd = (candidateProfile ?? "").trim()
        ? "No specific job — optimize structure, ATS safety, and measurable impact."
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
      // Default: accept all high-priority suggestions
      const highIds = new Set((json.suggestions ?? []).filter(s => s.priority === "high").map(s => s.id));
      setAcceptedIds(highIds);
    } catch (e: unknown) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggestLoading(false);
    }
  }, [jd, candidateProfile, studioHandoff]);

  const handlePdfUpload = useCallback(async (file: File) => {
    if (!file.type.includes("pdf")) { setUploadError("Please upload a PDF file."); return; }
    setUploadingPdf(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: formData });
      const json = await parseJsonOrThrow<{ error?: string; text?: string }>(resp);
      if (!resp.ok) throw new Error(json.error ?? "Upload failed");
      setCandidateProfile(json.text ?? "");
      setUploadedFileName(file.name);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingPdf(false);
    }
  }, []);

  const generate = useCallback(async () => {
    let effCompany = company.trim();
    let effRole    = role.trim();
    let effJd      = jd.trim();

    if (studioHandoff) {
      if (!effCompany) effCompany = "General application";
      if (!effRole) effRole = "Open role";
      if (!effJd) {
        const cp = (candidateProfile ?? "").trim();
        effJd = cp
          ? `No specific job posting yet—optimize structure, ATS safety, and measurable impact using this candidate profile only.\n\n---\n${cp.slice(0, 6000)}`
          : "No specific job posting yet—produce a polished ATS-safe résumé from the uploaded profile text.";
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
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);
    setPreview("");
    setStatusMsg("Connecting…");
    setJdKeywords(extractJdKeywords(effJd));
    setSearchQueries([]);
    setSearchSources([]);
    setStorageFailures([]);

    // Bake accepted suggestions into the candidate profile as explicit instructions
    const accepted = (suggestions ?? []).filter(s => acceptedIds.has(s.id));
    let effProfile = candidateProfile ?? "";
    if (accepted.length > 0) {
      const instructions = accepted.map((s, i) =>
        `${i + 1}. In ${s.section}: change "${s.original}" to "${s.suggested}" — ${s.reason}`
      ).join("\n");
      effProfile = `${effProfile}\n\n---\nACCEPTED IMPROVEMENTS TO APPLY:\n${instructions}`;
    }

    const acc: GenerationResult = { ...EMPTY_RESULT, baseFolder, baseLoaded: baseFolder ? null : false };

    try {
      const resp = await fetch(apiUrl("/api/generate-stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: effCompany, role: effRole, job_description: effJd,
          model, base_folder: baseFolder,
          reference_folder: styleReferenceFolder,
          candidate_profile: effProfile,
          user_id: user?.id ?? null,
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
            case "sources": acc.sources = ev.urls as Source[]; break;
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
                upsertResume(acc.folder, effCompany, effRole, model, acc.texPath ?? "", acc.pdfUrl, acc.ratings).catch(console.error);
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setGenerating(false);
      setStatusMsg("");
    }
  }, [company, role, jd, jobUrl, importFromUrl, baseFolder, candidateProfile, user, styleReferenceFolder, studioHandoff, suggestions, acceptedIds]);

  const ratings = result?.ratings;
  const score   = ratings?.match_score ?? 0;

  return (
    <div
      className="rb-root"
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >

      {/* ── Main ── */}
      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Page content */}
        <div className="rb-page" style={{ padding: "44px 48px 80px", maxWidth: studioHandoff ? 920 : 820, margin: "0 auto", width: "100%" }}>

          {/* ── Hero (pre-generation) ── */}
          {!result && !generating && (
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
                  Layout &amp; extract ready
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
                  You picked a template in the layout gallery. Optionally add a job posting below to sharpen keywords—then
                  generate your PDF. To change layout or spacing, go back via the app menu:{" "}
                  <strong style={{ color: "var(--text)" }}>Résumé Builder → Template &amp; PDF</strong>.
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
                  Upload your current résumé, pick a template, paste the job posting, and receive an AI-tailored LaTeX résumé with match score, gap analysis, and ATS-safe PDF — in under 60 seconds.
                </p>
                <div className="fade-in stagger-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { n: 1, label: "Pick LaTeX layout" },
                    { n: 2, label: "Upload résumé" },
                    { n: 3, label: "Paste job posting" },
                    { n: 4, label: "Tailor & download PDF" },
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

          {/* ── Inputs (hidden once results are shown) ── */}
          {!result && !generating && (<>

          {!studioHandoff && (
          <>
          {/* ── Step 1: LaTeX layout (reference .tex on server) ── */}
          <StepCard
            step={1}
            title="Layout template"
            subtitle="Pick the LaTeX style the AI will copy. Final PDF is compiled with pdflatex."
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

          {/* ── Step 2: Resume ── */}
          <StepCard step={2} title="Your resume" subtitle="Upload your current resume as a PDF">
            <input
              ref={fileInputRef} type="file" accept=".pdf,application/pdf"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); e.target.value = ""; }}
            />

            {candidateProfile ? (
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
                  onClick={() => { setCandidateProfile(null); setUploadedFileName(null); }}
                  style={{
                    background: "none", border: "none", color: "var(--dim)",
                    cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 4px",
                  }}
                  title="Remove"
                >×</button>
              </div>
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
          </>
          )}

          {/* ── Step 3: Job target ── */}
          <StepCard
            step={studioHandoff ? 1 : 3}
            title={studioHandoff ? "Target job (optional)" : "Target job"}
            subtitle={studioHandoff
              ? "Paste a posting to sharpen keywords—or leave everything blank and we'll compile from your extract with safe defaults."
              : "Tell us what you're applying for"}
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
                    padding: "0 16px", fontSize: 12, fontWeight: 600, letterSpacing: -0.2,
                    background: extractingJd ? "var(--surface2)" : "var(--accent)",
                    color: extractingJd ? "var(--dim)" : "#fff",
                    border: "none", borderRadius: 8, cursor: extractingJd || !jobUrl.trim() ? "not-allowed" : "pointer",
                    fontFamily: "inherit", opacity: !jobUrl.trim() ? 0.55 : 1,
                    whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 6,
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
                  value={jd}
                  onChange={e => setJd(e.target.value)}
                  placeholder="Paste the full job description here — or import from a link above."
                  style={{ minHeight: 140, lineHeight: 1.55 }}
                />
              </Field>
            )}
          </StepCard>

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
                onClick={() => setBaseFolder(null)}
                style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
                title="Clear base"
              >×</button>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div style={{
              marginBottom: 16, padding: "12px 16px",
              background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)",
              borderRadius: 10, color: "var(--red)", fontSize: 13, letterSpacing: -0.2,
            }}>
              {error}
            </div>
          )}

          {/* ── Primary CTA: Get Suggestions ── */}
          {suggestError && (
            <div style={{ marginBottom: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, color: "var(--red)", fontSize: 12 }}>
              {suggestError}
            </div>
          )}
          <button
            onClick={getSuggestions}
            disabled={suggestLoading || generating}
            style={{
              width: "100%", padding: "14px 20px", marginBottom: 8,
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
              <><Spinner size={16} />Analyzing your resume…</>
            ) : (
              studioHandoff ? "Generate suggestions →" : "Analyze & get suggestions →"
            )}
          </button>
          <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginBottom: 24, letterSpacing: -0.1 }}>
            We&apos;ll show you exactly what to change — you pick what to apply.
          </p>

          </>)} {/* end !result && !generating inputs block */}

          {/* ── Suggestions review panel ── */}
          {suggestions && !generating && !result && (
            <SuggestionsPanel
              summary={suggestSummary}
              suggestions={suggestions}
              acceptedIds={acceptedIds}
              rejectedIds={rejectedIds}
              candidateProfile={candidateProfile ?? ""}
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
              onGenerate={generate}
              generating={generating}
              error={error}
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
                {statusMsg || "Tailoring your resume…"}
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, maxWidth: 440, margin: 0 }}>
                Analyzing the job description and drafting your tailored résumé. Live preview and web research will appear below as they stream in.
              </p>
            </div>
          )}

          {/* Live Google Search activity (Gemini grounding) */}
          {hasWebResearch && (
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
                {/* Queries Gemini issued to Google */}
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

                {/* Pages Gemini cited from those queries */}
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


          {/* ── Streaming LaTeX preview (during generation) ── */}
          {generating && preview && (
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

          {/* ── Results ── */}
          {result && (
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
                    padding: "14px 18px",
                    borderRadius: 12,
                    background: "var(--accent-bg)",
                    border: "1px solid var(--border)",
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

              {/* Results header row */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: 11, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>Results</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <button
                  onClick={() => setResult(null)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 12px", borderRadius: 8,
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    color: "var(--muted)", fontSize: 12, fontWeight: 500,
                    cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.2,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.color = "var(--text)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.color = "var(--muted)"; }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M1 6a5 5 0 109.9-1M1 6V2m0 4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Try new resume
                </button>
              </div>

              {/* Score hero card */}
              <div className="rb-score-card" style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 16, padding: "28px 28px 24px",
                marginBottom: 16,
                position: "relative", overflow: "hidden",
              }}>
                {/* Subtle accent glow behind score */}
                <div style={{
                  position: "absolute", top: -40, left: -40, width: 200, height: 200,
                  background: score >= 75 ? "rgba(52,211,153,0.06)" : score >= 55 ? "rgba(251,191,36,0.06)" : "rgba(248,113,113,0.06)",
                  borderRadius: "50%", pointerEvents: "none",
                }} />

                <div className="rb-score-row" style={{ display: "flex", alignItems: "flex-start", gap: 24, position: "relative" }}>
                  {ratings ? (
                    <ScoreRing score={score} size={130} />
                  ) : (
                    <div style={{ width: 130, height: 130, borderRadius: "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Spinner size={28} />
                    </div>
                  )}

                  <div style={{ flex: 1, paddingTop: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 6 }}>
                      {company} · {role}
                    </div>
                    {ratings ? (
                      <>
                        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.6, color: "var(--text)", marginBottom: 8, lineHeight: 1.3 }}>
                          {score >= 80 ? "Strong match" : score >= 65 ? "Good match" : score >= 50 ? "Moderate match" : "Needs work"}
                        </div>
                        <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, letterSpacing: -0.2, margin: 0 }}>
                          {ratings.verdict}
                        </p>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: "var(--dim)" }}>Analysing match…</div>
                    )}
                  </div>

                  {/* PDF download + share */}
                  {result.pdfUrl && (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {result.folder && (
                        <ShareButton
                          folder={result.folder}
                          pdfUrl={result.pdfUrl}
                          userId={user?.id ?? null}
                        />
                      )}
                      <a
                        href={result.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex", alignItems: "center", gap: 7,
                          padding: "9px 16px",
                          background: "var(--accent)", borderRadius: 9,
                          color: "#fff", textDecoration: "none",
                          fontSize: 13, fontWeight: 500, letterSpacing: -0.3,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2 11h9" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        Download PDF
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Strengths + Gaps */}
              {ratings && (ratings.whats_working?.length > 0 || ratings.gaps?.length > 0) && (
                <div className="rb-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  {ratings.whats_working?.length > 0 && (
                    <div style={{
                      background: "var(--surface)", border: "1px solid rgba(52,211,153,0.18)",
                      borderRadius: 12, padding: "16px 18px",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 12 }}>
                        What&apos;s working
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {ratings.whats_working.map((w, i) => (
                          <div key={i} style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.5, letterSpacing: -0.2 }}>
                            <span style={{ color: "var(--green)", flexShrink: 0, marginTop: 1 }}>✓</span>
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {ratings.gaps?.length > 0 && (
                    <div style={{
                      background: "var(--surface)", border: "1px solid rgba(251,191,36,0.18)",
                      borderRadius: 12, padding: "16px 18px",
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--orange)", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 12 }}>
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
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
                    Match breakdown
                  </div>
                  <CriteriaTable criteria={ratings.criteria} />
                </div>
              )}

              {/* Inline diff — line-by-line edits below analysis */}
              {result.diff.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
                    Changes to your resume&ensp;
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>+{result.adds}</span>
                    <span style={{ color: "var(--dim)" }}> / </span>
                    <span style={{ color: "var(--red)", fontWeight: 600 }}>−{result.removes}</span>
                  </div>
                  <DiffView diff={result.diff} adds={result.adds} removes={result.removes} rationales={result.rationales} baseFolder={result.baseFolder} baseLoaded={result.baseLoaded} jdKeywords={jdKeywords} />
                </div>
              )}

              {/* Sources */}
              {result.sources.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <SourcesPanel sources={result.sources} />
                </div>
              )}

              {/* Storage failure banner — surfaces silent upload errors so the
                  user knows this resume can't be used as a base for diff/edit
                  later. */}
              {storageFailures.length > 0 && (
                <div style={{
                  marginBottom: 16, padding: "10px 14px",
                  background: "rgba(251,191,36,0.08)",
                  border: "1px solid rgba(251,191,36,0.35)",
                  borderRadius: 9, fontSize: 12, color: "var(--text)",
                  letterSpacing: -0.1, lineHeight: 1.5,
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
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
                  ATS check{atsResult ? ` — ${atsResult.score}` : ""}
                </div>
                {atsLoading && (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
                    Running ATS check…
                  </div>
                )}
                {atsError && !atsLoading && (
                  <div style={{ padding: 12, color: "var(--red)", fontSize: 12, display: "flex", alignItems: "center", gap: 10 }}>
                    Couldn&apos;t run ATS check: {atsError}
                    {result.folder && (
                      <button onClick={() => runAtsCheck(result.folder!)} style={{ fontSize: 11, padding: "4px 10px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", cursor: "pointer", fontFamily: "inherit" }}>
                        Retry
                      </button>
                    )}
                  </div>
                )}
                {atsResult && !atsLoading && (
                  <AtsPanel result={atsResult} rechecking={atsLoading} onRecheck={() => result.folder && runAtsCheck(result.folder)} />
                )}
              </div>

              {/* Start over nudge */}
              <div style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--dim)", letterSpacing: -0.2 }}>Want to try a different job?</span>
                <button
                  onClick={() => { setResult(null); setSuggestions(null); setJd(""); setCompany(""); setRole(""); setPreview(""); }}
                  style={{ fontSize: 12, padding: "6px 14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 7, color: "var(--muted)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Start over
                </button>
              </div>
            </div>
          )}


        </div>
      </main>

    </div>
  );
}

/* ── Resume paper preview (plain text → paper-style render) ─────────────── */

function ResumePaperView({ text, highlightOriginals }: { text: string; highlightOriginals: string[] }) {
  const lines = text.split("\n");
  const highlightSet = new Set(highlightOriginals.map(s => s.trim().toLowerCase()));

  const isAllCaps = (t: string) => t.length > 2 && t === t.toUpperCase() && /[A-Z]/.test(t) && !t.startsWith("•");
  const isBullet  = (t: string) => /^[•\-–*]/.test(t);
  const firstNonEmpty = lines.findIndex(l => l.trim().length > 0);

  return (
    <div style={{
      background: "#fff",
      borderRadius: 6,
      boxShadow: "0 2px 16px rgba(0,0,0,0.10)",
      padding: "28px 32px",
      fontFamily: "'Georgia', serif",
      fontSize: 10.5,
      lineHeight: 1.55,
      color: "#1e293b",
      minHeight: 480,
    }}>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 7 }} />;

        const highlighted = highlightSet.has(t.toLowerCase());
        const hlStyle: React.CSSProperties = highlighted ? {
          background: "rgba(245,158,11,0.12)",
          borderLeft: "3px solid #f59e0b",
          paddingLeft: 6,
          marginLeft: -9,
          borderRadius: "0 3px 3px 0",
        } : {};

        if (i === firstNonEmpty) {
          return <div key={i} style={{ fontSize: 15, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2, textAlign: "center", textTransform: "uppercase" }}>{t}</div>;
        }
        if (i === firstNonEmpty + 1 && !isAllCaps(t)) {
          return <div key={i} style={{ fontSize: 9.5, color: "#64748b", textAlign: "center", marginBottom: 8 }}>{t}</div>;
        }
        if (isAllCaps(t)) {
          return (
            <div key={i} style={{ marginTop: 12, marginBottom: 3 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#0f172a" }}>{t}</div>
              <div style={{ height: 0.8, background: "#0f172a", marginTop: 2 }} />
            </div>
          );
        }
        if (isBullet(t)) {
          return (
            <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2, paddingLeft: 6, ...hlStyle }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>•</span>
              <span>{t.replace(/^[•\-–*]\s*/, "")}</span>
            </div>
          );
        }
        return <div key={i} style={{ marginBottom: 2, ...hlStyle }}>{t}</div>;
      })}
    </div>
  );
}

/* ── Suggestions panel ───────────────────────────────────────────────────── */

const PRIORITY_COLOR: Record<string, string> = {
  high: "#ef4444", medium: "#f59e0b", low: "#94a3b8",
};
const PRIORITY_BG: Record<string, string> = {
  high: "rgba(239,68,68,0.08)", medium: "rgba(245,158,11,0.08)", low: "rgba(148,163,184,0.08)",
};

function SuggestionsPanel({
  summary, suggestions, acceptedIds, rejectedIds, candidateProfile,
  onToggleAccept, onToggleReject, onGenerate, generating, error,
}: {
  summary: string;
  suggestions: Suggestion[];
  acceptedIds: Set<string>;
  rejectedIds: Set<string>;
  candidateProfile: string;
  onToggleAccept: (id: string) => void;
  onToggleReject: (id: string) => void;
  onGenerate: () => void;
  generating: boolean;
  error: string | null;
}) {
  const accepted = suggestions.filter(s => acceptedIds.has(s.id));
  const highlightOriginals = suggestions.map(s => s.original);

  return (
    <div className="fade-in" style={{ marginBottom: 32 }}>
      {/* Summary banner */}
      {summary && (
        <div style={{
          marginBottom: 16, padding: "12px 16px",
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, fontSize: 13, color: "var(--muted)", lineHeight: 1.55,
          borderLeft: "3px solid var(--accent)",
        }}>
          <strong style={{ color: "var(--text)" }}>Key gap: </strong>{summary}
        </div>
      )}

      {/* Two-panel layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>

        {/* Left: live resume preview */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
            Your resume — highlighted bullets can be improved
          </div>
          <div style={{ overflowY: "auto", maxHeight: 600 }}>
            <ResumePaperView text={candidateProfile} highlightOriginals={highlightOriginals} />
          </div>
        </div>

        {/* Right: suggestion cards */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }}>
            {suggestions.length} suggested improvements
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 600, overflowY: "auto" }}>
            {suggestions.map(s => {
              const isAccepted = acceptedIds.has(s.id);
              const isRejected = rejectedIds.has(s.id);
              return (
                <div key={s.id} style={{
                  borderRadius: 10, border: `1.5px solid ${isAccepted ? "rgba(52,211,153,0.4)" : isRejected ? "var(--border)" : "var(--border)"}`,
                  background: isAccepted ? "rgba(52,211,153,0.04)" : isRejected ? "var(--surface2)" : "var(--surface)",
                  padding: "12px 14px",
                  opacity: isRejected ? 0.5 : 1,
                  transition: "all 0.15s",
                }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase",
                      padding: "2px 7px", borderRadius: 99,
                      color: PRIORITY_COLOR[s.priority] ?? "#64748b",
                      background: PRIORITY_BG[s.priority] ?? "transparent",
                    }}>{s.priority}</span>
                    <span style={{ fontSize: 10.5, color: "var(--dim)", letterSpacing: -0.1 }}>{s.section}</span>
                  </div>

                  {/* Original → Suggested */}
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6, lineHeight: 1.5, fontStyle: "italic", textDecoration: isAccepted ? "line-through" : "none", opacity: isAccepted ? 0.6 : 1 }}>
                    {s.original}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 8 }}>
                    <span style={{ color: "var(--green)", fontSize: 11, flexShrink: 0, marginTop: 2 }}>→</span>
                    <span style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.5, fontWeight: isAccepted ? 500 : 400 }}>{s.suggested}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--dim)", lineHeight: 1.45, marginBottom: 10, paddingLeft: 14 }}>
                    {s.reason}
                  </div>

                  {/* Accept / Reject buttons */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => onToggleAccept(s.id)}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
                        borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: isAccepted ? "rgba(52,211,153,0.15)" : "var(--surface2)",
                        color: isAccepted ? "var(--green)" : "var(--muted)",
                        transition: "all 0.12s",
                      }}
                    >
                      {isAccepted ? "Accepted" : "Accept"}
                    </button>
                    <button
                      onClick={() => onToggleReject(s.id)}
                      style={{
                        flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 600,
                        borderRadius: 7, border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: isRejected ? "rgba(248,113,113,0.1)" : "var(--surface2)",
                        color: isRejected ? "var(--red)" : "var(--muted)",
                        transition: "all 0.12s",
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
        <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={onGenerate}
          disabled={generating}
          style={{
            flex: 1, padding: "13px 20px",
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
              ? `Generate PDF with ${accepted.length} improvement${accepted.length > 1 ? "s" : ""} →`
              : "Generate PDF without changes →"
          )}
        </button>
      </div>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
        {accepted.length} of {suggestions.length} suggestions accepted
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
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--dim)", marginBottom: 6, letterSpacing: -0.1, textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
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
