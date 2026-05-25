"use client";

import { useState } from "react";
import type { RatingsData, DetailedRatingItem, DetailedCategory, JobTitleRating, KeywordsRating, ContextualKeyword } from "@/lib/types";
import { isDetailedRatings } from "@/lib/types";

type Tab = "overall" | "job_title" | "qualifications" | "responsibilities" | "keywords";

function scoreColor(pct: number) {
  if (pct >= 75) return "var(--green, #34d399)";
  if (pct >= 50) return "#f59e0b";
  return "#f87171";
}

function ScorePill({ score, total, label }: { score: number; total?: number; label?: string }) {
  const pct = total ? Math.round((score / total) * 100) : score;
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(pct) }}>
      {total ? `${score}/${total}` : `${score}%`}
      {label && <span style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", marginLeft: 4 }}>{label}</span>}
    </span>
  );
}

function CoveredMissingSection({
  category,
  onFixGap,
}: {
  category: DetailedCategory;
  onFixGap?: (item: DetailedRatingItem) => void;
}) {
  const covered = category.covered ?? [];
  const missing = category.missing ?? [];
  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <div style={{
          flex: 1, padding: "16px 20px", borderRadius: 12,
          background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.2)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--green, #34d399)", letterSpacing: -1 }}>{covered.length}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.4, textTransform: "uppercase", marginTop: 2 }}>✓ Covered</div>
        </div>
        <div style={{
          flex: 1, padding: "16px 20px", borderRadius: 12,
          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#f87171", letterSpacing: -1 }}>{missing.length}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.4, textTransform: "uppercase", marginTop: 2 }}>✕ Missing</div>
        </div>
      </div>

      {/* Missing items */}
      {missing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 11, color: "#f87171", fontWeight: 700 }}>✕</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#f87171", letterSpacing: 0.2 }}>Missing ({missing.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {missing.map((item, i) => (
              <div key={i} style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(248,113,113,0.2)",
                background: "var(--surface)",
                borderLeft: "3px solid #f87171",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: item.analysis ? 8 : 0, lineHeight: 1.4 }}>
                  {item.text}
                </div>
                {item.analysis && (
                  <div style={{ padding: "8px 10px", borderRadius: 7, background: "rgba(248,113,113,0.06)", marginBottom: onFixGap ? 8 : 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#f87171", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 6 }}>Analysis</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{item.analysis}</span>
                  </div>
                )}
                {onFixGap && (
                  <button
                    type="button"
                    onClick={() => onFixGap(item)}
                    style={{
                      marginTop: 6, padding: "4px 12px", borderRadius: 6,
                      border: "1px solid rgba(59,130,246,0.4)",
                      background: "rgba(59,130,246,0.08)", color: "var(--accent)",
                      fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                    }}
                  >
                    Fix this gap →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Covered items */}
      {covered.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 11, color: "var(--green, #34d399)", fontWeight: 700 }}>✓</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.2 }}>Covered ({covered.length})</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {covered.map((item, i) => (
              <div key={i} style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(52,211,153,0.2)",
                background: "var(--surface)",
                borderLeft: "3px solid var(--green, #34d399)",
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: item.context ? 6 : 0, lineHeight: 1.4 }}>
                  {item.text}
                </div>
                {item.context && (
                  <div style={{ padding: "6px 10px", borderRadius: 7, background: "rgba(52,211,153,0.06)" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.4, textTransform: "uppercase", marginRight: 6 }}>Context</span>
                    <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{item.context}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JobTitleSection({ jobTitle }: { jobTitle: JobTitleRating }) {
  return (
    <div>
      <div style={{
        padding: "20px 24px", borderRadius: 12,
        border: `1px solid ${jobTitle.matched ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`,
        background: jobTitle.matched ? "rgba(52,211,153,0.05)" : "rgba(248,113,113,0.05)",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: jobTitle.matched ? "var(--green, #34d399)" : "#f87171" }}>
            {jobTitle.matched ? "✓ Title Match" : "✕ Title Mismatch"}
          </span>
          <ScorePill score={jobTitle.score} label="match" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>JD Title</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{jobTitle.jd_title || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Your Title</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{jobTitle.resume_title || "—"}</div>
          </div>
        </div>
        {jobTitle.detail && (
          <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "var(--surface2)", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
            {jobTitle.detail}
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordsSection({ keywords }: { keywords: KeywordsRating }) {
  const [checkedMissing, setCheckedMissing] = useState<Set<string>>(new Set());

  // Normalise to categorised shape (handles both legacy flat and new schema)
  const dsFound: string[] = keywords.direct_skills?.found ?? keywords.found ?? [];
  const dsMissing: string[] = keywords.direct_skills?.missing ?? keywords.missing ?? [];
  const ctxFound: ContextualKeyword[] = keywords.contextual?.found ?? [];
  const ctxMissing: string[] = keywords.contextual?.missing ?? [];

  const totalFound = dsFound.length + ctxFound.length;
  const totalMissing = dsMissing.length + ctxMissing.length;

  const toggleMissing = (kw: string) => {
    setCheckedMissing(prev => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw); else next.add(kw);
      return next;
    });
  };

  return (
    <div>
      {/* Big summary chips */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <div style={{
          flex: 1, padding: "18px 20px", borderRadius: 14,
          background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.25)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "var(--green, #34d399)", letterSpacing: -1.5, lineHeight: 1 }}>{totalFound}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--green, #34d399)", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 }}>FOUND</div>
        </div>
        <div style={{
          flex: 1, padding: "18px 20px", borderRadius: 14,
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
          textAlign: "center",
        }}>
          <div style={{ fontSize: 36, fontWeight: 900, color: "#f87171", letterSpacing: -1.5, lineHeight: 1 }}>{totalMissing}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 }}>MISSING</div>
        </div>
      </div>

      {/* Missing Direct Skills — checkbox tag cloud */}
      {dsMissing.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            Missing Direct Skills ({dsMissing.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dsMissing.map((kw, i) => {
              const checked = checkedMissing.has(kw);
              return (
                <label
                  key={i}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                    background: checked ? "rgba(248,113,113,0.14)" : "rgba(248,113,113,0.06)",
                    border: `1px solid ${checked ? "rgba(248,113,113,0.45)" : "rgba(248,113,113,0.22)"}`,
                    transition: "background 0.12s, border-color 0.12s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMissing(`ds:${kw}`)}
                    style={{ accentColor: "#f87171", width: 12, height: 12, margin: 0, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>{kw}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Missing Contextual Keywords — checkbox tag cloud */}
      {ctxMissing.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            Missing Contextual Keywords ({ctxMissing.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {ctxMissing.map((kw, i) => {
              const key = `ctx:${kw}`;
              const checked = checkedMissing.has(key);
              return (
                <label
                  key={i}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                    background: checked ? "rgba(248,113,113,0.14)" : "rgba(248,113,113,0.06)",
                    border: `1px solid ${checked ? "rgba(248,113,113,0.45)" : "rgba(248,113,113,0.22)"}`,
                    transition: "background 0.12s, border-color 0.12s",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMissing(key)}
                    style={{ accentColor: "#f87171", width: 12, height: 12, margin: 0, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>{kw}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Found Direct Skills — uppercase bold solid-border tags */}
      {dsFound.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            Found Direct Skills ({dsFound.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {dsFound.map((kw, i) => (
              <span
                key={i}
                style={{
                  padding: "5px 11px", borderRadius: 7,
                  border: "1.5px solid rgba(52,211,153,0.45)",
                  background: "rgba(52,211,153,0.07)",
                  fontSize: 11, fontWeight: 800, color: "var(--green, #34d399)",
                  letterSpacing: 0.6, textTransform: "uppercase",
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Found Contextual Keywords — rows with match count */}
      {ctxFound.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>
            Found Contextual Keywords ({ctxFound.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ctxFound.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 12px", borderRadius: 8,
                  border: "1px solid rgba(52,211,153,0.18)",
                  background: "var(--surface)",
                }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }}>&ldquo;{item.keyword}&rdquo;</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)",
                  background: "rgba(52,211,153,0.1)", borderRadius: 5,
                  padding: "2px 8px", flexShrink: 0, marginLeft: 8,
                }}>
                  {item.count} {item.count === 1 ? "match" : "matches"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
      color: scoreColor(keywords.found_count > 0 && keywords.total_count > 0
        ? Math.round((keywords.found_count / keywords.total_count) * 100)
        : 0),
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 0, borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
      {/* Left sidebar nav */}
      <div style={{ borderRight: "1px solid var(--border)", background: "var(--surface2)", padding: "16px 0" }}>
        {/* Score header */}
        <div style={{ padding: "8px 20px 16px", borderBottom: "1px solid var(--border)", marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Job Match Score</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor(overall_score), letterSpacing: -1.5, lineHeight: 1 }}>{overall_score}</div>
        </div>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 20px", border: "none", background: activeTab === tab.id ? "var(--surface)" : "transparent",
              borderLeft: activeTab === tab.id ? "3px solid var(--accent)" : "3px solid transparent",
              cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s",
            }}
          >
            <span style={{ fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 500, color: activeTab === tab.id ? "var(--text)" : "var(--muted)", textAlign: "left", lineHeight: 1.3 }}>
              {tab.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: tab.color, flexShrink: 0, marginLeft: 8 }}>
              {tab.score}
            </span>
          </button>
        ))}
      </div>

      {/* Right detail panel */}
      <div style={{ padding: "24px 28px", minHeight: 400, overflowY: "auto", maxHeight: 700 }}>
        {activeTab === "overall" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 16 }}>Overview</div>
            {verdict && (
              <div style={{ padding: "14px 16px", borderRadius: 10, background: "var(--surface2)", border: "1px solid var(--border)", marginBottom: 20, fontSize: 13, color: "var(--muted)", lineHeight: 1.6, borderLeft: "3px solid var(--accent)" }}>
                {verdict}
              </div>
            )}
            {whats_working?.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green, #34d399)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>What&apos;s Working</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {whats_working.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--muted)", lineHeight: 1.5, alignItems: "flex-start" }}>
                      <span style={{ color: "var(--green, #34d399)", flexShrink: 0 }}>✓</span>
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {gaps?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#f87171", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 10 }}>Gaps to Address</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {gaps.map((g, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--muted)", lineHeight: 1.5, alignItems: "flex-start" }}>
                      <span style={{ color: "#f87171", flexShrink: 0 }}>→</span>
                      <span>{g}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === "job_title" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 16 }}>Job Title Match</div>
            <JobTitleSection jobTitle={job_title} />
          </div>
        )}
        {activeTab === "qualifications" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>Qualifications</div>
              <ScorePill score={qualifications.covered.length} total={qualifications.covered.length + qualifications.missing.length} label="met" />
            </div>
            <CoveredMissingSection category={qualifications} onFixGap={onFixGap} />
          </div>
        )}
        {activeTab === "responsibilities" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>Responsibilities</div>
              <ScorePill score={responsibilities.covered.length} total={responsibilities.covered.length + responsibilities.missing.length} label="covered" />
            </div>
            <CoveredMissingSection category={responsibilities} onFixGap={onFixGap} />
          </div>
        )}
        {activeTab === "keywords" && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 16 }}>Keywords</div>
            <KeywordsSection keywords={keywords} />
          </div>
        )}
      </div>
    </div>
  );
}
