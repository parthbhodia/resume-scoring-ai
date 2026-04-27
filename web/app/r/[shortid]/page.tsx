"use client";

/**
 * Public share recipient page — no auth required.
 *
 * Visitors land here from a /r/<shortid> URL, we hit GET /api/share/<shortid>
 * to resolve to the underlying PDF, and embed it in an iframe along with a
 * minimal Resunova header (so recipients know what they're looking at and
 * can find their way back to the marketing page).
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiUrl, parseJsonOrThrow } from "@/lib/utils";

interface ResolveResp {
  shortid?:    string;
  folder?:     string;
  pdf_url?:    string;
  views?:      number;
  created_at?: string;
  error?:      string;
}

export default function SharePage() {
  const params = useParams<{ shortid: string }>();
  const shortid = params?.shortid ?? "";

  const [data,    setData]    = useState<ResolveResp | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!shortid) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(apiUrl(`/api/share/${encodeURIComponent(shortid)}`));
        const json = await parseJsonOrThrow<ResolveResp>(resp);
        if (!resp.ok) throw new Error(json.error ?? `HTTP ${resp.status}`);
        if (!cancelled) setData(json);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shortid]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg, #0a0a0a)",
      display: "flex", flexDirection: "column",
    }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 22px",
        borderBottom: "1px solid var(--border, #2a2a2a)",
        background: "var(--surface, #1a1a1a)",
      }}>
        <a href="/" style={{
          fontSize: 16, fontWeight: 700, color: "var(--text, #f5f5f5)",
          textDecoration: "none", letterSpacing: -0.4,
        }}>
          Resunova
        </a>
        <a href="/" style={{
          fontSize: 11, color: "var(--dim, #888)",
          textDecoration: "none", letterSpacing: -0.1,
        }}>
          Want a tailored resume of your own? →
        </a>
      </header>

      <main style={{ flex: 1, display: "flex", flexDirection: "column", padding: 22 }}>
        {loading && (
          <div style={{
            margin: "auto", color: "var(--dim, #888)",
            fontSize: 13, letterSpacing: -0.2,
          }}>Loading shared resume…</div>
        )}

        {!loading && error && (
          <div style={{
            margin: "auto", maxWidth: 460, textAlign: "center",
            color: "var(--text, #f5f5f5)",
          }}>
            <div style={{ fontSize: 32, marginBottom: 14 }}>🔗</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, letterSpacing: -0.4 }}>
              {error.toLowerCase().includes("revoked") ? "This link was revoked"
                : error.toLowerCase().includes("not found") ? "Link not found"
                : "Couldn't load this share"}
            </div>
            <div style={{ fontSize: 13, color: "var(--dim, #888)", letterSpacing: -0.1 }}>
              {error.toLowerCase().includes("revoked")
                ? "The owner has turned this link off."
                : error.toLowerCase().includes("not found")
                  ? "Double-check the URL — the shortcode might be wrong or expired."
                  : error}
            </div>
          </div>
        )}

        {!loading && data?.pdf_url && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontSize: 11, color: "var(--dim, #888)", letterSpacing: -0.1,
            }}>
              <span>Shared resume · {data.views?.toLocaleString() ?? 0} view{data.views === 1 ? "" : "s"}</span>
              <a
                href={data.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12, padding: "6px 14px",
                  background: "var(--accent, #0071e3)", color: "#fff",
                  borderRadius: 7, textDecoration: "none", letterSpacing: -0.2,
                }}
              >Download PDF</a>
            </div>
            <div style={{
              flex: 1, border: "1px solid var(--border, #2a2a2a)",
              borderRadius: 10, overflow: "hidden", background: "#fafaf7",
            }}>
              <iframe
                src={data.pdf_url}
                title="Shared resume"
                style={{ width: "100%", height: "100%", minHeight: "calc(100vh - 180px)", border: "none" }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
