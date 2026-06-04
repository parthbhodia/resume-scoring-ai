"use client";

import { useEffect, useState } from "react";
import type { AddressedGapAction, RatingsData, DetailedRatingItem } from "@/lib/types";
import { isDetailedRatings } from "@/lib/types";
import { scoreColor } from "./ratings/scoreColor";
import { OverallSection } from "./ratings/OverallSection";
import { JobTitleSection } from "./ratings/JobTitleSection";
import { CoveredMissingSection } from "./ratings/CoveredMissingSection";
import { KeywordsSection } from "./ratings/KeywordsSection";
import { InterviewSection } from "./ratings/InterviewSection";
import CategoryFixPanel from "./CategoryFixPanel";
import GapFixTabPanel from "./ratings/GapFixTabPanel";

export type Tab = "overall" | "job_title" | "qualifications" | "responsibilities" | "keywords" | "interview" | "gapfix" | "fixes";

const ALWAYS_TABS: Tab[] = ["overall", "job_title", "qualifications", "responsibilities", "keywords", "interview"];

type Impact = "HIGH" | "MEDIUM" | "LOW";

const IMPACT_COLOR: Record<Impact, { color: string; bg: string }> = {
  HIGH:   { color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  MEDIUM: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  LOW:    { color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

const SECTION_ICON: Record<Tab, string> = {
  overall:          "📊",
  job_title:        "💼",
  qualifications:   "🎓",
  responsibilities: "📋",
  keywords:         "🔑",
  interview:        "🎤",
  gapfix:           "⚡",
  fixes:            "✨",
};

const SECTION_IMPACT: Record<Tab, Impact> = {
  overall:          "HIGH",
  job_title:        "HIGH",
  qualifications:   "HIGH",
  responsibilities: "MEDIUM",
  keywords:         "HIGH",
  interview:        "HIGH",
  gapfix:           "HIGH",
  fixes:            "HIGH",
};

const SECTION_DESC: Record<Tab, string> = {
  overall:          "Comprehensive evaluation of your resume against the job description.",
  job_title:        "Analysis of your job title alignment with the target role.",
  qualifications:   "Comparison of your qualifications against required skills and experience.",
  responsibilities: "Review of your role descriptions and impact quantification.",
  keywords:         "ATS keyword optimisation check for skills and technologies.",
  interview:        "Coaching tips on how to position your story for this role in interviews.",
  gapfix:           "Review targeted bullet rewrites for the gap you selected, then apply to your résumé.",
  fixes:            "Review and apply AI-suggested bullet improvements category by category.",
};

type GapFixSuggestion = {
  id: string; section: string; original: string; suggested: string; reason: string; priority: string;
};
type GapFixPanel = { gapName: string; gapNotes: string; suggestions: GapFixSuggestion[] };

type SharedProps = {
  ratings: RatingsData;
  onFixGap?: (item: DetailedRatingItem, gapType: AddressedGapAction["type"]) => void;
  onFixKeyword?: (keyword: string) => void;
  fixingGapName?: string | null;
  gapFixPanel?: GapFixPanel | null;
  gapFixError?: string | null;
  onApplyFix?: (s: GapFixSuggestion) => void | Promise<void>;
  onApplyAllGapFixes?: (suggestions: GapFixSuggestion[]) => void | Promise<void>;
  onDismissFix?: () => void;
  addressedGaps?: ReadonlySet<string>;
  addressedGapActions?: readonly AddressedGapAction[];
  gapFixDrafts?: Record<string, string>;
  onGapFixDraftChange?: (id: string, text: string) => void;
  keyGap?: string;
  strategicTips?: string[];
  interviewQuestions?: string[];
  onGetSuggestions?: () => void;
  suggestionsLoading?: boolean;
  hasSuggestions?: boolean;
  onApplyAllSuggestions?: () => void;
  applyBusy?: boolean;
  activeTab?: Tab;
  onActiveTabChange?: (tab: Tab) => void;
};

function useTailorRatingsState({
  ratings,
  hasSuggestions = false,
  gapFixPanel = null,
  strategicTips,
  interviewQuestions,
  activeTab: activeTabProp,
  onActiveTabChange,
}: Pick<SharedProps, "ratings" | "hasSuggestions" | "gapFixPanel" | "strategicTips" | "interviewQuestions" | "activeTab" | "onActiveTabChange">) {
  const [activeTabInternal, setActiveTabInternal] = useState<Tab>("overall");
  const activeTab = activeTabProp ?? activeTabInternal;
  const setActiveTab = (t: Tab) => {
    setActiveTabInternal(t);
    onActiveTabChange?.(t);
  };

  if (!isDetailedRatings(ratings)) {
    return null;
  }

  const {
    overall_score,
    job_title,
    qualifications,
    responsibilities,
    keywords,
    whats_working,
    gaps,
    verdict,
  } = ratings;

  const tabOrder: Tab[] = [
    ...ALWAYS_TABS,
    ...(gapFixPanel ? (["gapfix"] as Tab[]) : []),
    ...(hasSuggestions ? (["fixes"] as Tab[]) : []),
  ];

  type NavTab = { id: Tab; label: string; score: string; color: string };
  const navTabs: NavTab[] = [
    { id: "overall", label: "Overall Match", score: `${overall_score}%`, color: scoreColor(overall_score) },
    { id: "job_title", label: "Job Title", score: `${job_title.score}%`, color: scoreColor(job_title.score) },
    {
      id: "qualifications",
      label: "Qualifications",
      score: `${qualifications.covered.length}/${qualifications.covered.length + qualifications.missing.length}`,
      color: scoreColor(qualifications.score),
    },
    {
      id: "responsibilities",
      label: "Responsibilities",
      score: `${responsibilities.covered.length}/${responsibilities.covered.length + responsibilities.missing.length}`,
      color: scoreColor(responsibilities.score),
    },
    {
      id: "keywords",
      label: "Keywords",
      score: keywords.found_count > 0 ? `${keywords.found_count} Found` : "0 Found",
      color: scoreColor(
        keywords.found_count > 0 && keywords.total_count > 0
          ? Math.round((keywords.found_count / keywords.total_count) * 100)
          : 0,
      ),
    },
    {
      id: "interview",
      label: "Interview",
      score: interviewQuestions && interviewQuestions.length > 0
        ? `${interviewQuestions.length} Qs`
        : strategicTips && strategicTips.length > 0
        ? `${strategicTips.length} Tips`
        : "—",
      color: (interviewQuestions?.length ?? 0) > 0 || (strategicTips?.length ?? 0) > 0 ? "#f59e0b" : "var(--dim)",
    },
    ...(gapFixPanel
      ? [{ id: "gapfix" as Tab, label: "⚡ Gap fix", score: `${gapFixPanel.suggestions.length}`, color: "#818cf8" }]
      : []),
    ...(hasSuggestions ? [{ id: "fixes" as Tab, label: "✨ Fixes", score: "Review", color: "#818cf8" }] : []),
  ];

  const tabIdx = tabOrder.indexOf(activeTab);
  const prevTab = tabIdx > 0 ? tabOrder[tabIdx - 1] : null;
  const nextTab = tabIdx < tabOrder.length - 1 ? tabOrder[tabIdx + 1] : null;
  const impact = SECTION_IMPACT[activeTab];
  const impactStyle = IMPACT_COLOR[impact];

  return {
    activeTab,
    setActiveTab,
    overall_score,
    job_title,
    qualifications,
    responsibilities,
    keywords,
    whats_working,
    gaps,
    verdict,
    navTabs,
    prevTab,
    nextTab,
    impact,
    impactStyle,
  };
}

/** Left rail — job match score + category nav (Analyze Improvement Plan analogue). */
export function TailorMatchSidebar({
  ratings,
  hasSuggestions,
  gapFixPanel,
  strategicTips,
  interviewQuestions,
  activeTab: activeTabProp,
  onActiveTabChange,
  collapsed = false,
  onCollapsedChange,
}: Pick<SharedProps, "ratings" | "hasSuggestions" | "gapFixPanel" | "strategicTips" | "interviewQuestions" | "activeTab" | "onActiveTabChange"> & {
  collapsed?: boolean;
  onCollapsedChange?: (c: boolean) => void;
}) {
  const state = useTailorRatingsState({ ratings, hasSuggestions, gapFixPanel, strategicTips, interviewQuestions, activeTab: activeTabProp, onActiveTabChange });
  if (!state) return null;

  const { activeTab, setActiveTab, overall_score, navTabs } = state;
  const sidebarCollapsed = collapsed;

  return (
    <aside
      className="tb-match-sidebar"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        height: "100%",
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
        width: sidebarCollapsed ? 36 : undefined,
        flexShrink: 0,
      }}
    >
      {/* Header — collapse toggle + score (expanded) */}
      <div style={{
        flexShrink: 0,
        padding: sidebarCollapsed ? "10px 4px 8px" : "16px 16px 12px",
        borderBottom: sidebarCollapsed ? "none" : "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {!sidebarCollapsed && (
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.6, flex: 1 }}>
              Job Match
            </div>
          )}
          <button
            type="button"
            title={sidebarCollapsed ? "Expand match sidebar" : "Collapse"}
            onClick={() => onCollapsedChange?.(!sidebarCollapsed)}
            style={{
              width: 28, height: 28, borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface2)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, color: "var(--muted)", flexShrink: 0,
            }}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>
        {!sidebarCollapsed && (
          <div style={{ marginTop: 12, textAlign: "center" }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor(overall_score), letterSpacing: -1.5, lineHeight: 1 }}>
              {overall_score}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Overall match</div>
          </div>
        )}
      </div>

      {/* Nav tabs — hidden when collapsed; just the toggle button is enough */}
      {!sidebarCollapsed && (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
          {navTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isLow = tab.color === "#ef4444" || tab.color === "#f59e0b";
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.label}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: "100%",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  gap: 0,
                  border: "none",
                  borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
                  background: isActive ? "var(--accent-bg)" : "transparent",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  transition: "background 0.15s, color 0.15s",
                  position: "relative",
                }}
              >
                <span style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: (tab.id === "fixes" || tab.id === "gapfix") ? "#818cf8" : (isActive ? "var(--text)" : "var(--muted)"),
                  textAlign: "left",
                }}>
                  {tab.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: isLow ? tab.color : "var(--muted)", flexShrink: 0, marginLeft: 8 }}>
                  {tab.score}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

