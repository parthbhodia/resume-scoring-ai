"use client";

/**
 * Root page — routes between top-level views via query params.
 *
 *   /                            -> analyze (default)
 *   /?view=builder&flow=tailor|scratch|template -> résumé builder workflows
 *   /?view=library               -> library grid
 *   /?view=library&resume=<f>    -> ResumeView for folder <f>
 *   /?view=profile&prefill=1     -> profile draft viewer (from Analyze / template flow)
 *   /?view=jobs                  -> jobs (placeholder for now)
 *   /?view=builder&flow=tailor&base=<folder> -> builder with folder pre-loaded
 *
 * Query params instead of dynamic routes because GH Pages serves the
 * `output: "export"` build, which can't enumerate runtime-minted IDs.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppShell, { useAppView } from "@/components/AppShell";
import ResumeBuilder from "@/components/ResumeBuilder";
import ResumeTemplateStudio from "@/components/ResumeTemplateStudio";
import ContentSourcePicker from "@/components/ContentSourcePicker";
import ManualResumeForm from "@/components/ManualResumeForm";
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
  const params = useSearchParams();
  const rawView = (params?.get("view") || "analyze").toLowerCase();
  const view = useAppView();
  const resume = (params?.get("resume") || "").trim();
  const base = (params?.get("base") || "").trim();
  const flow = (params?.get("flow") || "tailor").toLowerCase();
  const scratchStart = view === "builder" && flow === "scratch";
  const templateResumeStart = view === "builder" && flow === "template";

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
    const prefill = (params?.get("prefill") || "").trim() === "1";
    return (
      <ViewFill>
        <ScrollPane>
          <ProfileDraftFromAnalyze prefill={prefill} />
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
  return (
    <ViewFill>
      <ResumeBuilder
        key={`builder-${base}-${scratchStart ? "scratch" : flow}`}
        initialBaseFolder={scratchStart ? null : (base || null)}
        scratchStart={scratchStart}
      />
    </ViewFill>
  );
}

const PROFILE_PREFILL_KEY = "rn_profile_prefill";

function ProfileDraftFromAnalyze({ prefill }: { prefill: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (!prefill || typeof window === "undefined") return;
    try {
      const t = sessionStorage.getItem(PROFILE_PREFILL_KEY);
      if (t) setDraft(t);
      sessionStorage.removeItem(PROFILE_PREFILL_KEY);
    } catch {
      setDraft(null);
    }
  }, [prefill]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 28px 80px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, marginBottom: 10, color: "var(--text)" }}>
        Profile
      </h1>
      <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.65, marginBottom: 28 }}>
        Full profile editing (education, work history blocks, EEO, defaults) is still in progress. If you arrived here from
        Analyze or the template flow, you can keep the text below as a personal reference until we wire structured fields.
      </p>
      {draft ? (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "16px 18px",
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.06, marginBottom: 10 }}>
            Text saved from your last action
          </div>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--text)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
              maxHeight: 360,
              overflowY: "auto",
            }}
          >
            {draft}
          </pre>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--dim)", fontStyle: "italic", marginBottom: 24 }}>
          {prefill
            ? "No draft text was found — open it again from Analyze → Résumé builder → "Use as profile starter.""
            : "Use "Use as profile starter" from the template builder to send your extract here."}
        </p>
      )}
    </div>
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
