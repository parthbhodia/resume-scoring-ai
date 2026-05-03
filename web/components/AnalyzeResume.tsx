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

function Spinner() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
      <circle cx="9" cy="9" r="7" stroke="var(--border)" strokeWidth="2.5"/>
      <path d="M9 2a7 7 0 017 7" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round"/>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </svg>
  );
}

const CHECK_ORDER = [
  "quantify","weak_verbs","role_depth","action","pronouns","repetition",
  "dates","contact","length","unnecessary","density",
];

function parseFolder(folder: string): { company: string; role: string } {
  // Folder format: "CompanyName_RoleTitle" or "CompanyName_RoleTitle_timestamp"
  const parts = folder.split("_");
  if (parts.length >= 2) {
    return { company: parts[0], role: parts.slice(1, -1).join(" ") || parts[1] };
  }
  return { company: folder, role: "" };
}

export default function AnalyzeResume() {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [dragging,  setDragging]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [result,    setResult]    = useState<AnalysisResult | null>(null);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [rewriting,     setRewriting]     = useState<string | null>(null);
  const [rewrites,      setRewrites]      = useState<Record<string, string>>({});
  const [roleRewriting, setRoleRewriting] = useState<string | null>(null);
  const [roleRewrites,  setRoleRewrites]  = useState<Record<string, string[]>>({});

  // Stored resumes
  const [storedResumes, setStoredResumes] = useState<StoredResume[]>([]);
  const [loadingStored, setLoadingStored] = useState(false);

  // Load stored resumes on mount
  useEffect(() => {
    setLoadingStored(true);
    fetch(apiUrl("/api/resumes"))
      .then(r => r.json())
      .then((data: { resumes?: string[] }) => {
        const resumes = (data.resumes || []).map((folder: string) => ({
          folder,
          ...parseFolder(folder),
        }));
        setStoredResumes(resumes);
      })
      .catch(() => {/* silently ignore */})
      .finally(() => setLoadingStored(false));
  }, []);

  const run = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(null);
    setRewrites({});
    const fd = new FormData();
    fd.append("file", file);
    try {
      const resp = await fetch(apiUrl("/api/analyze-upload"), { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Analysis failed");
      const sorted = [...json.checks].sort((a: Check, b: Check) => {
        const ai = CHECK_ORDER.indexOf(a.id);
        const bi = CHECK_ORDER.indexOf(b.id);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setResult({ ...json, checks: sorted });
      setSelected(sorted.find((c: Check) => !c.passed)?.id ?? sorted[0]?.id ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const runFolder = useCallback(async (folder: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSelected(null);
    setRewrites({});
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
      const sorted = [...json.checks].sort((a: Check, b: Check) => {
        const ai = CHECK_ORDER.indexOf(a.id);
        const bi = CHECK_ORDER.indexOf(b.id);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setResult({ ...json, checks: sorted });
      setSelected(sorted.find((c: Check) => !c.passed)?.id ?? sorted[0]?.id ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const onFile = (f: File | null | undefined) => {
    if (!f || !f.name.endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    run(f);
  };

  const rewriteBullet = async (bullet: string) => {
    if (rewrites[bullet]) return;
    setRewriting(bullet);
    try {
      const resp = await fetch(apiUrl("/api/ai-edit-bullet"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: bullet, instruction: "Rewrite this bullet to be stronger: add a quantified outcome, start with a powerful action verb, and remove any weak or passive language. Keep it factual — do not invent numbers." }),
      });
      const json = await resp.json();
      if (json.text) setRewrites(r => ({ ...r, [bullet]: json.text }));
    } catch { /* swallow */ } finally {
      setRewriting(null);
    }
  };

  const rewriteRole = async (item: string) => {
    if (roleRewrites[item] || roleRewriting === item) return;
    setRoleRewriting(item);
    // item format: "Header  [reason]" — split on double-space
    const header = item.split(/\s{2,}/)[0].trim();
    try {
      const resp = await fetch(apiUrl("/api/rewrite-role"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ header, bullets: [] }),
      });
      const json = await resp.json();
      if (json.bullets?.length) setRoleRewrites(r => ({ ...r, [item]: json.bullets }));
    } catch { /* swallow */ } finally {
      setRoleRewriting(null);
    }
  };

  const checks    = result?.checks ?? [];
  const failed    = checks.filter(c => !c.passed);
  const passed    = checks.filter(c => c.passed);
  const activeCheck = checks.find(c => c.id === selected) ?? null;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* ── Left sidebar ───────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0, borderRight: "1px solid var(--border)",
        overflowY: "auto", display: "flex", flexDirection: "column",
        background: "var(--surface)", padding: "20px 0",
      }}>
        {result && (
          <>
            <div style={{ padding: "0 16px 16px", borderBottom: "1px solid var(--border)", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ScoreRing score={result.overall} size={56} label="" />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4 }}>Overall</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {result.overall >= 75 ? "Strong" : result.overall >= 55 ? "Good" : "Needs work"}
                  </div>
                </div>
              </div>
            </div>

            {failed.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", padding: "0 16px 6px" }}>
                  Top Fixes
                </div>
                {failed.map(c => (
                  <SidebarItem key={c.id} check={c} active={selected === c.id} onClick={() => setSelected(c.id)} />
                ))}
              </>
            )}

            {passed.length > 0 && (
              <>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", padding: "16px 16px 6px" }}>
                  Completed
                </div>
                {passed.map(c => (
                  <SidebarItem key={c.id} check={c} active={selected === c.id} onClick={() => setSelected(c.id)} />
                ))}
              </>
            )}
          </>
        )}
      </aside>

      {/* ── Main panel ─────────────────────────────── */}
      <main style={{ flex: 1, overflowY: "auto", padding: "32px 36px" }}>
        {/* Upload zone + stored resumes — visible if no result */}
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

            {/* My Resumes picker */}
            {(storedResumes.length > 0 || loadingStored) && (
              <div style={{ maxWidth: 520, margin: "28px auto 0" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10,
                  marginBottom: 12,
                }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 12, color: "var(--dim)", letterSpacing: 0.2 }}>or pick a saved resume</span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>

                {loadingStored ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                    <Spinner />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {storedResumes.map(r => (
                      <button
                        key={r.folder}
                        onClick={() => runFolder(r.folder)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "12px 16px", borderRadius: 10,
                          border: "1px solid var(--border)",
                          background: "var(--surface)", cursor: "pointer",
                          textAlign: "left", fontFamily: "inherit",
                          transition: "background 0.12s, border-color 0.12s",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = "var(--surface2)";
                          e.currentTarget.style.borderColor = "var(--accent)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = "var(--surface)";
                          e.currentTarget.style.borderColor = "var(--border)";
                        }}
                      >
                        <span style={{ fontSize: 18 }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
                            {r.company}
                          </div>
                          {r.role && (
                            <div style={{ fontSize: 12, color: "var(--dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {r.role}
                            </div>
                          )}
                        </div>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "var(--dim)", flexShrink: 0 }}>
                          <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, paddingTop: 80, color: "var(--muted)" }}>
            <Spinner />
            <span style={{ fontSize: 14 }}>Analysing your resume…</span>
          </div>
        )}

        {result && (
          <>
            {/* Summary banner */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "20px 24px", marginBottom: 24,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                Your score is based on {result.checks.length} recruiter checks.
              </div>
              {result.summary_ok && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ color: "var(--green)", marginTop: 1 }}>✓</span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    Scored well in <strong style={{ color: "var(--text)" }}>{result.summary_ok.replace("Scored well in ", "").replace(".", "")}</strong>.
                  </span>
                </div>
              )}
              {result.summary_bad && (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--red)", marginTop: 1 }}>✗</span>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    Needs work on <strong style={{ color: "var(--text)" }}>{result.summary_bad.replace("Needs work on ", "").replace(".", "")}</strong>.
                  </span>
                </div>
              )}
            </div>

            {/* Check detail */}
            {activeCheck && (
              <div style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 14, padding: "22px 24px", marginBottom: 24,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: activeCheck.passed ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 15,
                  }}>
                    {activeCheck.passed ? "✓" : "✗"}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{activeCheck.name}</div>
                    <div style={{ fontSize: 12, color: "var(--dim)" }}>Score: {activeCheck.score}/10</div>
                  </div>
                  <div style={{
                    marginLeft: "auto", padding: "4px 10px", borderRadius: 20,
                    background: activeCheck.passed ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                    fontSize: 11, fontWeight: 600, color: activeCheck.passed ? "var(--green)" : "var(--red)",
                    textTransform: "uppercase", letterSpacing: 0.3,
                  }}>
                    {activeCheck.passed ? "Pass" : "Fix needed"}
                  </div>
                </div>

                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 16px" }}>
                  {activeCheck.detail}
                </p>

                {activeCheck.items.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {activeCheck.id === "quantify" ? "Bullets missing metrics — click to rewrite"
                        : activeCheck.id === "role_depth" ? "Weak roles — click to rewrite with AI"
                        : "Flagged lines"}
                    </div>
                    {activeCheck.id === "role_depth"
                      ? activeCheck.items.map((item, i) => (
                          <RoleCard
                            key={i}
                            item={item}
                            rewrites={roleRewrites[item]}
                            rewriting={roleRewriting === item}
                            onRewrite={() => rewriteRole(item)}
                          />
                        ))
                      : activeCheck.items.map((item, i) => (
                          <BulletCard
                            key={i}
                            bullet={item}
                            canRewrite={activeCheck.id === "quantify" || activeCheck.id === "weak_verbs"}
                            rewrite={rewrites[item]}
                            rewriting={rewriting === item}
                            onRewrite={() => rewriteBullet(item)}
                          />
                        ))
                    }
                  </div>
                )}
              </div>
            )}

            {/* Re-analyse button */}
            <button
              onClick={() => { setResult(null); setError(null); }}
              style={{
                padding: "9px 18px", borderRadius: 9, border: "1px solid var(--border)",
                background: "transparent", color: "var(--muted)", fontSize: 13, cursor: "pointer",
              }}
            >
              Analyse another resume
            </button>
          </>
        )}
      </main>

      <input
        ref={fileRef} type="file" accept=".pdf"
        style={{ display: "none" }}
        onChange={e => onFile(e.target.files?.[0])}
      />
    </div>
  );
}

