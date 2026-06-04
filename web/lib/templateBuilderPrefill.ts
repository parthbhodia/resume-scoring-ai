"use client";

import {
  DEFAULT_CUSTOMIZATION,
  DEFAULT_EDU,
  DEFAULT_FEATURED_SKILLS,
  DEFAULT_PROJECT,
  DEFAULT_RESUME,
  DEFAULT_WORK,
  type TBResumeData,
} from "@/components/TemplateBuilder/types";
import {
  normalizeStructuredResume,
  type StructuredResume,
} from "@/store/resumeAnalyzeStore";

const TEMPLATE_BUILDER_STRUCTURED_PREFILL_KEY = "rn_template_builder_structured_prefill";

function splitDateRange(raw: string): { startDate: string; endDate: string; current: boolean } {
  const text = (raw ?? "").trim();
  if (!text) return { startDate: "", endDate: "", current: false };
  const parts = text
    .split(/\s(?:-|–|—|to)\s/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { startDate: text, endDate: "", current: false };
  if (parts.length === 1) return { startDate: parts[0], endDate: "", current: false };
  const startDate = parts[0];
  const endDate = parts[parts.length - 1];
  const current = /present|current|ongoing|now/i.test(endDate);
  return { startDate, endDate: current ? "" : endDate, current };
}

function mapStructuredResumeToTemplateData(structured: StructuredResume): TBResumeData {
  const featuredSkills = DEFAULT_FEATURED_SKILLS();
  const flatSkills = structured.skills.flatMap((s) => (Array.isArray(s.items) ? s.items : []));
  const uniqueSkills: string[] = [];
  for (const skill of flatSkills) {
    const s = (skill ?? "").trim();
    if (!s) continue;
    if (!uniqueSkills.some((existing) => existing.toLowerCase() === s.toLowerCase())) {
      uniqueSkills.push(s);
    }
    if (uniqueSkills.length >= featuredSkills.length) break;
  }
  uniqueSkills.forEach((skill, idx) => {
    featuredSkills[idx] = { skill, rating: idx < 2 ? 5 : 4 };
  });

  const workExperiences = structured.experience.map((exp) => {
    const { startDate, endDate, current } = splitDateRange(exp.dates);
    return {
      ...DEFAULT_WORK(),
      company: (exp.company ?? "").trim(),
      jobTitle: (exp.role ?? "").trim(),
      location: (exp.location ?? "").trim(),
      startDate,
      endDate,
      current,
      bullets: (Array.isArray(exp.bullets) ? exp.bullets : []).map((b) => b.trim()).filter(Boolean).join("\n"),
    };
  });

  const educations = structured.education.map((edu) => {
    const { startDate, endDate } = splitDateRange(edu.dates);
    const bulletLines = (Array.isArray(edu.bullets) ? edu.bullets : []).map((b) => b.trim()).filter(Boolean);
    const gpaLine = bulletLines.find((line) => /\bgpa\b/i.test(line)) ?? "";
    const courseworkLine = bulletLines.find((line) => /coursework/i.test(line)) ?? "";
    return {
      ...DEFAULT_EDU(),
      school: (edu.institution ?? "").trim(),
      degree: (edu.degree ?? "").trim(),
      location: (edu.location ?? "").trim(),
      startDate,
      endDate,
      gpa: gpaLine.replace(/^gpa[:\s-]*/i, "").trim(),
      coursework: courseworkLine.replace(/^coursework[:\s-]*/i, "").trim(),
    };
  });

  const projects = structured.projects.map((project) => ({
    ...DEFAULT_PROJECT(),
    name: (project.name ?? "").trim(),
    tech: (project.tech ?? "").trim(),
    link: "",
    date: "",
    bullets: (Array.isArray(project.bullets) ? project.bullets : []).map((b) => b.trim()).filter(Boolean).join("\n"),
  }));

  const descriptionLines = structured.skills
    .map((skill) => {
      const category = (skill.category ?? "").trim();
      const items = (Array.isArray(skill.items) ? skill.items : []).map((item) => item.trim()).filter(Boolean);
      if (!category && !items.length) return "";
      if (!category) return items.join(", ");
      return items.length ? `${category}: ${items.join(", ")}` : category;
    })
    .filter(Boolean);

  return {
    ...DEFAULT_RESUME,
    profile: {
      name: (structured.full_name ?? "").trim(),
      email: (structured.email ?? "").trim(),
      phone: (structured.phone ?? "").trim(),
      location: (structured.location ?? "").trim(),
      website: "",
      linkedin: (structured.linkedin ?? "").trim(),
      github: (structured.github ?? "").trim(),
      summary: (structured.summary ?? "").trim(),
    },
    workExperiences: workExperiences.length ? workExperiences : [DEFAULT_WORK()],
    educations: educations.length ? educations : [DEFAULT_EDU()],
    projects: projects.length ? projects : [DEFAULT_PROJECT()],
    skills: {
      featuredSkills,
      descriptions: descriptionLines.join("\n"),
    },
    customization: DEFAULT_CUSTOMIZATION,
  };
}

export function stashTemplateBuilderStructuredPrefillFromAnalysisResult(result: unknown): boolean {
  if (typeof sessionStorage === "undefined") return false;
  if (!result || typeof result !== "object") return false;
  const raw = result as Record<string, unknown>;
  const normalized = normalizeStructuredResume(
    (raw.structuredResume ?? raw.structured_resume) as StructuredResume | null | undefined,
  );
  if (!normalized) return false;
  try {
    const data = mapStructuredResumeToTemplateData(normalized);
    sessionStorage.setItem(TEMPLATE_BUILDER_STRUCTURED_PREFILL_KEY, JSON.stringify({ version: 1, data }));
    return true;
  } catch {
    return false;
  }
}

export function consumeTemplateBuilderStructuredPrefill(): TBResumeData | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(TEMPLATE_BUILDER_STRUCTURED_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(TEMPLATE_BUILDER_STRUCTURED_PREFILL_KEY);
    const parsed = JSON.parse(raw) as { version?: number; data?: TBResumeData };
    if (parsed.version !== 1 || !parsed.data) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
