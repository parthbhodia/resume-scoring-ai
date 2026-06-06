import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  Code2,
  FileSearch,
  FileText,
  Heart,
  Layers,
  Lightbulb,
  MessageSquare,
  Network,
  PenTool,
  Scale,
  Shield,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { ResumeCategory } from "@/lib/resumeCategoryClassify";

export interface InterviewTypeConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  /** "Beta" only — "Recommended" is computed dynamically per category. */
  badge?: "Beta";
  /** Topic chips shown on the card. */
  topics: string[];
  questionCount: number;
  estimatedMinutes: number;
  /** Checklist items shown in the selection summary. */
  includes: string[];
}

// ── Full catalog ────────────────────────────────────────────────────────────

const BEHAVIORAL: InterviewTypeConfig = {
  id: "behavioral",
  label: "Behavioral Interview",
  description: "STAR-method questions about leadership, conflict, teamwork, communication, and ownership.",
  icon: <Users className="size-6" aria-hidden />,
  topics: ["Leadership", "Teamwork", "Conflict Resolution", "Communication"],
  questionCount: 15,
  estimatedMinutes: 20,
  includes: ["Behavioral Questions", "STAR Framework", "Leadership Scenarios"],
};

const TECHNICAL: InterviewTypeConfig = {
  id: "technical",
  label: "Technical Interview",
  description: "Deep-dives into your technology stack, architecture decisions, and job requirements.",
  icon: <BookOpen className="size-6" aria-hidden />,
  topics: ["System Architecture", "APIs", "Best Practices", "Debugging"],
  questionCount: 20,
  estimatedMinutes: 25,
  includes: ["Technical Deep-Dive", "Stack-Specific Questions", "Practical Scenarios"],
};

const CODING: InterviewTypeConfig = {
  id: "coding",
  label: "Coding Interview",
  description: "Algorithms, data structures, coding challenges, and problem-solving exercises.",
  icon: <Code2 className="size-6" aria-hidden />,
  badge: "Beta",
  topics: ["Algorithms", "Data Structures", "Problem Solving", "Complexity"],
  questionCount: 5,
  estimatedMinutes: 45,
  includes: ["Algorithm Questions", "Data Structure Problems", "Coding Challenges"],
};

const SYSTEM_DESIGN: InterviewTypeConfig = {
  id: "system-design",
  label: "System Design",
  description: "Architect scalable systems — databases, APIs, microservices, and infrastructure tradeoffs.",
  icon: <Network className="size-6" aria-hidden />,
  badge: "Beta",
  topics: ["Scalability", "Databases", "Microservices", "Infrastructure"],
  questionCount: 3,
  estimatedMinutes: 45,
  includes: ["Architecture Questions", "Scalability Scenarios", "Design Tradeoffs"],
};

const COMPANY_SPECIFIC: InterviewTypeConfig = {
  id: "company-specific",
  label: "Company Specific",
  description: "Questions tailored to your selected company, role, culture, and known interview processes.",
  icon: <Building2 className="size-6" aria-hidden />,
  topics: ["Culture Fit", "Role Expectations", "Values Alignment", "Team Dynamics"],
  questionCount: 12,
  estimatedMinutes: 15,
  includes: ["Company Culture Questions", "Role-Specific Scenarios", "Values Alignment"],
};

const MIXED: InterviewTypeConfig = {
  id: "mixed",
  label: "Mixed Interview",
  description: "Combination of behavioral, technical, and role-specific questions for comprehensive prep.",
  icon: <Layers className="size-6" aria-hidden />,
  topics: ["Technical", "Behavioral", "Role-Specific", "Company Culture"],
  questionCount: 20,
  estimatedMinutes: 25,
  includes: ["Technical Questions", "Behavioral Questions", "Company Specific Questions"],
};

