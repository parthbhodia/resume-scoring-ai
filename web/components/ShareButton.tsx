"use client";

/**
 * ShareButton — mints a public shortlink for a resume PDF and shows it in a
 * popover with Copy + Open + Revoke actions.
 *
 * The actual PDF is hosted on Supabase Storage (see resume_gui/storage.py);
 * the shortid only proxies through resunova.io/r/<id> so the user has a
 * pretty link to share AND a kill-switch (revoke) without having to delete
 * the underlying PDF.
 */

import { useEffect, useRef, useState } from "react";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";

interface ShareResp {
  shortid?: string;
  pdf_url?: string;
  views?:   number;
  reused?:  boolean;
  error?:   string;
}

export default function ShareButton({ folder, pdfUrl, userId }: {
  folder: string;
  pdfUrl: string | null;
  userId: string | null;
}) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [shortid, setShortid] = useState<string | null>(null);
  const [copied,  setCopied]  = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const onClick = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (shortid || loading) return;
    if (!userId) { setError("Sign in to share."); return; }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl(`/api/share/${encodeURIComponent(folder)}`), {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: userId, pdf_url: pdfUrl ?? "" }),
      });
      const json = await parseJsonOrThrow<ShareResp>(resp);
      if (!resp.ok || !json.shortid) throw new Error(json.error ?? "Share failed.");
      setShortid(json.shortid);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const shareUrl = shortid
    ? (typeof window !== "undefined" ? `${window.location.origin}/r/${shortid}` : `/r/${shortid}`)
    : "";

  const onCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Couldn't copy — select and copy manually.");
    }
  };

  const onRevoke = async () => {
    if (!shortid || !userId) return;
    if (!confirm("Revoke this share link? Anyone with the URL will see a 'link revoked' page.")) return;
    setLoading(true);
    try {
      const resp = await fetch(apiUrl(`/api/share/${encodeURIComponent(shortid)}`), {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: userId }),
      });
      if (!resp.ok) throw new Error("Revoke failed");
      setShortid(null);
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={popRef} style={{ position: "relative" }}>
      <button
        onClick={onClick}
        title="Get a public share link"
        style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "9px 14px",
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 9, color: "var(--text)", cursor: "pointer",
          fontSize: 13, fontWeight: 500, letterSpacing: -0.3,
          whiteSpace: "nowrap", fontFamily: "inherit",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="3" cy="6.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="10" cy="3"   r="1.7" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="10" cy="10"  r="1.7" stroke="currentColor" strokeWidth="1.4" />
          <path d="M4.5 5.6 L8.5 3.7  M4.5 7.4 L8.5 9.3" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        Share
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30,
          width: 320,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, padding: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.32)",
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", letterSpacing: -0.2, marginBottom: 4 }}>
            Public share link
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: -0.1, lineHeight: 1.45, marginBottom: 12 }}>
            Anyone with this URL can view the PDF. You can revoke any time.
          </div>

          {loading && !shortid && (
            <div style={{ fontSize: 12, color: "var(--dim)" }}>Generating link…</div>
          )}

          {error && (
            <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 8 }}>{error}</div>
          )}

          {shortid && (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--surface2)", border: "1px solid var(--border)",
                borderRadius: 7, padding: "7px 10px", marginBottom: 10,
              }}>
                <input
                  readOnly value={shareUrl}
                  onFocus={e => e.currentTarget.select()}
                  style={{
                    flex: 1, fontSize: 11.5, color: "var(--text)",
                    background: "transparent", border: "none", outline: "none",
                    fontFamily: "monospace", letterSpacing: -0.2,
                  }}
                />
                <button
                  onClick={onCopy}
                  style={{
                    fontSize: 10.5, padding: "3px 9px",
                    background: copied ? "var(--green)" : "var(--accent)",
                    color: "#fff", border: "none", borderRadius: 5,
                    cursor: "pointer", fontFamily: "inherit",
                    transition: "background 0.15s",
                  }}
                >{copied ? "Copied" : "Copy"}</button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a
                  href={shareUrl} target="_blank" rel="noopener noreferrer"
                  style={{
                    flex: 1, textAlign: "center",
                    fontSize: 11, padding: "6px 10px",
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    borderRadius: 7, color: "var(--text)", textDecoration: "none",
                    fontFamily: "inherit",
                  }}>Open</a>
                <button
                  onClick={onRevoke} disabled={loading}
                  style={{
                    flex: 1, fontSize: 11, padding: "6px 10px",
                    background: "transparent", border: "1px solid var(--red)",
                    borderRadius: 7, color: "var(--red)",
                    cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
                  }}
                >Revoke</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