function SidebarItem({ check, active, onClick }: { check: Check; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%",
        padding: "8px 16px", border: "none", cursor: "pointer", textAlign: "left",
        background: active ? "var(--surface2)" : "transparent",
        borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
      }}
    >
      <span style={{ fontSize: 12, color: check.passed ? "var(--green)" : "var(--red)", flexShrink: 0 }}>
        {check.passed ? "✓" : "✗"}
      </span>
      <span style={{ fontSize: 13, color: "var(--text)", flex: 1, fontWeight: active ? 500 : 400 }}>
        {check.name}
      </span>
      {!check.passed && (
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--red)" }}>{check.score}</span>
      )}
      {check.passed && (
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)" }}>10</span>
      )}
    </button>
  );
}

function UploadZone({ dragging, onDragOver, onDragLeave, onDrop, onClick, error }: {
  dragging: boolean; error: string | null;
  onDragOver: React.DragEventHandler; onDragLeave: React.DragEventHandler;
  onDrop: React.DragEventHandler; onClick: () => void;
}) {
  return (
    <div style={{ maxWidth: 520, margin: "60px auto 0", textAlign: "center" }}>
      <div
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} onClick={onClick}
        style={{
          border: `2px dashed ${dragging ? "var(--accent)" : "var(--border)"}`,
          borderRadius: 16, padding: "56px 32px", cursor: "pointer",
          background: dragging ? "rgba(99,102,241,0.04)" : "var(--surface)",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>
          Drop your resume PDF here
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          or click to browse — we&apos;ll run {11} recruiter checks instantly
        </div>
      </div>
      {error && (
        <div style={{ marginTop: 12, fontSize: 13, color: "var(--red)" }}>{error}</div>
      )}
    </div>
  );
}

function RoleCard({ item, rewrites, rewriting, onRewrite }: {
  item: string; rewrites?: string[]; rewriting: boolean; onRewrite: () => void;
}) {
  // item = "Header  [reason]"
  const bracketIdx = item.lastIndexOf("  [");
  const header = bracketIdx > -1 ? item.slice(0, bracketIdx) : item;
  const reason = bracketIdx > -1 ? item.slice(bracketIdx + 2) : "";
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{header}</div>
      {reason && (
        <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 10 }}>{reason}</div>
      )}
      {rewrites && rewrites.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 2 }}>
            AI-Suggested Rewrites
          </div>
          {rewrites.map((b, i) => (
            <div key={i} style={{
              fontSize: 13, color: "var(--text)", lineHeight: 1.55,
              borderLeft: "3px solid var(--green)", paddingLeft: 10,
            }}>{b}</div>
          ))}
        </div>
      ) : (
        <button
          onClick={onRewrite}
          disabled={rewriting}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 7,
            background: "var(--accent)", border: "none", color: "#fff",
            fontSize: 12, fontWeight: 500, cursor: rewriting ? "default" : "pointer",
            opacity: rewriting ? 0.7 : 1,
          }}
        >
          {rewriting ? <Spinner /> : "✦"}
          {rewriting ? "Rewriting role…" : "Rewrite this role"}
        </button>
      )}
    </div>
  );
}

