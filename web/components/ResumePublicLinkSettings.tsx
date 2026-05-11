"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchResumeShareMetaByFolder,
  normalizeResumePublicSlug,
  updateResumeShareSettings,
} from "@/lib/supabase";

const RN_PL_ACC_CSS = `
  .rn-pl-acc > summary {
    list-style: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    cursor: pointer;
    padding: 12px 16px;
    border-radius: var(--radius-xl);
    border: 1px solid var(--border);
    background: var(--surface2);
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .rn-pl-acc > summary::-webkit-details-marker { display: none; }
  .rn-pl-acc[open] > summary {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
  .rn-pl-acc .rn-pl-chev {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--dim);
    transition: transform 0.15s ease;
  }
  .rn-pl-acc[open] .rn-pl-chev { transform: rotate(180deg); }
`;

export default function ResumePublicLinkSettings({
  folder,
  userId,
  templateFlow,
  /** When true, wrap settings in a closed-by-default accordion to save vertical space (e.g. builder results). */
  collapseAsDetails = false,
  /** If save hits “no library row”, run once then retry (same as Share mint). */
  ensureLibraryRow,
}: {
  folder: string;
  userId: string | null;
  templateFlow?: boolean;
  collapseAsDetails?: boolean;
  ensureLibraryRow?: () => Promise<void>;
}) {
  const [slugDraft, setSlugDraft] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [originHost, setOriginHost] = useState("");

  useEffect(() => {
    setOriginHost(typeof window !== "undefined" ? window.location.host : "");
  }, []);

  useEffect(() => {
    if (!folder || !userId) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void fetchResumeShareMetaByFolder(folder).then((meta) => {
      if (cancelled) return;
      if (meta) {
        setSlugDraft(meta.public_slug ?? "");
        setIsDefault(!!meta.is_default);
      } else {
        setSlugDraft("");
        setIsDefault(false);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [folder, userId]);

  const fullUrl = (() => {
    if (typeof window === "undefined") return "";
    const seg = normalizeResumePublicSlug(slugDraft);
    if (seg.length < 3) return "";
    return `${window.location.origin}/r/?id=${encodeURIComponent(seg)}`;
  })();

  const onSave = useCallback(async () => {
    if (!folder || !userId) return;
    setSaving(true);
    setMessage(null);
    const slug = slugDraft.trim() ? normalizeResumePublicSlug(slugDraft) : "";
    const payload = { publicSlug: slug || null, isDefault: isDefault } as const;
    let res = await updateResumeShareSettings(folder, payload);
    const missingRow =
      !res.ok &&
      ensureLibraryRow &&
      res.error.toLowerCase().includes("not in your library");
    if (missingRow) {
      try {
        await ensureLibraryRow();
        res = await updateResumeShareSettings(folder, payload);
      } catch {
        /* ensureLibraryRow surfaces via second res.error */
      }
    }
    setSaving(false);
    if (res.ok) {
      setMessage({ kind: "ok", text: "Link settings saved." });
    } else {
      setMessage({ kind: "err", text: res.error });
    }
  }, [folder, userId, slugDraft, isDefault, ensureLibraryRow]);

  const intro = templateFlow ? (
    <p style={{ margin: collapseAsDetails ? "0 0 14px" : "0 0 16px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55, letterSpacing: -0.1 }}>
      Optional: pick a memorable URL for this build, and choose whether it should be your primary résumé in the app.
    </p>
  ) : (
    <p style={{ margin: collapseAsDetails ? "0 0 14px" : "0 0 16px", fontSize: 13, color: "var(--muted)", lineHeight: 1.55, letterSpacing: -0.1 }}>
      Share a stable link or set this version as your default résumé.
    </p>
  );

  const titleBar = (
    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", letterSpacing: 0.35, textTransform: "uppercase", marginBottom: 10 }}>
      Public link &amp; default résumé
    </div>
  );

  const fields = (
    <>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 6, letterSpacing: -0.1 }}>
        Customize your résumé link
      </label>
      <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6, lineHeight: 1.4 }}>
        Path <code style={{ fontSize: 10, color: "var(--text)" }}>/r/</code> then query{" "}
        <code style={{ fontSize: 10, color: "var(--text)" }}>?id=</code>
        <span style={{ color: "var(--muted)" }}> (the question mark starts the query — not part of your slug)</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 0, marginBottom: 8 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            fontSize: 12,
            color: "var(--dim)",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRight: "none",
            borderRadius: "8px 0 0 8px",
            whiteSpace: "nowrap",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            letterSpacing: -0.2,
          }}
          title="Public share URL prefix"
        >
          <span>{originHost ? `${originHost}/r/` : "/r/"}</span>
          <span
            style={{
              display: "inline-block",
              marginLeft: 1,
              padding: "0 3px",
              borderRadius: 3,
              background: "rgba(59, 130, 246, 0.14)",
              color: "#1d4ed8",
              fontWeight: 700,
            }}
            title="Query parameter name is id"
          >
            ?id=
          </span>
        </span>
        <input
          value={slugDraft}
          onChange={(e) => setSlugDraft(e.target.value)}
          placeholder="your-name"
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: "1 1 140px",
            minWidth: 120,
            padding: "10px 12px",
            fontSize: 13,
            borderRadius: "0 8px 8px 0",
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
            fontFamily: "inherit",
            letterSpacing: -0.1,
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 14, lineHeight: 1.45 }}>
        3–50 characters: lowercase letters, numbers, and hyphens. Leave empty to clear a custom slug.
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          fontSize: 13,
          color: "var(--text)",
          cursor: "pointer",
          marginBottom: 16,
          lineHeight: 1.45,
        }}
      >
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          <strong style={{ fontWeight: 600 }}>Set as my default résumé</strong>
          <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
            Your default appears first in the library and is treated as your primary version for this account.
          </span>
        </span>
      </label>

      {fullUrl ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, wordBreak: "break-all" }}>
          Preview:{" "}
          <a href={fullUrl} style={{ color: "var(--accent)", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
            {fullUrl}
          </a>
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            background: saving ? "var(--surface2)" : "var(--accent)",
            color: saving ? "var(--muted)" : "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving…" : "Save link settings"}
        </button>
        {fullUrl ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(fullUrl);
                setMessage({ kind: "ok", text: "Link copied to clipboard." });
              } catch {
                setMessage({ kind: "err", text: "Could not copy — select the preview link manually." });
              }
            }}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              color: "var(--text)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Copy link
          </button>
        ) : null}
      </div>

      {message ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 12,
            fontWeight: 500,
            color: message.kind === "ok" ? "var(--green)" : "var(--red)",
          }}
        >
          {message.text}
        </div>
      ) : null}
    </>
  );

  if (!loaded) {
    return (
      <div style={{ fontSize: 12, color: "var(--dim)", padding: "4px 0" }}>Loading link settings…</div>
    );
  }

  if (!userId) {
    const signInBody = (
      <div
        style={{
          borderRadius: collapseAsDetails ? "0 0 var(--radius-xl) var(--radius-xl)" : "var(--radius-xl)",
          border: "1px solid var(--border)",
          borderTop: collapseAsDetails ? "none" : "1px solid var(--border)",
          background: "var(--surface2)",
          padding: "16px 18px",
          fontSize: 13,
          color: "var(--muted)",
          lineHeight: 1.55,
        }}
      >
        Sign in to create a custom public link or mark this résumé as your default.
      </div>
    );

    if (collapseAsDetails) {
      return (
        <details className="rn-pl-acc" style={{ marginBottom: 16 }}>
          <style>{RN_PL_ACC_CSS}</style>
          <summary>
            <span>Public link &amp; default résumé</span>
            <span className="rn-pl-chev" aria-hidden>
              ▼
            </span>
          </summary>
          {signInBody}
        </details>
      );
    }

    return signInBody;
  }

  if (collapseAsDetails) {
    return (
      <details className="rn-pl-acc" style={{ marginBottom: 16 }}>
        <style>{RN_PL_ACC_CSS}</style>
        <summary>
          <span>Public link &amp; default résumé</span>
          <span className="rn-pl-chev" aria-hidden>
            ▼
          </span>
        </summary>
        <div
          style={{
            borderRadius: "0 0 var(--radius-xl) var(--radius-xl)",
            border: "1px solid var(--border)",
            borderTop: "none",
            background: "var(--surface)",
            boxShadow: "var(--shadow-card)",
            padding: "16px 18px 18px",
          }}
        >
          {intro}
          {fields}
        </div>
      </details>
    );
  }

  return (
    <div
      style={{
        marginBottom: 16,
        borderRadius: "var(--radius-xl)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow-card)",
        padding: "20px 22px 18px",
      }}
    >
      {titleBar}
      {intro}
      {fields}
    </div>
  );
}
