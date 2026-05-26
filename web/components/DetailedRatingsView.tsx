"use client";

import { useState } from "react";
import type { RatingsData, DetailedRatingItem } from "@/lib/types";
import { isDetailedRatings } from "@/lib/types";
import { scoreColor } from "./ratings/scoreColor";
import { OverallSection } from "./ratings/OverallSection";
import { JobTitleSection } from "./ratings/JobTitleSection";
import { CoveredMissingSection } from "./ratings/CoveredMissingSection";
import { KeywordsSection } from "./ratings/KeywordsSection";
import { InterviewSection } from "./ratings/InterviewSection";
import CategoryFixPanel from "./CategoryFixPanel";

type Tab = "overall" | "job_title" | "qualifications" | "responsibilities" | "keywords" | "interview" | "fixes";

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
  fixes:            "✨",
};

const SECTION_IMPACT: Record<Tab, Impact> = {
  overall:          "HIGH",
  job_title:        "HIGH",
  qualifications:   "HIGH",
  responsibilities: "MEDIUM",
  keywords:         "HIGH",
  interview:        "HIGH",
  fixes:            "HIGH",
};

const SECTION_DESC: Record<Tab, string> = {
  overall:          "Comprehensive evaluation of your resume against the job description.",
  job_title:        "Analysis of your job title alignment with the target role.",
  qualifications:   "Comparison of your qualifications against required skills and experience.",
  responsibilities: "Review of your role descriptions and impact quantification.",
  keywords:         "ATS keyword optimisation check for skills and technologies.",
  interview:        "Coaching tips on how to position your story for this role in interviews.",
  fixes:            "Review and apply AI-suggested bullet improvements category by category.",
};

type GapFixSuggestion = {
  id: string; section: string; original: string; suggested: string; reason: string; priority: string;
};
type GapFixPanel = { gapName: string; gapNotes: string; suggestions: GapFixSuggestion[] };

