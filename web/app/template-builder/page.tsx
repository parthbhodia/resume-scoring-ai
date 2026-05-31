import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import TemplateBuilderShell from "@/components/TemplateBuilder/TemplateBuilderShell";

export const metadata: Metadata = {
  title: "Resume Template Builder",
  description:
    "Build and download a professional ATS-friendly resume PDF for free — no sign-up required.",
};

export default function TemplateBuilderPage() {
  return (
    <Suspense fallback={<TemplateBuilderPageSkeleton />}>
      <AppShell>
        <TemplateBuilderShell />
      </AppShell>
    </Suspense>
  );
}

function TemplateBuilderPageSkeleton() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg, #0d1117)",
        color: "var(--muted, #94a3b8)",
      }}
    >
      Loading template builder...
    </div>
  );
}
