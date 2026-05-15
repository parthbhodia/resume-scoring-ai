export type ResumeTemplate =
  | "Harshibar_Template1"
  | "Classic_Professional"
  | "MaltaCV_Modern";

export type ResumeDoc = {
  meta: {
    template: ResumeTemplate;
    version: 1;
  };
  header: {
    fullName: string;
    headline?: string;
    location?: string;
    email?: string;
    phone?: string;
    website?: string;
    linkedin?: string;
    github?: string;
  };
  summary?: string;
  skills: Array<{
    id: string;
    label: string;
    items: string[];
  }>;
  experience: Array<{
    id: string;
    company: string;
    role: string;
    location?: string;
    start?: string;
    end?: string;
    bullets: Array<{ id: string; text: string }>;
    technologies?: string[];
  }>;
  projects?: Array<{
    id: string;
    name: string;
    role?: string;
    start?: string;
    end?: string;
    bullets: Array<{ id: string; text: string }>;
    technologies?: string[];
  }>;
  education?: Array<{
    id: string;
    school: string;
    degree?: string;
    location?: string;
    graduation?: string;
    details?: string[];
  }>;
  certifications?: string[];
};
