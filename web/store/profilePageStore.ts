import { create } from "zustand";

export interface ProfileFormState {
  displayName: string;
  tagline: string;
  email: string;
  phone: string;
  linkedin: string;
  portfolio: string;
  headline: string;
  roles: string;
  locations: string;
  school: string;
  degree: string;
  graduation: string;
  gpa: string;
  tone: string;
  sectionOrder: string;
  fontSize: string;
  accentColor: string;
  eeoWorkUs: string;
  eeoSponsor: string;
  eeoDisability: string;
  eeoVeteran: string;
  eeoGender: string;
  eeoLgbtq: string;
}

export interface DashboardStats {
  scansUsedToday: number;
  scansLimitDaily: number;
  analysesTotal: number;
  jobsSaved: number;
  resumesBuilt: number;
}

export interface Activity {
  type: "analysis" | "job_saved" | "resume_built";
  date: string;
  details: Record<string, any>;
}

interface ProfilePageState {
  // Tab state
  selectedTab: "dashboard" | "career" | "settings";

  // Profile data
  profile: ProfileFormState;
  baselineProfile: string; // JSON string for dirty checking
  dirty: boolean;
  saving: boolean;
  saveError: string | null;

  // Dashboard data
  stats: DashboardStats | null;
  activity: Activity[];
  statsLoading: boolean;
  statsError: string | null;

  // UI state
  expandedSections: Set<string>;
  fieldErrors: Partial<Record<keyof ProfileFormState, string>>;

  // Actions
  setSelectedTab: (tab: "dashboard" | "career" | "settings") => void;
  setProfile: (profile: Partial<ProfileFormState>) => void;
  updateProfile: (updates: Partial<ProfileFormState>) => void;
  setDirty: (dirty: boolean) => void;
  setSaving: (saving: boolean) => void;
  setSaveError: (error: string | null) => void;
  setStats: (stats: DashboardStats) => void;
  setActivity: (activity: Activity[]) => void;
  setStatsLoading: (loading: boolean) => void;
  setStatsError: (error: string | null) => void;
  toggleExpandedSection: (section: string) => void;
  setFieldError: (field: keyof ProfileFormState, error: string | null) => void;
  clearFieldError: (field: keyof ProfileFormState) => void;
  resetProfile: () => void;
}

const EMPTY_PROFILE: ProfileFormState = {
  displayName: "",
  tagline: "",
  email: "",
  phone: "",
  linkedin: "",
  portfolio: "",
  headline: "",
  roles: "",
  locations: "",
  school: "",
  degree: "",
  graduation: "",
  gpa: "",
  tone: "confident",
  sectionOrder: "summary-exp-proj-edu",
  fontSize: "1.0",
  accentColor: "amber",
  eeoWorkUs: "",
  eeoSponsor: "",
  eeoDisability: "",
  eeoVeteran: "",
  eeoGender: "",
  eeoLgbtq: "",
};

export const useProfilePageStore = create<ProfilePageState>((set) => ({
  // Initial state
  selectedTab: "dashboard",
  profile: EMPTY_PROFILE,
  baselineProfile: JSON.stringify(EMPTY_PROFILE),
  dirty: false,
  saving: false,
  saveError: null,
  stats: null,
  activity: [],
  statsLoading: true,
  statsError: null,
  expandedSections: new Set(),
  fieldErrors: {},

  // Tab actions
  setSelectedTab: (tab) => set({ selectedTab: tab }),

  // Profile actions
  setProfile: (profile) => {
    const newProfile = { ...EMPTY_PROFILE, ...profile };
    const jsonStr = JSON.stringify(newProfile);
    set({
      profile: newProfile,
      baselineProfile: jsonStr,
      dirty: false,
    });
  },

  updateProfile: (updates) =>
    set((state) => {
      const newProfile = { ...state.profile, ...updates };
      const isDirty = JSON.stringify(newProfile) !== state.baselineProfile;
      return {
        profile: newProfile,
        dirty: isDirty,
      };
    }),

  setDirty: (dirty) => set({ dirty }),
  setSaving: (saving) => set({ saving }),
  setSaveError: (error) => set({ saveError: error }),

  // Stats actions
  setStats: (stats) =>
    set({
      stats,
      statsLoading: false,
      statsError: null,
    }),

  setActivity: (activity) => set({ activity }),

  setStatsLoading: (loading) => set({ statsLoading: loading }),
  setStatsError: (error) =>
    set({
      statsError: error,
      statsLoading: false,
    }),

  // UI actions
  toggleExpandedSection: (section) =>
    set((state) => {
      const newSections = new Set(state.expandedSections);
      if (newSections.has(section)) {
        newSections.delete(section);
      } else {
        newSections.add(section);
      }
      return { expandedSections: newSections };
    }),

  setFieldError: (field, error) =>
    set((state) => ({
      fieldErrors: {
        ...state.fieldErrors,
        [field]: error,
      },
    })),

  clearFieldError: (field) =>
    set((state) => ({
      fieldErrors: {
        ...state.fieldErrors,
        [field]: undefined,
      },
    })),

  resetProfile: () =>
    set({
      profile: EMPTY_PROFILE,
      baselineProfile: JSON.stringify(EMPTY_PROFILE),
      dirty: false,
      saveError: null,
      fieldErrors: {},
    }),
}));
