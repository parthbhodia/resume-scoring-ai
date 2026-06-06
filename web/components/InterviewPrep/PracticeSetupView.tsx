"use client";

/**
 * Interview Prep — Step 3 (Practice Setup).
 *
 * Reads resume category + interview type from the store (Steps 1–2).
 * Persists: difficulty, questionCount, selectedSources, selectedFocusAreas.
 * Continue navigates to /interview-prep/dashboard (Step 4, not built yet).
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Lightbulb,
  Sparkles,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useInterviewPrepStore } from "@/store/interviewPrepStore";
import {
  classifyResumeCategory,
  type ResumeCategory,
} from "@/lib/resumeCategoryClassify";
import { INTERVIEW_TYPES_BY_CATEGORY } from "./interviewTypeConfig";
import {
  DIFFICULTY_OPTIONS,
  FOCUS_AREAS_BY_CATEGORY,
  QUESTION_COUNT_OPTIONS,
  QUESTION_SOURCES,
  getAIRecommendation,
  type Difficulty,
} from "./practiceSetupConfig";
import WorkflowStepper from "./WorkflowStepper";

// ── Source icon map ──────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  resume:  <User className="size-4" aria-hidden />,
  jd:      <FileText className="size-4" aria-hidden />,
  company: <Building2 className="size-4" aria-hidden />,
  role:    <BookMarked className="size-4" aria-hidden />,
};

// ── Main view ────────────────────────────────────────────────────────────────

export default function PracticeSetupView() {
  const router = useRouter();

  const structuredResume     = useInterviewPrepStore((s) => s.structuredResume);
  const extractedText        = useInterviewPrepStore((s) => s.extractedText);
  const resumeCategory       = useInterviewPrepStore((s) => s.resumeCategory);
  const company              = useInterviewPrepStore((s) => s.company);
  const role                 = useInterviewPrepStore((s) => s.role);
  const selectedInterviewType = useInterviewPrepStore((s) => s.selectedInterviewType);

  const difficulty           = useInterviewPrepStore((s) => s.difficulty);
  const questionCount        = useInterviewPrepStore((s) => s.questionCount);
  const selectedSources      = useInterviewPrepStore((s) => s.selectedSources);
  const selectedFocusAreas   = useInterviewPrepStore((s) => s.selectedFocusAreas);

  const setDifficulty        = useInterviewPrepStore((s) => s.setDifficulty);
  const setQuestionCount     = useInterviewPrepStore((s) => s.setQuestionCount);
  const toggleSource         = useInterviewPrepStore((s) => s.toggleSource);
  const toggleFocusArea      = useInterviewPrepStore((s) => s.toggleFocusArea);
  const setSelectedFocusAreas = useInterviewPrepStore((s) => s.setSelectedFocusAreas);
  const setSelectedSources    = useInterviewPrepStore((s) => s.setSelectedSources);
  const setDifficultyState    = useInterviewPrepStore((s) => s.setDifficulty);

  const category: ResumeCategory =
    (resumeCategory as ResumeCategory | null) ??
    classifyResumeCategory(structuredResume, extractedText).category;

  const focusAreaOptions = FOCUS_AREAS_BY_CATEGORY[category];

  // Resolve interview type label for summary
  const allTypes = INTERVIEW_TYPES_BY_CATEGORY[category] ?? INTERVIEW_TYPES_BY_CATEGORY.General;
  const interviewTypeLabel =
    allTypes.find((t) => t.id === selectedInterviewType)?.label ?? selectedInterviewType ?? "—";

  // AI recommendation — memoised, recomputed only when inputs change
  const aiRec = useMemo(
    () => getAIRecommendation(category, selectedInterviewType, company, role),
    [category, selectedInterviewType, company, role],
  );

  const applyAIRecommendation = () => {
    setDifficultyState(aiRec.difficulty);
    setQuestionCount(aiRec.questionCount);
    setSelectedSources(aiRec.sources);
    setSelectedFocusAreas(aiRec.focusAreas);
  };

  const canContinue = difficulty !== null && selectedSources.length > 0;

  // Estimated session time
  const estimatedTime = Math.round(questionCount * 1.5);

  return (
    <div className="w-full px-6 py-6 md:px-8 md:py-8">
      <header className="mb-5">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Practice Setup
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground md:text-base">
          Configure your practice session. We&apos;ll use these settings to
          generate the most relevant questions for you.
        </p>
      </header>

      <div className="mb-6">
        <WorkflowStepper activeStep={3} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* ── Left: configuration ── */}
        <div className="flex flex-col gap-5">
          {/* Difficulty */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Difficulty Level</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <DifficultyCard
                    key={opt.id}
                    option={opt}
                    isSelected={difficulty === opt.id}
                    onSelect={() => setDifficulty(opt.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Question Count */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Number of Questions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                {QUESTION_COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQuestionCount(n)}
                    className={cn(
                      "flex h-14 w-20 flex-col items-center justify-center rounded-xl border text-center transition-all",
                      "focus-visible:ring-3 focus-visible:ring-ring/50 outline-none",
                      questionCount === n
                        ? "border-accent bg-[var(--accent-bg)] shadow-[0_0_0_2px_var(--accent)]"
                        : "border-border bg-card hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm",
                    )}
                  >
                    <span
                      className={cn(
                        "text-xl font-bold",
                        questionCount === n ? "text-accent" : "text-foreground",
                      )}
                    >
                      {n}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {n === 5 ? "Quick" : n === 10 ? "Standard" : n === 15 ? "Extended" : "Full"}
                    </span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Estimated session time:{" "}
                <span className="font-medium text-foreground">~{estimatedTime} minutes</span>
              </p>
            </CardContent>
          </Card>

          {/* Question Sources */}
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Question Sources</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {QUESTION_SOURCES.map((src) => {
                  const isSelected = selectedSources.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => toggleSource(src.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all outline-none",
                        "focus-visible:ring-3 focus-visible:ring-ring/50",
                        isSelected
                          ? "border-accent bg-[var(--accent-bg)]"
                          : "border-border bg-card hover:border-accent/40 hover:bg-muted/20",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                          isSelected
                            ? "bg-accent text-[var(--accent-fg,#fff)]"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {SOURCE_ICONS[src.id]}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              isSelected ? "text-accent" : "text-foreground",
                            )}
                          >
                            {src.label}
                          </span>
                          {isSelected ? (
                            <CheckCircle2 className="size-4 text-accent" aria-hidden />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {src.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedSources.length === 0 ? (
                <p className="mt-2 text-xs text-destructive">
                  Select at least one question source.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* Focus Areas */}
          <Card className="rounded-2xl">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Focus Areas</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Select the areas you want to emphasize.{" "}
                    <span className="text-foreground">Optional</span> — leave blank to cover
                    all.
                  </p>
                </div>
                <Badge variant="secondary">{category}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {focusAreaOptions.map((area) => {
                  const isSelected = selectedFocusAreas.includes(area);
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => toggleFocusArea(area)}
                      aria-pressed={isSelected}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-medium transition-all outline-none",
                        "focus-visible:ring-3 focus-visible:ring-ring/50",
                        isSelected
                          ? "border-accent bg-[var(--accent-bg)] text-accent"
                          : "border-border bg-transparent text-foreground hover:border-accent/40 hover:bg-muted/30",
                      )}
                    >
                      {isSelected ? (
                        <CheckCircle2 className="mr-1.5 inline size-3" aria-hidden />
                      ) : null}
                      {area}
                    </button>
                  );
                })}
              </div>
              {selectedFocusAreas.length > 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedFocusAreas.length}</span>{" "}
                  area{selectedFocusAreas.length !== 1 ? "s" : ""} selected
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* ── Right: summary + AI recommendation ── */}
        <div className="flex flex-col gap-5">
          {/* AI Recommendation */}
          <Card className="rounded-2xl border-accent/20 bg-[var(--accent-bg)]">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-[var(--accent-fg,#fff)]">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <CardTitle className="text-sm text-foreground">AI Recommendation</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                {aiRec.rationale}
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <RecommendationChip label="Difficulty" value={aiRec.difficulty} />
                <RecommendationChip label="Questions" value={String(aiRec.questionCount)} />
                <RecommendationChip label="Sources" value={`${aiRec.sources.length} selected`} />
                <RecommendationChip label="Focus Areas" value={`${aiRec.focusAreas.length} areas`} />
              </div>
              <Separator className="bg-accent/15" />
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 border-accent/30 text-accent hover:bg-accent/10 hover:text-accent"
                onClick={applyAIRecommendation}
              >
                <Lightbulb className="size-3.5" aria-hidden />
                Apply AI Recommendation
              </Button>
            </CardContent>
          </Card>

          {/* Session Summary */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Session Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <SummaryRow icon={<Badge variant="secondary">{category}</Badge>} label="Category" />
              <SummaryRow
                label="Interview Type"
                value={interviewTypeLabel}
              />
              <SummaryRow
                label="Difficulty"
                value={
                  difficulty
                    ? DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.label ?? difficulty
                    : "Not set"
                }
              />
              <SummaryRow
                label="Questions"
                value={
                  <span className="flex items-center gap-1">
                    <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden />
                    {questionCount} questions
                  </span>
                }
              />
              <SummaryRow
                label="Est. Time"
                value={
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5 text-muted-foreground" aria-hidden />
                    ~{estimatedTime} minutes
                  </span>
                }
              />
              <SummaryRow
                label="Sources"
                value={
                  selectedSources.length > 0
                    ? `${selectedSources.length} source${selectedSources.length !== 1 ? "s" : ""}`
                    : "None selected"
                }
              />
              {selectedFocusAreas.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Focus Areas</span>
                  <div className="flex flex-wrap gap-1">
                    {selectedFocusAreas.map((area) => (
                      <Badge key={area} variant="outline" className="text-[11px]">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {company || role ? (
                <>
                  <Separator />
                  {role ? <SummaryRow label="Role" value={role} /> : null}
                  {company ? <SummaryRow label="Company" value={company} /> : null}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator className="my-5" />

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="lg"
          className="gap-2"
          onClick={() => router.push("/interview-prep/interview-type")}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
        <Button
          size="lg"
          className="gap-2"
          disabled={!canContinue}
          onClick={() => router.push("/interview-prep/dashboard")}
        >
          Start Practice Session
          <ArrowRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DifficultyCard({
  option,
  isSelected,
  onSelect,
}: {
  option: (typeof DIFFICULTY_OPTIONS)[number];
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-4 text-left transition-all outline-none",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        isSelected
          ? "border-accent bg-[var(--accent-bg)] shadow-[0_0_0_2px_var(--accent)]"
          : "border-border bg-card hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-sm",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("size-2.5 rounded-full", {
          "bg-green-500": option.id === "easy",
          "bg-amber-500": option.id === "medium",
          "bg-red-500": option.id === "hard",
        })} />
        {isSelected ? (
          <CheckCircle2 className="size-4 text-accent" aria-hidden />
        ) : null}
      </div>
      <span
        className={cn(
          "text-sm font-semibold",
          isSelected ? "text-accent" : "text-foreground",
        )}
      >
        {option.label}
      </span>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {option.description}
      </p>
    </button>
  );
}

function RecommendationChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-accent/20 bg-card px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground capitalize">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground">
        {icon ?? value}
      </span>
    </div>
  );
}