/** Middle column — active category detail cards. */
export function TailorMatchDetail(props: SharedProps) {
  const state = useTailorRatingsState({
    ratings: props.ratings,
    hasSuggestions: props.hasSuggestions,
    gapFixPanel: props.gapFixPanel,
    strategicTips: props.strategicTips,
    interviewQuestions: props.interviewQuestions,
    activeTab: props.activeTab,
    onActiveTabChange: props.onActiveTabChange,
  });
  // The "gapfix" tab only exists while gapFixPanel is set. If the panel is
  // cleared (fix applied or dismissed) while it's the active tab, the detail
  // panel would render blank — fall back to Overall.
  useEffect(() => {
    if (props.activeTab === "gapfix" && !props.gapFixPanel) {
      props.onActiveTabChange?.("overall");
    }
  }, [props.activeTab, props.gapFixPanel, props.onActiveTabChange]);
  if (!state) return null;

  const {
    activeTab,
    setActiveTab,
    overall_score,
    job_title,
    qualifications,
    responsibilities,
    keywords,
    whats_working,
    gaps,
    verdict,
    navTabs,
    prevTab,
    nextTab,
    impact,
    impactStyle,
  } = state;

  const {
    onFixGap,
    onFixKeyword,
    fixingGapName,
    gapFixPanel,
    gapFixError,
    onApplyFix,
    onApplyAllGapFixes,
    onDismissFix,
    addressedGaps,
    addressedGapActions,
    gapFixDrafts,
    onGapFixDraftChange,
    keyGap,
    strategicTips,
    interviewQuestions,
    onGetSuggestions,
    suggestionsLoading,
    onApplyAllSuggestions,
    applyBusy,
  } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      {activeTab !== "fixes" && activeTab !== "gapfix" && (
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 24px", borderBottom: "1px solid var(--border)",
            background: "var(--surface2)", gap: 12, flexWrap: "wrap", flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 0", minWidth: 0 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "var(--surface)",
              border: "1px solid var(--border)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 18, flexShrink: 0,
            }}>
              {SECTION_ICON[activeTab]}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
                  {navTabs.find((t) => t.id === activeTab)?.label}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 5,
                  background: impactStyle.bg, color: impactStyle.color, letterSpacing: 0.4,
                  textTransform: "uppercase", flexShrink: 0,
                }}>
                  {impact} IMPACT
                </span>
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.4 }}>
                {SECTION_DESC[activeTab]}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button type="button" disabled={!prevTab} onClick={() => prevTab && setActiveTab(prevTab)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: prevTab ? "pointer" : "not-allowed", opacity: prevTab ? 1 : 0.4, fontSize: 14, color: "var(--muted)" }}
            >‹</button>
            <button type="button" disabled={!nextTab} onClick={() => nextTab && setActiveTab(nextTab)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: nextTab ? "pointer" : "not-allowed", opacity: nextTab ? 1 : 0.4, fontSize: 14, color: "var(--muted)" }}
            >›</button>
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: (activeTab === "fixes" || activeTab === "gapfix") ? 0 : "24px 28px" }}>
        {activeTab === "overall" && (
          <OverallSection overallScore={overall_score} jobTitleScore={job_title?.score} verdict={verdict} whats_working={whats_working} gaps={gaps} keywords={keywords} qualifications={qualifications} responsibilities={responsibilities} onNavigate={setActiveTab} />
        )}
        {activeTab === "job_title" && <JobTitleSection jobTitle={job_title} />}
        {activeTab === "qualifications" && (
          <CoveredMissingSection category={qualifications} label="Qualifications" onFixGap={onFixGap} fixingGapName={fixingGapName} addressedGaps={addressedGaps} addressedGapActions={addressedGapActions} />
        )}
        {activeTab === "responsibilities" && (
          <CoveredMissingSection category={responsibilities} label="Responsibilities" onFixGap={onFixGap} fixingGapName={fixingGapName} addressedGaps={addressedGaps} addressedGapActions={addressedGapActions} />
        )}
        {activeTab === "keywords" && (
          <KeywordsSection keywords={keywords} onFixKeyword={onFixKeyword} fixingKeyword={fixingGapName} addressedGaps={addressedGaps} addressedGapActions={addressedGapActions} />
        )}
        {activeTab === "interview" && (
          <InterviewSection keyGap={keyGap} tips={strategicTips} questions={interviewQuestions} onGetSuggestions={onGetSuggestions} suggestionsLoading={suggestionsLoading} />
        )}
        {activeTab === "gapfix" && gapFixPanel && (
          <GapFixTabPanel
            gapFixPanel={gapFixPanel}
            gapFixError={gapFixError}
            onApplyFix={onApplyFix}
            onApplyAllFixes={onApplyAllGapFixes}
            onDismissFix={onDismissFix}
            gapFixDrafts={gapFixDrafts}
            onGapFixDraftChange={onGapFixDraftChange}
            applyBusy={applyBusy}
          />
        )}
        {activeTab === "fixes" && (
          <CategoryFixPanel onApplyAll={onApplyAllSuggestions ?? (() => {})} applyBusy={applyBusy ?? false} />
        )}
      </div>
    </div>
  );
}

export default function DetailedRatingsView(props: SharedProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: sidebarCollapsed ? "44px 1fr" : "220px 1fr",
        gap: 0,
        borderRadius: "var(--radius-xl, 16px)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
        transition: "grid-template-columns 0.22s ease",
      }}
    >
      <TailorMatchSidebar
        {...props}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      />
      <TailorMatchDetail {...props} />
    </div>
  );
}