export default function DetailedRatingsView({
  ratings,
  onFixGap,
  onFixKeyword,
  fixingGapName,
  gapFixPanel,
  gapFixError,
  onApplyFix,
  onDismissFix,
  keyGap,
  strategicTips,
  interviewQuestions,
  onGetSuggestions,
  suggestionsLoading,
  hasSuggestions,
  onApplyAllSuggestions,
  applyBusy,
}: {
  ratings: RatingsData;
  onFixGap?: (item: DetailedRatingItem) => void;
  /** Called when user clicks "Fix with AI" on a missing keyword */
  onFixKeyword?: (keyword: string) => void;
  fixingGapName?: string | null;
  gapFixPanel?: GapFixPanel | null;
  gapFixError?: string | null;
  onApplyFix?: (s: GapFixSuggestion) => void;
  onDismissFix?: () => void;
  keyGap?: string;
  strategicTips?: string[];
  interviewQuestions?: string[];
  onGetSuggestions?: () => void;
  suggestionsLoading?: boolean;
  /** When true, the ✨ Fixes tab is shown */
  hasSuggestions?: boolean;
  onApplyAllSuggestions?: () => void;
  applyBusy?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overall");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (!isDetailedRatings(ratings)) return null;

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

  const tabOrder: Tab[] = hasSuggestions
    ? [...ALWAYS_TABS, "fixes"]
    : ALWAYS_TABS;

  type NavTab = { id: Tab; label: string; score: string; color: string };
  const navTabs: NavTab[] = [
    {
      id: "overall",
      label: "Overall Match",
      score: `${overall_score}%`,
      color: scoreColor(overall_score),
    },
    {
      id: "job_title",
      label: "Job Title",
      score: `${job_title.score}%`,
      color: scoreColor(job_title.score),
    },
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
    ...(hasSuggestions ? [{
      id: "fixes" as Tab,
      label: "✨ Fixes",
      score: "Review",
      color: "#818cf8",
    }] : []),
  ];

  const tabIdx = tabOrder.indexOf(activeTab);
  const prevTab = tabIdx > 0 ? tabOrder[tabIdx - 1] : null;
  const nextTab = tabIdx < tabOrder.length - 1 ? tabOrder[tabIdx + 1] : null;
  const impact = SECTION_IMPACT[activeTab];
  const { color: impactColor, bg: impactBg } = IMPACT_COLOR[impact];

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
      {/* ── Left sidebar nav ───────────────────────────────── */}
      <div
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface2)",
          padding: "16px 0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Collapse toggle */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: sidebarCollapsed ? "center" : "flex-end",
            padding: sidebarCollapsed ? "0 0 12px" : "0 12px 12px",
          }}
        >
          <button
            type="button"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((c) => !c)}
            style={{
              width: 28, height: 28, borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 13, color: "var(--muted)",
              flexShrink: 0, transition: "background 0.12s",
            }}
          >
            {sidebarCollapsed ? "›" : "‹"}
          </button>
        </div>

        {sidebarCollapsed ? (
          /* ── Collapsed: icon-only rail ── */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: scoreColor(overall_score), marginBottom: 8, lineHeight: 1 }}>
              {overall_score}
            </div>
            {navTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                title={tab.label}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "none",
                  background: activeTab === tab.id ? "var(--accent)" : "transparent",
                  cursor: "pointer", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 15, transition: "background 0.12s",
                }}
              >
                {SECTION_ICON[tab.id]}
              </button>
            ))}
          </div>
        ) : (
          /* ── Expanded: full sidebar ── */
          <>
            {/* Score header */}
            <div style={{ padding: "0 20px 16px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                JOB MATCH SCORE
              </div>
              <div style={{ fontSize: 36, fontWeight: 900, color: scoreColor(overall_score), letterSpacing: -1.5, lineHeight: 1, marginBottom: 8 }}>
                {overall_score}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: "rgba(148,163,184,0.2)", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, overall_score)}%`, height: "100%", borderRadius: 2, background: scoreColor(overall_score) }} />
              </div>
            </div>

            {navTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 20px", border: "none",
                  background: activeTab === tab.id ? "var(--surface)" : "transparent",
                  borderLeft: activeTab === tab.id ? "3px solid var(--accent)" : "3px solid transparent",
                  cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s",
                }}
              >
                <span style={{
                  fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 500,
                  color: tab.id === "fixes"
                    ? (activeTab === "fixes" ? "#818cf8" : "#818cf8")
                    : (activeTab === tab.id ? "var(--text)" : "var(--muted)"),
                  textAlign: "left", lineHeight: 1.3,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {tab.label}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: tab.color, flexShrink: 0, marginLeft: 8 }}>
                  {tab.score}
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* ── Right detail panel ─────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: 400 }}>

        {/* Section header — hidden for fixes tab (CategoryFixPanel has its own header) */}
        {activeTab !== "fixes" && (
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "16px 24px", borderBottom: "1px solid var(--border)",
              background: "var(--surface2)", gap: 12, flexWrap: "wrap",
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
                    background: impactBg, color: impactColor, letterSpacing: 0.4,
                    textTransform: "uppercase", flexShrink: 0,
                  }}>
                    {impact} IMPACT
                  </span>
                </div>
                <div style={{
                  fontSize: 11, color: "var(--dim)", lineHeight: 1.4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {SECTION_DESC[activeTab]}
                </div>
              </div>
            </div>

            {/* Prev / Next nav arrows */}
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                disabled={!prevTab}
                onClick={() => prevTab && setActiveTab(prevTab)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--surface)", cursor: prevTab ? "pointer" : "not-allowed",
                  opacity: prevTab ? 1 : 0.4, fontSize: 14, color: "var(--muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >‹</button>
              <button
                type="button"
                disabled={!nextTab}
                onClick={() => nextTab && setActiveTab(nextTab)}
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--surface)", cursor: nextTab ? "pointer" : "not-allowed",
                  opacity: nextTab ? 1 : 0.4, fontSize: 14, color: "var(--muted)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >›</button>
            </div>
          </div>
        )}

        {/* Tab content */}
        <div style={{
          padding: activeTab === "fixes" ? 0 : "24px 28px",
          overflowY: "auto", maxHeight: 680, flex: 1,
        }}>
          {activeTab === "overall" && (
            <OverallSection
              overallScore={overall_score}
              jobTitleScore={job_title?.score}
              verdict={verdict}
              whats_working={whats_working}
              gaps={gaps}
              keywords={keywords}
              qualifications={qualifications}
              responsibilities={responsibilities}
            />
          )}

          {activeTab === "job_title" && <JobTitleSection jobTitle={job_title} />}

          {activeTab === "qualifications" && (
            <CoveredMissingSection
              category={qualifications}
              label="Qualifications"
              onFixGap={onFixGap}
              fixingGapName={fixingGapName}
              gapFixPanel={gapFixPanel}
              gapFixError={gapFixError}
              onApplyFix={onApplyFix}
              onDismissFix={onDismissFix}
            />
          )}

          {activeTab === "responsibilities" && (
            <CoveredMissingSection
              category={responsibilities}
              label="Responsibilities"
              onFixGap={onFixGap}
              fixingGapName={fixingGapName}
              gapFixPanel={gapFixPanel}
              gapFixError={gapFixError}
              onApplyFix={onApplyFix}
              onDismissFix={onDismissFix}
            />
          )}

          {activeTab === "keywords" && (
            <KeywordsSection
              keywords={keywords}
              onFixKeyword={onFixKeyword}
              fixingKeyword={fixingGapName}
              gapFixPanel={gapFixPanel}
              gapFixError={gapFixError}
              onApplyFix={onApplyFix}
              onDismissFix={onDismissFix}
            />
          )}

          {activeTab === "interview" && (
            <InterviewSection
              keyGap={keyGap}
              tips={strategicTips}
              questions={interviewQuestions}
              onGetSuggestions={onGetSuggestions}
              suggestionsLoading={suggestionsLoading}
            />
          )}

          {activeTab === "fixes" && (
            <CategoryFixPanel
              onApplyAll={onApplyAllSuggestions ?? (() => {})}
              applyBusy={applyBusy ?? false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
