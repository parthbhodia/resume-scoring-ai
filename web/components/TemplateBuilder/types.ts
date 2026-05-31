export interface TBProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  website: string;
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
  coursework: string;
}

export interface TBProject {
  id: string;
  name: string;
  tech: string;
  link: string;
  date: string;
  bullets: string; // newline-separated
}

export type TBFont = "Helvetica" | "Times-Roman" | "Courier";

export interface TBCustomization {
  font: TBFont;
  accentColor: string; // hex — used for section title text/rule
}

export interface TBFeaturedSkill {
  skill: string;
  rating: number; // 0–5 (number of filled circles out of 5)
}

export interface TBSkills {
  featuredSkills: TBFeaturedSkill[]; // fixed array of 6
  descriptions: string; // newline-separated category lines, e.g. "Languages: Python, Go"
}

export interface TBResumeData {
  profile: TBProfile;
  workExperiences: TBWorkExperience[];
  educations: TBEducation[];
  projects: TBProject[];
  skills: TBSkills;
  customization: TBCustomization;
}

export const DEFAULT_CUSTOMIZATION: TBCustomization = {
  font: "Helvetica",
  accentColor: "#1a1a1a",
};

export const DEFAULT_PROFILE: TBProfile = {
  name: "", email: "", phone: "", location: "", website: "", linkedin: "", github: "", summary: "",
};

export const DEFAULT_WORK = (): TBWorkExperience => ({
  id: crypto.randomUUID(),
  company: "", jobTitle: "", location: "", startDate: "", endDate: "", current: false, bullets: "",
});

export const DEFAULT_EDU = (): TBEducation => ({
  id: crypto.randomUUID(),
  school: "", degree: "", location: "", startDate: "", endDate: "", gpa: "", coursework: "",
});

export const DEFAULT_PROJECT = (): TBProject => ({
  id: crypto.randomUUID(),
  name: "", tech: "", link: "", date: "", bullets: "",
});

export const DEFAULT_FEATURED_SKILL = (): TBFeaturedSkill => ({ skill: "", rating: 4 });
export const DEFAULT_FEATURED_SKILLS = (): TBFeaturedSkill[] => Array.from({ length: 6 }, DEFAULT_FEATURED_SKILL);
export const DEFAULT_SKILLS = (): TBSkills => ({ featuredSkills: DEFAULT_FEATURED_SKILLS(), descriptions: "" });

export const DEFAULT_RESUME: TBResumeData = {
  profile: DEFAULT_PROFILE,
  workExperiences: [DEFAULT_WORK()],
  educations: [DEFAULT_EDU()],
  projects: [DEFAULT_PROJECT()],
  skills: DEFAULT_SKILLS(),
  customization: DEFAULT_CUSTOMIZATION,
};

// Prefilled demo resume — shown to first-time users so the preview is never blank
export const DEMO_RESUME: TBResumeData = {
  customization: { font: "Helvetica", accentColor: "#1e3a5f" },
  profile: {
    name: "Alex Johnson",
    email: "alex.johnson@email.com",
    phone: "(415) 555-0192",
    location: "San Francisco, CA",
    website: "alexjohnson.dev",
    linkedin: "linkedin.com/in/alexjohnson",
    github: "github.com/alexjohnson",
    summary:
      "Full-stack software engineer with 4+ years building scalable web applications and ML-powered features. " +
      "Experienced in React, TypeScript, Python, and cloud infrastructure. Passionate about developer tooling and product-led growth.",
  },
  workExperiences: [
    {
      id: "demo-w1",
      company: "Stripe",
      jobTitle: "Software Engineer II",
      location: "San Francisco, CA",
      startDate: "Jun 2022",
      endDate: "",
      current: true,
      bullets:
        "Designed and shipped the onboarding flow for Stripe Tax, reducing time-to-first-charge by 38%\n" +
        "Built a real-time webhook replay system handling 2M+ events/day using Go and Kafka\n" +
        "Led a cross-functional team of 4 engineers to migrate legacy PHP services to a Go microservice architecture\n" +
        "Improved dashboard p99 latency from 1.8 s to 340 ms by introducing Redis caching and query optimization",
    },
    {
      id: "demo-w2",
      company: "Airbnb",
      jobTitle: "Software Engineer Intern",
      location: "San Francisco, CA",
      startDate: "May 2021",
      endDate: "Aug 2021",
      current: false,
      bullets:
        "Developed a React component library used by 12 product teams, cutting UI dev time by 20%\n" +
        "Integrated a third-party accessibility linter into the CI pipeline, raising WCAG compliance from 64% to 91%",
    },
  ],
  educations: [
    {
      id: "demo-e1",
      school: "University of California, Berkeley",
      degree: "B.S. Electrical Engineering & Computer Science",
      location: "Berkeley, CA",
      startDate: "Aug 2018",
      endDate: "May 2022",
      gpa: "3.87",
      coursework: "Algorithms, Distributed Systems, Machine Learning, Computer Architecture",
    },
  ],
  projects: [
    {
      id: "demo-p1",
      name: "ResumeIQ",
      tech: "Next.js, Python, OpenAI API, PostgreSQL",
      link: "github.com/alexjohnson/resumeiq",
      date: "2024",
      bullets:
        "Built an AI-powered resume scorer that analyzes PDFs and returns an ATS compatibility score with improvement suggestions\n" +
        "Processed 10K+ resumes in beta; achieved 4.8/5 user satisfaction rating",
    },
    {
      id: "demo-p2",
      name: "Quill",
      tech: "TypeScript, Redis, WebSockets",
      link: "github.com/alexjohnson/quill",
      date: "2023",
      bullets:
        "Open-source collaborative markdown editor with real-time sync via operational transforms\n" +
        "1,200+ GitHub stars; featured in JavaScript Weekly",
    },
  ],
  skills: {
    featuredSkills: [
      { skill: "TypeScript", rating: 5 },
      { skill: "Python",     rating: 5 },
      { skill: "React",      rating: 4 },
      { skill: "Next.js",    rating: 4 },
      { skill: "PostgreSQL", rating: 4 },
      { skill: "AWS",        rating: 3 },
    ],
    descriptions:
      "Languages: TypeScript, Python, Go, SQL\n" +
      "Frontend: React, Next.js, Tailwind CSS\n" +
      "Backend: Node.js, FastAPI, PostgreSQL, Redis, Kafka\n" +
      "Cloud & DevOps: AWS (EC2, S3, Lambda), Docker, Kubernetes, GitHub Actions",
  },
};
