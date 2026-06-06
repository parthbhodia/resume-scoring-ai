"use client";

/**
 * Interview Prep — Step 2 (Select Interview Type).
 *
 * UI-only refine: enriched category banner, cards with topics/counts/time,
 * hover/selected polish, dynamic Recommended badge, improved selection summary.
 * Routing, state management, and category detection are unchanged.
 */

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useInterviewPrepStore } from "@/store/interviewPrepStore";
import {
  classifyResumeCategory,
  type ResumeCategory,
} from "@/lib/resumeCategoryClassify";
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_FALLBACK_SKILLS,
  CATEGORY_ICON_CHAR,
  CATEGORY_RECOMMENDED,
  INTERVIEW_TYPES_BY_CATEGORY,
  type InterviewTypeConfig,
} from "./interviewTypeConfig";
import WorkflowStepper from "./WorkflowStepper";

export default function InterviewTypeView() {
  const router = useRouter();

  const structuredResume = useInterviewPrepStore((s) => s.structuredResume);
  const extractedText = useInterviewPrepStore((s) => s.extractedText);
  const resumeCategory = useInterviewPrepStore((s) => s.resumeCategory);
  const company = useInterviewPrepStore((s) => s.company);
  const role = useInterviewPrepStore((s) => s.role);
  const selectedInterviewType = useInterviewPrepStore((s) => s.selectedInterviewType);
  const setSelectedInterviewType = useInterviewPrepStore((s) => s.setSelectedInterviewType);

  // Derive live category — prefer store value set during Step 1 parse; re-derive
  // if missing so this page works after a hard refresh in dev.
  const category: ResumeCategory =
    (resumeCategory as ResumeCategory | null) ??
    classifyResumeCategory(structuredResume, extractedText).category;

  const types = INTERVIEW_TYPES_BY_CATEGORY[category] ?? INTERVIEW_TYPES_BY_CATEGORY.General;
  const recommended = CATEGORY_RECOMMENDED[category];
  const selected = types.find((t) => t.id === selectedInterviewType) ?? null;

  // Pull real skills from the parsed resume; fall back to category-specific defaults.
  const detectedSkills: string[] = (() => {
    const items = (structuredResume?.skills ?? []).flatMap((s) => s.items ?? []);
    return items.length > 0 ? items.slice(0, 6) : CATEGORY_FALLBACK_SKILLS[category];
  })();

  const contextLabel = [role, company].filter(Boolean).join(" at ") || null;

  return (
    <div className="w-full px-6 py-6 md:px-8 md:py-8">
      {/* Header */}
      <header className="mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Select Your Interview Type
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground md:text-base">
          Choose interview formats personalized to your resume, role, company,
          and job description.
        </p>
      </header>

      <div className="mb-6">
        <WorkflowStepper activeStep={2} />
      </div>

      <div className="flex flex-col gap-5">
        {/* Category banner */}
        <CategoryBanner
          category={category}
          skills={detectedSkills}
          contextLabel={contextLabel}
        />

        {/* Interview type cards — 3-col on desktop */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <InterviewTypeCard
              key={type.id}
              type={type}
              isSelected={selectedInterviewType === type.id}
              isRecommended={type.id === recommended}
              onSelect={() =>
                setSelectedInterviewType(
                  selectedInterviewType === type.id ? null : type.id,
                )
              }
            />
          ))}
        </div>

        {/* Selection summary */}
        {selected ? (
          <SelectionSummary type={selected} />
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Select an interview format above to continue.
          </p>
        )}

        <Separator />

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="lg"
            className="gap-2"
            onClick={() => router.push("/interview-prep")}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          <Button
            size="lg"
            className="gap-2"
            disabled={!selectedInterviewType}
            onClick={() => router.push("/interview-prep/setup")}
          >
            Continue
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Category banner ──────────────────────────────────────────────────────────