const LEGAL_KNOWLEDGE: InterviewTypeConfig = {
  id: "legal-knowledge",
  label: "Legal Knowledge",
  description: "Core legal principles, case law, statutes, and practice area-specific questions.",
  icon: <Scale className="size-6" aria-hidden />,
  topics: ["Case Law", "Legal Principles", "Statutes", "Practice Areas"],
  questionCount: 15,
  estimatedMinutes: 20,
  includes: ["Core Legal Principles", "Case Law Questions", "Statute Analysis"],
};

const CASE_ANALYSIS: InterviewTypeConfig = {
  id: "case-analysis",
  label: "Case Analysis",
  description: "Structured analysis of legal cases — issue spotting, rule application, and reasoning.",
  icon: <FileSearch className="size-6" aria-hidden />,
  topics: ["Issue Spotting", "Rule Application", "Legal Reasoning", "Analysis"],
  questionCount: 5,
  estimatedMinutes: 45,
  includes: ["Case Scenario Analysis", "Issue Identification", "Legal Reasoning"],
};

const CONTRACT_REVIEW: InterviewTypeConfig = {
  id: "contract-review",
  label: "Contract Review",
  description: "Identifying key clauses, risk areas, and negotiation points in legal agreements.",
  icon: <FileText className="size-6" aria-hidden />,
  topics: ["Key Clauses", "Risk Assessment", "Negotiation", "Compliance"],
  questionCount: 8,
  estimatedMinutes: 30,
  includes: ["Contract Analysis", "Risk Identification", "Negotiation Strategies"],
};

const CLINICAL_KNOWLEDGE: InterviewTypeConfig = {
  id: "clinical-knowledge",
  label: "Clinical Knowledge",
  description: "Evidence-based practice, clinical decision-making, and specialty-specific scenarios.",
  icon: <Stethoscope className="size-6" aria-hidden />,
  topics: ["Evidence-Based Practice", "Clinical Decisions", "Specialty Topics"],
  questionCount: 15,
  estimatedMinutes: 20,
  includes: ["Clinical Scenario Questions", "Decision-Making", "Evidence-Based Practice"],
};

const PATIENT_CARE: InterviewTypeConfig = {
  id: "patient-care",
  label: "Patient Care",
  description: "Situational questions around patient communication, safety, advocacy, and outcomes.",
  icon: <Heart className="size-6" aria-hidden />,
  topics: ["Patient Communication", "Safety Protocols", "Advocacy", "Outcomes"],
  questionCount: 12,
  estimatedMinutes: 15,
  includes: ["Patient Interaction Scenarios", "Safety Questions", "Advocacy Cases"],
};

const COMPLIANCE_REGS: InterviewTypeConfig = {
  id: "compliance-regulations",
  label: "Compliance & Regulations",
  description: "HIPAA, CMS regulations, accreditation standards, and healthcare compliance scenarios.",
  icon: <Shield className="size-6" aria-hidden />,
  topics: ["HIPAA", "CMS Regulations", "Accreditation", "Risk Management"],
  questionCount: 10,
  estimatedMinutes: 15,
  includes: ["HIPAA Compliance", "Regulatory Scenarios", "Risk Management"],
};

const SALES_SCENARIOS: InterviewTypeConfig = {
  id: "sales-scenarios",
  label: "Sales Scenarios",
  description: "Role-plays and situational questions around prospecting, discovery, and deal-closing.",
  icon: <TrendingUp className="size-6" aria-hidden />,
  topics: ["Prospecting", "Discovery", "Closing", "Pipeline Management"],
  questionCount: 12,
  estimatedMinutes: 20,
  includes: ["Sales Role-Plays", "Discovery Questions", "Closing Scenarios"],
};

const OBJECTION_HANDLING: InterviewTypeConfig = {
  id: "objection-handling",
  label: "Objection Handling",
  description: "Real objections from prospects — price, timing, competition — and how to navigate them.",
  icon: <MessageSquare className="size-6" aria-hidden />,
  topics: ["Price Objections", "Timing", "Competition", "Value Positioning"],
  questionCount: 10,
  estimatedMinutes: 15,
  includes: ["Common Objection Scenarios", "Reframing Techniques", "Value Positioning"],
};

