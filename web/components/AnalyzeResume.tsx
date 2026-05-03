"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ScoreRing from "./ScoreRing";
import { apiUrl } from "@/lib/utils";
import { getSupabaseClient } from "@/lib/supabase";

interface Check {
  id: string;
  name: string;
  score: number;
  passed: boolean;
  detail: string;
  items: string[];
}

interface AnalysisResult {
  overall: number;
  summary_ok: string;
  summary_bad: string;
  checks: Check[];
  bullets: string[];
}

interface StoredResume {
  folder: string;
  company: string;
  role: string;
}

// ── Check groups ────────────────────────────────────────────────────────────
const CHECK_GROUPS = [
  {
    id: "content",
    label: "Content & Impact",
    badge: "HIGH SCORE IMPACT",
    badgeColor: "var(--accent)",
    description: "These checks have the biggest impact on how recruiters perceive your experience. Each bullet should show ownership, action, and a measurable result.",
    checkIds: ["quantify", "weak_verbs", "role_depth", "density"],
  },
  {
    id: "writing",
    label: "Writing Quality",
    badge: "IMPORTANT",
    badgeColor: "#f59e0b",
    description: "Recruiters scan for writing professionalism. Passive phrasing, repeated verbs, and personal pronouns all signal a weaker candidate.",
    checkIds: ["action", "pronouns", "repetition"],
  },
  {
    id: "format",
    label: "Format & Structure",
    badge: "STRUCTURE",
    badgeColor: "#6366f1",
    description: "ATS systems and recruiters need to parse your resume correctly. Missing contact details, dates, or awkward phrases block your application before anyone reads it.",
    checkIds: ["dates", "contact", "length", "unnecessary"],
  },
] as const;

const CHECK_ORDER = [
  "quantify","weak_verbs","role_depth","action","pronouns","repetition",
  "dates","contact","length","unnecessary","density",
];

function parseFolder(folder: string): { company: string; role: string } {
  const parts = folder.split("_");
  if (parts.length >= 2) {
    return { company: parts[0], role: parts.slice(1, -1).join(" ") || parts[1] };
  }
  return { company: folder, role: "" };
}

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.8s linear infinite", flexShrink: 0 }}>
      <circle cx="9" cy="9" r="7" stroke="var(--border)" strokeWidth="2.5"/>
      <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

