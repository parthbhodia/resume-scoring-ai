"use client";
import { useUmbcVariant } from "@/contexts/UmbcContext";
import { useState } from "react";

export function UmbcWelcomeBanner() {
  const { isUmbc } = useUmbcVariant();
  const [dismissed, setDismissed] = useState(false);

  if (!isUmbc || dismissed) return null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #b8860b 0%, #daa520 100%)",
      padding: "12px 16px",
      borderBottom: "1px solid rgba(0,0,0,0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      color: "#fff",
      fontSize: "13px",
      gap: "16px",
    }}>
      <div style={{ flex: 1 }}>
        <span style={{ marginRight: 6 }}>⚡</span>
        <strong>Tailored for UMBC students</strong> — Our analysis follows UMBC Career Center resume guidelines.
        <a href="https://careers.umbc.edu/" target="_blank" rel="noopener noreferrer" style={{ color: "#fff", textDecoration: "underline", marginLeft: 8 }}>Learn more</a>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: "none",
          border: "none",
          color: "#fff",
          cursor: "pointer",
          fontSize: "18px",
          padding: 0,
          flexShrink: 0,
        }}
        aria-label="Dismiss banner"
      >
        ×
      </button>
    </div>
  );
}