const CRM_PIPELINE: InterviewTypeConfig = {
  id: "crm-pipeline",
  label: "CRM & Pipeline",
  description: "Salesforce, HubSpot, and pipeline management — forecasting, hygiene, and reporting.",
  icon: <BarChart3 className="size-6" aria-hidden />,
  topics: ["Salesforce", "HubSpot", "Forecasting", "Pipeline Hygiene"],
  questionCount: 10,
  estimatedMinutes: 15,
  includes: ["CRM Tool Questions", "Forecasting Scenarios", "Pipeline Management"],
};

const CAMPAIGN_STRATEGY: InterviewTypeConfig = {
  id: "campaign-strategy",
  label: "Campaign Strategy",
  description: "End-to-end campaign planning, channel selection, budgeting, and performance analysis.",
  icon: <Target className="size-6" aria-hidden />,
  topics: ["Channel Selection", "Budget Planning", "Target Audience", "Performance KPIs"],
  questionCount: 12,
  estimatedMinutes: 20,
  includes: ["Campaign Planning", "Channel Strategy", "Budget & Performance"],
};

const ANALYTICS_GROWTH: InterviewTypeConfig = {
  id: "analytics-growth",
  label: "Analytics & Growth",
  description: "SEO, SEM, attribution, A/B testing, and data-driven growth strategy questions.",
  icon: <Activity className="size-6" aria-hidden />,
  topics: ["SEO / SEM", "A/B Testing", "Attribution", "Funnel Analysis"],
  questionCount: 12,
  estimatedMinutes: 20,
  includes: ["Growth Strategy Questions", "Analytics Deep-Dive", "Experiment Design"],
};

const CONTENT_BRANDING: InterviewTypeConfig = {
  id: "content-branding",
  label: "Content & Branding",
  description: "Brand voice, content calendars, storytelling, copywriting, and audience strategy.",
  icon: <PenTool className="size-6" aria-hidden />,
  topics: ["Brand Voice", "Content Calendar", "Copywriting", "Audience Strategy"],
  questionCount: 10,
  estimatedMinutes: 15,
  includes: ["Content Strategy Questions", "Brand Scenarios", "Copywriting Challenges"],
};

const PRODUCT_SENSE: InterviewTypeConfig = {
  id: "product-sense",
  label: "Product Sense",
  description: "Product intuition, user empathy, prioritization frameworks, and roadmap tradeoffs.",
  icon: <Lightbulb className="size-6" aria-hidden />,
  topics: ["User Empathy", "Prioritization", "Roadmap", "Product Strategy"],
  questionCount: 10,
  estimatedMinutes: 20,
  includes: ["Product Design Questions", "Prioritization Frameworks", "User Research"],
};

const EXECUTION: InterviewTypeConfig = {
  id: "execution",
  label: "Execution",
  description: "How you drive delivery — sprint planning, stakeholder management, and shipping under constraints.",
  icon: <Zap className="size-6" aria-hidden />,
  topics: ["Sprint Planning", "Stakeholder Management", "Delivery", "Risk Mitigation"],
  questionCount: 12,
  estimatedMinutes: 20,
  includes: ["Delivery Scenarios", "Stakeholder Challenges", "Shipping Under Constraints"],
};

const METRICS_ANALYTICS: InterviewTypeConfig = {
  id: "metrics-analytics",
  label: "Metrics & Analytics",
  description: "Defining success metrics, analyzing funnel data, and diagnosing product health.",
  icon: <BarChart3 className="size-6" aria-hidden />,
  topics: ["Success Metrics", "Funnel Analysis", "Product Health", "Data Interpretation"],
  questionCount: 10,
  estimatedMinutes: 15,
  includes: ["Metrics Definition", "Funnel Diagnostics", "Data-Driven Decisions"],
};

