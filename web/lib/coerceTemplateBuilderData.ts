import type { TBResumeData, TBSkills } from "@/components/TemplateBuilder/types";
import {
  DEFAULT_CUSTOMIZATION,
  DEFAULT_RESUME,
  DEFAULT_SKILLS,
  normalizeSectionOrder,
} from "@/components/TemplateBuilder/types";

/** Normalize JSON from Supabase or legacy localStorage into a full TBResumeData. */
export function coerceTemplateBuilderData(raw: unknown): TBResumeData | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as Partial<TBResumeData>;

  const rawSkills = parsed.skills as TBSkills | string | undefined;
  const skills: TBSkills = typeof rawSkills === "string"
    ? { ...DEFAULT_SKILLS(), descriptions: rawSkills }
    : { ...DEFAULT_SKILLS(), ...(rawSkills ?? {}) };

  return {
    ...DEFAULT_RESUME,
    ...parsed,
    skills,
    customization: { ...DEFAULT_CUSTOMIZATION, ...(parsed.customization ?? {}) },
    customSections: Array.isArray(parsed.customSections) ? parsed.customSections : [],
    sectionOrder: normalizeSectionOrder(parsed.sectionOrder, parsed.customSections ?? []),
    hiddenSections: Array.isArray(parsed.hiddenSections) ? parsed.hiddenSections : [],
  };
}
