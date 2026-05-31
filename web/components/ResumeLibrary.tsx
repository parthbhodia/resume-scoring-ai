"use client";

/**
 * ResumeLibrary — grid of saved résumés + optional right-hand detail panel (?resume=<folder>).
 *
 * - 2–3 columns desktop, 1 column mobile; score badge by threshold; paper-style preview.
 * - Hover (desktop): overlay with View + Use as base; touch: actions always visible.
 * - Card click → opens detail drawer beside the grid (matches product mockup).
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LibraryResumeDetailPanel from "./LibraryResumeDetailPanel";
import { stashTailorPrefillFromLibrary } from "@/lib/tailorPrefill";
import { displayPdfUrlForResume } from "@/lib/displayResumePdfUrl";
import { fetchLibraryItems, getSupabaseClient, type LibraryItem } from "@/lib/supabase";
import { RESUME_LIBRARY_CHANGED_EVENT } from "@/lib/resumeLibraryEvents";
import { RN_BUILDER_LAYOUT_ONLY_KEY } from "@/lib/resumeTemplateStudioPrefs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "recent" | "score" | "name";
type FilterKey = "all" | "analyzed" | "tailored" | "default";

/** Aligns with Analyze bullet bands: strong ≥70, improvable 55–69, weak &lt;55 */
function matchScoreBand(score: number): "strong" | "mid" | "weak" {
  if (score >= 70) return "strong";
  if (score >= 55) return "mid";
  return "weak";
}

function analysisResult(item: LibraryItem): Record<string, unknown> {
  return item.kind === "analyzed" && item.analysis.result && typeof item.analysis.result === "object"
    ? item.analysis.result as Record<string, unknown>
    : {};
}

