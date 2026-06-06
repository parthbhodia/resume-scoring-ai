import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import PrepDashboardView from "@/components/InterviewPrep/PrepDashboardView";

export const metadata: Metadata = {
  title: "Interview Prep Kit — Interview Prep",
  description:
    "Your personalized interview preparation questions generated from your resume, job description, company, and role.",
};

export default function PrepDashboardPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <PrepDashboardView />
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
