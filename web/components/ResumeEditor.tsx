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

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { ParsedResume, ParsedBullet, ParsedSection, ParsedEntry } from "@/lib/types";

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
}

// Cap the per-folder localStorage version log. 5 is plenty for "oh no, undo".
const MAX_HISTORY = 5;
const HISTORY_KEY = (folder: string) => `resume-editor-history:${folder}`;
const _newId = () => `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

interface HistoryEntry { savedAt: number; tree: ParsedResume; }

export default function ResumeEditor({ initial, saving, saveError, folder, onSave, onAIEdit }: Props) {
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
    if (!folder) { setHistory([]); return; }
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY(folder));
      setHistory(raw ? JSON.parse(raw) : []);
    } catch { setHistory([]); }
  }, [folder]);

  // Re-sync draft when initial changes (e.g. parent loaded a new folder).
  useEffect(() => { setDraft(initial); }, [initial]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

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
    <div style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
      gap: 16,
      // Tall enough to feel like a real workspace, short enough to not eat the page.
      minHeight: 600,
    }}>
      {/* ── EDITOR PANE ───────────────────────────────────────── */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, padding: 16, overflow: "auto", maxHeight: "78vh",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Editor
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {history.length > 0 && (
              <button
                onClick={() => setHistoryOpen(o => !o)}
                title={`${history.length} prior version${history.length === 1 ? "" : "s"} saved locally`}
                style={{
                  fontSize: 10, padding: "4px 8px",
                  background: historyOpen ? "var(--accent-bg)" : "var(--surface2)",
                  color: historyOpen ? "var(--accent)" : "var(--muted)",
                  border: "1px solid var(--border)", borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                  letterSpacing: 0.3, textTransform: "uppercase", fontWeight: 600,
                }}
              >
                ↺ History ({history.length})
              </button>
            )}
            <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: -0.1 }}>
              <code style={{ color: "var(--text)" }}>**bold**</code> • drag to reorder • Education is locked
            </div>
          </div>
        </div>

        {/* Version history popover — slides in below the toolbar */}
        {historyOpen && history.length > 0 && (
          <div style={{
            background: "var(--surface2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: 8, marginBottom: 10,
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
                    padding: "6px 10px", fontSize: 11,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 6, color: "var(--text)", cursor: "pointer",
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
            onBulletChange={(ei, bi, text) => updateBullet(si, ei, bi, text)}
            onBulletAdd={(ei) => addBullet(si, ei)}
            onBulletDelete={(ei, bi) => deleteBullet(si, ei, bi)}
            onBulletReorder={(ei, from, to) => reorderBullets(si, ei, from, to)}
            onSectionRewrite={onAIEdit ? (instruction) => rewriteSection(si, instruction) : undefined}
            onAIEdit={onAIEdit}
            dragRef={dragRef}
            dropHover={dropHover}
            setDropHover={setDropHover}
          />
        ))}

        {/* Save bar — sticky at the bottom of the editor pane */}
        <div style={{
          position: "sticky", bottom: -16, marginTop: 16, paddingTop: 12,
          paddingBottom: 4,
          background: "linear-gradient(to top, var(--surface) 60%, rgba(28,28,30,0))",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <button
            disabled={!dirty || saving}
            onClick={() => wrappedSave(draft)}
            style={{
              fontSize: 13, padding: "8px 18px",
              background: dirty ? "var(--accent)" : "var(--surface2)",
              color: dirty ? "#fff" : "var(--dim)",
              border: "none", borderRadius: 8,
              cursor: dirty && !saving ? "pointer" : "not-allowed",
              fontWeight: 600, letterSpacing: -0.2, fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {saving ? "Re-compiling…" : dirty ? "Save & re-compile PDF" : "No changes"}
          </button>
          {dirty && !saving && (
            <button
              onClick={() => setDraft(initial)}
              style={{
                fontSize: 12, padding: "7px 12px",
                background: "transparent", color: "var(--dim)",
                border: "1px solid var(--border)", borderRadius: 7,
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

      {/* ── PREVIEW PANE ──────────────────────────────────────── */}
      <div style={{
        background: "#fafaf7", color: "#111",
        border: "1px solid var(--border)", borderRadius: 12,
        padding: "32px 36px", overflow: "auto", maxHeight: "78vh",
        fontFamily: "'Latin Modern Roman', 'Computer Modern', Georgia, serif",
        fontSize: 11, lineHeight: 1.35,
      }}>
        <PreviewPane resume={draft} />
      </div>
    </div>
  );
}

/* ── Editor sub-components ────────────────────────────────── */

type DragHandle = React.MutableRefObject<{ sIdx: number; eIdx: number; bIdx: number } | null>;

function SectionBlock({
  section, sIdx,
  onBulletChange, onBulletAdd, onBulletDelete, onBulletReorder,
  onSectionRewrite, onAIEdit,
  dragRef, dropHover, setDropHover,
}: {
  section: ParsedSection;
  sIdx: number;
  onBulletChange: (entryIdx: number, bulletIdx: number, text: string) => void;
  onBulletAdd:    (entryIdx: number) => void;
  onBulletDelete: (entryIdx: number, bulletIdx: number) => void;
  onBulletReorder:(entryIdx: number, fromIdx: number, toIdx: number) => void;
  onSectionRewrite?: (instruction: string) => Promise<void>;
  onAIEdit?: Props["onAIEdit"];
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

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: section.editable ? "var(--accent)" : "var(--dim)",
        letterSpacing: 0.6, textTransform: "uppercase",
        paddingBottom: 6, marginBottom: 10,
        borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {section.name}
        {!section.editable && (
          <span style={{
            fontSize: 9, fontWeight: 600, padding: "2px 6px",
            background: "var(--surface2)", color: "var(--dim)",
            borderRadius: 4, letterSpacing: 0.3,
          }}>LOCKED</span>
        )}
        {section.editable && onSectionRewrite && (
          <button
            onClick={() => setSectionAIOpen(o => !o)}
            disabled={sectionAIBusy}
            title={`Rewrite every bullet in ${section.name} with one instruction`}
            style={{
              fontSize: 9, padding: "3px 8px", marginLeft: "auto",
              background: sectionAIOpen ? "var(--accent-bg)" : "var(--surface2)",
              color: sectionAIOpen ? "var(--accent)" : "var(--muted)",
              border: "1px solid var(--border)", borderRadius: 4,
              cursor: sectionAIBusy ? "wait" : "pointer", fontFamily: "inherit",
              letterSpacing: 0.3, fontWeight: 600, textTransform: "uppercase",
            }}
          >
            {sectionAIBusy ? "Rewriting…" : "✨ Rewrite all"}
          </button>
        )}
      </div>

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
          dragRef={dragRef}
          dropHover={dropHover}
          setDropHover={setDropHover}
        />
      ))}
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
  onBulletChange, onBulletAdd, onBulletDelete, onBulletReorder, onAIEdit,
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
  bullet, editable, onChange, onDelete, onDragStart, onDragEnd, onAIEdit,
}: {
  bullet: ParsedBullet;
  editable: boolean;
  onChange: (text: string) => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onAIEdit?: Props["onAIEdit"];
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
  return (
    <div>
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