function BulletCard({ bullet, canRewrite, rewrite, rewriting, onRewrite }: {
  bullet: string; canRewrite: boolean;
  rewrite?: string; rewriting: boolean; onRewrite: () => void;
}) {
  return (
    <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{
        fontSize: 13, color: "var(--muted)", lineHeight: 1.55,
        fontStyle: "italic", marginBottom: rewrite || canRewrite ? 10 : 0,
        borderLeft: "3px solid var(--border)", paddingLeft: 10,
      }}>
        {bullet}
      </div>
      {rewrite && (
        <div style={{
          fontSize: 13, color: "var(--text)", lineHeight: 1.55,
          borderLeft: "3px solid var(--green)", paddingLeft: 10, marginBottom: 6,
        }}>
          {rewrite}
        </div>
      )}
      {canRewrite && !rewrite && (
        <button
          onClick={onRewrite}
          disabled={rewriting}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", borderRadius: 7,
            background: "var(--accent)", border: "none", color: "#fff",
            fontSize: 12, fontWeight: 500, cursor: rewriting ? "default" : "pointer",
            opacity: rewriting ? 0.7 : 1,
          }}
        >
          {rewriting ? <Spinner /> : "✦"}
          {rewriting ? "Rewriting…" : "Generate suggestion"}
        </button>
      )}
    </div>
  );
}
