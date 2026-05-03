"use client";

/**
 * Root page — routes between top-level views via query params.
 *
 *   /                            -> builder (default)
 *   /?view=library               -> library grid
 *   /?view=library&resume=<f>    -> ResumeView for folder <f>
 *   /?view=profile               -> profile (placeholder for now)
 *   /?view=jobs                  -> jobs (placeholder for now)
 *   /?base=<folder>              -> builder, with folder pre-loaded as base
 *
 * Query params instead of dynamic routes because GH Pages serves the
 * `output: "export"` build, which can't enumerate runtime-minted IDs.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AppShell, { useAppView } from "@/components/AppShell";
import ResumeBuilder from "@/components/ResumeBuilder";
import ResumeLibrary from "@/components/ResumeLibrary";
import ResumeView from "@/components/ResumeView";
import AnalyzeResume from "@/components/AnalyzeResume";

export default function HomePageClient() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppShell>
        <RouterView />
      </AppShell>
    </Suspense>
  );
}

function RouterView() {
  const view = useAppView();
  const params = useSearchParams();
  const resume = (params?.get("resume") || "").trim();
  const base = (params?.get("base") || "").trim();

  if (view === "library") {
    if (resume) return <ResumeView folder={resume} />;
    return <ResumeLibrary />;
  }
  if (view === "profile") return <PlaceholderPanel title="Profile" subtitle="Coming next — your Personal, Education, Work Experience, Skills, EEO, and Resume defaults all in one place." />;
  if (view === "jobs") return <PlaceholderPanel title="Jobs" subtitle="Coming soon — autoapply will live here once your profile is set up." />;
  if (view === "analyze") return <AnalyzeResume />;
  return <ResumeBuilder initialBaseFolder={base || null} />;
}

function ShellSkeleton() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
    }}>
      <div style={{
        width: 22, height: 22, border: "2px solid var(--surface2)", borderTopColor: "var(--accent)",
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );
}

function PlaceholderPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 28px", textAlign: "center" }}>
      <div style={{ fontSize: 30, marginBottom: 14 }}>🚧</div>
      <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5, marginBottom: 8 }}>{title}</h1>
      <p style={{ fontSize: 13, color: "var(--dim)", letterSpacing: -0.1, lineHeight: 1.6 }}>{subtitle}</p>
    </div>
  );
}
