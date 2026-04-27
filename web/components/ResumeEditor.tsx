"use client";

/**
 * ResumeEditor — structured bullet editor with live HTML preview.
 *
 * Design notes:
 *   • Edits target *plain text* bullets, not raw .tex. Most users don't speak
 *     LaTeX, and the few who do can still drop \textbf{} / **bold** in the
 *     textarea — both render the same way.
 *   • The preview pane is HTML-not-LaTeX. It mimics the resume's typography
 *     closely enough to read, but is NOT pixel-perfect. The "Save & re-compile"
 *     button is what ultimately produces the real PDF.
 *   • Education is locked (parser sets `editable: false`) per user request.
 *   • Per-bullet ✨ AI edit is a Phase-2 stub here — the button is wired but
 *     points to a callback the parent provides.
 */

import { useState, useMemo, useCallback, useEffect, useRef, type CSSProperties } from "react";
import type { ParsedResume, ParsedBullet, ParsedSection, ParsedEntry } from "@/lib/types";

export interface DoctorIssue {
  id:       string;
  severity: "warn" | "info";
  msg:      string;
}

interface Props {
  initial: ParsedResume;
  saving?: boolean;
  saveError?: string | null;
  /** Stable key (folder name) for scoping localStorage version history. */
  folder?: string | null;
  /** Called with the edited tree when user hits "Save & re-compile". */
  onSave: (next: ParsedResume) => void | Promise<void>;
  /** Optional: per-bullet AI rewrite. Returns the new text. */
  onAIEdit?: (bullet: ParsedBullet, instruction: string) => Promise<string>;
  /** Optional: writing-quality issues keyed by bullet id. Surfaced inline as
   *  chips under each textarea. Pure decoration — empty/missing is safe. */
  doctorIssues?: Record<string, DoctorIssue[]>;
  /** Optional: URL of the most recently compiled PDF. Enables the "PDF" toggle
   *  in the preview pane (vs the live HTML mock). */
  pdfUrl?: string | null;
}

