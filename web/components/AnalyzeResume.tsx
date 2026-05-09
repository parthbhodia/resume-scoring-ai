"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent } from "react";
import { useRouter } from "next/navigation";
import ScoreRing from "./ScoreRing";
import BulletImprovedEditor from "./BulletImprovedEditor";
import {
  bulletMatchesAnalysisCategory,
  inferPrimaryCategoryFromBullet,
} from "@/lib/analysisCategoryMatch";
import { apiUrl } from "@/lib/utils";
import { useResumeAnalyzeStore } from "@/store/resumeAnalyzeStore";
import { getSupabaseClient, fetchAnalyses, insertAnalysis, deleteAnalysis } from "@/lib/supabase";
import type { AnalyzeRecord } from "@/lib/supabase";
import AnalyzePreviewPane from "@/components/AnalyzePreviewPane";

// ── Interfaces ────────────────────────────────────────────────────────────────
// Full strongly-typed shape of the AI analysis response.
// AnalyzeRecord is imported from @/lib/supabase (result typed as `any` for
// JSON column flexibility); we cast result → AnalysisResult when reading.

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
  summary: string;
  topStrengths: string[];
  topIssues: Array<{
    issue: string;
    severity: "low" | "medium" | "high";
    whyItMatters: string;
    suggestion: string;
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
  }>;
  /** Plain text from PDF/LaTeX extraction — drives live preview when present. */
  extractedText?: string;
  /** Name + contact lines extracted before the first section heading. */
  resumeHeader?: string[];
  sectionFeedback: Array<{ section: string; score: number; feedback: string }>;
  rewriteSuggestions: Array<{ before: string; after: string; reason: string }>;
  finalRecommendations: string[];
}


// ── Helpers ───────────────────────────────────────────────────────────────────


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

const LOADING_MESSAGES = [
  "Extracting resume text…",
  "Running structural checks…",
  "AI is analyzing bullets…",
  "Generating suggestions…",
];

const CATEGORY_LABELS: Array<{ key: keyof AnalysisResult["categoryScores"]; label: string }> = [
  { key: "readability", label: "Readability" },
  { key: "atsCompatibility", label: "ATS Safety" },
  { key: "jobMatch", label: "Job Match" },
  { key: "achievementQuality", label: "Achievement" },
  { key: "quantification", label: "Quantification" },
  { key: "sectionStructure", label: "Structure" },
  { key: "languageQuality", label: "Language" },
  { key: "technicalBranding", label: "Tech Brand" },
];

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
  quantification:     "Recruiters look for hard numbers, percentages, and metrics that prove scale and impact. Bullets without data are forgettable — bullets with data are memorable.",
  achievementQuality: "Your resume should be achievement-focused, not task-focused. Great bullets describe outcomes and impact, not just responsibilities you held.",
  languageQuality:    "Strong resumes use active, powerful language. Passive voice, clichés, and filler words weaken your narrative and make it harder to stand out.",
  readability:        "A readable resume can be skimmed in 6 seconds by a recruiter. Short, clear bullets with strong openers help you get noticed faster.",
  atsCompatibility:   "ATS systems scan resumes before a human sees them. Poor formatting, missing keywords, or non-standard headings can get you filtered out automatically.",
  sectionStructure:   "A well-structured resume has the right sections in the right order, making it easy for recruiters to find what they need quickly.",
  technicalBranding:  "Your technical profile should clearly communicate your stack and depth. Weak technical branding makes it hard for employers to match you to the right roles.",
  jobMatch:           "How well your resume keywords and experience match the target job description. Higher match means a higher chance of passing ATS filters.",
};

// Map top-issue text keywords to category keys for smart linking
const ISSUE_TEXT_TO_CATEGORY: Array<{ patterns: string[]; key: keyof AnalysisResult["categoryScores"] }> = [
  { patterns: ["quantif", "metric", "number", "data", "measur"], key: "quantification" },
  { patterns: ["achievement", "impact", "action", "result", "accomplishment"], key: "achievementQuality" },
  { patterns: ["language", "verb", "passive", "buzzword", "communication", "word"], key: "languageQuality" },
  { patterns: ["readab", "length", "format", "clarity", "long", "short"], key: "readability" },
  { patterns: ["ats", "applicant", "tracking", "keyword", "scan"], key: "atsCompatibility" },
  { patterns: ["section", "structure", "summary", "objective", "order"], key: "sectionStructure" },
  { patterns: ["technical", "skill", "stack", "technology", "branding"], key: "technicalBranding" },
  { patterns: ["job match", "fit", "requirement", "relevance"], key: "jobMatch" },
];

function guessIssueCategory(issueText: string): keyof AnalysisResult["categoryScores"] | null {
  const lower = issueText.toLowerCase();
  for (const { patterns, key } of ISSUE_TEXT_TO_CATEGORY) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return null;
}

