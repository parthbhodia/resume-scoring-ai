"use client";

import type { CSSProperties } from "react";
import { resolveApiError } from "@/lib/userFriendlyError";

export function ApiErrorBanner({
  error,
  onDismiss,
  className,
  style,
}: {
  error: string | null;
  onDismiss?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  if (!error) return null;

  const d = resolveApiError(error);

  return (
    <div
      role="alert"
      className={className}
      style={{
        marginBottom: 16,
        padding: "14px 16px 12px",
        background: "var(--red-bg)",
        border: "1px solid rgba(248, 113, 113, 0.28)",
        borderRadius: 12,
        color: "var(--text)",
        fontSize: 13,
        lineHeight: 1.5,
        letterSpacing: -0.15,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, color: "var(--red)", marginBottom: 4, fontSize: 14 }}>
            {d.title}
          </div>
          <p style={{ margin: 0, color: "var(--text)", opacity: 0.92 }}>{d.message}</p>

          {d.steps.length > 0 && (
            <ol
              style={{
                margin: "10px 0 0",
                paddingLeft: 20,
                color: "var(--muted)",
                fontSize: 12.5,
              }}
            >
              {d.steps.map((step, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {step}
                </li>
              ))}
            </ol>
          )}

          {(d.healthUrl || d.statusUrl) && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 12 }}>
              {d.healthUrl && (
                <a
                  href={d.healthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}
                >
                  Check API health →
                </a>
              )}
              {d.statusUrl && (
                <a
                  href={d.statusUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}
                >
                  Platform status →
                </a>
              )}
            </div>
          )}
        </div>

        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss error"
            style={{
              flexShrink: 0,
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "0 2px",
              marginTop: -2,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
