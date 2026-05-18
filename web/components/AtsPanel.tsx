"use client";

/**
 * AtsPanel — ATS + job-alignment report from POST /api/ats-check.
 * Shows weighted JD match, structure, bullets, recruiter scan, and export checklist.
 */

import Link from "next/link";
import { useMemo, type CSSProperties } from "react";

export interface AtsCheck {
  id: string;
  name: string;
  pass: boolean;
  detail: string;
}

export interface AtsKeyword {
  keyword: string;
  weight: number;
  status: "found" | "partial" | "missing";
  count: number;
  jd_count: number;
  keywordType?: string;
}

export interface AtsScoreBreakdown {
  jdKeywordMatch: number;
  requiredSkillMatch: number;
  categoryAndTitleMatch: number;
  experienceBulletQuality: number;
  formattingAndParseability: number;
  contactAndLinks: number;
  redFlagPenalty: number;
  keywordTypeWeights?: Record<string, number>;
}

export interface JdMatch {
  matchScore: number | null;
  missingRequiredSkills: string[];
  weakKeywords: string[];
  matchedKeywords: string[];
  categoryMatch: string;
  titleMatch: string;
}

export interface SkillSuggestionRow {
  skill: string;
  source: string;
  status: string;
  recommendation: string;
  jdMentions?: number;
}

export interface AtsResult {
  score: number;
  checks: AtsCheck[];
  keywords: AtsKeyword[];
  stats: { page_count: number; word_count: number; char_count: number };
  disclaimer?: string;
  scoreBreakdown?: AtsScoreBreakdown;
  jdAnalysis?: {
    jobTitle?: string;
    jobCategory?: string;
    requiredSkills?: string[];
    preferredSkills?: string[];
    certifications?: string[];
    repeatedKeywords?: { keyword: string; count: number }[];
    minYearsExperience?: number | null;
    employerProblemHint?: string;
  };
  jdMatch?: JdMatch;
  summarySignals?: {
    hasObjectivePattern?: boolean;
    summaryLooksGeneric?: boolean;
    jdKeywordsInSummary?: number;
    summaryHasMetric?: boolean;
    suggestions?: string[];
  };
  bulletStrength?: {
    bulletCount: number;
    samples?: Array<Record<string, unknown>>;
    quantifiedCount?: number;
    weakOpenersCount?: number;
    weakOpenersSample?: string[];
    uxHint?: string;
  };
  quantification?: { withMetric?: number; total?: number; ratio?: number | null };
  actionVerbs?: { strongVerbRatio?: number | null; weakStartsFound?: string[]; tip?: string };
  skillSuggestions?: SkillSuggestionRow[];
  redFlags?: { id: string; severity?: string; detail: string }[];
  contactValidation?: Record<string, unknown>;
  lengthDensity?: { suggestedPages?: string; longLines?: number; bulletsPerJobHint?: string };
  employerProblemFit?: {
    employerProblem?: string;
    candidateEvidence?: string[];
    missingEvidence?: string[];
    rewriteHint?: string;
  };
  recruiterScan?: {
    name?: string;
    targetRole?: string;
    topSkillsLine?: string;
    education?: string;
    strongestMetric?: string;
    signals?: { label: string; ok: boolean }[];
  };
  exportChecklist?: { id: string; label: string; pass: boolean }[];
  bestPractices?: {
    score?: number;
    passed?: number;
    total?: number;
    guidePath?: string;
    secondaryGuidePath?: string;
    attribution?: string;
    checks?: Array<{
      id: string;
      name: string;
      pass: boolean;
      detail: string;
      category?: string;
    }>;
  };
}

const SEV_COLOR = {
  pass: "var(--green)",
  fail: "var(--red)",
};

const STATUS_BG: Record<AtsKeyword["status"], string> = {
  found:   "rgba(76, 217, 100, 0.16)",
  partial: "rgba(255, 204, 0, 0.16)",
  missing: "rgba(255, 95, 95, 0.14)",
};
const STATUS_FG: Record<AtsKeyword["status"], string> = {
  found:   "var(--green)",
  partial: "var(--yellow, #ffc857)",
  missing: "var(--red)",
};

