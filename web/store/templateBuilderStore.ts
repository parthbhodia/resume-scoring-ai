"use client";
import { create } from "zustand";
import type {
  TBResumeData, TBWorkExperience, TBEducation, TBProject, TBProfile, TBCustomization,
} from "@/components/TemplateBuilder/types";
import {
  DEFAULT_RESUME, DEFAULT_CUSTOMIZATION, DEFAULT_WORK, DEFAULT_EDU, DEFAULT_PROJECT, DEMO_RESUME,
} from "@/components/TemplateBuilder/types";

const STORAGE_KEY = "rn_template_builder";

function safeLoad(): TBResumeData {
  if (typeof window === "undefined") return DEMO_RESUME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // First visit — show demo resume so the preview is never blank
    if (!raw) return DEMO_RESUME;
    const parsed = JSON.parse(raw) as Partial<TBResumeData>;
    return {
      ...DEFAULT_RESUME,
      ...parsed,
      customization: { ...DEFAULT_CUSTOMIZATION, ...(parsed.customization ?? {}) },
    };
  } catch {
    return DEMO_RESUME;
  }
}

function safeSave(data: TBResumeData) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

interface TemplateBuilderStore {
  data: TBResumeData;
  loaded: boolean;
  loadFromStorage: () => void;
  setProfile: (field: keyof TBProfile, value: string) => void;
  setWork: (id: string, field: keyof TBWorkExperience, value: string | boolean) => void;
  addWork: () => void;
  removeWork: (id: string) => void;
  setEducation: (id: string, field: keyof TBEducation, value: string) => void;
  addEducation: () => void;
  removeEducation: (id: string) => void;
  setProject: (id: string, field: keyof TBProject, value: string) => void;
  addProject: () => void;
  removeProject: (id: string) => void;
  setSkills: (value: string) => void;
  setCustomization: (field: keyof TBCustomization, value: string) => void;
  reset: () => void;
}

export const useTemplateBuilderStore = create<TemplateBuilderStore>((set) => ({
  data: DEMO_RESUME,
  loaded: false,

  loadFromStorage: () => {
    const data = safeLoad();
    set({ data, loaded: true });
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

  setSkills: (value) => {
    set((s) => {
      const data = { ...s.data, skills: value };
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

  reset: () => {
    const data = DEFAULT_RESUME;
    safeSave(data);
    set({ data });
  },
}));
