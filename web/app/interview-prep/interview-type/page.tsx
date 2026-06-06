import type { Metadata } from "next";
import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import InterviewTypeView from "@/components/InterviewPrep/InterviewTypeView";

export const metadata: Metadata = {
  title: "Select Interview Type — Interview Prep",
  description:
    "Choose your interview format personalized to your resume, role, company, and job description.",
};

export default function InterviewTypePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <InterviewTypeView />
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
