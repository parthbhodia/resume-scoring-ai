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

/** Fills AppShell main (flex) without growing the document — children handle their own scroll areas. */
function ViewFill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: "1 1 0%",
        minHeight: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function ScrollPane({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {children}
    </div>
  );
}

function RouterView() {
  const view = useAppView();
  const params = useSearchParams();
  const resume = (params?.get("resume") || "").trim();
  const base = (params?.get("base") || "").trim();

  if (view === "library") {
    if (resume) {
      return (
        <ViewFill>
          <ScrollPane>
            <ResumeView folder={resume} />
          </ScrollPane>
        </ViewFill>
      );
    }
    return (
      <ViewFill>
        <ScrollPane>
          <ResumeLibrary />
        </ScrollPane>
      </ViewFill>
    );
  }
  if (view === "profile") {
    return (
      <ViewFill>
        <ScrollPane>
          <PlaceholderPanel title="Profile" subtitle="Coming next — your Personal, Education, Work Experience, Skills, EEO, and Resume defaults all in one place." />
        </ScrollPane>
      </ViewFill>
    );
  }
  if (view === "jobs") {
    return (
      <ViewFill>
        <ScrollPane>
          <PlaceholderPanel title="Jobs" subtitle="Coming soon — autoapply will live here once your profile is set up." />
        </ScrollPane>
      </ViewFill>
    );
  }
  if (view === "analyze") {
    return (
      <ViewFill>
        <AnalyzeResume />
      </ViewFill>
    );
  }
  // key=base ensures remount when switching from a library-loaded resume to fresh builder
  return (
    <ViewFill>
      <ResumeBuilder key={`builder-${base}`} initialBaseFolder={base || null} />
    </ViewFill>
  );
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
