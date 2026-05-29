export interface TBProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  summary: string;
}

export interface TBWorkExperience {
  id: string;
  company: string;
  jobTitle: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string; // newline-separated
}

export interface TBEducation {
  id: string;
  school: string;
  degree: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface TBProject {
  id: string;
  name: string;
  date: string;
  bullets: string; // newline-separated
}

export interface TBResumeData {
  profile: TBProfile;
  workExperiences: TBWorkExperience[];
  educations: TBEducation[];
  projects: TBProject[];
  skills: string; // comma-separated or newline-separated
}

export const DEFAULT_PROFILE: TBProfile = {
  name: "", email: "", phone: "", location: "", linkedin: "", github: "", summary: "",
};

export const DEFAULT_WORK = (): TBWorkExperience => ({
  id: crypto.randomUUID(),
  company: "", jobTitle: "", location: "", startDate: "", endDate: "", current: false, bullets: "",
});

export const DEFAULT_EDU = (): TBEducation => ({
  id: crypto.randomUUID(),
  school: "", degree: "", location: "", startDate: "", endDate: "", gpa: "",
});

export const DEFAULT_PROJECT = (): TBProject => ({
  id: crypto.randomUUID(),
  name: "", date: "", bullets: "",
});

export const DEFAULT_RESUME: TBResumeData = {
  profile: DEFAULT_PROFILE,
  workExperiences: [DEFAULT_WORK()],
  educations: [DEFAULT_EDU()],
  projects: [DEFAULT_PROJECT()],
  skills: "",
};