const TYPE_LABEL: Record<string, string> = {
  jobTitle: "Title",
  requiredSkills: "Required",
  repeatedKeywords: "Repeated",
  certifications: "Cert",
  preferredSkills: "Preferred",
  industryTerms: "Industry",
};

function ringColor(score: number): string {
  if (score >= 85) return "var(--green)";
  if (score >= 65) return "var(--yellow, #ffc857)";
  return "var(--red)";
}

function detailsStyle(): CSSProperties {
  return {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  };
}

/** Coerce partial API payloads so UI never calls `.join` / `.filter` on undefined. */
export function normalizeAtsResult(result: AtsResult): AtsResult {
  const jd = result.jdMatch;
  return {
    ...result,
    keywords: Array.isArray(result.keywords) ? result.keywords : [],
    checks: Array.isArray(result.checks) ? result.checks : [],
    jdMatch: jd
      ? {
          ...jd,
          missingRequiredSkills: jd.missingRequiredSkills ?? [],
          weakKeywords: jd.weakKeywords ?? [],
          matchedKeywords: jd.matchedKeywords ?? [],
        }
      : jd,
  };
}

export default function AtsPanel({ result: rawResult, onRecheck, rechecking }: {
  result: AtsResult;
  onRecheck?: () => void;
  rechecking?: boolean;
}) {
  const result = useMemo(() => normalizeAtsResult(rawResult), [rawResult]);
  const sortedKeywords = useMemo(() => {
    return [...result.keywords].sort((a, b) => {
      const rank: Record<AtsKeyword["status"], number> = { missing: 0, partial: 1, found: 2 };
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.keyword.localeCompare(b.keyword);
    });
  }, [result.keywords]);

  const found   = result.keywords.filter(k => k.status === "found").length;
  const partial = result.keywords.filter(k => k.status === "partial").length;
  const missing = result.keywords.filter(k => k.status === "missing").length;
  const passed  = result.checks.filter(c => c.pass).length;

  const jd = result.jdMatch;
  const hasJd = jd != null && jd.matchScore != null;
  const breakdown = result.scoreBreakdown;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 18,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "16px 18px",
      }}>
        <Ring score={result.score} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase", marginBottom: 4 }}>
            Job alignment &amp; ATS readiness
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", letterSpacing: -0.2, lineHeight: 1.45 }}>
            {result.score >= 85 && "Strong alignment — your text, structure, and keywords look well tuned for this posting."}
            {result.score >= 65 && result.score < 85 && "Good foundation — tighten JD keywords, bullets, and contact signals to improve both ATS parsing and recruiter scan."}
            {result.score < 65 && "Several gaps vs this job and common ATS patterns — prioritize missing skills and accomplishment wording."}
          </div>
          {result.disclaimer && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, lineHeight: 1.45, fontStyle: "italic" }}>
              {result.disclaimer}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, letterSpacing: -0.1 }}>
            {result.stats.page_count} page · {result.stats.word_count.toLocaleString()} words ·
            {" "}{passed}/{result.checks.length} checks pass
            {result.keywords.length > 0 && (
              <> · {found} found · {partial} partial · {missing} missing keyword{missing === 1 ? "" : "s"}</>
            )}
          </div>
        </div>
        {onRecheck && (
          <button
            onClick={onRecheck}
            disabled={rechecking}
            style={{
              fontSize: 11, padding: "6px 12px",
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 7, color: "var(--text)",
              cursor: rechecking ? "wait" : "pointer", fontFamily: "inherit",
              opacity: rechecking ? 0.6 : 1,
            }}
          >{rechecking ? "Re-checking…" : "Re-check"}</button>
        )}
      </div>

      {breakdown && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            Score breakdown (points toward 100, before penalty)
          </summary>
          <div style={{ padding: "0 16px 14px", fontSize: 12, color: "var(--dim)", display: "grid", gap: 6 }}>
            <Row k="JD keyword match" v={`${breakdown.jdKeywordMatch} / 30`} />
            <Row k="Required skills" v={`${breakdown.requiredSkillMatch} / 20`} />
            <Row k="Title &amp; category fit" v={`${breakdown.categoryAndTitleMatch} / 15`} />
            <Row k="Bullet quality" v={`${breakdown.experienceBulletQuality} / 15`} />
            <Row k="Formatting &amp; parseability" v={`${breakdown.formattingAndParseability} / 10`} />
            <Row k="Contact &amp; links" v={`${breakdown.contactAndLinks} / 5`} />
            <Row k="Red-flag penalty" v={`−${breakdown.redFlagPenalty}`} accent />
          </div>
        </details>
      )}

      {hasJd && jd && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "14px 16px",
        }}>
          <div style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", marginBottom: 8 }}>JD match</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{jd.matchScore}</span>
            <span style={{ fontSize: 12, color: "var(--dim)" }}>alignment subscore</span>
            <Tag label="Title" value={jd.titleMatch} />
            <Tag label="Category" value={jd.categoryMatch} />
          </div>
          {result.jdAnalysis && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--dim)", lineHeight: 1.5 }}>
              {(result.jdAnalysis.jobTitle || result.jdAnalysis.jobCategory) && (
                <div>
                  {result.jdAnalysis.jobTitle && <span><b style={{ color: "var(--text)" }}>Title:</b> {result.jdAnalysis.jobTitle}</span>}
                  {result.jdAnalysis.jobTitle && result.jdAnalysis.jobCategory ? " · " : null}
                  {result.jdAnalysis.jobCategory && <span><b style={{ color: "var(--text)" }}>Category:</b> {result.jdAnalysis.jobCategory}</span>}
                </div>
              )}
            </div>
          )}
          {(jd.missingRequiredSkills?.length ?? 0) > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>Missing required-style skills (add only if true for you)</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(jd.missingRequiredSkills ?? []).map(s => (
                  <span key={s} style={{
                    fontSize: 11, padding: "3px 8px", borderRadius: 6,
                    background: "rgba(255, 95, 95, 0.12)", color: "var(--red)", border: "1px solid rgba(255,95,95,0.25)",
                  }}>{s}</span>
                ))}
              </div>
            </div>
          )}
          {jd.weakKeywords.length > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--dim)" }}>
              Low density vs JD: {jd.weakKeywords.join(", ")}
            </div>
          )}
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase", marginBottom: 8 }}>
          Structure &amp; parseability
        </div>
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, overflow: "hidden",
        }}>
          {result.checks.map((c, i) => (
            <div key={c.id} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "12px 16px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                background: c.pass ? SEV_COLOR.pass : SEV_COLOR.fail,
                color: "#fff", fontSize: 11, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>{c.pass ? "✓" : "✗"}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: "var(--text)", letterSpacing: -0.2, fontWeight: c.pass ? 400 : 500 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2, letterSpacing: -0.1 }}>
                  {c.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {result.keywords.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--dim)", padding: "4px 2px" }}>
          (No job description — JD keyword weighting skipped. Paste a JD for a tailored match view.)
        </div>
      ) : (
        <div>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase" }}>
              Weighted keywords (type shown in tooltip)
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--dim)" }}>
              <Legend color={STATUS_FG.found}   label="Found" />
              <Legend color={STATUS_FG.partial} label="Partial" />
              <Legend color={STATUS_FG.missing} label="Missing" />
            </div>
          </div>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 10,
            display: "flex", flexWrap: "wrap", gap: 6,
          }}>
            {sortedKeywords.map(k => {
              const kt = k.keywordType ? TYPE_LABEL[k.keywordType] ?? k.keywordType : "";
              return (
                <span
                  key={k.keyword}
                  title={`${kt ? `${kt} · ` : ""}freq weight ${k.weight} · ${k.jd_count}× in JD${k.count ? ` · ${k.count}× in résumé` : ""}`}
                  style={{
                    fontSize: 11.5, padding: "4px 10px", borderRadius: 999,
                    background: STATUS_BG[k.status], color: STATUS_FG[k.status],
                    fontWeight: k.weight >= 3 ? 600 : 500,
                    letterSpacing: -0.1, lineHeight: 1.3,
                    cursor: "default",
                    border: `1px solid ${STATUS_FG[k.status]}33`,
                  }}
                >
                  {k.keyword}
                  {kt && <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 10 }}>({kt})</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {result.summarySignals && (result.summarySignals.suggestions?.length ?? 0) > 0 && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Summary / objective signals</summary>
          <ul style={{ margin: "0 16px 14px 28px", padding: 0, fontSize: 12, color: "var(--text)", lineHeight: 1.55 }}>
            {(result.summarySignals.suggestions ?? []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}

      {result.bulletStrength && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Bullets &amp; quantification
          </summary>
          <div style={{ padding: "0 16px 14px", fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>
            <p style={{ margin: "0 0 8px", color: "var(--text)" }}>{result.bulletStrength.uxHint}</p>
            {result.quantification?.total != null
              && result.quantification.total > 0
              && (result.quantification.withMetric ?? 0) < result.quantification.total && (
              <p style={{ margin: 0 }}>
                {result.quantification.withMetric} of {result.quantification.total} lines include measurable numbers.
              </p>
            )}
            {result.actionVerbs?.tip && (
              <p style={{ margin: "8px 0 0" }}>{result.actionVerbs.tip}</p>
            )}
            {(result.actionVerbs?.weakStartsFound?.length ?? 0) > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>Weak openings detected</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text)" }}>
                  {(result.actionVerbs?.weakStartsFound ?? []).map((w, i) => (
                    <li key={i} style={{ fontSize: 11 }}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      {(result.skillSuggestions?.length ?? 0) > 0 && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Skills (truthful add-if-relevant)
          </summary>
          <div style={{ padding: "0 8px 8px", overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--dim)", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px" }}>Skill</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>Note</th>
                </tr>
              </thead>
              <tbody>
                {(result.skillSuggestions ?? []).slice(0, 14).map((r, i) => (
                  <tr key={`${r.skill}-${i}`} style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 500 }}>{r.skill}</td>
                    <td style={{ padding: "6px 8px" }}>{r.status.replace(/_/g, " ")}</td>
                    <td style={{ padding: "6px 8px", color: "var(--dim)" }}>
                      {r.recommendation.replace(/_/g, " ")}
                      {typeof r.jdMentions === "number" && r.jdMentions > 0 ? ` · ${r.jdMentions}× in JD` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {(result.redFlags?.length ?? 0) > 0 && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--red)" }}>
            Red flags ({result.redFlags?.length})
          </summary>
          <ul style={{ margin: "0 16px 14px 24px", fontSize: 12, lineHeight: 1.5, color: "var(--text)" }}>
            {(result.redFlags ?? []).map(rf => (
              <li key={rf.id}><span style={{ color: "var(--dim)" }}>{rf.severity}:</span> {rf.detail}</li>
            ))}
          </ul>
        </details>
      )}

      {result.recruiterScan && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>6-second recruiter scan (from PDF text)</summary>
          <div style={{ padding: "0 16px 14px", fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
            <div><b>Name</b>: {result.recruiterScan.name}</div>
            <div><b>Target role</b>: {result.recruiterScan.targetRole}</div>
            <div><b>Skills line</b>: {result.recruiterScan.topSkillsLine}</div>
            <div><b>Education</b>: {result.recruiterScan.education}</div>
            <div><b>Strong metric</b>: {result.recruiterScan.strongestMetric}</div>
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              {(result.recruiterScan.signals ?? []).map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: s.ok ? "var(--green)" : "var(--dim)" }}>
                  {s.ok ? "✓" : "○"} {s.label}
                </div>
              ))}
            </div>
          </div>
        </details>
      )}

      {result.employerProblemFit?.employerProblem && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>JD fit</summary>
          <div style={{ padding: "0 16px 14px", fontSize: 12, lineHeight: 1.5, color: "var(--dim)" }}>
            <p style={{ margin: "0 0 10px", color: "var(--text)" }}>
              <span style={{ color: "var(--dim)" }}>Want: </span>
              {result.employerProblemFit.employerProblem}
            </p>
            {(result.employerProblemFit.candidateEvidence?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>You show</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                  {(result.employerProblemFit.candidateEvidence ?? []).map((e, i) => (
                    <li key={i} style={{ color: "var(--text)" }}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {(result.employerProblemFit.missingEvidence?.length ?? 0) > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Gap</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 2 }}>
                  {(result.employerProblemFit.missingEvidence ?? []).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.employerProblemFit.rewriteHint && (
              <p style={{ margin: 0, fontSize: 11, color: "var(--dim)" }}>{result.employerProblemFit.rewriteHint}</p>
            )}
          </div>
        </details>
      )}

      {result.bestPractices && (result.bestPractices.checks?.length ?? 0) > 0 && (
        <details style={detailsStyle()} open>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            ATS best practices
            {typeof result.bestPractices.score === "number" && (
              <span style={{ marginLeft: 8, fontWeight: 500, color: "var(--dim)" }}>
                {result.bestPractices.passed}/{result.bestPractices.total} · {result.bestPractices.score}%
              </span>
            )}
          </summary>
          <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {(result.bestPractices.checks ?? []).map((bp) => (
              <div key={bp.id} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, color: bp.pass ? "var(--green)" : "var(--dim)" }}>
                  {bp.pass ? "✓" : "○"}
                </span>
                <div>
                  <div style={{ color: bp.pass ? "var(--dim)" : "var(--text)", fontWeight: 500 }}>{bp.name}</div>
                  <div style={{ color: "var(--dim)", marginTop: 2, lineHeight: 1.45 }}>{bp.detail}</div>
                </div>
              </div>
            ))}
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
              {result.bestPractices.attribution}{" "}
              <Link href={result.bestPractices.guidePath ?? "/blog/how-ats-really-works"} style={{ color: "var(--accent)" }}>
                Read the guide
              </Link>
              {result.bestPractices.secondaryGuidePath && (
                <>
                  {" · "}
                  <Link href={result.bestPractices.secondaryGuidePath} style={{ color: "var(--accent)" }}>
                    UIC checklist
                  </Link>
                </>
              )}
            </p>
          </div>
        </details>
      )}

      {(result.exportChecklist?.length ?? 0) > 0 && (
        <details style={detailsStyle()}>
          <summary style={{ padding: "12px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            Pre-export checklist
          </summary>
          <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {(result.exportChecklist ?? []).map(item => (
              <div key={item.id} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", color: item.pass ? "var(--green)" : "var(--text)" }}>
                <span style={{ flexShrink: 0 }}>{item.pass ? "✓" : "○"}</span>
                <span style={{ color: item.pass ? "var(--dim)" : "var(--text)" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: accent ? "var(--red)" : undefined }}>
      <span>{k}</span>
      <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text)" }}>{v}</span>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span style={{
      fontSize: 11, padding: "3px 8px", borderRadius: 6,
      background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)",
    }}>
      {label}: <b>{value}</b>
    </span>
  );
}

function Ring({ score }: { score: number }) {
  const r = 28, c = 2 * Math.PI * r;
  const off = c - (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
      <svg width="70" height="70" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} stroke="var(--border)" strokeWidth="6" fill="none" />
        <circle cx="35" cy="35" r={r} stroke={ringColor(score)} strokeWidth="6" fill="none"
          strokeDasharray={c} strokeDashoffset={off}
          strokeLinecap="round" transform="rotate(-90 35 35)"
          style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s" }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: -0.6,
      }}>{score}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      {label}
    </span>
  );
}
