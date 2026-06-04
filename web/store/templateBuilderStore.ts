"use client";
import { create } from "zustand";
import type {
  TBResumeData, TBWorkExperience, TBEducation, TBProject, TBProfile, TBCustomization, TBSkills,
  TBCustomSection, TBSectionSlot,
} from "@/components/TemplateBuilder/types";
import {
  DEFAULT_RESUME, DEFAULT_CUSTOMIZATION, DEFAULT_WORK, DEFAULT_EDU, DEFAULT_PROJECT, DEFAULT_SKILLS, DEMO_RESUME,
  DEFAULT_CUSTOM_SECTION, customSectionSlot, normalizeSectionOrder,
} from "@/components/TemplateBuilder/types";

const STORAGE_KEY = "rn_template_builder";

function isMeaningfulResume(parsed: Partial<TBResumeData>): boolean {
  const hasWorkContent = parsed.workExperiences?.some((w) => w.bullets?.trim() || w.company?.trim());
  const hasEduContent = parsed.educations?.some((e) => e.school?.trim() || e.degree?.trim());
  const skills = parsed.skills as TBSkills | string | undefined;
  const hasSkills = typeof skills === "string"
    ? !!(skills as string).trim()
    : !!(skills?.featuredSkills?.some((f) => f.skill?.trim()) || skills?.descriptions?.trim());
  return !!(hasWorkContent || hasEduContent || hasSkills);
}

function safeLoad(): TBResumeData {
  if (typeof window === "undefined") return DEMO_RESUME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEMO_RESUME;
    const parsed = JSON.parse(raw) as Partial<TBResumeData>;
    if (!isMeaningfulResume(parsed)) return DEMO_RESUME;

    // Migrate old string-format skills to the new structured format
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
  } catch {
    return DEMO_RESUME;
  }
}

function safeSave(data: TBResumeData) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export interface TemplateBuilderStore {
  data: TBResumeData;
  loaded: boolean;
  loadFromStorage: () => void;
  replaceData: (data: TBResumeData) => void;
  setProfile: (field: keyof TBProfile, value: string) => void;
  setWork: (id: string, field: keyof TBWorkExperience, value: string | boolean) => void;
  addWork: () => void;
  removeWork: (id: string) => void;
  moveWork: (fromIdx: number, toIdx: number) => void;
  setEducation: (id: string, field: keyof TBEducation, value: string) => void;
  addEducation: () => void;
  removeEducation: (id: string) => void;
  moveEducation: (fromIdx: number, toIdx: number) => void;
  setProject: (id: string, field: keyof TBProject, value: string) => void;
  addProject: () => void;
  removeProject: (id: string) => void;
  moveProject: (fromIdx: number, toIdx: number) => void;
  setFeaturedSkill: (idx: number, skill: string, rating: number) => void;
  setSkillDescriptions: (value: string) => void;
  setCustomization: (field: keyof TBCustomization, value: string) => void;
  reorderSection: (fromIdx: number, toIdx: number) => void;
  toggleSectionHidden: (slot: TBSectionSlot) => void;
  addCustomSection: (title?: string) => string;
  removeCustomSection: (id: string) => void;
  setCustomSection: (id: string, field: keyof TBCustomSection, value: string) => void;
  reset: () => void;
}