// Cap the per-folder localStorage version log. 5 is plenty for "oh no, undo".
const MAX_HISTORY = 5;
const HISTORY_KEY = (folder: string) => `resume-editor-history:${folder}`;
const _newId = () => `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface HistoryEntry { savedAt: number; tree: ParsedResume; }

export default function ResumeEditor({ initial, saving, saveError, folder, onSave, onAIEdit, doctorIssues, pdfUrl }: Props) {
  // We work on a draft copy so cancel/reset is one setState away.
  const [draft, setDraft] = useState<ParsedResume>(initial);
  // Drag-and-drop state — which bullet is being dragged, and which slot is hovered.
  const dragRef = useRef<{ sIdx: number; eIdx: number; bIdx: number } | null>(null);
  const [dropHover, setDropHover] = useState<string | null>(null);   // "s.e.b" key

  // Version history — last MAX_HISTORY *successful saves* per folder.
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Load history on mount / when folder changes.
  useEffect(() => {
    queueMicrotask(() => {
      if (!folder) { setHistory([]); return; }
      try {
        const raw = window.localStorage.getItem(HISTORY_KEY(folder));
        setHistory(raw ? JSON.parse(raw) : []);
      } catch { setHistory([]); }
    });
  }, [folder]);

  // Re-sync draft when initial changes (e.g. parent loaded a new folder).
  useEffect(() => { queueMicrotask(() => setDraft(initial)); }, [initial]);

  const initialOpenSections = useCallback((resume: ParsedResume) => {
    const firstEditableWithContent = resume.sections.findIndex(s => s.editable && s.entries.some(e => e.bullets.length > 0));
    return Object.fromEntries(
      resume.sections.map((section, index) => [
        section.name,
        firstEditableWithContent === -1 ? index === 0 : index === firstEditableWithContent,
      ]),
    );
  }, []);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => initialOpenSections(initial));
  const defaultOpenSections = useMemo(() => initialOpenSections(draft), [draft, initialOpenSections]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const editorStats = useMemo(() => {
    const editableSections = draft.sections.filter(s => s.editable).length;
    const bullets = draft.sections.reduce((acc, section) => (
      acc + section.entries.reduce((entryAcc, entry) => entryAcc + entry.bullets.length, 0)
    ), 0);
    return { editableSections, bullets };
  }, [draft.sections]);

  const updateBullet = useCallback((sectionIdx: number, entryIdx: number, bulletIdx: number, text: string) => {
    setDraft(d => {
      const sections = d.sections.map((s, si) => {
        if (si !== sectionIdx) return s;
        const entries = s.entries.map((e, ei) => {
          if (ei !== entryIdx) return e;
          const bullets = e.bullets.map((b, bi) => bi === bulletIdx ? { ...b, text } : b);
          return { ...e, bullets };
        });
        return { ...s, entries };
      });
      return { ...d, sections };
    });
  }, []);

  /** Generic per-entry bullet-list mutator — used by add / delete / reorder. */
  const mutateBullets = useCallback((sIdx: number, eIdx: number, fn: (bs: ParsedBullet[]) => ParsedBullet[]) => {
    setDraft(d => {
      const sections = d.sections.map((s, si) => {
        if (si !== sIdx) return s;
        const entries = s.entries.map((e, ei) => ei === eIdx ? { ...e, bullets: fn(e.bullets) } : e);
        return { ...s, entries };
      });
      return { ...d, sections };
    });
  }, []);

  const addBullet = useCallback((sIdx: number, eIdx: number) => {
    mutateBullets(sIdx, eIdx, bs => [...bs, { id: _newId(), text: "", texLine: -1 }]);
  }, [mutateBullets]);

  const deleteBullet = useCallback((sIdx: number, eIdx: number, bIdx: number) => {
    mutateBullets(sIdx, eIdx, bs => bs.filter((_, i) => i !== bIdx));
  }, [mutateBullets]);

  const reorderBullets = useCallback((sIdx: number, eIdx: number, fromIdx: number, toIdx: number) => {
    mutateBullets(sIdx, eIdx, bs => {
      const next = bs.slice();
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
  }, [mutateBullets]);

  /** Section-level "✨ Rewrite all" — runs onAIEdit serially over every bullet
   *  in the section. We snapshot the existing draft first so a failure mid-run
   *  doesn't strand half-rewritten state.
   */
  const rewriteSection = useCallback(async (sIdx: number, instruction: string) => {
    if (!onAIEdit) return;
    const sec = draft.sections[sIdx];
    if (!sec || !sec.editable) return;
    // Walk entries × bullets, awaiting each — do serial so we don't blast the
    // backend with parallel LLM calls (Gemini free tier RPMs hate that).
    for (let ei = 0; ei < sec.entries.length; ei++) {
      const entry = sec.entries[ei];
      for (let bi = 0; bi < entry.bullets.length; bi++) {
        const b = entry.bullets[bi];
        try {
          const next = await onAIEdit(b, instruction);
          // Re-read draft via setter to avoid stale-state writes during the
          // long-running serial loop.
          setDraft(d => {
            const sections = d.sections.map((s, si) => {
              if (si !== sIdx) return s;
              const entries = s.entries.map((e, eei) => {
                if (eei !== ei) return e;
                const bullets = e.bullets.map((bb, bbi) => bbi === bi ? { ...bb, text: next } : bb);
                return { ...e, bullets };
              });
              return { ...s, entries };
            });
            return { ...d, sections };
          });
        } catch (e) {
          console.warn("rewriteSection: bullet failed, continuing", e);
        }
      }
    }
  }, [draft, onAIEdit]);

  const wrappedSave = useCallback(async (next: ParsedResume) => {
    await onSave(next);
    // Persist the post-save tree to local history (best-effort).
    if (!folder) return;
    try {
      const trimmed: HistoryEntry[] = [
        { savedAt: Date.now(), tree: next },
        ...history,
      ].slice(0, MAX_HISTORY);
      window.localStorage.setItem(HISTORY_KEY(folder), JSON.stringify(trimmed));
      setHistory(trimmed);
    } catch (err) {
      console.warn("localStorage write failed", err);
    }
  }, [folder, history, onSave]);

  const restoreVersion = useCallback((tree: ParsedResume) => {
    setDraft(tree);
    setHistoryOpen(false);
  }, []);

  return (
    <div
      className="resume-editor-workspace"
      style={{
      display: "grid",
      gridTemplateColumns: "minmax(560px, 1.18fr) minmax(420px, 0.82fr)",
      gap: 18,
      // Tall enough to feel like a real workspace, short enough to not eat the page.
      minHeight: 600,
      alignItems: "start",
    }}>
      {/* ── EDITOR PANE ───────────────────────────────────────── */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: 0, overflow: "hidden", maxHeight: "82vh",
        boxShadow: "0 18px 60px rgba(0,0,0,0.24)",
      }}>
        <div style={{
          position: "sticky", top: 0, zIndex: 5,
          padding: "14px 16px 12px",
          background: "linear-gradient(to bottom, var(--surface) 82%, rgba(28,28,30,0.86))",
          borderBottom: "1px solid var(--border)",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 750, color: "var(--text)", letterSpacing: -0.2 }}>
                Resume editor
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                <HelpChip label={`${editorStats.editableSections} editable sections`} />
                <HelpChip label={`${editorStats.bullets} bullets`} />
                <HelpChip label="**bold** supported" />
                <HelpChip label="Education locked" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                onClick={() => setOpenSections(Object.fromEntries(draft.sections.map(s => [s.name, true])))}
                style={toolbarButtonStyle}
              >
                Expand all
              </button>
              <button
                onClick={() => setOpenSections(Object.fromEntries(draft.sections.map(s => [s.name, false])))}
                style={toolbarButtonStyle}
              >
                Collapse all
              </button>
              {history.length > 0 && (
                <button
                  onClick={() => setHistoryOpen(o => !o)}
                  title={`${history.length} prior version${history.length === 1 ? "" : "s"} saved locally`}
                  style={{
                    ...toolbarButtonStyle,
                    background: historyOpen ? "var(--accent-bg)" : "var(--surface2)",
                    color: historyOpen ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  History ({history.length})
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ overflow: "auto", maxHeight: "calc(82vh - 74px)", padding: 16 }}>
          {/* Version history popover — slides in below the toolbar */}
          {historyOpen && history.length > 0 && (
            <div style={{
              background: "var(--surface2)", border: "1px solid var(--border)",
              borderRadius: 12, padding: 8, marginBottom: 12,
              display: "flex", flexDirection: "column", gap: 4,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase", padding: "4px 6px" }}>
                Recent saves (this device only)
              </div>
              {history.map((h, i) => {
                const ago = relativeTime(h.savedAt);
                const bulletCount = h.tree.sections.reduce((acc, s) => acc + s.entries.reduce((a, e) => a + e.bullets.length, 0), 0);
                return (
                  <button
                    key={i}
                    onClick={() => restoreVersion(h.tree)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "7px 10px", fontSize: 11,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 8, color: "var(--text)", cursor: "pointer",
                      fontFamily: "inherit", textAlign: "left",
                    }}
                  >
                    <span>{i === 0 ? "Latest" : `Version ${history.length - i}`} · {ago}</span>
                    <span style={{ color: "var(--dim)", fontSize: 10 }}>{bulletCount} bullets · restore</span>
                  </button>
                );
              })}
            </div>
          )}

          {draft.sections.map((section, si) => (
            <SectionBlock
              key={si}
              section={section}
              sIdx={si}
              open={openSections[section.name] ?? defaultOpenSections[section.name] ?? false}
              onToggle={() => setOpenSections(prev => ({ ...prev, [section.name]: !(prev[section.name] ?? false) }))}
              onBulletChange={(ei, bi, text) => updateBullet(si, ei, bi, text)}
              onBulletAdd={(ei) => addBullet(si, ei)}
              onBulletDelete={(ei, bi) => deleteBullet(si, ei, bi)}
              onBulletReorder={(ei, from, to) => reorderBullets(si, ei, from, to)}
              onSectionRewrite={onAIEdit ? (instruction) => rewriteSection(si, instruction) : undefined}
              onAIEdit={onAIEdit}
              doctorIssues={doctorIssues}
              dragRef={dragRef}
              dropHover={dropHover}
              setDropHover={setDropHover}
            />
          ))}

          {/* Save bar — sticky at the bottom of the editor pane */}
          <div style={{
            position: "sticky", bottom: -16, marginTop: 16, paddingTop: 12,
            paddingBottom: 4,
            background: "linear-gradient(to top, var(--surface) 64%, rgba(28,28,30,0))",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <button
              disabled={!dirty || saving}
              onClick={() => wrappedSave(draft)}
              style={{
                fontSize: 13, padding: "10px 18px",
                background: dirty ? "var(--accent)" : "var(--surface2)",
                color: dirty ? "#fff" : "var(--dim)",
                border: "none", borderRadius: 10,
                cursor: dirty && !saving ? "pointer" : "not-allowed",
                fontWeight: 700, letterSpacing: -0.2, fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {saving ? "Re-compiling…" : dirty ? "Save & re-compile PDF" : "No changes"}
            </button>
            {dirty && !saving && (
              <button
                onClick={() => setDraft(initial)}
                style={{
                  fontSize: 12, padding: "9px 12px",
                  background: "transparent", color: "var(--dim)",
                  border: "1px solid var(--border)", borderRadius: 9,
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Discard
              </button>
            )}
            {saveError && (
              <span style={{ fontSize: 12, color: "var(--red)" }}>{saveError}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── PREVIEW PANE ──────────────────────────────────────── */}
      <PreviewSurface
        resume={draft}
        pdfUrl={pdfUrl ?? null}
        dirty={dirty}
      />
    </div>
  );
}

/* ── Editor sub-components ────────────────────────────────── */

type DragHandle = React.MutableRefObject<{ sIdx: number; eIdx: number; bIdx: number } | null>;

const toolbarButtonStyle: CSSProperties = {
  fontSize: 10,
  padding: "6px 9px",
  background: "var(--surface2)",
  color: "var(--muted)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: 0.2,
  textTransform: "uppercase",
  fontWeight: 700,
};

function HelpChip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: 10,
      padding: "3px 7px",
      borderRadius: 999,
      background: "var(--surface2)",
      color: "var(--dim)",
      border: "1px solid var(--border)",
      lineHeight: 1.4,
    }}>
      {label}
    </span>
  );
}

function SectionBlock({
  section, sIdx,
  open, onToggle,
  onBulletChange, onBulletAdd, onBulletDelete, onBulletReorder,
  onSectionRewrite, onAIEdit, doctorIssues,
  dragRef, dropHover, setDropHover,
}: {
  section: ParsedSection;
  sIdx: number;
  open: boolean;
  onToggle: () => void;
  onBulletChange: (entryIdx: number, bulletIdx: number, text: string) => void;
  onBulletAdd:    (entryIdx: number) => void;
  onBulletDelete: (entryIdx: number, bulletIdx: number) => void;
  onBulletReorder:(entryIdx: number, fromIdx: number, toIdx: number) => void;
  onSectionRewrite?: (instruction: string) => Promise<void>;
  onAIEdit?: Props["onAIEdit"];
  doctorIssues?: Record<string, DoctorIssue[]>;
  dragRef:    DragHandle;
  dropHover:  string | null;
  setDropHover: (v: string | null) => void;
}) {
  const [sectionAIBusy, setSectionAIBusy] = useState(false);
  const [sectionAIOpen, setSectionAIOpen] = useState(false);

  const runSectionAI = async (instr: string) => {
    if (!onSectionRewrite) return;
    setSectionAIBusy(true);
    try { await onSectionRewrite(instr); }
    finally { setSectionAIBusy(false); setSectionAIOpen(false); }
  };

  const bulletCount = section.entries.reduce((acc, entry) => acc + entry.bullets.length, 0);

  return (
    <div style={{
      marginBottom: 10,
      border: "1px solid var(--border)",
      borderRadius: 13,
      overflow: "hidden",
      background: open ? "rgba(255,255,255,0.018)" : "transparent",
    }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={ev => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        style={{
          width: "100%",
          border: "none",
          background: open ? "var(--surface2)" : "transparent",
          color: "var(--text)",
          display: "grid",
          gridTemplateColumns: "20px minmax(0, 1fr) auto",
          alignItems: "center",
          gap: 10,
          padding: "11px 12px",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{
          color: section.editable ? "var(--accent)" : "var(--dim)",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.16s ease-out",
          fontSize: 13,
        }}>›</span>
        <span style={{ minWidth: 0 }}>
          <span style={{
            display: "block",
            fontSize: 12,
            fontWeight: 750,
            color: section.editable ? "var(--text)" : "var(--dim)",
            letterSpacing: 0.2,
            textTransform: "uppercase",
          }}>
            {section.name}
          </span>
          <span style={{ display: "block", marginTop: 2, fontSize: 10.5, color: "var(--dim)" }}>
            {bulletCount} bullet{bulletCount === 1 ? "" : "s"}
            {!section.editable ? " • locked" : ""}
          </span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
          {!section.editable && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: "3px 7px",
              background: "var(--surface)", color: "var(--dim)",
              borderRadius: 999, letterSpacing: 0.3,
              border: "1px solid var(--border)",
            }}>LOCKED</span>
          )}
          {section.editable && onSectionRewrite && (
            <span
              onClick={ev => { ev.stopPropagation(); setSectionAIOpen(o => !o); }}
              role="button"
              tabIndex={0}
              onKeyDown={ev => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  ev.stopPropagation();
                  setSectionAIOpen(o => !o);
                }
              }}
              title={`Rewrite every bullet in ${section.name} with one instruction`}
              style={{
                fontSize: 9, padding: "4px 8px",
                background: sectionAIOpen ? "var(--accent-bg)" : "var(--surface)",
                color: sectionAIOpen ? "var(--accent)" : "var(--muted)",
                border: "1px solid var(--border)", borderRadius: 999,
                cursor: sectionAIBusy ? "wait" : "pointer", fontFamily: "inherit",
                letterSpacing: 0.3, fontWeight: 700, textTransform: "uppercase",
              }}
            >
              {sectionAIBusy ? "Rewriting" : "Rewrite"}
            </span>
          )}
        </span>
      </div>

      {open && (
        <div style={{ padding: "12px 12px 14px" }}>
          {sectionAIOpen && !sectionAIBusy && (
            <SectionRewritePopover
              onRun={runSectionAI}
              onCancel={() => setSectionAIOpen(false)}
            />
          )}

          {section.entries.map((entry, ei) => (
            <EntryBlock
              key={ei}
              entry={entry}
              sIdx={sIdx}
              eIdx={ei}
              editable={section.editable}
              onBulletChange={(bi, text) => onBulletChange(ei, bi, text)}
              onBulletAdd={() => onBulletAdd(ei)}
              onBulletDelete={(bi) => onBulletDelete(ei, bi)}
              onBulletReorder={(from, to) => onBulletReorder(ei, from, to)}
              onAIEdit={onAIEdit}
              doctorIssues={doctorIssues}
              dragRef={dragRef}
              dropHover={dropHover}
              setDropHover={setDropHover}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SectionRewritePopover({ onRun, onCancel }: { onRun: (instr: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState("");
  const PRESETS = [
    "Make every bullet more quantified, but never invent numbers.",
    "Tighten every bullet — drop hedge words, keep all facts.",
    "Lead each bullet with a stronger action verb.",
  ];
  return (
    <div style={{
      background: "var(--surface2)", border: "1px solid var(--border)",
      borderRadius: 8, padding: 12, marginBottom: 12,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.5, textTransform: "uppercase" }}>
        Section rewrite — applies to every bullet here
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PRESETS.map(p => (
          <button
            key={p}
            onClick={() => onRun(p)}
            style={{
              fontSize: 11, padding: "5px 10px",
              background: "var(--surface)", color: "var(--text)",
              border: "1px solid var(--border)", borderRadius: 14,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >{p.split(",")[0]}</button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder='Custom instruction — e.g. "emphasize Python and distributed systems"'
          style={{ fontSize: 12, padding: "6px 10px", flex: 1 }}
        />
        <button
          onClick={() => onRun(val || "Make every bullet sharper while preserving all facts.")}
          style={{
            fontSize: 11, padding: "6px 14px",
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 6, cursor: "pointer",
            fontFamily: "inherit", fontWeight: 600,
          }}
        >Run</button>
        <button
          onClick={onCancel}
          style={{
            fontSize: 11, padding: "6px 12px",
            background: "transparent", color: "var(--dim)",
            border: "1px solid var(--border)", borderRadius: 6,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >Cancel</button>
      </div>
      <div style={{ fontSize: 10, color: "var(--dim)" }}>
        Section rewrites bypass the per-bullet preview — review the result and use History to undo if needed.
      </div>
    </div>
  );
}

function EntryBlock({
  entry, sIdx, eIdx, editable,
  onBulletChange, onBulletAdd, onBulletDelete, onBulletReorder, onAIEdit, doctorIssues,
  dragRef, dropHover, setDropHover,
}: {
  entry: ParsedEntry;
  sIdx: number;
  eIdx: number;
  editable: boolean;
  onBulletChange: (bulletIdx: number, text: string) => void;
  onBulletAdd: () => void;
  onBulletDelete: (bulletIdx: number) => void;
  onBulletReorder: (fromIdx: number, toIdx: number) => void;
  onAIEdit?: Props["onAIEdit"];
  doctorIssues?: Record<string, DoctorIssue[]>;
  dragRef:    DragHandle;
  dropHover:  string | null;
  setDropHover: (v: string | null) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      {entry.header && (
        <div style={{
          fontSize: 12, fontWeight: 600, color: "var(--text)",
          marginBottom: 6, letterSpacing: -0.2,
        }}>
          {entry.header}
        </div>
      )}
      {entry.bullets.map((b, bi) => {
        const dropKey = `${sIdx}.${eIdx}.${bi}`;
        return (
          <div
            key={b.id}
            // Drop zone styling — a thin accent line above the bullet when hovered.
            style={{
              borderTop: dropHover === dropKey ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "border-color 0.1s",
            }}
            onDragOver={ev => {
              if (!editable) return;
              const drag = dragRef.current;
              if (!drag || drag.sIdx !== sIdx || drag.eIdx !== eIdx) return;
              ev.preventDefault();
              setDropHover(dropKey);
            }}
            onDrop={ev => {
              if (!editable) return;
              const drag = dragRef.current;
              if (!drag || drag.sIdx !== sIdx || drag.eIdx !== eIdx) return;
              ev.preventDefault();
              const from = drag.bIdx;
              // If dropping below original position, target index shifts down by 1.
              const to = bi > from ? bi - 1 : bi;
              if (from !== to) onBulletReorder(from, to);
              setDropHover(null);
              dragRef.current = null;
            }}
          >
            <BulletRow
              bullet={b}
              editable={editable}
              onChange={text => onBulletChange(bi, text)}
              onDelete={() => onBulletDelete(bi)}
              onDragStart={() => { dragRef.current = { sIdx, eIdx, bIdx: bi }; }}
              onDragEnd={() => { dragRef.current = null; setDropHover(null); }}
              onAIEdit={onAIEdit}
              issues={doctorIssues?.[b.id]}
            />
          </div>
        );
      })}
      {entry.bullets.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--dim)", fontStyle: "italic", padding: "4px 0" }}>
          (no bullets yet)
        </div>
      )}
      {editable && (
        <button
          onClick={onBulletAdd}
          style={{
            fontSize: 11, padding: "5px 10px", marginTop: 4,
            background: "transparent", color: "var(--accent)",
            border: "1px dashed var(--border)", borderRadius: 6,
            cursor: "pointer", fontFamily: "inherit", letterSpacing: -0.1,
          }}
        >
          + Add bullet
        </button>
      )}
    </div>
  );
}

/** Quick-action chips — one-click rewrites without typing an instruction.
 *  Order matters: Quantify is the highest-leverage default for most bullets. */
const QUICK_ACTIONS: { label: string; instr: string }[] = [
  { label: "Quantify",       instr: "Add concrete numbers, percentages, or scale where the original implies them. Don't invent metrics that aren't already supported by the bullet." },
  { label: "Shorten",        instr: "Trim to one tight line. Drop hedge words and connective filler. Keep every concrete fact." },
  { label: "Stronger verb",  instr: "Replace the leading verb with a more specific, high-impact action verb. Keep everything else identical." },
  { label: "Match JD tone",  instr: "Re-phrase to match the language and emphasis of the job description, while preserving every fact in the original." },
];

function BulletRow({
  bullet, editable, onChange, onDelete, onDragStart, onDragEnd, onAIEdit, issues,
}: {
  bullet: ParsedBullet;
  editable: boolean;
  onChange: (text: string) => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onAIEdit?: Props["onAIEdit"];
  issues?: DoctorIssue[];
}) {
  const [aiOpen,  setAiOpen]  = useState(false);
  const [aiInstr, setAiInstr] = useState("");
  const [aiBusy,  setAiBusy]  = useState(false);
  const [aiErr,   setAiErr]   = useState<string | null>(null);
  // Pending rewrite — held until user accepts. `null` = no preview yet.
  const [preview, setPreview] = useState<string | null>(null);
  // We snapshot the instruction that produced the current preview so "Try
  // again" re-runs the same one even if the user types something else after.
  const [lastInstr, setLastInstr] = useState<string>("");

  const runAI = async (instruction: string) => {
    if (!onAIEdit) return;
    setAiBusy(true); setAiErr(null);
    try {
      const next = await onAIEdit(bullet, instruction || "Make this stronger and more quantified.");
      setPreview(next);
      setLastInstr(instruction || "Make this stronger and more quantified.");
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const accept = () => {
    if (preview === null) return;
    onChange(preview);
    setAiOpen(false); setPreview(null); setAiInstr(""); setLastInstr("");
  };
  const close = () => {
    setAiOpen(false); setPreview(null); setAiInstr(""); setLastInstr(""); setAiErr(null);
  };

  return (
    <div
      // Drag handles live on the row itself (not just a tiny grip icon) so the
      // drop zone is forgiving — but we restrict the *initiation* to a draggable
      // attribute on the explicit grip span so accidental textarea drags don't
      // hijack text-selection. (See `draggable={false}` on textarea below.)
      style={{ marginBottom: 8 }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <span
          draggable={editable && !!onDragStart}
          onDragStart={ev => {
            // Use a transparent drag image so the browser doesn't show a
            // misaligned ghost; the drop-zone highlight is enough feedback.
            if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
            onDragStart?.();
          }}
          onDragEnd={onDragEnd}
          title={editable ? "Drag to reorder" : ""}
          style={{
            color: "var(--dim)", marginTop: 6, fontSize: 14, flexShrink: 0,
            cursor: editable && onDragStart ? "grab" : "default",
            userSelect: "none", padding: "0 4px",
          }}
        >⋮⋮</span>
        <textarea
          value={bullet.text}
          onChange={e => onChange(e.target.value)}
          disabled={!editable}
          draggable={false}
          rows={Math.max(2, Math.ceil(bullet.text.length / 80))}
          style={{
            fontSize: 12, lineHeight: 1.5, padding: "6px 10px",
            background: editable ? "var(--surface2)" : "var(--surface)",
            color: editable ? "var(--text)" : "var(--dim)",
            border: "1px solid var(--border)", borderRadius: 6,
            resize: "vertical", flex: 1,
            cursor: editable ? "text" : "not-allowed",
          }}
        />
        {editable && onAIEdit && (
          <button
            onClick={() => setAiOpen(o => !o)}
            title="Rewrite with AI"
            style={{
              fontSize: 11, padding: "6px 9px",
              background: aiOpen ? "var(--accent-bg)" : "var(--surface2)",
              color: aiOpen ? "var(--accent)" : "var(--muted)",
              border: "1px solid var(--border)", borderRadius: 6,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
            }}
          >
            ✨ AI
          </button>
        )}
        {editable && onDelete && (
          <button
            onClick={onDelete}
            title="Delete bullet"
            style={{
              fontSize: 14, padding: "4px 8px",
              background: "var(--surface2)", color: "var(--dim)",
              border: "1px solid var(--border)", borderRadius: 6,
              cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
              lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {issues && issues.length > 0 && (
        <div style={{
          marginTop: 4, marginLeft: 16,
          display: "flex", flexWrap: "wrap", gap: 4,
        }}>
          {issues.map(iss => (
            <span
              key={iss.id}
              title={iss.msg}
              style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 999,
                background: iss.severity === "warn"
                  ? "rgba(255, 95, 95, 0.13)" : "rgba(255, 204, 0, 0.13)",
                color: iss.severity === "warn" ? "var(--red)" : "var(--yellow, #ffc857)",
                border: `1px solid ${iss.severity === "warn" ? "var(--red)" : "var(--yellow, #ffc857)"}33`,
                letterSpacing: -0.1, lineHeight: 1.4,
                cursor: "help",
              }}
            >
              {iss.severity === "warn" ? "⚠" : "ⓘ"} {iss.msg.split("—")[0].trim()}
            </span>
          ))}
        </div>
      )}

      {aiOpen && (
        <div style={{
          marginTop: 6, marginLeft: 16, padding: 12,
          background: "var(--surface2)", borderRadius: 8,
          display: "flex", flexDirection: "column", gap: 10,
          border: "1px solid var(--border)",
        }}>
          {/* When no preview yet → show chips + custom input.
              When preview present → show diff + accept/try-again. */}
          {preview === null ? (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Quick actions
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {QUICK_ACTIONS.map(a => (
                  <button
                    key={a.label}
                    onClick={() => runAI(a.instr)}
                    disabled={aiBusy}
                    title={a.instr}
                    style={{
                      fontSize: 11, padding: "5px 10px",
                      background: "var(--surface)", color: "var(--text)",
                      border: "1px solid var(--border)", borderRadius: 14,
                      cursor: aiBusy ? "wait" : "pointer", fontFamily: "inherit",
                      letterSpacing: -0.1,
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 700, marginTop: 2 }}>
                Or describe your own change
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={aiInstr}
                  onChange={e => setAiInstr(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !aiBusy) runAI(aiInstr); }}
                  placeholder='e.g. "lead with the business outcome"'
                  style={{ fontSize: 12, padding: "6px 10px", flex: 1 }}
                />
                <button
                  onClick={() => runAI(aiInstr)} disabled={aiBusy}
                  style={{
                    fontSize: 11, padding: "6px 14px",
                    background: "var(--accent)", color: "#fff",
                    border: "none", borderRadius: 6, cursor: aiBusy ? "wait" : "pointer",
                    fontFamily: "inherit", fontWeight: 600, flexShrink: 0,
                  }}
                >
                  {aiBusy ? "Rewriting…" : "Rewrite"}
                </button>
                <button
                  onClick={close}
                  style={{
                    fontSize: 11, padding: "6px 12px",
                    background: "transparent", color: "var(--dim)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
              </div>
              {aiErr && <span style={{ fontSize: 11, color: "var(--red)" }}>{aiErr}</span>}
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                Suggested rewrite — review then accept
              </div>
              <DiffPreview before={bullet.text} after={preview} />
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={accept}
                  style={{
                    fontSize: 11, padding: "6px 14px",
                    background: "var(--green)", color: "#0a0a0a",
                    border: "none", borderRadius: 6, cursor: "pointer",
                    fontFamily: "inherit", fontWeight: 600,
                  }}
                >
                  ✓ Accept
                </button>
                <button
                  onClick={() => runAI(lastInstr)}
                  disabled={aiBusy}
                  style={{
                    fontSize: 11, padding: "6px 12px",
                    background: "var(--surface)", color: "var(--text)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    cursor: aiBusy ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >
                  {aiBusy ? "Trying again…" : "↻ Try again"}
                </button>
                <button
                  onClick={close}
                  style={{
                    fontSize: 11, padding: "6px 12px",
                    background: "transparent", color: "var(--dim)",
                    border: "1px solid var(--border)", borderRadius: 6,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>
                <span style={{ fontSize: 10, color: "var(--dim)", marginLeft: "auto" }}>
                  {preview.length} chars ({preview.length - bullet.text.length >= 0 ? "+" : ""}{preview.length - bullet.text.length})
                </span>
              </div>
              {aiErr && <span style={{ fontSize: 11, color: "var(--red)" }}>{aiErr}</span>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Diff preview ─────────────────────────────────────────── */

/**
 * Word-level diff renderer for the AI rewrite preview.
 *
 * Uses a longest-common-subsequence pass over tokens (words + whitespace).
 * Removed tokens render with red strikethrough on a faint red background;
 * added tokens render with green underline on a faint green background;
 * unchanged tokens render plain. Mirrors what GitHub does in inline-diff
 * mode and is the most readable pattern for short single-bullet rewrites.
 */
function DiffPreview({ before, after }: { before: string; after: string }) {
  const tokens = useMemo(() => diffWords(before, after), [before, after]);
  return (
    <div style={{
      fontSize: 12, lineHeight: 1.55, padding: "10px 12px",
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 6, color: "var(--text)",
    }}>
      {tokens.map((t, i) => {
        if (t.type === "same") return <span key={i}>{t.text}</span>;
        if (t.type === "add") return (
          <span key={i} style={{
            background: "rgba(52,211,153,0.18)", color: "var(--green)",
            textDecoration: "underline", textDecorationColor: "rgba(52,211,153,0.6)",
            borderRadius: 3, padding: "0 2px",
          }}>{t.text}</span>
        );
        return (
          <span key={i} style={{
            background: "rgba(248,113,113,0.14)", color: "var(--red)",
            textDecoration: "line-through", textDecorationColor: "rgba(248,113,113,0.6)",
            borderRadius: 3, padding: "0 2px",
          }}>{t.text}</span>
        );
      })}
    </div>
  );
}

/** Tiny "5 min ago" formatter for the version-history list. */
function relativeTime(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60)        return `${s}s ago`;
  if (s < 60 * 60)   return `${Math.floor(s / 60)}m ago`;
  if (s < 60 * 60 * 24) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

type DiffTok = { type: "same" | "add" | "del"; text: string };

function diffWords(before: string, after: string): DiffTok[] {
  // Tokenize keeping whitespace so the rendered diff preserves spacing.
  const tok = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];
  const a = tok(before);
  const b = tok(after);
  const n = a.length, m = b.length;

  // Standard LCS DP. Bullets are short (rarely >50 tokens) so O(n*m) is fine.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffTok[] = [];
  let i = 0, j = 0;
  const push = (type: DiffTok["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  while (i < n && j < m) {
    if (a[i] === b[j])              { push("same", a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", a[i]);  i++; }
    else                            { push("add", b[j]);  j++; }
  }
  while (i < n) { push("del", a[i++]); }
  while (j < m) { push("add", b[j++]); }
  return out;
}

/* ── Preview pane ─────────────────────────────────────────── */

/**
 * PreviewSurface — wraps the HTML mock + (optionally) the real compiled PDF
 * so the user can flip between them with a small toggle.
 *
 * Default behavior:
 *  - PDF available + no unsaved edits → show PDF (it's the source of truth)
 *  - PDF available + unsaved edits → show HTML (PDF is now stale; HTML reflects
 *    the *current* draft)
 *  - No PDF yet → HTML only, no toggle
 *
 * The toggle lets the user override either way (e.g. peek at the PDF mid-edit
 * to remember the layout, or check the HTML preview after save).
 */
function PreviewSurface({ resume, pdfUrl, dirty }: {
  resume: ParsedResume;
  pdfUrl: string | null;
  dirty: boolean;
}) {
  // Default: prefer PDF when clean, HTML when dirty.
  const [mode, setMode] = useState<"html" | "pdf">(pdfUrl && !dirty ? "pdf" : "html");
  // When the user starts editing, auto-flip back to HTML so they see live
  // updates. We track the "user manually overrode" state to avoid yanking
  // them out of PDF mode if they explicitly chose it.
  const [userOverride, setUserOverride] = useState(false);
  useEffect(() => {
    if (userOverride) return;
    queueMicrotask(() => {
      if (dirty && mode === "pdf") setMode("html");
      if (!dirty && pdfUrl && mode === "html") setMode("pdf");
    });
  }, [dirty, pdfUrl, mode, userOverride]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {pdfUrl && (
        <div style={{
          display: "flex", gap: 4, padding: 3,
          background: "var(--surface2)", borderRadius: 7,
          alignSelf: "flex-end",
        }}>
          {(["html", "pdf"] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setUserOverride(true); }}
              style={{
                fontSize: 10.5, padding: "4px 10px",
                background: mode === m ? "var(--surface)" : "transparent",
                color: mode === m ? "var(--text)" : "var(--dim)",
                border: "none", borderRadius: 5,
                fontWeight: mode === m ? 600 : 400,
                cursor: "pointer", fontFamily: "inherit",
                letterSpacing: -0.1,
              }}
              title={m === "pdf" && dirty ? "PDF reflects last save — unsaved edits not shown" : ""}
            >
              {m === "pdf" ? "PDF" : "Live preview"}
              {m === "pdf" && dirty && <span style={{ marginLeft: 4, color: "var(--orange)" }}>•</span>}
            </button>
          ))}
        </div>
      )}

      {mode === "pdf" && pdfUrl ? (
        <div style={{
          border: "1px solid var(--border)", borderRadius: 12,
          overflow: "hidden", background: "#1c1c1e",
          maxHeight: "78vh",
        }}>
          <iframe
            src={pdfUrl + "#toolbar=0&navpanes=0"}
            title="Compiled PDF preview"
            style={{
              width: "100%", height: "78vh", border: "none",
              display: "block", background: "#fafaf7",
            }}
          />
        </div>
      ) : (
        <div style={{
          background: "#fafaf7", color: "#111",
          border: "1px solid var(--border)", borderRadius: 12,
          padding: "32px 36px", overflow: "auto", maxHeight: "78vh",
          fontFamily: "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
          fontSize: 11, lineHeight: 1.35,
        }}>
          <PreviewPane resume={resume} />
        </div>
      )}
    </div>
  );
}

/** Render plain text with **bold** and \textbf{...} both honored. */
function renderInline(text: string): React.ReactNode[] {
  // Normalize \textbf{x} → **x** so we have one syntax to split on.
  const normalized = text.replace(/\\textbf\{([^}]*)\}/g, "**$1**");
  const parts = normalized.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

function PreviewPane({ resume }: { resume: ParsedResume }) {
  const header = extractPreviewHeader(resume.rawTex);
  return (
    <div>
      <div style={{
        textAlign: "center",
        marginBottom: 12,
        paddingBottom: 8,
        borderBottom: "0.5px solid #d7d2c6",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.2, marginBottom: 3 }}>
          {header.name}
        </div>
        <div style={{ fontSize: 9.5, lineHeight: 1.45, color: "#333" }}>
          {header.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
      {resume.sections.map((s, si) => (
        <div key={si} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: 1.2, borderBottom: "0.5px solid #333",
            paddingBottom: 2, marginBottom: 6,
          }}>
            {s.name}
          </div>
          {s.entries.map((e, ei) => (
            <div key={ei} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>
                {renderInline(e.header)}
              </div>
              {e.bullets.length > 0 && (
                // Explicit listStyle — globals.css resets all margins/padding,
                // which also wipes default list bullets. Restore them here.
                <ul style={{ paddingLeft: 16, margin: 0, listStyle: "disc outside" }}>
                  {e.bullets.map(b => (
                    <li key={b.id} style={{ fontSize: 10.5, lineHeight: 1.4, marginBottom: 2, marginLeft: 4 }}>
                      {renderInline(b.text)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function extractPreviewHeader(rawTex: string): { name: string; lines: string[] } {
  // Keep the user-info section visible in the HTML preview. Prefer details from
  // the generated .tex if present, then fall back to the canonical profile info.
  const fallback = {
    name: "Parth Bhodia",
    lines: [
      "Jersey City, NJ (NYC metro)",
      "parthbhodia08@gmail.com | +1 (443) 929-4371",
      "parthbhodia.com | linkedin.com/in/parthbhodia",
    ],
  };

  if (!rawTex) return fallback;
  const bodyStart = rawTex.includes("\\begin{document}")
    ? rawTex.split("\\begin{document}", 2)[1]
    : rawTex;
  const beforeFirstSection = bodyStart.split(/\\section\s*\{/)[0] ?? bodyStart;
  const cleaned = beforeFirstSection
    .replace(/%.*$/gm, "")
    .replace(/\\(?:vspace|hspace)\*?\s*\{[^{}]*\}/g, "")
    .replace(/\\(?:rule|addtolength|setlength|titleformat|titlespacing)\*?\s*(\[[^\]]*\])?(\{[^{}]*\})+/g, "")
    .replace(/\\(?:textbf|textit|emph|uline|underline|large|Large|small)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:begin|end)\{center\}/g, "")
    .replace(/\\(?:center|noindent|centering|hfill|par|quad|qquad)/g, "")
    .replace(/\\\\/g, "\n")
    .replace(/[{}]/g, "")
    .split(/\n+/)
    .map(s => s.replace(/\\[a-zA-Z]+\*?/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter(s => !/(documentclass|usepackage|article|a4paper|11pt|textwidth|textheight|footskip|oddsidemargin|evensidemargin|topmargin|pdfgentounicode|glyphtounicode|pagestyle|fancy|renewcommand|newcommand|0in|=1)/i.test(s));

  const name = cleaned.find(s => /parth\s+bhodia/i.test(s)) ?? fallback.name;
  const lines = cleaned
    .filter(s => s !== name)
    .filter(s => /@|\+?\d|linkedin|github|jersey|city|nj|http|www|\.com/i.test(s))
    .slice(0, 3);

  return { name, lines: lines.length ? lines : fallback.lines };
}
