"use client";
// Dynamic import with ssr:false must live in a Client Component in Next.js 16+
import { Suspense } from "react";
import dynamic from "next/dynamic";

const TemplateBuilderClient = dynamic(
  () => import("./TemplateBuilderClient"),
  { ssr: false }
);

export default function TemplateBuilderShell() {
  return (
    <Suspense fallback={<TemplateBuilderShellFallback />}>
      <TemplateBuilderClient />
    </Suspense>
  );
}

function TemplateBuilderShellFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)" }}>
      <div style={{ width: 18, height: 18, border: "2px solid var(--border)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}
