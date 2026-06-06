import type { ResumeCategory } from "@/lib/resumeCategoryClassify";

// ── Difficulty ──────────────────────────────────────────────────────────────

export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyOption {
  id: Difficulty;
  label: string;
  description: string;
  color: string; // Tailwind text class for the accent dot
}

export const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    id: "easy",
    label: "Entry Level",
    description: "Foundational questions suitable for new graduates and early-career candidates.",
    color: "text-green-500",
  },
  {
    id: "medium",
    label: "Mid Level",
    description: "Balanced mix of conceptual and applied questions for 2–5 years of experience.",
    color: "text-amber-500",
  },
  {
    id: "hard",
    label: "Senior Level",
    description: "Complex, scenario-based questions for senior roles and leadership positions.",
    color: "text-red-500",
  },
];

// ── Question count presets ──────────────────────────────────────────────────

export const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20] as const;
export type QuestionCountOption = (typeof QUESTION_COUNT_OPTIONS)[number];

// ── Question sources ────────────────────────────────────────────────────────

export interface QuestionSource {
  id: string;
  label: string;
  description: string;
}

export const QUESTION_SOURCES: QuestionSource[] = [
  {
    id: "resume",
    label: "My Resume",
    description: "Questions derived from your uploaded resume skills and experience.",
  },
  {
    id: "jd",
    label: "Job Description",
    description: "Questions based on requirements and keywords from the job description.",
  },
  {
    id: "company",
    label: "Company Research",
    description: "Questions tailored to your target company's values and known interview style.",
  },
  {
    id: "role",
    label: "Role Best Practices",
    description: "Industry-standard questions commonly asked for this type of role.",
  },
];

// ── Focus areas (dynamic per category) ─────────────────────────────────────

export const FOCUS_AREAS_BY_CATEGORY: Record<ResumeCategory, string[]> = {
  Technology: [
    "Frontend Development",
    "Backend Development",
    "System Design",
    "Algorithms & Data Structures",
    "Cloud & Infrastructure",
    "DevOps & CI/CD",
    "Security",
    "Performance Optimization",
    "API Design",
    "Testing & Quality",
  ],
  Legal: [
    "Contract Drafting",
    "Litigation Strategy",
    "Corporate Governance",
    "Intellectual Property",
    "Compliance & Regulatory",
    "Legal Research",
    "Negotiation",
    "Client Communication",
    "Risk Management",
    "Due Diligence",
  ],
  Healthcare: [
    "Patient Assessment",
    "Clinical Documentation",
    "Medication Management",
    "Emergency Response",
    "Interdisciplinary Collaboration",
    "Evidence-Based Practice",
    "HIPAA Compliance",
    "Quality Improvement",
    "Patient Education",
    "Care Coordination",
  ],
  Sales: [
    "Prospecting & Outreach",
    "Discovery & Qualification",
    "Demo & Presentation",
    "Negotiation & Closing",
    "Objection Handling",
    "Pipeline Management",
    "Account Management",
    "Customer Success",
    "CRM & Tools",
    "Revenue Forecasting",
  ],
  Marketing: [
    "Campaign Planning",
    "Content Strategy",
    "SEO & SEM",
    "Social Media",
    "Email Marketing",
    "Brand Management",
    "Growth Hacking",
    "Analytics & Reporting",
    "Demand Generation",
    "Customer Segmentation",
  ],
  Product: [
    "Product Discovery",
    "Roadmap Prioritization",
    "User Research",
    "Go-to-Market Strategy",
    "Metrics & OKRs",
    "Stakeholder Management",
    "Agile & Scrum",
    "Competitive Analysis",
    "Pricing Strategy",
    "Product Analytics",
  ],
  General: [
    "Communication Skills",
    "Leadership & Management",
    "Problem Solving",
    "Teamwork & Collaboration",
    "Adaptability",
    "Time Management",
    "Strategic Thinking",
    "Conflict Resolution",
    "Decision Making",
    "Ownership & Initiative",
  ],
};

// ── AI Recommendation ───────────────────────────────────────────────────────

export interface AIRecommendation {
  difficulty: Difficulty;
  questionCount: QuestionCountOption;
  sources: string[];
  focusAreas: string[];
  rationale: string;
}

/** Generate a contextual AI recommendation based on step 1–2 inputs. */
export function getAIRecommendation(
  category: ResumeCategory,
  interviewTypeId: string | null,
  company: string,
  role: string,
): AIRecommendation {
  // Difficulty: senior-leaning types → hard; company-specific → medium; coding/design → hard
  const hardTypes = new Set(["coding", "system-design", "case-analysis"]);
  const difficulty: Difficulty = hardTypes.has(interviewTypeId ?? "") ? "hard" : "medium";

  // Question count: longer types get fewer (coding), mixed get more
  const countMap: Record<string, QuestionCountOption> = {
    coding: 5,
    "system-design": 5,
    "case-analysis": 5,
    "contract-review": 10,
    mixed: 20,
  };
  const questionCount: QuestionCountOption = countMap[interviewTypeId ?? ""] ?? 10;

  // Sources: always include resume; add company if company name filled
  const sources = ["resume", "jd", "role"];
  if (company.trim()) sources.push("company");

  // Focus areas: first 3 from the category list
  const focusAreas = FOCUS_AREAS_BY_CATEGORY[category].slice(0, 3);

  const roleLabel = [role, company].filter(Boolean).join(" at ") || "this role";
  const rationale = `Based on your ${category} background${company ? ` and target company (${company})` : ""}, we recommend a ${difficulty} difficulty session covering ${questionCount} questions. Your resume and job description together provide the strongest signal for personalizing questions to ${roleLabel}.`;

  return { difficulty, questionCount, sources, focusAreas, rationale };
}
