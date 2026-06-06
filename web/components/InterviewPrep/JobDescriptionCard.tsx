"use client";

import { useMemo } from "react";
import { ScanSearch } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useInterviewPrepStore } from "@/store/interviewPrepStore";
import { extractKeywords } from "@/lib/keywordExtraction";

/**
 * Job Description — bound to the Interview Prep store. Surfaces ATS-style
 * keywords extracted from the pasted text (reusing the shared keyword util).
 */
export default function JobDescriptionCard() {
  const jobDescription = useInterviewPrepStore((s) => s.jobDescription);
  const setJobDescription = useInterviewPrepStore((s) => s.setJobDescription);

  const keywords = useMemo(
    () => extractKeywords(jobDescription, 16),
    [jobDescription],
  );

  return (
    <Card className="h-full rounded-2xl">
      <CardHeader>
        <CardTitle>Job Description</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <Textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the job description here…"
          className="min-h-72 flex-1 resize-y leading-relaxed"
        />

        <Badge variant="secondary" className="w-fit gap-1.5">
          <ScanSearch className="size-3" aria-hidden />
          Used for ATS keyword extraction
        </Badge>

        {keywords.length ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Extracted keywords
            </span>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((kw) => (
                <Badge key={kw} variant="outline">
                  {kw}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
