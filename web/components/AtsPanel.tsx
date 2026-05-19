"use client";

/**
 * AtsPanel — ATS + job-alignment report from POST /api/ats-check.
 * Shows ATS best-practices checklist score and optional detail sections.
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
  bestPracticesScore?: number;
  bestPracticesPassed?: number;
  bestPracticesTotal?: number;
  jdKeywordMatch?: number;
  requiredSkillMatch?: number;
  categoryAndTitleMatch?: number;
  experienceBulletQuality?: number;
  formattingAndParseability?: number;
  contactAndLinks?: number;
  redFlagPenalty?: number;
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
  const bp = result.bestPractices;
  const bpPassed = bp?.passed ?? result.scoreBreakdown?.bestPracticesPassed ?? 0;
  const bpTotal = bp?.total ?? result.scoreBreakdown?.bestPracticesTotal ?? 0;
  const displayScore = bp?.score ?? result.score;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 18,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: "16px 18px",
      }}>
        <Ring score={displayScore} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, textTransform: "uppercase", marginBottom: 4 }}>
            ATS best practices score
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", letterSpacing: -0.2, lineHeight: 1.45 }}>
            {displayScore >= 85 && "Strong checklist — formatting and role signals look ATS-friendly."}
            {displayScore >= 65 && displayScore < 85 && "Good foundation — fix the open items below before you apply."}
            {displayScore < 65 && "Several checklist gaps — address failed items so parsers and recruiters read your résumé cleanly."}
          </div>
          {result.disclaimer && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, lineHeight: 1.45, fontStyle: "italic" }}>
              {result.disclaimer}
            </div>
          )}
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8, letterSpacing: -0.1 }}>
            {result.stats.page_count} page · {result.stats.word_count.toLocaleString()} words
            {bpTotal > 0 && (
              <> · {bpPassed}/{bpTotal} checks passed</>
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

      {bp && (bp.checks?.length ?? 0) > 0 && (
        <div style={{
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 12, overflow: "hidden",
        }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
            ATS best practices
            <span style={{ marginLeft: 8, fontWeight: 500, color: "var(--dim)" }}>
              {bpPassed}/{bpTotal} passed
            </span>
          </div>
          <div style={{ padding: "12px 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {(bp.checks ?? []).map((chk) => (
              <div key={chk.id} style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ flexShrink: 0, color: chk.pass ? "var(--green)" : "var(--dim)" }}>
                  {chk.pass ? "✓" : "○"}
                </span>
                <div>
                  <div style={{ color: chk.pass ? "var(--dim)" : "var(--text)", fontWeight: 500 }}>{chk.name}</div>
                  <div style={{ color: "var(--dim)", marginTop: 2, lineHeight: 1.45 }}>{chk.detail}</div>
                </div>
              </div>
            ))}
            <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
              {bp.attribution}{" "}
              <Link href={bp.guidePath ?? "/blog/how-ats-really-works"} style={{ color: "var(--accent)" }}>
                Read the guide
              </Link>
              {bp.secondaryGuidePath && (
                <>
                  {" · "}
                  <Link href={bp.secondaryGuidePath} style={{ color: "var(--accent)" }}>
                    UIC checklist
                  </Link>
                </>
              )}
            </p>
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
    </div>
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