const ROLE_SPECIFIC: InterviewTypeConfig = {
  id: "role-specific",
  label: "Role-Specific Knowledge",
  description: "Questions tailored to the responsibilities, skills, and expertise your role demands.",
  icon: <BookOpen className="size-6" aria-hidden />,
  topics: ["Core Competencies", "Domain Knowledge", "Role Requirements"],
  questionCount: 15,
  estimatedMinutes: 20,
  includes: ["Role Competency Questions", "Domain Knowledge", "Skill Assessment"],
};

// ── Category → displayed card list ─────────────────────────────────────────

export const INTERVIEW_TYPES_BY_CATEGORY: Record<ResumeCategory, InterviewTypeConfig[]> = {
  Technology: [BEHAVIORAL, TECHNICAL, CODING, SYSTEM_DESIGN, COMPANY_SPECIFIC, MIXED],
  Legal:      [BEHAVIORAL, LEGAL_KNOWLEDGE, CASE_ANALYSIS, CONTRACT_REVIEW, COMPANY_SPECIFIC, MIXED],
  Healthcare: [BEHAVIORAL, CLINICAL_KNOWLEDGE, PATIENT_CARE, COMPLIANCE_REGS, COMPANY_SPECIFIC, MIXED],
  Sales:      [BEHAVIORAL, SALES_SCENARIOS, OBJECTION_HANDLING, CRM_PIPELINE, COMPANY_SPECIFIC, MIXED],
  Marketing:  [BEHAVIORAL, CAMPAIGN_STRATEGY, ANALYTICS_GROWTH, CONTENT_BRANDING, COMPANY_SPECIFIC, MIXED],
  Product:    [BEHAVIORAL, PRODUCT_SENSE, EXECUTION, METRICS_ANALYTICS, COMPANY_SPECIFIC, MIXED],
  General:    [BEHAVIORAL, ROLE_SPECIFIC, COMPANY_SPECIFIC, MIXED],
};

/** Which interview type id is "Recommended" for each category. */
export const CATEGORY_RECOMMENDED: Record<ResumeCategory, string> = {
  Technology: "technical",
  Legal:      "legal-knowledge",
  Healthcare: "clinical-knowledge",
  Sales:      "sales-scenarios",
  Marketing:  "campaign-strategy",
  Product:    "product-sense",
  General:    "behavioral",
};

/** Emoji / icon character for each category, used in the banner heading. */
export const CATEGORY_ICON_CHAR: Record<ResumeCategory, string> = {
  Technology: "🚀",
  Legal:      "⚖️",
  Healthcare: "🏥",
  Sales:      "📈",
  Marketing:  "🎯",
  Product:    "💡",
  General:    "👤",
};

/** Fallback representative skills per category if the resume has none. */
export const CATEGORY_FALLBACK_SKILLS: Record<ResumeCategory, string[]> = {
  Technology: ["JavaScript", "APIs", "Cloud", "Git"],
  Legal:      ["Contract Law", "Legal Research", "Compliance", "Litigation"],
  Healthcare: ["Patient Care", "Clinical", "HIPAA", "EHR"],
  Sales:      ["CRM", "Pipeline", "Lead Generation", "Negotiation"],
  Marketing:  ["SEO", "Campaigns", "Analytics", "Content Strategy"],
  Product:    ["Roadmap", "User Research", "Agile", "Stakeholders"],
  General:    ["Communication", "Problem Solving", "Teamwork", "Ownership"],
};

/** One-line description for each category shown in the banner. */
export const CATEGORY_DESCRIPTIONS: Record<ResumeCategory, string> = {
  Technology: "Showing engineering-focused interview preparation tailored to your background.",
  Legal:      "Showing legal-focused interview preparation tailored to your background.",
  Healthcare: "Showing clinical and healthcare interview preparation tailored to your background.",
  Sales:      "Showing sales-focused interview preparation tailored to your background.",
  Marketing:  "Showing marketing-focused interview preparation tailored to your background.",
  Product:    "Showing product management interview preparation tailored to your background.",
  General:    "Showing general interview preparation formats tailored to your background.",
};