function getBulletsForCategory(
  key: string,
  bulletAnalysis: AnalysisResult["bulletAnalysis"]
): AnalysisResult["bulletAnalysis"] {
  return bulletAnalysis.filter((b) => bulletMatchesAnalysisCategory(b, key));
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
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const lastPdfRef = useRef<File | null>(null);
  const [dragging, setDragging]         = useState(false);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [result, setResult]             = useState<AnalysisResult | null>(null);
  const [jd, setJd]                     = useState("");
  const [loadingMsg, setLoadingMsg]     = useState(0);
  const [expandedBullets, setExpandedBullets] = useState<Record<number, boolean>>({});
  const [historyOpen, setHistoryOpen]   = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  /** Accordion for category-detail flagged bullets (`bulletAnalysis` index, or null = all collapsed). */
  const [expandedFlaggedBulletIdx, setExpandedFlaggedBulletIdx] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen]       = useState(true);
  /** Desktop: hide left improvement plan sidebar for more reading space (mobile overlay unchanged). Always starts open — not persisted across visits. */
  const [improvementPlanVisible, setImprovementPlanVisible] = useState(true);
  const [selectedBulletIndex, setSelectedBulletIndex] = useState<number | null>(null);
  /** Library folder when last run used analyze-folder; PDF file via lastPdfRef otherwise */
  const [linkedFolder, setLinkedFolder]               = useState<string | null>(null);
  /** True only for the current analyze run (lost when restoring from history) */
  const [builderLinkReady, setBuilderLinkReady]       = useState(false);
  const [builderOpening, setBuilderOpening]           = useState(false);
  const [azHistory, setAzHistory]           = useState<AnalyzeRecord[]>([]);
  const [userId, setUserId]                 = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  /** Draft text for AI improved bullets keyed by bulletAnalysis index */
  const [rewriteEdits, setRewriteEdits] = useState<Record<number, string>>({});
  const previewLineOverrides = useResumeAnalyzeStore((s) => s.lineOverrides);

  // Load user + history on mount: Supabase first, localStorage fallback
  useEffect(() => {
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user?.id) { setLoadingHistory(false); return; }
      setUserId(user.id);
      // Seed from localStorage immediately so UI isn't empty while fetching
      setAzHistory(lsLoad(user.id));
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

  // Cycle loading messages every 3s
  useEffect(() => {
    if (!loading) { setLoadingMsg(0); return; }
    const iv = setInterval(() => setLoadingMsg(m => (m + 1) % LOADING_MESSAGES.length), 3000);
    return () => clearInterval(iv);
  }, [loading]);

  useEffect(() => {
    if (!result) {
      useResumeAnalyzeStore.getState().reset();
      return;
    }
    useResumeAnalyzeStore.getState().hydrateFromAnalysis({
      extractedText: result.extractedText,
      bulletAnalysis: result.bulletAnalysis,
      resumeHeader: result.resumeHeader,
    });
  }, [result]);

  // Persist result to Supabase + localStorage
  const persistResult = useCallback(async (label: string, res: AnalysisResult) => {
    const optimistic: AnalyzeRecord = {
      id:        `local_${Date.now()}`,
      label,
      score:     res.overallScore,
      createdAt: new Date().toISOString(),
      result:    res,
    };
    // Optimistic update — show instantly
    setAzHistory(prev => [optimistic, ...prev].slice(0, 20));
    if (userId) lsPush(userId, optimistic);

    try {
      const newId = await insertAnalysis(label, res);
      if (newId) {
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
    setRewriteEdits({});
    setExpandedBullets({});
    setActiveCategory(null);
    setPreviewOpen(true);
    setImprovementPlanVisible(true);
    setSelectedBulletIndex(null);
    setBuilderLinkReady(false);
    setLinkedFolder(null);
    lastPdfRef.current = file;
    const fd = new FormData();
    fd.append("file", file);
    if (jd.trim()) fd.append("jd", jd);
    try {
      const resp = await fetch(apiUrl("/api/analyze-upload"), { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      const res = json as AnalysisResult;
      setResult(res);
      setBuilderLinkReady(true);
      persistResult(file.name.replace(/\.pdf$/i, ""), res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      lastPdfRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [jd, persistResult]);

  const runFolder = useCallback(async (folder: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setRewriteEdits({});
    setExpandedBullets({});
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setPreviewOpen(true);
    setImprovementPlanVisible(true);
    setBuilderLinkReady(false);
    setLinkedFolder(null);
    lastPdfRef.current = null;
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
      const res = json as AnalysisResult;
      setResult(res);
      setLinkedFolder(folder);
      setBuilderLinkReady(true);
      persistResult(folder, res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [jd, persistResult]);

  // Restore a cached result instantly — no re-analysis needed
  const restoreRecord = useCallback((rec: AnalyzeRecord) => {
    setResult(rec.result);
    setRewriteEdits({});
    setExpandedBullets({});
    setHistoryOpen(false);
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setBuilderLinkReady(false);
    setLinkedFolder(null);
    lastPdfRef.current = null;
  }, []);

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

  const continueInBuilder = useCallback(async () => {
    if (!builderLinkReady) return;
    setBuilderOpening(true);
    setError(null);
    try {
      if (linkedFolder) {
        try {
          if (jd.trim()) sessionStorage.setItem("rn_builder_jd_prefill", jd.trim());
          else sessionStorage.removeItem("rn_builder_jd_prefill");
        } catch { /* quota */ }
        router.push(`/?view=builder&base=${encodeURIComponent(linkedFolder)}`);
        return;
      }
      const file = lastPdfRef.current;
      if (!file) {
        setError("Re-upload your PDF once to unlock editing in Résumé Builder — history-only results do not keep the file.");
        return;
      }
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(apiUrl("/api/upload-resume"), { method: "POST", body: fd });
      const json = (await resp.json()) as { error?: string; text?: string };
      if (!resp.ok) throw new Error(json.error ?? "Could not extract text from your PDF.");
      try {
        sessionStorage.setItem("rn_builder_profile_prefill", json.text ?? "");
        if (jd.trim()) sessionStorage.setItem("rn_builder_jd_prefill", jd.trim());
        else sessionStorage.removeItem("rn_builder_jd_prefill");
        sessionStorage.setItem("rn_builder_from_analyze", "1");
      } catch { /* quota */ }
      router.push("/?view=builder&fromAnalyze=1");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open Résumé Builder.");
    } finally {
      setBuilderOpening(false);
    }
  }, [builderLinkReady, linkedFolder, jd, router]);

  const handleBulletLinkedSelect = useCallback(
    (index: number) => {
      useResumeAnalyzeStore.getState().pulseBullet(index);
      setSelectedBulletIndex(index);
      if (!result?.bulletAnalysis[index]) return;
      setActiveCategory(
        inferPrimaryCategoryFromBullet(result.bulletAnalysis[index]) as keyof AnalysisResult["categoryScores"],
      );
    },
    [result],
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
    setExpandedFlaggedBulletIdx(null);
  }, [activeCategory]);

  const onFile = (f: File | null | undefined) => {
    if (!f || !f.name.endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    run(f);
  };

  // Sort issues high → medium → low
  const sortedIssues = result?.topIssues
    ? [...result.topIssues].sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.severity] - order[b.severity];
      })
    : [];

  // Split categories into TOP FIXES (score < 70) vs COMPLETED (score >= 70)
  const topFixCategories = result
    ? CATEGORY_LABELS
        .filter(({ key }) => {
          const s = result.categoryScores[key];
          return s !== null && s !== undefined && s < 70;
        })
        .sort((a, b) => (result.categoryScores[a.key] ?? 100) - (result.categoryScores[b.key] ?? 100))
    : [];

  const completedCategories = result
    ? CATEGORY_LABELS.filter(({ key }) => {
        const s = result.categoryScores[key];
        return s !== null && s !== undefined && s >= 70;
      })
    : [];

  /** Résumé on the right, suggestions on the left (desktop/tablet split). */
  const workspaceSplit = !!(result && previewOpen);

  // For the active category detail view
  const activeCategoryLabel = CATEGORY_LABELS.find(c => c.key === activeCategory)?.label ?? "";
  const activeCategoryScore = activeCategory && result ? result.categoryScores[activeCategory as keyof AnalysisResult["categoryScores"]] : null;
  const activeBullets = activeCategory && result ? getBulletsForCategory(activeCategory, result.bulletAnalysis) : [];
  const relatedTopIssues = activeCategory && result
    ? result.topIssues.filter(issue => {
        const guessed = guessIssueCategory(issue.issue + " " + issue.whyItMatters);
        return guessed === activeCategory;
      })
    : [];

  // Inline copy + editable AI-suggestion drafts (keyed by bulletAnalysis index)
  const [copiedBullet, setCopiedBullet] = useState<number | null>(null);

  const patchBulletRewrite = useCallback((index: number, value: string | null) => {
    setRewriteEdits(prev => {
      const next = { ...prev };
      if (value === null) delete next[index];
      else next[index] = value;
      return next;
    });
  }, []);

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

  const startOverAnalyze = useCallback(() => {
    setResult(null);
    setError(null);
    setExpandedBullets({});
    setJd("");
    setHistoryOpen(false);
    setActiveCategory(null);
    setSelectedBulletIndex(null);
    setBuilderLinkReady(false);
    setLinkedFolder(null);
    lastPdfRef.current = null;
    setRewriteEdits({});
  }, []);

  /* ── Shared sidebar content ─────────────────── */
  const sidebarContent = (
    <>
      {result ? (
        <>
          {/* Analyze another — top of sidebar (same actions as main CTA) */}
          <div style={{
            marginBottom: 16,
            paddingBottom: 16,
            borderBottom: "1px solid var(--border)",
          }}>
            <div style={{
              fontFamily: "'Cormorant Garant', Georgia, serif",
              fontSize: 17, fontWeight: 600, letterSpacing: -0.35,
              color: "var(--text)", marginBottom: 6, lineHeight: 1.25,
            }}>
              Ready to analyze another?
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, marginBottom: 12 }}>
              Upload a new résumé PDF or paste a different job description to get a fresh score and set of recommendations.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  width: "100%", padding: "10px 14px", borderRadius: 9,
                  background: "var(--amber)", border: "none", color: "#fff",
                  fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  transition: "opacity var(--transition)",
                  letterSpacing: -0.15, fontFamily: "inherit", boxSizing: "border-box",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 2v9M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M2 13h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                Upload new résumé
              </button>
              <button
                type="button"
                onClick={startOverAnalyze}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  width: "100%", padding: "9px 14px", borderRadius: 9,
                  background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--muted)",
                  fontSize: 12.5, fontWeight: 500, cursor: "pointer",
                  transition: "background var(--transition), border-color var(--transition)",
                  letterSpacing: -0.15, fontFamily: "inherit", boxSizing: "border-box",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--surface3)"; e.currentTarget.style.borderColor = "var(--border-h)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                ← Start over
              </button>
            </div>
          </div>

          {/* Score ring */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#78909c", textTransform: "uppercase", letterSpacing: 1.15, marginBottom: 10, fontFamily: "system-ui, -apple-system, sans-serif" }}>
              Improvement Plan
            </div>
            <ScoreRing score={result.overallScore} size={96} label="" />
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: scoreColor(result.overallScore) }}>
              {scoreLabel(result.overallScore)}
            </div>
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
            Click a category or a bullet — they stay in sync. Copy improved text into your résumé.
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
                  const affectedCount = getBulletsForCategory(key, result.bulletAnalysis).length;
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
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                          background: "rgba(248,113,113,0.12)", color: "var(--red)", flexShrink: 0,
                        }}>
                          {affectedCount}
                        </span>
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
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                        <circle cx="6" cy="6" r="5" fill="rgba(52,211,153,0.15)" stroke="var(--green)" strokeWidth="1.2"/>
                        <path d="M3.5 6l2 2 3-3" stroke="var(--green)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span style={{ flex: 1, fontSize: 11.5, fontWeight: 500, color: "var(--muted)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", flexShrink: 0 }}>
                        {score ?? "–"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Pre-result: analyze history from localStorage */
        <>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 14, fontFamily: "'Cormorant Garant', Georgia, serif" }}>
            Recent Analyses
          </div>

          {loadingHistory ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
                  <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div className="skeleton" style={{ height: 11, borderRadius: 3, width: "75%" }} />
                    <div className="skeleton" style={{ height: 10, borderRadius: 3, width: "55%" }} />
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
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {azHistory.map(rec => (
                <div
                  key={rec.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "9px 10px", borderRadius: 8,
                    border: "1px solid var(--border)", background: "transparent",
                    transition: "background var(--transition), border-color var(--transition)",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--amber-bg)"; (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(196,121,58,0.3)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)"; }}
                >
                  {/* Score badge + label — clicking restores result */}
                  <button
                    onClick={() => restoreRecord(rec)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 8,
                      background: "none", border: "none", cursor: "pointer",
                      textAlign: "left", fontFamily: "inherit", padding: 0, minWidth: 0,
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: "var(--surface2)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: scoreColor(rec.score),
                    }}>
                      {rec.score}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {rec.label}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 1 }}>
                        {new Date(rec.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteRecord(rec.id)}
                    title="Remove"
                    style={{
                      width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                      border: "none", background: "transparent",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      color: "var(--dim)", transition: "background var(--transition), color var(--transition)",
                      padding: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,113,113,0.15)"; e.currentTarget.style.color = "var(--red)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--dim)"; }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );

  return (
    <div
      className={`az-shell${improvementPlanVisible ? "" : " az-desktop-sidebar-hidden"}`}
      style={{
        display: "flex",
        width: "100%",
        ...(workspaceSplit
          ? { flex: 1, minHeight: 0, overflow: "hidden" as const }
          : { minHeight: "100vh", overflow: "visible" as const }),
        background: "var(--bg)",
        position: "relative",
      }}
    >

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

        /* ── Desktop: inline sticky sidebar (never overlays content) ── */
        .az-sidebar {
          width: 272px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          padding: 20px 14px;
          box-sizing: border-box;
          position: sticky;
          top: 0;
          height: 100vh;
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

        /* Desktop scrim never shows — sidebar is inline, not overlaying */
        .az-sidebar-scrim-desktop { display: none !important; }
        /* Restore FAB not needed — toggle button in header serves this */
        .az-sidebar-restore-fab { display: none !important; }

        /* Mobile: keep slide-over overlay (screen too narrow for inline) */
        .az-sidebar-scrim-mobile { display: none; }
        @media (max-width: 767px) {
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
            overflow-y: auto;
            border-right-color: var(--border);
          }
          .az-main { padding: 20px 16px 60px !important; }
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
        @media (min-width: 768px) {
          .az-desktop-sidebar-toggle { display: inline-flex; }
        }

        @media (prefers-reduced-motion: reduce) {
          .az-sidebar { transition-duration: 0.01ms !important; }
          .az-sidebar-scrim-mobile { animation: none !important; opacity: 1; }
        }

        .az-analyze-sidebar-toggle-row { display: none; }
        @media (min-width: 768px) {
          .az-analyze-sidebar-toggle-row {
            display: flex;
            justify-content: flex-end;
            width: 100%;
            margin-bottom: 16px;
          }
        }
        .az-mobile-only { display: flex; }
        @media (min-width: 768px) { .az-mobile-only { display: none !important; } }
      `}</style>
      <aside className={`az-sidebar${historyOpen ? " open" : ""}`}>
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
              title="Hide improvement plan — more space to read"
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
        {sidebarContent}
      </aside>

      {/* Desktop: bring back improvement plan */}
      <button
        type="button"
        className="az-sidebar-restore-fab"
        onClick={() => setImprovementPlanVisible(true)}
        title="Show improvement plan"
        style={{
          position: "fixed",
          left: 0,
          top: "42%",
          transform: "translateY(-50%)",
          zIndex: 1001,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          padding: "10px 5px 12px",
          borderRadius: "0 10px 10px 0",
          border: "1px solid var(--border)",
          borderLeft: "none",
          background: "var(--surface)",
          boxShadow: "2px 0 12px rgba(0,0,0,0.06)",
          cursor: "pointer",
          fontFamily: "inherit",
          color: "var(--muted)",
          transition: "background var(--transition), color var(--transition)",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "var(--surface2)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "var(--surface)";
          e.currentTarget.style.color = "var(--muted)";
        }}
      >
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
          <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            maxHeight: 88,
          }}
        >
          Sidebar
        </span>
      </button>
      <main
        className={`az-main${workspaceSplit ? " az-main-workspace-split" : ""}`}
        style={{
          flex: 1,
          ...(workspaceSplit ? {
            display: "grid",
            gridTemplateColumns: "minmax(300px,min(472px, 44vw)) 1fr",
            gridTemplateRows: "minmax(0, 1fr)",
            overflow: "hidden",
            padding: 0,
            minHeight: 0,
            width: "100%",
          } : {
            overflowY: "auto",
            padding: "28px 36px",
          }),
          minWidth: 0,
        }}
      >

        <style>{`
          @media (max-width: 767px) {
            .az-history-bar     { display: flex !important; }
            .az-mobile-score    { display: block !important; }
            .az-main:not(.az-main-workspace-split) {
              padding: 16px 14px 60px !important;
            }
          }
          @media (max-width: 767px) {
            .az-main.az-main-workspace-split {
              display: flex !important;
              flex-direction: column-reverse !important;
              overflow-y: auto !important;
              padding: 16px 0 60px !important;
            }
            .az-split-resume-slot {
              min-height: 42vh !important;
              border-left: none !important;
              border-bottom: 1px solid var(--border) !important;
            }
            .az-split-work-slot {
              padding: 12px 16px 48px !important;
            }
          }
        `}</style>

        {/* ── Mobile-only score card (shown when result exists) ── */}
        {result && (
          <div className="az-mobile-score" style={{ display: "none", marginBottom: 20 }}>
            {/* Score row */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "18px 16px", marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <ScoreRing score={result.overallScore} size={80} label="" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "'Cormorant Garant', Georgia, serif", marginBottom: 4 }}>
                    Resume Score
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: scoreColor(result.overallScore), lineHeight: 1 }}>
                    {result.overallScore}
                    <span style={{ fontSize: 14, fontWeight: 400, color: "var(--dim)" }}>/100</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: scoreColor(result.overallScore), marginTop: 2 }}>
                    {scoreLabel(result.overallScore)}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => {
                    setResult(null); setError(null); setExpandedBullets({});
                    setActiveCategory(null); setSelectedBulletIndex(null);
                    setBuilderLinkReady(false); setLinkedFolder(null);                     lastPdfRef.current = null;
                    setRewriteEdits({});
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
                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: score === null ? "var(--dim)" : color }}>
                        {score === null ? "–" : score}
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 2, background: "var(--surface2)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: score === null ? "var(--border)" : color, transition: "width 0.9s cubic-bezier(0.16,1,0.3,1)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile history toggle bar (pre-result only) */}
        {!result && (
          <div className="az-history-bar" style={{ display: "none", marginBottom: 16 }}>
            <button
              onClick={() => setHistoryOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--surface)",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, color: "var(--muted)",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {azHistory.length > 0 ? `Recent Analyses (${azHistory.length})` : "Recent Analyses"}
            </button>
          </div>
        )}

        {/* Desktop: hide score/history rail for a wider upload area */}
        {!result && !loading && (
          <div className="az-analyze-sidebar-toggle-row">
            <button
              type="button"
              onClick={() => setImprovementPlanVisible(o => !o)}
              title={improvementPlanVisible ? "Hide score sidebar" : "Show score sidebar"}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: 8,
                border: "1px solid var(--border)",
                background: improvementPlanVisible ? "var(--surface2)" : "var(--accent-bg)",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 600,
                color: improvementPlanVisible ? "var(--muted)" : "var(--accent)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <rect x="2" y="3" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
                <rect x="7" y="3" width="7" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity={improvementPlanVisible ? 1 : 0.4} />
              </svg>
              {improvementPlanVisible ? "Hide sidebar" : "Show sidebar"}
            </button>
          </div>
        )}

        {/* Pre-result upload state */}
        {!result && !loading && (
          <div style={{ maxWidth: 560, margin: "0 auto" }}>
            {/* JD textarea */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
                Paste job description (optional — unlocks keyword analysis)
              </label>
              <textarea
                value={jd}
                onChange={e => setJd(e.target.value)}
                placeholder="Paste the job description here to get tailored keyword matching and job fit scoring…"
                rows={5}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--text)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  resize: "vertical",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
                borderRadius: 16,
                padding: "56px 32px",
                cursor: "pointer",
                background: dragging ? "rgba(99,102,241,0.04)" : "var(--surface)",
                transition: "border-color 0.15s, background 0.15s",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                Drop your resume PDF here
              </div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                or click to browse — we&apos;ll give you a full AI-powered report
              </div>
            </div>

            {error && (
              <div style={{ marginTop: 12, fontSize: 13, color: "var(--red)" }}>{error}</div>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, paddingTop: 100 }}>
            <Spinner size={28} />
            <span style={{ fontSize: 15, color: "var(--muted)", fontWeight: 500, transition: "opacity 0.3s" }}>
              {LOADING_MESSAGES[loadingMsg]}
            </span>
          </div>
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
            <AnalyzePreviewPane
              sectionFeedback={result.sectionFeedback}
              activeCategory={activeCategory}
              rewriteEdits={rewriteEdits}
              patchBulletRewrite={patchBulletRewrite}
              patchPreviewLine={patchPreviewLine}
              selectedBulletIndex={selectedBulletIndex}
              onBulletLinkedSelect={handleBulletLinkedSelect}
              presentationOnly
              onOpenBuilder={continueInBuilder}
              builderReady={builderLinkReady}
              builderOpening={builderOpening}
            />
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
        {/* ── Preview toggle bar ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 20,
          }}>
            <div style={{ flex: "1 1 220px", minWidth: 0 }}>
              {builderLinkReady && (
                <button
                  type="button"
                  disabled={builderOpening || loading}
                  onClick={() => continueInBuilder()}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: builderOpening || loading ? "wait" : "pointer",
                    fontFamily: "inherit",
                    opacity: builderOpening ? 0.85 : 1,
                  }}
                  title={
                    linkedFolder
                      ? "Open this résumé in Résumé Builder (library draft)."
                      : "Load PDF text into Résumé Builder to tailor or edit bullets."
                  }
                >
                  {builderOpening ? (
                    <>
                      <Spinner size={14} /> Opening…
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M8 3v10M12 11l-4 3-4-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Edit in Résumé Builder
                    </>
                  )}
                </button>
              )}
              {builderLinkReady && (
                <div style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: "var(--dim)",
                  maxWidth: 460,
                  lineHeight: 1.45,
                }}>
                  {linkedFolder
                    ? "Opens your library draft — edit bullets, run ATS checks, tailor to a JD."
                    : "Copies extracted text into Résumé Builder — add JD & company details, then generate or edit bullets."}
                </div>
              )}
            </div>
            <button
              onClick={() => setImprovementPlanVisible(o => !o)}
              className="az-desktop-sidebar-toggle"
              title={improvementPlanVisible ? "Hide score sidebar" : "Show score sidebar"}
              style={{
                alignItems: "center", gap: 6,
                padding: "7px 13px", borderRadius: 8,
                border: "1px solid var(--border)",
                background: improvementPlanVisible ? "var(--surface2)" : "var(--accent-bg)",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 600,
                color: improvementPlanVisible ? "var(--muted)" : "var(--accent)",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                <rect x="2" y="3" width="4" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" />
                <rect x="7" y="3" width="7" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none" opacity={improvementPlanVisible ? 1 : 0.4} />
              </svg>
              {improvementPlanVisible ? "Hide sidebar" : "Show sidebar"}
            </button>
            <button
              onClick={() => setPreviewOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "7px 13px", borderRadius: 8,
                border: `1px solid ${previewOpen ? "var(--accent)" : "var(--border)"}`,
                background: previewOpen ? "var(--accent-bg)" : "var(--surface2)",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 600,
                color: previewOpen ? "var(--accent)" : "var(--muted)",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M5 6h6M5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              {previewOpen ? "Hide annotated preview" : "Show annotated preview"}
            </button>
          </div>

        {workspaceSplit && (
          <p style={{
            margin: "-4px 0 18px",
            fontSize: 12,
            color: "var(--muted)",
            lineHeight: 1.55,
          }}>
            Suggestions and rewrites stay in this column. The preview on the right is read-only tint + metrics — click a bullet to sync with the checklist here.
          </p>
        )}

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
              border: `1px solid ${(activeCategoryScore ?? 0) < 70 ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)"}`,
              borderRadius: 16,
            }}>
              <div style={{
                width: 72, height: 72, borderRadius: 16, flexShrink: 0,
                background: (activeCategoryScore ?? 0) < 70 ? "rgba(248,113,113,0.10)" : "rgba(52,211,153,0.10)",
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
              </div>
            </div>

            {/* "Here's what we found" — bullet impact stat */}
            {result.bulletAnalysis.length > 0 && (
              <div style={{
                padding: "18px 20px",
                background: "#fafbfc",
                border: "1px solid #cfd8dc",
                borderRadius: 12,
                boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.75,
                  color: "#546e7a",
                  marginBottom: 12,
                  fontFamily: "system-ui, sans-serif",
                }}>
                  Here&apos;s what we found
                </div>

                <div style={{
                  display: "flex", alignItems: "flex-start",
                  gap: 12, marginBottom: 14,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "#ffebee",
                    color: "#c62828",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    fontWeight: 800,
                    fontSize: 15,
                    lineHeight: 1,
                  }} aria-hidden>
                    ×
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: "#455a64", lineHeight: 1.65 }}>
                    {activeBullets.length > 0
                      ? `We compared your bullets to what hiring managers expect for ${activeCategoryLabel.toLowerCase()}. Weak lines use a blush highlight in the preview; numbers and percentages get a soft green cue — typical of annotated résumé scorecards.`
                      : `Strong — most bullets already meet expectations for ${activeCategoryLabel.toLowerCase()}. Keep this consistency in every section.`}
                  </p>
                </div>

                <details style={{
                  marginBottom: 14,
                  border: "1px solid #e1e8ed",
                  borderRadius: 10,
                  background: "#fff",
                  padding: "0 14px",
                  fontSize: 13,
                  color: "var(--muted)",
                }}>
                  <summary style={{
                    cursor: "pointer",
                    fontWeight: 600,
                    color: "var(--text)",
                    padding: "11px 0",
                  }}>
                    What do we mean by {activeCategoryLabel.toLowerCase()}?
                  </summary>
                  <div style={{ padding: "0 0 14px", borderTop: "1px solid #eceff1", paddingTop: 12, lineHeight: 1.65 }}>
                    {CATEGORY_DESCRIPTIONS[activeCategory] ?? ""}
                  </div>
                </details>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#78909c", textTransform: "uppercase", letterSpacing: 0.06 }}>
                    Category coverage
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#37474f" }}>
                    <span style={{ color: "#2e7d32", fontWeight: 800 }}>{result.bulletAnalysis.length - activeBullets.length}</span>
                    {" "}of {result.bulletAnalysis.length} bullets look strong here
                  </span>
                </div>
                <div style={{
                  height: 10,
                  borderRadius: 6,
                  overflow: "hidden",
                  background: "#eceff1",
                }}>
                  <div style={{
                    height: "100%",
                    width: "100%",
                    background: (() => {
                      const t = Math.max(result.bulletAnalysis.length, 1);
                      const strong = Math.max(t - activeBullets.length, 0);
                      const g = (strong / t) * 100;
                      return `linear-gradient(90deg, #66bb6a 0%, #66bb6a ${g}%, #ef5350 ${g}%, #ef5350 100%)`;
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
                  What you need to do
                </h3>
                {relatedTopIssues.map((issue, i) => (
                  <div key={i} style={{
                    border: "1px solid var(--border)", borderRadius: 12,
                    padding: "14px 16px", background: "var(--surface)",
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
                    <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                      {issue.whyItMatters}
                    </p>
                    <div style={{
                      background: "var(--surface2)", borderRadius: 8, padding: "10px 14px",
                      fontSize: 13, color: "var(--text)", lineHeight: 1.6,
                      borderLeft: "3px solid var(--accent)",
                    }}>
                      {issue.suggestion}
                    </div>
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
                    const baseImproved = bullet.improvedBullet ?? "";
                    const draft = rewriteEdits[safeIdx] ?? baseImproved;
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
                    const onFlaggedAccordionToggle = () => {
                      handleBulletLinkedSelect(safeIdx);
                      setExpandedFlaggedBulletIdx((prev) => (prev === safeIdx ? null : safeIdx));
                    };
                    return (
                    <div
                      key={safeIdx}
                      data-az-bullet-workspace={safeIdx}
                      style={{
                      border: "1px solid rgba(245,158,11,0.25)",
                      borderLeft: "4px solid #f59e0b",
                      borderRadius: 10,
                      overflow: "hidden",
                      background: isFlaggedAccordionOpen ? "rgba(245,158,11,0.06)" : "rgba(245,158,11,0.03)",
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
                          background: isFlaggedAccordionOpen ? "rgba(245,158,11,0.06)" : "transparent",
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
                          {previewMain}
                          {previewLineAppliedHere && (
                            <span title="Replaced for this Analyze session’s preview." style={{ marginLeft: 6, color: "#fbbf24", fontSize: 11, fontWeight: 700 }}>●</span>
                          )}
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
                      {bullet.issues.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
                          {bullet.issues.map((iss, j) => (
                            <span key={j} style={{
                              fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 10,
                              background: "rgba(248,113,113,0.10)", color: "var(--red)",
                            }}>
                              {iss}
                            </span>
                          ))}
                        </div>
                      )}
                      {bullet.improvedBullet && (
                        <BulletImprovedEditor
                          layout="card"
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
                                padding: "4px 11px", borderRadius: 7,
                                border: `1px solid ${copiedBullet === safeIdx ? "rgba(52,211,153,0.5)" : "rgba(52,211,153,0.3)"}`,
                                background: copiedBullet === safeIdx ? "rgba(52,211,153,0.15)" : "rgba(52,211,153,0.08)",
                                color: "var(--green)", fontSize: 11, fontWeight: 600,
                                cursor: "pointer", fontFamily: "inherit",
                                transition: "all 0.15s",
                              }}
                            >
                              {copiedBullet === safeIdx ? (
                                <>
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                    <rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                                    <rect x="1" y="3" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
                                  </svg>
                                  Copy improved
                                </>
                              )}
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
              </div>
            )}

            {/* If no related issues or bullets */}
            {activeBullets.length === 0 && relatedTopIssues.length === 0 && (
              <div style={{
                padding: "32px", textAlign: "center",
                border: "1px solid var(--border)", borderRadius: 14,
                background: "var(--surface)",
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
                  No specific issues found
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
                  This category looks strong in your resume.
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Full analysis (shown when no category is active) ── */}
        {!activeCategory && (
          <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 760 }}>

            {/* 1. Summary banner */}
            <section>
              <div style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "20px 24px",
              }}>
                <p style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.7, margin: "0 0 16px" }}>
                  {result.summary}
                </p>
                {result.topStrengths.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {result.topStrengths.slice(0, 3).map((s, i) => (
                      <span key={i} style={{
                        fontSize: 12, fontWeight: 600, padding: "4px 12px",
                        borderRadius: 20, background: "rgba(52,211,153,0.12)", color: "var(--green)",
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

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
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>None — great coverage!</span>
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
                  Weakest Bullets — AI Rewrites
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
                    const baseImp = bullet.improvedBullet ?? "";
                    const draftAcc = rewriteEdits[i] ?? baseImp;
                    const previewAcc = previewLineOverrides[i] ?? bullet.originalBullet;
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
                          }}>
                            {previewAcc}
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
                            {bullet.improvedBullet ? (
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
                            ) : null}
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
                    fontFamily: "'Cormorant Garant', Georgia, serif",
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
                  {/* Primary — upload new file */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
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
                    Upload new résumé
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

      {/* ── Right panel (narrow mode when résumé split is off) ── */}
      {result && !workspaceSplit && (
        <div className={`az-resume-panel${previewOpen ? "" : " hidden"}`}>
          <AnalyzePreviewPane
            sectionFeedback={result.sectionFeedback}
            activeCategory={activeCategory}
            rewriteEdits={rewriteEdits}
            patchBulletRewrite={patchBulletRewrite}
            patchPreviewLine={patchPreviewLine}
            selectedBulletIndex={selectedBulletIndex}
            onBulletLinkedSelect={handleBulletLinkedSelect}
            onOpenBuilder={continueInBuilder}
            builderReady={builderLinkReady}
            builderOpening={builderOpening}
          />
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".pdf"
        style={{ display: "none" }}
        onChange={e => onFile(e.target.files?.[0])}
      />
    </div>
  );
}
