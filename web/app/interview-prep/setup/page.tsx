import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import PracticeSetupView from "@/components/InterviewPrep/PracticeSetupView";

export const metadata: Metadata = {
  title: "Practice Setup — Interview Prep",
  description:
    "Configure your practice session difficulty, question count, sources, and focus areas.",
};

export default function PracticeSetupPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <PracticeSetupView />
        </div>
      </AppShell>
    </Suspense>
  );
}

function Skeleton() {
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
      Loading…
    </div>
  );
}
