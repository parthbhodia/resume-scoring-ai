"use client";

/**
 * Root page — routes between top-level views via query params.
 *
 *   /                            -> analyze (default)
 *   /?view=builder&flow=tailor|template -> résumé builder workflows
 *   /?view=library               -> library grid (+ optional right detail panel when resume=<f>)
 *   /?view=profile&prefill=1     -> Profile page + optional session prefill from Analyze / template flow
 *   /?view=jobs                  -> jobs (placeholder for now)
 *   /?view=builder&flow=tailor&base=<folder> -> builder with folder pre-loaded
 *
 * Query params instead of dynamic routes because GH Pages serves the
 * `output: "export"` build, which can't enumerate runtime-minted IDs.
 */

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import AppShell, { useAppView } from "@/components/AppShell";
import ResumeBuilder from "@/components/ResumeBuilder";
import ResumeTemplateStudio from "@/components/ResumeTemplateStudio";
import ContentSourcePicker from "@/components/ContentSourcePicker";
import ManualResumeForm from "@/components/ManualResumeForm";
import ResumeLibrary from "@/components/ResumeLibrary";
import AnalyzeResume from "@/components/AnalyzeResume";
import ProfilePage from "@/components/ProfilePage";

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
  const params = useSearchParams();
  const router = useRouter();
  const rawView = (params?.get("view") || "analyze").toLowerCase();
  const view = useAppView();
  const base = (params?.get("base") || "").trim();
  const flow = (params?.get("flow") || "tailor").toLowerCase();
  const templateResumeStart = view === "builder" && flow === "template";

  /** Legacy `flow=scratch` matched tailor; normalize URL so bookmarks still work. */
  const searchQs = params.toString();
  useEffect(() => {
    if (view !== "builder" || flow !== "scratch") return;
    const q = new URLSearchParams(searchQs);
    q.set("flow", "tailor");
    router.replace(`/?${q.toString()}`);
  }, [view, flow, router, searchQs]);

  if (view === "library") {
    if (resume) {
      return (
        <ViewFill>
          <ResumeView folder={resume} />
        </ViewFill>
      );
    }
    return (
      <ViewFill>
        <ResumeLibrary />
      </ViewFill>
    );
  }
  if (view === "profile") {
    const prefill = (params?.get("prefill") || "").trim() === "1";
    return (
      <ViewFill>
        <ScrollPane>
          <ProfilePage prefill={prefill} />
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
  // These views are not in useAppView()'s allowlist so must be checked against
  // rawView before the view === "analyze" fallback swallows them.
  if (rawView === "content-source") {
    return (
      <ViewFill>
        <ContentSourcePicker />
      </ViewFill>
    );
  }
  if (rawView === "manual-form") {
    return (
      <ViewFill>
        <ManualResumeForm />
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
  /** Dedicated layout gallery — not the JD "tailor" wizard (see Continue → compact compile step). */
  if (templateResumeStart) {
    return (
      <ViewFill>
        <ResumeTemplateStudio initialBaseFolder={base || null} />
      </ViewFill>
    );
  }
  // key ensures remount when base folder or builder workflow changes
  const builderKeyFlow = flow === "scratch" ? "tailor" : flow;
  return (
    <ViewFill>
      <ResumeBuilder
        key={`builder-${base}-${builderKeyFlow}`}
        initialBaseFolder={base || null}
      />
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
