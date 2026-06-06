import type { StructuredResume } from "@/store/resumeAnalyzeStore";

/**
 * Lightweight, dependency-free resume industry/category classifier.
 *
 * Outputs one of 7 supported Interview Prep categories:
 * Technology | Legal | Healthcare | Sales | Marketing | Product | General
 *
 * Skills + job titles are weighted higher than free-text body matches because
 * they are the strongest domain signal.
 */

export type ResumeCategory =
  | "Technology"
  | "Legal"
  | "Healthcare"
  | "Sales"
  | "Marketing"
  | "Product"
  | "General";

export const RESUME_CATEGORIES: ResumeCategory[] = [
  "Technology",
  "Legal",
  "Healthcare",
  "Sales",
  "Marketing",
  "Product",
  "General",
];

export interface ResumeCategoryResult {
  category: ResumeCategory;
  /** 0–1 share of the winning category's score over the total. */
  confidence: number;
}

const SKILL_WEIGHT = 3;
const TITLE_WEIGHT = 4;
const TEXT_WEIGHT = 1;

const CATEGORY_SIGNALS: Record<ResumeCategory, string[]> = {
  Technology: [
    "react", "node", "typescript", "javascript", "python", "java", "c++", "go",
    "rust", "aws", "azure", "gcp", "docker", "kubernetes", "sql", "nosql", "api",
    "software engineer", "developer", "frontend", "backend", "full stack",
    "fullstack", "devops", "machine learning", "data scientist", "cloud", "git",
    "microservices", "graphql", "postgresql", "mongodb", "rest", "ci/cd",
    "algorithms", "data structures", "system design", "engineering",
  ],
  Legal: [
    "attorney", "lawyer", "legal research", "contract law", "corporate law",
    "litigation", "trademark", "patent", "legal", "paralegal", "compliance",
    "contract", "counsel", "law", "regulatory", "due diligence",
    "intellectual property", "case law", "legal counsel", "solicitor",
    "barrister", "court", "deposition", "arbitration", "mediation",
  ],
  Healthcare: [
    "patient care", "clinical", "nursing", "doctor", "healthcare", "nurse",
    "medical", "pharma", "physician", "registered nurse", "ehr", "hipaa",
    "therapy", "diagnosis", "surgical", "pharmacist", "epic", "phlebotomy",
    "hospital", "clinic", "radiology", "oncology", "pediatrics",
    "patient", "health", "care coordination",
  ],
  Sales: [
    "crm", "salesforce", "lead generation", "pipeline", "business development",
    "sales", "quota", "account executive", "b2b", "prospecting", "closing",
    "revenue", "cold calling", "sales representative", "negotiation",
    "deal closing", "account management", "territory", "upsell", "cross-sell",
  ],
  Marketing: [
    "seo", "sem", "campaigns", "google analytics", "growth marketing",
    "marketing", "content", "campaign", "brand", "social media", "growth",
    "copywriting", "google ads", "hubspot", "email marketing",
    "marketing manager", "content strategy", "ppc", "analytics", "engagement",
    "digital marketing", "demand generation", "influencer", "organic",
  ],
  Product: [
    "product manager", "roadmap", "user research", "product strategy",
    "product management", "product owner", "agile", "scrum", "backlog",
    "sprint", "stakeholder", "go-to-market", "gtm", "product led",
    "feature prioritization", "mvp", "customer discovery", "okr",
    "kpi", "product analytics", "a/b testing", "user stories",
  ],
  // General has no signals — it is only ever the fallback when score=0
  General: [],
};

function countMatches(haystack: string, signals: string[]): number {
  let hits = 0;
  for (const signal of signals) {
    if (haystack.includes(signal)) hits += 1;
  }
  return hits;
}

/**
 * Classify a parsed resume into one of the 7 supported Interview Prep
 * categories using a weighted keyword heuristic.
 *
 * @param structured Parsed resume from `/api/upload-resume` (may be null).
 * @param extractedText Synthesized resume text (fallback signal source).
 */
export function classifyResumeCategory(
  structured: StructuredResume | null,
  extractedText = "",
): ResumeCategoryResult {
  const skillText = (structured?.skills ?? [])
    .flatMap((s) => [s.category, ...(s.items ?? [])])
    .join(" ")
    .toLowerCase();

  const titleText = [
    structured?.headline ?? "",
    ...(structured?.experience ?? []).map((e) => e.role ?? ""),
    ...(structured?.projects ?? []).map((p) => p.name ?? ""),
  ]
    .join(" ")
    .toLowerCase();

  const bodyText = extractedText.toLowerCase();

  const scores: Partial<Record<ResumeCategory, number>> = {};
  let total = 0;

  for (const [category, signals] of Object.entries(CATEGORY_SIGNALS) as [ResumeCategory, string[]][]) {
    if (category === "General") continue;
    const score =
      countMatches(skillText, signals) * SKILL_WEIGHT +
      countMatches(titleText, signals) * TITLE_WEIGHT +
      countMatches(bodyText, signals) * TEXT_WEIGHT;
    scores[category] = score;
    total += score;
  }

  let bestCategory: ResumeCategory = "General";
  let bestScore = 0;
  for (const [category, score] of Object.entries(scores) as [ResumeCategory, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  if (bestScore === 0) {
    return { category: "General", confidence: 0 };
  }

  return { category: bestCategory, confidence: total ? bestScore / total : 0 };
}