function issueLabel(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as Record<string, unknown>;
  for (const key of ["issue", "title", "description", "whyItMatters", "suggestion"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getAnalysisIssues(item: LibraryItem, limit = 2): string[] {
  const issues = analysisResult(item).topIssues;
  if (!Array.isArray(issues)) return [];
  return issues.map(issueLabel).filter(Boolean).slice(0, limit);
}

function getAnalysisExtractedText(item: LibraryItem): string {
  const text = analysisResult(item).extractedText;
  return typeof text === "string" ? text.trim() : "";
}

export default function ResumeLibrary({ onUseAsBase }: {
  onUseAsBase?: (folder: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedFolder = (searchParams?.get("resume") ?? "").trim();
  const selectedAnalysisId = (searchParams?.get("analysis") ?? "").trim();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** `null` until first auth check completes — avoids flashing the wrong empty state. */
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    const supabase = getSupabaseClient();
    let cancelled = false;

    const syncLibrary = async () => {
      setLoadError(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      setSignedIn(!!session?.user?.id);
      setLoading(true);
      try {
        const rows = await fetchLibraryItems();
        if (!cancelled) setItems(rows);
      } catch (e: unknown) {
        console.error("[library] fetchLibraryItems", e);
        if (!cancelled) {
          setItems([]);
          setLoadError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void syncLibrary();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void syncLibrary();
    });

    const onRemoteResumeWrite = () => {
      void syncLibrary();
    };
    if (typeof window !== "undefined") {
      window.addEventListener(RESUME_LIBRARY_CHANGED_EVENT, onRemoteResumeWrite);
    }
    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (typeof window !== "undefined") {
        window.removeEventListener(RESUME_LIBRARY_CHANGED_EVENT, onRemoteResumeWrite);
      }
    };
  }, []);

  const signInWithGoogle = async () => {
    setOauthBusy(true);
    setLoadError(null);
    try {
      const redirectTo =
        typeof window !== "undefined"
          ? window.location.origin + (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
          : undefined;
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) setLoadError(error.message);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setOauthBusy(false);
    }
  };

  const selectedItem = useMemo(() => {
    if (selectedAnalysisId) {
      return items.find(item => item.kind === "analyzed" && item.id === selectedAnalysisId) ?? null;
    }
    if (selectedFolder) {
      return items.find(item => item.kind === "tailored" && item.record.folder === selectedFolder) ?? null;
    }
    return null;
  }, [items, selectedAnalysisId, selectedFolder]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let arr = items.filter(item => {
      if (kindFilter === "analyzed" && item.kind !== "analyzed") return false;
      if (kindFilter === "tailored" && item.kind !== "tailored") return false;
      if (kindFilter === "default" && !item.isDefault) return false;
      if (!f) return true;
      const issueText = item.kind === "analyzed" ? getAnalysisIssues(item).join(" ") : "";
      return `${item.title} ${item.subtitle} ${issueText}`.toLowerCase().includes(f);
    });
    if (sort === "recent") {
      arr = [...arr].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    } else if (sort === "score") {
      arr = [...arr].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    } else {
      arr = [...arr].sort((a, b) => a.title.localeCompare(b.title));
    }
    return arr;
  }, [items, filter, kindFilter, sort]);

  const openItem = (item: LibraryItem) => {
    if (item.kind === "analyzed") {
      router.push(`/?view=library&analysis=${encodeURIComponent(item.id)}`);
      return;
    }
    router.push(`/?view=library&resume=${encodeURIComponent(item.record.folder)}`);
  };

  const closeDetail = () => {
    router.push("/?view=library");
  };

  const useAsBase = (item: LibraryItem) => {
    if (item.kind !== "tailored") return;
    const r = item.record;
    onUseAsBase?.(r.folder);
    stashTailorPrefillFromLibrary(r);
    try {
      sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
    } catch { /* ignore */ }
    router.push(`/?view=builder&flow=tailor&base=${encodeURIComponent(r.folder)}&intent=job`);
  };

  const openAnalysis = (item: LibraryItem) => {
    if (item.kind !== "analyzed") return;
    router.push(`/?view=analyze&analysis=${encodeURIComponent(item.id)}`);
  };

  const tailorFromAnalysis = (item: LibraryItem) => {
    if (item.kind !== "analyzed") return;
    const text = getAnalysisExtractedText(item);
    try {
      if (text) sessionStorage.setItem("rn_builder_profile_prefill", text);
      sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
    } catch { /* ignore */ }
    router.push("/?view=builder&flow=tailor&fromAnalyze=1");
  };

  return (
    <div
      className="library-page fade-in"
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .library-shell {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: row;
          align-items: stretch;
          width: 100%;
        }
        .library-main-scroll {
          flex: 1 1 0%;
          min-width: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          display: flex;
          justify-content: center;
        }
        .library-main-inner {
          width: 100%;
          max-width: 1180px;
          padding: 24px 20px 32px;
          box-sizing: border-box;
        }
        .library-backdrop {
          display: none;
        }
        @media (max-width: 900px) {
          .library-backdrop.is-open {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 199;
            margin: 0;
            padding: 0;
            border: none;
            background: rgba(15, 23, 42, 0.42);
            cursor: pointer;
          }
          .library-detail-panel {
            position: fixed !important;
            top: 0;
            right: 0;
            bottom: 0;
            width: min(100%, 400px) !important;
            max-width: 100vw;
            z-index: 200;
            box-shadow: -12px 0 36px rgba(15, 23, 42, 0.18);
          }
          [data-theme="dark"] .library-backdrop.is-open {
            background: rgba(0, 0, 0, 0.55);
          }
        }
        .library-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
          gap: 16px;
        }
        @media (min-width: 1024px) {
          .library-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .library-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .library-card {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius-xl, 14px);
          box-shadow: var(--shadow-card, 0 1px 4px rgba(0,0,0,0.08));
          overflow: hidden;
          cursor: pointer;
          transition: border-color 0.14s ease, box-shadow 0.14s ease, transform 0.1s ease;
          display: flex;
          flex-direction: column;
          min-height: 280px;
        }
        .library-card:hover {
          border-color: rgba(47, 129, 247, 0.35);
          box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
        }
        [data-theme="dark"] .library-card:hover {
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
        }
        .library-card:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
        }
        .library-card-preview {
          flex-shrink: 0;
          aspect-ratio: 8.5 / 11;
          max-height: 148px;
          background: linear-gradient(180deg, var(--resume-paper-bg, #fff) 0%, var(--surface2) 100%);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        [data-theme="dark"] .library-card-preview {
          background: linear-gradient(180deg, #1e293b 0%, var(--surface2) 100%);
        }
        .library-card-body { padding: 14px 16px 16px; flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .library-card-actions {
          display: flex;
          gap: 8px;
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        @media (min-width: 768px) {
          .library-card-actions--hover {
            position: absolute;
            left: 0; right: 0; bottom: 0;
            z-index: 2;
            padding: 14px 16px 16px;
            background: linear-gradient(to top, var(--surface) 72%, rgba(255,255,255,0) 100%);
            border-top: none;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.12s ease, transform 0.12s ease;
          }
          [data-theme="dark"] .library-card-actions--hover {
            background: linear-gradient(to top, var(--surface) 72%, rgba(22,27,34,0) 100%);
          }
          .library-card:hover .library-card-actions--hover {
            opacity: 1;
            transform: translateY(0);
          }
          .library-card .library-card-actions--static { display: none; }
        }
        @media (max-width: 767px) {
          .library-card-actions--hover { display: none !important; }
          .library-card .library-card-actions--static { display: flex; }
        }
      `}</style>

      {selectedFolder || selectedAnalysisId ? (
        <button
          type="button"
          className={`library-backdrop is-open`}
          aria-label="Close resume details"
          onClick={closeDetail}
        />
      ) : null}

      <div className="library-shell">
        <div className="library-main-scroll">
          <div className="library-main-inner">
            <header
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 16,
                marginBottom: 24,
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                <h1
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: "-0.03em",
                    color: "var(--text)",
                    marginBottom: 6,
                    lineHeight: 1.15,
                  }}
                >
                  Resume Hub
                </h1>
                <p style={{ fontSize: 13.5, color: "var(--muted)", letterSpacing: "-0.02em", lineHeight: 1.55, margin: 0, maxWidth: 520 }}>
                  {loading || signedIn === null
                    ? "Loading…"
                    : signedIn
                      ? `${items.length} saved item${items.length === 1 ? "" : "s"} across Analyze and Builder`
                      : "Sign in to sync analyzed and tailored résumés"}
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
                  } catch { /* ignore */ }
                  router.push("/?view=builder&flow=tailor&intent=job");
                }}
                className="shrink-0"
              >
                + New Resume
              </Button>
            </header>

            {signedIn === false ? (
              <div
                role="region"
                aria-label="Sign in required"
                style={{
                  marginBottom: 18,
                  padding: "14px 16px",
                  borderRadius: "var(--radius-xl, 14px)",
                  border: "1px solid rgba(47, 129, 247, 0.35)",
                  background: "var(--accent-bg)",
                  fontSize: 13,
                  color: "var(--text)",
                  lineHeight: 1.55,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ flex: "1 1 220px", minWidth: 0 }}>
                  The Resume Hub only lists items tied to your account. After you sign in with Google, Analyze runs and
                  Builder exports are saved here automatically.
                </span>
                <Button
                  type="button"
                  disabled={oauthBusy}
                  onClick={() => void signInWithGoogle()}
                  className="shrink-0"
                >
                  {oauthBusy ? "Redirecting…" : "Sign in with Google"}
                </Button>
              </div>
            ) : null}

            {loadError ? (
              <div
                style={{
                  marginBottom: 18,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid rgba(248,113,113,0.35)",
                  background: "var(--red-bg)",
                  color: "var(--red)",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                Could not load your library: {loadError}
              </div>
            ) : null}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18, alignItems: "center" }}>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Search resumes, analyses, issues…"
                aria-label="Search resume hub"
                style={{ flex: "1 1 220px", minWidth: 0 }}
              />
              <select
                value={kindFilter}
                onChange={e => setKindFilter(e.target.value as FilterKey)}
                aria-label="Filter library item type"
                style={{ width: "auto", minWidth: 140, flexShrink: 0 }}
              >
                <option value="all">All</option>
                <option value="analyzed">Analyzed</option>
                <option value="tailored">Tailored</option>
                <option value="default">Default</option>
              </select>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                aria-label="Sort resumes"
                style={{ width: "auto", minWidth: 150, flexShrink: 0 }}
              >
                <option value="recent">Most recent</option>
                <option value="score">Highest score</option>
                <option value="name">Name A-Z</option>
              </select>
            </div>

            {loading ? (
              <div className="library-grid" aria-busy>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className={`h-[300px] rounded-xl stagger-${Math.min(i + 1, 4)}`}
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyLibrary
                hasAny={items.length > 0}
                filter={filter}
                signedIn={signedIn === true}
                onGoBuilder={() => {
                  try {
                    sessionStorage.removeItem(RN_BUILDER_LAYOUT_ONLY_KEY);
                  } catch { /* ignore */ }
                  router.push("/?view=builder&flow=tailor&intent=job");
                }}
              />
            ) : (
              <div className="library-grid">
                {filtered.map((item, i) => (
                  <ResumeCard
                    key={item.key}
                    item={item}
                    isSelected={
                      item.kind === "analyzed"
                        ? selectedAnalysisId === item.id
                        : selectedFolder === item.record.folder
                    }
                    stagger={Math.min(i % 5, 4)}
                    onOpen={() => openItem(item)}
                    onUseAsBase={() => useAsBase(item)}
                    onOpenAnalysis={() => openAnalysis(item)}
                    onTailorAnalysis={() => tailorFromAnalysis(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedFolder || selectedAnalysisId ? (
          <LibraryResumeDetailPanel
            item={selectedItem}
            loading={loading}
            notFound={!loading && !selectedItem}
            onClose={closeDetail}
            onTailorNewJob={() => {
              if (selectedItem) useAsBase(selectedItem);
            }}
            onOpenAnalysis={() => {
              if (selectedItem) openAnalysis(selectedItem);
            }}
            onTailorAnalysis={() => {
              if (selectedItem) tailorFromAnalysis(selectedItem);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function EmptyLibrary({
  hasAny,
  filter,
  signedIn,
  onGoBuilder,
}: {
  hasAny: boolean;
  filter: string;
  signedIn: boolean;
  onGoBuilder: () => void;
}) {
  return (
    <div
      className="scale-in fade-in-up"
      style={{
        padding: "48px 28px",
        textAlign: "center",
        background: "var(--surface)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--radius-xl, 14px)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12, lineHeight: 1 }} aria-hidden>📋</div>
      <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)", marginBottom: 8 }}>
        {hasAny ? "No matches" : signedIn ? "No résumés yet" : "Nothing to show yet"}
      </h2>
      <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, maxWidth: 400, margin: "0 auto 20px" }}>
        {hasAny
          ? `Nothing matches “${filter}”. Try another search or clear the filter.`
          : signedIn
            ? "Analyze a résumé or tailor one to a job posting — saved runs appear here so you can compare, improve, and reuse them."
            : "Use “Sign in with Google” above, then analyze or generate a résumé — successful runs are saved to this hub."}
      </p>
      {!hasAny && signedIn && (
        <Button
          type="button"
          onClick={onGoBuilder}
        >
          Open Résumé Builder
        </Button>
      )}
    </div>
  );
}

function ResumeCard({
  item,
  isSelected,
  stagger,
  onOpen,
  onUseAsBase,
  onOpenAnalysis,
  onTailorAnalysis,
}: {
  item: LibraryItem;
  isSelected?: boolean;
  stagger: number;
  onOpen: () => void;
  onUseAsBase: () => void;
  onOpenAnalysis: () => void;
  onTailorAnalysis: () => void;
}) {
  const displayPdf = useMemo(
    () => item.kind === "tailored" ? displayPdfUrlForResume(item.record) : null,
    [item],
  );
  const sc = item.score;
  const dateStr = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const band = sc != null ? matchScoreBand(sc) : null;
  const issues = item.kind === "analyzed" ? getAnalysisIssues(item) : [];

  const scoreBadge =
    sc != null ? (
      <Badge
        variant="secondary"
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 10px",
          borderRadius: "var(--radius-pill, 99px)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          background:
            band === "strong" ? "var(--green-bg)"
              : band === "mid" ? "var(--amber-bg)"
                : "var(--red-bg)",
          color: band === "strong" ? "var(--green)" : band === "mid" ? "var(--amber)" : "var(--red)",
        }}
      >
        {sc}/100
      </Badge>
    ) : (
      <Badge variant="outline" style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>No score</Badge>
    );

  const actions = (className: string) => (
    <div className={className} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button
        type="button"
        onClick={e => {
          e.stopPropagation();
          if (item.kind === "analyzed") onOpenAnalysis();
          else onOpen();
        }}
        style={actionBtnPrimary}
      >
        {item.kind === "analyzed" ? "Open analysis" : "Details"}
      </Button>
      {item.kind === "analyzed" ? (
        <>
          <Button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onOpenAnalysis();
            }}
            title="Reopen with saved preview edits if available in this browser"
            style={actionBtnGhost}
          >
            Continue edits
          </Button>
          <Button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onTailorAnalysis();
            }}
            style={actionBtnGhost}
          >
            Tailor
          </Button>
          <Button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onOpenAnalysis();
            }}
            title="Open analysis, then use Download PDF from the preview"
            style={actionBtnGhost}
          >
            Export PDF
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onUseAsBase();
            }}
            title="Start the builder with this version as the base"
            style={actionBtnGhost}
          >
            Use as base
          </Button>
          {displayPdf && (
            <a
              href={displayPdf}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="View PDF"
              style={{ ...actionBtnGhost, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
                <path d="M6.5 2v7M3.5 6.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 11h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              View PDF
            </a>
          )}
        </>
      )}
    </div>
  );

  return (
    <article
      role="button"
      tabIndex={0}
      className={`library-card fade-in-up stagger-${stagger + 1}`}
      style={{
        borderWidth: isSelected ? 2 : 1,
        borderColor: isSelected ? "var(--accent)" : "var(--border)",
        boxShadow: isSelected ? "0 0 0 3px rgba(47, 129, 247, 0.18)" : undefined,
      }}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${item.title}, ${item.subtitle}. Open ${item.kind === "analyzed" ? "analysis" : "resume"}.`}
    >
      <div className="library-card-preview">
        {item.kind === "analyzed" ? (
          <div
            style={{
              width: "100%",
              height: "100%",
              padding: 18,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background:
                "radial-gradient(circle at top left, rgba(47,129,247,0.16), transparent 42%), linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <Badge variant="secondary" style={kindBadgeAnalyzed}>Analyzed</Badge>
              {scoreBadge}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ height: 6, width: "78%", borderRadius: 99, background: "var(--border)" }} />
              <div style={{ height: 6, width: "92%", borderRadius: 99, background: "var(--border)" }} />
              <div style={{ height: 6, width: "58%", borderRadius: 99, background: "var(--border)" }} />
            </div>
            <Badge variant="outline" style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Improvement plan saved
            </Badge>
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: 12,
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden style={{ opacity: 0.4 }}>
              <path d="M7 3h8l4 4v14H7V3z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              <path d="M14 3v4h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <Badge variant="secondary" style={kindBadgeTailored}>{item.isDefault ? "Default" : "Tailored"}</Badge>
            {displayPdf ? (
              <Badge
                variant="secondary"
                title={item.record.pdf_url ? "Stored PDF link" : "API PDF path (not saved to library — open to verify)"}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  padding: "4px 10px",
                  borderRadius: "var(--radius-pill, 99px)",
                  background: "var(--accent-bg)",
                }}
              >
                PDF ready
              </Badge>
            ) : (
              <Badge variant="outline" style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                No PDF yet
              </Badge>
            )}
          </div>
        )}
      </div>

      <div className="library-card-body">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          {item.kind === "analyzed" ? <Badge variant="secondary" style={kindBadgeAnalyzed}>Analyzed</Badge> : scoreBadge}
          <time dateTime={item.createdAt} style={{ fontSize: 11, color: "var(--dim)", whiteSpace: "nowrap", flexShrink: 0 }}>
            {dateStr}
          </time>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--text)",
              lineHeight: 1.25,
              marginBottom: 4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.title}
          </h2>
          <p
            style={{
              fontSize: 13,
              color: "var(--muted)",
              letterSpacing: "-0.02em",
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: item.kind === "analyzed" && issues.length ? 1 : 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.subtitle}
          </p>
          {item.kind === "analyzed" && issues.length > 0 && (
            <div style={{ marginTop: 8, display: "grid", gap: 5 }}>
              {issues.map((issue, i) => (
                <div key={`${issue}-${i}`} style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.35, display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--amber)", fontWeight: 800 }}>•</span>
                  <span style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{issue}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {actions("library-card-actions library-card-actions--static")}
      </div>

      {actions("library-card-actions library-card-actions--hover")}
    </article>
  );
}

const kindBadgeAnalyzed: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: "var(--radius-pill, 99px)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  background: "var(--accent-bg)",
  color: "var(--accent)",
};

const kindBadgeTailored: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: "var(--radius-pill, 99px)",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  background: "var(--amber-bg)",
  color: "var(--amber)",
};

const actionBtnPrimary: CSSProperties = {
  flex: "1 1 calc(50% - 4px)",
  minWidth: 92,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: "var(--radius, 8px)",
  border: "none",
  background: "var(--accent)",
  color: "#fff",
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.02em",
};

const actionBtnGhost: CSSProperties = {
  flex: "1 1 calc(50% - 4px)",
  minWidth: 92,
  fontSize: 12,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: "var(--radius, 8px)",
  border: "1px solid var(--border)",
  background: "var(--surface2)",
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "-0.02em",
};