export const useTemplateBuilderStore = create<TemplateBuilderStore>((set) => ({
  data: DEMO_RESUME,
  loaded: false,

  loadFromStorage: () => {
    const data = safeLoad();
    set({ data, loaded: true });
  },

  replaceData: (data) => {
    const customSections = Array.isArray(data.customSections) ? data.customSections : [];
    const normalized: TBResumeData = {
      ...data,
      customSections,
      sectionOrder: normalizeSectionOrder(data.sectionOrder, customSections),
      hiddenSections: Array.isArray(data.hiddenSections) ? data.hiddenSections : [],
    };
    safeSave(normalized);
    set({ data: normalized, loaded: true });
  },

  setProfile: (field, value) => {
    set((s) => {
      const data = { ...s.data, profile: { ...s.data.profile, [field]: value } };
      safeSave(data);
      return { data };
    });
  },

  setWork: (id, field, value) => {
    set((s) => {
      const data = {
        ...s.data,
        workExperiences: s.data.workExperiences.map((w) =>
          w.id === id ? { ...w, [field]: value } : w
        ),
      };
      safeSave(data);
      return { data };
    });
  },

  addWork: () => {
    set((s) => {
      const data = { ...s.data, workExperiences: [...s.data.workExperiences, DEFAULT_WORK()] };
      safeSave(data);
      return { data };
    });
  },

  removeWork: (id) => {
    set((s) => {
      const data = { ...s.data, workExperiences: s.data.workExperiences.filter((w) => w.id !== id) };
      safeSave(data);
      return { data };
    });
  },

  moveWork: (fromIdx, toIdx) => {
    set((s) => {
      const arr = [...s.data.workExperiences];
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= arr.length ||
        toIdx >= arr.length ||
        fromIdx === toIdx
      ) {
        return s;
      }
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      const data = { ...s.data, workExperiences: arr };
      safeSave(data);
      return { data };
    });
  },

  setEducation: (id, field, value) => {
    set((s) => {
      const data = {
        ...s.data,
        educations: s.data.educations.map((e) =>
          e.id === id ? { ...e, [field]: value } : e
        ),
      };
      safeSave(data);
      return { data };
    });
  },

  addEducation: () => {
    set((s) => {
      const data = { ...s.data, educations: [...s.data.educations, DEFAULT_EDU()] };
      safeSave(data);
      return { data };
    });
  },

  removeEducation: (id) => {
    set((s) => {
      const data = { ...s.data, educations: s.data.educations.filter((e) => e.id !== id) };
      safeSave(data);
      return { data };
    });
  },

  moveEducation: (fromIdx, toIdx) => {
    set((s) => {
      const arr = [...s.data.educations];
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= arr.length ||
        toIdx >= arr.length ||
        fromIdx === toIdx
      ) {
        return s;
      }
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      const data = { ...s.data, educations: arr };
      safeSave(data);
      return { data };
    });
  },

  setProject: (id, field, value) => {
    set((s) => {
      const data = {
        ...s.data,
        projects: s.data.projects.map((p) =>
          p.id === id ? { ...p, [field]: value } : p
        ),
      };
      safeSave(data);
      return { data };
    });
  },

  addProject: () => {
    set((s) => {
      const data = { ...s.data, projects: [...s.data.projects, DEFAULT_PROJECT()] };
      safeSave(data);
      return { data };
    });
  },

  removeProject: (id) => {
    set((s) => {
      const data = { ...s.data, projects: s.data.projects.filter((p) => p.id !== id) };
      safeSave(data);
      return { data };
    });
  },

  moveProject: (fromIdx, toIdx) => {
    set((s) => {
      const arr = [...s.data.projects];
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= arr.length ||
        toIdx >= arr.length ||
        fromIdx === toIdx
      ) {
        return s;
      }
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      const data = { ...s.data, projects: arr };
      safeSave(data);
      return { data };
    });
  },

  setFeaturedSkill: (idx, skill, rating) => {
    set((s) => {
      const featuredSkills = s.data.skills.featuredSkills.map((fs, i) =>
        i === idx ? { skill, rating } : fs
      );
      const data = { ...s.data, skills: { ...s.data.skills, featuredSkills } };
      safeSave(data);
      return { data };
    });
  },

  setSkillDescriptions: (value) => {
    set((s) => {
      const data = { ...s.data, skills: { ...s.data.skills, descriptions: value } };
      safeSave(data);
      return { data };
    });
  },

  setCustomization: (field, value) => {
    set((s) => {
      const data = { ...s.data, customization: { ...s.data.customization, [field]: value } };
      safeSave(data);
      return { data };
    });
  },

  reorderSection: (fromIdx, toIdx) => {
    set((s) => {
      const arr = [...s.data.sectionOrder];
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= arr.length ||
        toIdx >= arr.length ||
        fromIdx === toIdx
      ) {
        return s;
      }
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      const data = { ...s.data, sectionOrder: arr };
      safeSave(data);
      return { data };
    });
  },

  toggleSectionHidden: (slot) => {
    set((s) => {
      const hidden = new Set(s.data.hiddenSections);
      if (hidden.has(slot)) hidden.delete(slot);
      else hidden.add(slot);
      const data = { ...s.data, hiddenSections: [...hidden] };
      safeSave(data);
      return { data };
    });
  },

  addCustomSection: (title) => {
    const section = DEFAULT_CUSTOM_SECTION();
    if (title?.trim()) section.title = title.trim();
    const slot = customSectionSlot(section.id);
    set((s) => {
      const data = {
        ...s.data,
        customSections: [...s.data.customSections, section],
        sectionOrder: [...s.data.sectionOrder, slot],
      };
      safeSave(data);
      return { data };
    });
    return section.id;
  },

  removeCustomSection: (id) => {
    const slot = customSectionSlot(id);
    set((s) => {
      const data = {
        ...s.data,
        customSections: s.data.customSections.filter((c) => c.id !== id),
        sectionOrder: s.data.sectionOrder.filter((x) => x !== slot),
        hiddenSections: s.data.hiddenSections.filter((x) => x !== slot),
      };
      safeSave(data);
      return { data };
    });
  },

  setCustomSection: (id, field, value) => {
    set((s) => {
      const data = {
        ...s.data,
        customSections: s.data.customSections.map((c) =>
          c.id === id ? { ...c, [field]: value } : c
        ),
      };
      safeSave(data);
      return { data };
    });
  },

  reset: () => {
    const data = DEMO_RESUME;
    safeSave(data);
    set({ data });
  },
}));
