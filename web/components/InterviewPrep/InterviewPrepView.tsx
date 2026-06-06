"use client";

/**
 * Interview Prep — Step 1 (Resume & Job Details).
 *
 * Reuses the shared `/api/upload-resume` parsing pipeline (same as ATS scoring),
 * stores the parsed resume + job/target-role inputs in `useInterviewPrepStore`
 * for later steps, and classifies the resume into an industry category. Later
 * steps (Interview Type, Practice Setup, Prep Dashboard) are not built yet — the
 * CTA only acknowledges that Step 2 is coming.
 *
 * Layout: a horizontal workflow stepper sits under the heading; the content area
 * spans the full page width as a responsive two-column grid (Resume Upload |
 * Job Description), with Target Role and the CTA stacked full-width below.
 */

import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useInterviewPrepStore } from "@/store/interviewPrepStore";
import WorkflowStepper from "./WorkflowStepper";
import ResumeUploadCard from "./ResumeUploadCard";
import JobDescriptionCard from "./JobDescriptionCard";
import TargetRoleCard from "./TargetRoleCard";

export default function InterviewPrepView() {
  const router = useRouter();
  const fileName = useInterviewPrepStore((s) => s.fileName);
  const canContinue = Boolean(fileName);

  return (
    <div className="w-full px-6 py-6 md:px-8 md:py-8">
      <header className="mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Interview Prep
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground md:text-base">
          Upload your resume and provide job details to generate personalized
          interview preparation.
        </p>
      </header>

      <div className="mb-6">
        <WorkflowStepper activeStep={1} />
      </div>

      <div className="flex flex-col gap-6">
        {/* Two-column: Resume Upload | Job Description */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <ResumeUploadCard />
          <JobDescriptionCard />
        </div>

        {/* Target Role (full width) */}
        <TargetRoleCard />

        {/* CTA (full width) */}
        <Card className="rounded-2xl border-accent/20 bg-[var(--accent-bg)]">
          <CardContent className="flex flex-col gap-5 py-2">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-[var(--accent-fg,#fff)]">
                <ArrowRight className="size-5" aria-hidden />
              </span>
              <div className="flex-1">
                <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Ready to generate your personalized prep kit
                </h2>
                <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                  We&apos;ll analyze your resume, company, role, and job
                  description to create personalized interview preparation.
                </p>
              </div>
            </div>

            <Separator className="bg-accent/15" />

            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
              {!canContinue ? (
                <span className="text-sm text-muted-foreground sm:mr-auto">
                  Upload your resume to continue
                </span>
              ) : null}
              <Button
                size="lg"
                className="gap-2"
                disabled={!canContinue}
                onClick={() => router.push("/interview-prep/interview-type")}
              >
                Continue to Interview Type
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