export default function AnalyzeResume() {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [dragging,  setDragging]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<AnalysisResult | null>(null);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [rewrites,  setRewrites]  = useState<Record<string, string>>({});
  const [roleRewriting, setRoleRewriting] = useState<string | null>(null);
  const [roleRewrites,  setRoleRewrites]  = useState<Record<string, string[]>>({});
  const [expanded,  setExpanded]  = useState<Record<string, boolean>>({});
  const [storedResumes, setStoredResumes] = useState<StoredResume[]>([]);
  const [loadingStored, setLoadingStored] = useState(false);

  useEffect(() => {
    setLoadingStored(true);
    const supabase = getSupabaseClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      try {
        const url = user?.id
          ? apiUrl(`/api/resumes?user_id=${encodeURIComponent(user.id)}`)
          : apiUrl("/api/resumes");
        const resp = await fetch(url);
        const data = await resp.json();
        const folders: string[] = Array.isArray(data)
          ? data.map((r: { folder: string }) => r.folder)
          : (data.resumes || []);
        setStoredResumes(folders.map(folder => ({ folder, ...parseFolder(folder) })));
      } catch { /* silently ignore */ }
      setLoadingStored(false);
    });
  }, []);

  const processResult = (json: AnalysisResult) => {
    const sorted = [...json.checks].sort((a, b) => {
      const ai = CHECK_ORDER.indexOf(a.id);
      const bi = CHECK_ORDER.indexOf(b.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    setResult({ ...json, checks: sorted });
    // Auto-expand failed checks
    const exp: Record<string, boolean> = {};
    sorted.filter(c => !c.passed).forEach(c => { exp[c.id] = true; });
    setExpanded(exp);
  };

  const run = useCallback(async (file: File) => {
    setLoading(true); setError(null); setResult(null); setRewrites({}); setRoleRewrites({});
    const fd = new FormData();
    fd.append("file", file);
    try {
      const resp = await fetch(apiUrl("/api/analyze-upload"), { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      processResult(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setLoading(false); }
  }, []);

  const runFolder = useCallback(async (folder: string) => {
    setLoading(true); setError(null); setResult(null); setRewrites({}); setRoleRewrites({});
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const resp = await fetch(apiUrl(`/api/analyze-folder/${encodeURIComponent(folder)}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user?.id ?? "" }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      processResult(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally { setLoading(false); }
  }, []);

  const rewriteBullet = async (bullet: string) => {
    if (rewrites[bullet]) return;
    setRewriting(bullet);
    try {
      const resp = await fetch(apiUrl("/api/ai-edit-bullet"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bullet, instruction: "Rewrite this bullet to be stronger: add a quantified outcome, start with a powerful action verb, and remove any weak or passive language. Keep it factual — do not invent numbers." }),
      });
      const json = await resp.json();
      if (json.text) setRewrites(r => ({ ...r, [bullet]: json.text }));
    } catch { /* swallow */ } finally { setRewriting(null); }
  };

  const rewriteRole = async (item: string) => {
    if (roleRewrites[item] || roleRewriting === item) return;
    setRoleRewriting(item);
    const header = item.split(/\s{2,}/)[0].trim();
    try {
      const resp = await fetch(apiUrl("/api/rewrite-role"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, bullets: [] }),
      });
      const json = await resp.json();
      if (json.bullets?.length) setRoleRewrites(r => ({ ...r, [item]: json.bullets }));
    } catch { /* swallow */ } finally { setRoleRewriting(null); }
  };

  const onFile = (f: File | null | undefined) => {
    if (!f || !f.name.endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    run(f);
  };

  const checks = result?.checks ?? [];

  // Build group stats for sidebar
  const groupStats = CHECK_GROUPS.map(g => {
    const groupChecks = g.checkIds.map(id => checks.find(c => c.id === id)).filter(Boolean) as Check[];
    const issues = groupChecks.filter(c => !c.passed).length;
    const total  = groupChecks.length;
    return { ...g, issues, total, groupChecks };
  });

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* ── Left sidebar ─────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, borderRight: "1px solid var(--border)",
        overflowY: "auto", display: "flex", flexDirection: "column",
        background: "var(--surface)", padding: "24px 16px",
      }}>
        {result ? (
          <>
            {/* Score ring */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
                Resume Score
              </div>
              <ScoreRing score={result.overall} size={100} label="" />
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginTop: 8 }}>
                {result.overall >= 75 ? "Strong" : result.overall >= 55 ? "Good" : "Needs Work"}
              </div>
            </div>

            {/* Rescan button */}
            <button
              onClick={() => { setResult(null); setError(null); }}
              style={{
                width: "100%", padding: "9px 14px", borderRadius: 8,
                background: "var(--accent)", border: "none", color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer", marginBottom: 20,
              }}
            >
              ↑ Scan another resume
            </button>

            {/* Category bars */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {groupStats.map(g => (
                <a key={g.id} href={`#group-${g.id}`} style={{ textDecoration: "none" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{g.label}</span>
                      <span style={{ fontSize: 11, color: g.issues > 0 ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
                        {g.issues > 0 ? `${g.issues} issue${g.issues > 1 ? "s" : ""}` : "✓ Clear"}
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: "var(--surface2)", overflow: "hidden" }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        width: `${((g.total - g.issues) / Math.max(g.total, 1)) * 100}%`,
                        background: g.issues === 0 ? "var(--green)" : g.issues >= g.total / 2 ? "var(--red)" : "#f59e0b",
                        transition: "width 0.8s ease",
                      }} />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : (
          /* Pre-result: show history of saved resumes */
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
              My Resumes
            </div>

            {loadingStored ? (
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 20 }}><Spinner /></div>
            ) : storedResumes.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", paddingTop: 20, lineHeight: 1.6 }}>
                No saved resumes yet.<br />Upload a PDF to get started.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {storedResumes.map(r => (
                  <button
                    key={r.folder}
                    onClick={() => runFolder(r.folder)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--border)", background: "var(--surface2)",
                      cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      transition: "background 0.12s, border-color 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-bg)"; e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "var(--surface2)"; e.currentTarget.style.borderColor = "var(--border)"; }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: "var(--dim)", flexShrink: 0 }}>
                      <path d="M3 2h7l3 3v9H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                      <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company}</div>
                      {r.role && <div style={{ fontSize: 11, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.role}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </aside>

      {/* ── Main panel ──────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>

        {/* Upload state */}
        {!result && !loading && (
          <>
            <UploadZone
              dragging={dragging}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}
              error={error}
            />
          </>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 80, color: "var(--muted)" }}>
            <Spinner size={24} />
            <span style={{ fontSize: 14 }}>Analysing your resume…</span>
          </div>
        )}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
            {groupStats.map(g => (
              <section key={g.id} id={`group-${g.id}`}>
                {/* Group header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", margin: 0 }}>{g.label}</h2>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.5, padding: "3px 8px",
                    borderRadius: 20, background: `${g.badgeColor}20`, color: g.badgeColor,
                    textTransform: "uppercase",
                  }}>{g.badge}</span>
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 14px" }}>
                  {g.description}
                </p>

                {/* Check rows */}
                <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                  {g.groupChecks.map((check, idx) => (
                    <CheckRow
                      key={check.id}
                      check={check}
                      isLast={idx === g.groupChecks.length - 1}
                      expanded={!!expanded[check.id]}
                      onToggle={() => setExpanded(e => ({ ...e, [check.id]: !e[check.id] }))}
                      rewrites={rewrites}
                      rewriting={rewriting}
                      onRewriteBullet={rewriteBullet}
                      roleRewrites={roleRewrites}
                      roleRewriting={roleRewriting}
                      onRewriteRole={rewriteRole}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => onFile(e.target.files?.[0])} />
    </div>
  );
}

// ── CheckRow ─────────────────────────────────────────────────────────────────
function CheckRow({ check, isLast, expanded, onToggle, rewrites, rewriting, onRewriteBullet, roleRewrites, roleRewriting, onRewriteRole }: {
  check: Check; isLast: boolean; expanded: boolean; onToggle: () => void;
  rewrites: Record<string, string>; rewriting: string | null; onRewriteBullet: (b: string) => void;
  roleRewrites: Record<string, string[]>; roleRewriting: string | null; onRewriteRole: (r: string) => void;
}) {
  const canExpand = check.items.length > 0;
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}>
      {/* Row header */}
      <div
        onClick={canExpand ? onToggle : undefined}
        style={{
          display: "flex", alignItems: "flex-start", gap: 14,
          padding: "16px 20px", cursor: canExpand ? "pointer" : "default",
          background: expanded ? "var(--surface2)" : "var(--surface)",
          transition: "background 0.1s",
        }}
      >
        {/* Pass/fail dot */}
        <div style={{
          width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: check.passed ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)",
        }}>
          {check.passed
            ? <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2l6 6M8 2l-6 6" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round"/></svg>
          }
        </div>

        {/* Name + detail */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{check.name}</span>
            <span style={{
              fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600,
              background: check.passed ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
              color: check.passed ? "var(--green)" : "var(--red)",
              letterSpacing: 0.3, textTransform: "uppercase",
            }}>
              {check.passed ? "Pass" : `Score ${check.score}/10`}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.6 }}>
            {check.detail}
          </p>
        </div>

        {/* Expand chevron */}
        {canExpand && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}>
            <path d="M4 6l4 4 4-4" stroke="var(--dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* Expanded items */}
      {expanded && canExpand && (
        <div style={{ padding: "0 20px 16px 56px", background: "var(--surface)", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
            {check.id === "quantify" ? "Bullets missing metrics — click to improve"
              : check.id === "role_depth" ? "Under-described roles — click to rewrite"
              : "Flagged items"}
          </div>
          {check.id === "role_depth"
            ? check.items.map((item, i) => {
                const bracketIdx = item.lastIndexOf("  [");
                const header = bracketIdx > -1 ? item.slice(0, bracketIdx) : item;
                const reason = bracketIdx > -1 ? item.slice(bracketIdx + 2) : "";
                const rewrites = roleRewrites[item];
                return (
                  <div key={i} style={{ background: "var(--surface2)", borderRadius: 9, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>{header}</div>
                    {reason && <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>{reason}</div>}
                    {rewrites ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>AI Suggestions</div>
                        {rewrites.map((b, j) => (
                          <div key={j} style={{ fontSize: 13, color: "var(--text)", borderLeft: "3px solid var(--green)", paddingLeft: 10, lineHeight: 1.55 }}>{b}</div>
                        ))}
                      </div>
                    ) : (
                      <button onClick={() => onRewriteRole(item)} disabled={roleRewriting === item} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px",
                        borderRadius: 7, background: "var(--accent)", border: "none", color: "#fff",
                        fontSize: 12, fontWeight: 500, cursor: roleRewriting === item ? "default" : "pointer",
                        opacity: roleRewriting === item ? 0.7 : 1,
                      }}>
                        {roleRewriting === item ? <><Spinner size={14} /> Rewriting…</> : <>✦ Rewrite this role</>}
                      </button>
                    )}
                  </div>
                );
              })
            : check.items.map((item, i) => {
                const canRewrite = check.id === "quantify" || check.id === "weak_verbs";
                const rewrite = rewrites[item];
                return (
                  <div key={i} style={{ background: "var(--surface2)", borderRadius: 9, padding: "10px 14px" }}>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55, fontStyle: "italic", borderLeft: "3px solid var(--border)", paddingLeft: 10, marginBottom: rewrite || canRewrite ? 8 : 0 }}>
                      {item}
                    </div>
                    {rewrite && (
                      <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.55, borderLeft: "3px solid var(--green)", paddingLeft: 10, marginBottom: 6 }}>
                        {rewrite}
                      </div>
                    )}
                    {canRewrite && !rewrite && (
                      <button onClick={() => onRewriteBullet(item)} disabled={rewriting === item} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "5px 11px",
                        borderRadius: 6, background: "var(--accent)", border: "none", color: "#fff",
                        fontSize: 11, fontWeight: 500, cursor: rewriting === item ? "default" : "pointer",
                        opacity: rewriting === item ? 0.7 : 1,
                      }}>
                        {rewriting === item ? <><Spinner size={13} /> Rewriting…</> : <>✦ Improve this bullet</>}
                      </button>
                    )}
                  </div>
                );
              })
          }
        </div>
      )}
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────
function UploadZone({ dragging, onDragOver, onDragLeave, onDrop, onClick, error }: {
  dragging: boolean; error: string | null;
  onDragOver: React.DragEventHandler; onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler; onClick: () => void;
}) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto 0", textAlign: "center" }}>
      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onClick} style={{
        border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 16, padding: "56px 32px", cursor: "pointer",
        background: dragging ? "rgba(99,102,241,0.04)" : "var(--surface)",
        transition: "border-color 0.15s, background 0.15s",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Drop your resume PDF here</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>or click to browse — we&apos;ll run 11 recruiter checks instantly</div>
      </div>
      {error && <div style={{ marginTop: 12, fontSize: 13, color: "var(--red)" }}>{error}</div>}
    </div>
  );
}