function CategoryBanner({
  category,
  skills,
  contextLabel,
}: {
  category: ResumeCategory;
  skills: string[];
  contextLabel: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-2xl leading-none" aria-hidden>
          {CATEGORY_ICON_CHAR[category]}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-semibold text-foreground">
              {category} Profile Detected
            </span>
            <Badge variant="secondary" className="font-medium">
              {category}
            </Badge>
            {contextLabel ? (
              <span className="text-xs text-muted-foreground">· {contextLabel}</span>
            ) : null}
          </div>

          {skills.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Skills Found:
              </span>
              {skills.map((skill) => (
                <Badge key={skill} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {CATEGORY_DESCRIPTIONS[category]}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Interview type card ──────────────────────────────────────────────────────

function InterviewTypeCard({
  type,
  isSelected,
  isRecommended,
  onSelect,
}: {
  type: InterviewTypeConfig;
  isSelected: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-4 rounded-2xl border p-5 text-left",
        "transition-all duration-200 outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        isSelected
          ? "border-accent bg-[var(--accent-bg)] shadow-[0_0_0_2px_var(--accent),0_4px_16px_-2px_color-mix(in_oklch,var(--accent)_25%,transparent)]"
          : "border-border bg-card shadow-sm hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md",
      )}
    >
      {/* Checkmark (selected) */}
      {isSelected ? (
        <CheckCircle2
          className="absolute right-4 top-4 size-5 text-accent"
          aria-hidden
        />
      ) : null}

      {/* Top row: icon + badges */}
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
            isSelected
              ? "bg-accent text-[var(--accent-fg,#fff)]"
              : "bg-muted text-muted-foreground group-hover:bg-accent/10 group-hover:text-accent",
          )}
        >
          {type.icon}
        </span>
        <div className="flex flex-wrap justify-end gap-1.5 pr-6">
          {isRecommended ? (
            <Badge className="px-2 py-0 text-[10px] font-semibold tracking-wide uppercase">
              Recommended
            </Badge>
          ) : null}
          {type.badge === "Beta" ? (
            <Badge
              variant="secondary"
              className="px-2 py-0 text-[10px] font-semibold tracking-wide uppercase"
            >
              Beta
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Title */}
      <div>
        <span
          className={cn(
            "font-heading text-base font-semibold leading-snug",
            isSelected ? "text-accent" : "text-foreground",
          )}
        >
          {type.label}
        </span>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {type.description}
        </p>
      </div>

      {/* Topic chips */}
      <div className="flex flex-wrap gap-1.5">
        {type.topics.map((topic) => (
          <Badge
            key={topic}
            variant="outline"
            className={cn(
              "text-[11px] transition-colors",
              isSelected && "border-accent/30 bg-accent/5 text-accent",
            )}
          >
            {topic}
          </Badge>
        ))}
      </div>

      {/* Footer: question count + time */}
      <div className="mt-auto flex items-center gap-3 border-t border-border/60 pt-3">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <HelpCircle className="size-3.5" aria-hidden />
          {type.questionCount} Questions
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {type.estimatedMinutes} min prep
        </span>
      </div>
    </button>
  );
}

// ── Selection summary ────────────────────────────────────────────────────────

function SelectionSummary({ type }: { type: InterviewTypeConfig }) {
  return (
    <Card className="rounded-2xl border-accent/20 bg-[var(--accent-bg)]">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Selected Interview
            </p>
            <CardTitle className="mt-0.5 text-lg text-accent">{type.label}</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <HelpCircle className="size-4 shrink-0" aria-hidden />
              <span className="font-medium text-foreground">{type.questionCount}</span>
              <span>Questions</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-4 shrink-0" aria-hidden />
              <span className="font-medium text-foreground">{type.estimatedMinutes}</span>
              <span>Minutes</span>
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Separator className="mb-3 bg-accent/15" />
        <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Includes
        </p>
        <ul className="flex flex-col gap-1.5">
          {type.includes.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 className="size-4 shrink-0 text-accent" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
