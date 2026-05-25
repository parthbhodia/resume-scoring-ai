"use client";

import { useState } from "react";
import type { RatingsData, DetailedRatingItem } from "@/lib/types";
import { isDetailedRatings } from "@/lib/types";
import { scoreColor } from "./ratings/scoreColor";
import { ScorePill } from "./ratings/ScorePill";
import { OverallSection } from "./ratings/OverallSection";
import { JobTitleSection } from "./ratings/JobTitleSection";
import { CoveredMissingSection } from "./ratings/CoveredMissingSection";
import { KeywordsSection } from "./ratings/KeywordsSection";

type Tab = "overall" | "job_title" | "qualifications" | "responsibilities" | "keywords";

export default function DetailedRatingsView({
  ratings,
  onFixGap,
}: {
  ratings: RatingsData;
  onFixGap?: (item: DetailedRatingItem) => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("overall");

  if (!isDetailedRatings(ratings)) return null;

  const { overall_score, job_title, qualifications, responsibilities, keywords, whats_working, gaps, verdict } = ratings;

  const tabs: { id: Tab; label: string; score: string; color: string }[] = [
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
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: 0,
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* ── Left sidebar nav ───────────────────────────────── */}
      <div
        style={{
          borderRight: "1px solid var(--border)",
          background: "var(--surface2)",
          padding: "16px 0",
        }}
      >
        {/* Score header */}
        <div
          style={{
            padding: "8px 20px 16px",
            borderBottom: "1px solid var(--border)",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: "var(--dim)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            Job Match Score
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: scoreColor(overall_score),
              letterSpacing: -1.5,
              lineHeight: 1,
            }}
          >
            {overall_score}
          </div>
        </div>

        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 20px",
              border: "none",
              background: activeTab === tab.id ? "var(--surface)" : "transparent",
              borderLeft:
                activeTab === tab.id
                  ? "3px solid var(--accent)"
                  : "3px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "background 0.12s",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 600 : 500,
                color: activeTab === tab.id ? "var(--text)" : "var(--muted)",
                textAlign: "left",
                lineHeight: 1.3,
              }}
            >
              {tab.label}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: tab.color,
                flexShrink: 0,
                marginLeft: 8,
              }}
            >
              {tab.score}
            </span>
          </button>
        ))}
      </div>

      {/* ── Right detail panel ─────────────────────────────── */}
      <div
        style={{
          padding: "24px 28px",
          minHeight: 400,
          overflowY: "auto",
          maxHeight: 700,
        }}
      >
        {activeTab === "overall" && (
          <OverallSection verdict={verdict} whats_working={whats_working} gaps={gaps} />
        )}

        {activeTab === "job_title" && <JobTitleSection jobTitle={job_title} />}

        {activeTab === "qualifications" && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--dim)",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Qualifications
              </div>
              <ScorePill
                score={qualifications.covered.length}
                total={qualifications.covered.length + qualifications.missing.length}
                label="met"
              />
            </div>
            <CoveredMissingSection category={qualifications} onFixGap={onFixGap} />
          </div>
        )}

        {activeTab === "responsibilities" && (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--dim)",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                Responsibilities
              </div>
              <ScorePill
                score={responsibilities.covered.length}
                total={responsibilities.covered.length + responsibilities.missing.length}
                label="covered"
              />
            </div>
            <CoveredMissingSection category={responsibilities} onFixGap={onFixGap} />
          </div>
        )}

        {activeTab === "keywords" && <KeywordsSection keywords={keywords} />}
      </div>
    </div>
  );
}
