import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import InterviewPrepView from "@/components/InterviewPrep/InterviewPrepView";

export const metadata: Metadata = {
  title: "Interview Prep",
  description:
    "Prepare for your next interview with personalized interview preparation.",
};

export default function InterviewPrepPage() {
  return (
    <Suspense fallback={<InterviewPrepPageSkeleton />}>
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <InterviewPrepView />
        </div>
      </AppShell>
    </Suspense>
  );
}

function InterviewPrepPageSkeleton() {
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
      Loading interview prep...
    </div>
  );
}
