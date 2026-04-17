"use client";
import type { Source } from "@/lib/types";

interface Props { sources: Source[] }

export default function SourcesPanel({ sources }: Props) {
  if (!sources.length) return null;
  return (
    <div style={{
      background: "var(--surface2)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      padding: "12px 14px",
      marginTop: 14,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.8px", color: "var(--dim)", marginBottom: 10 }}>
        Sites visited ({sources.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {sources.map((s, i) => {
          let hostname = "";
          try { hostname = new URL(s.url).hostname; } catch { hostname = s.url; }
          return (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              title={s.title}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px",
                background: "var(--surface3)",
                borderRadius: 20,
                border: "1px solid var(--border)",
                fontSize: 11, color: "var(--muted)",
                textDecoration: "none",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--border-h)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
            >
              {/* favicon */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=16`}
                width={12} height={12} alt=""
                style={{ borderRadius: 2 }}
              />
              {hostname}
            </a>
          );
        })}
      </div>
    </div>
  );
}
