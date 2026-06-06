import type { ResumeCategory } from "@/lib/resumeCategoryClassify";

/**
 * Mock question banks for the Interview Prep Dashboard (Step 4).
 * No backend required — these stand in until AI generation is wired.
 *
 * Structure: each "section" has a title, description, and question list.
 * Questions are keyed by ResumeCategory. Company-specific questions are
 * further keyed by lowercase company name with a generic fallback.
 */

export interface QuestionSection {
  id: string;
  title: string;
  description: string;
  questions: string[];
}

// ── Section 1: Resume-based ─────────────────────────────────────────────────

const RESUME_QUESTIONS: Record<ResumeCategory, string[]> = {
  Technology: [
    "Walk me through the most technically complex project on your resume.",
    "What measurable improvements did your work produce, and how did you track them?",
    "Describe a time you made a key architectural decision. What tradeoffs did you consider?",
    "How did you approach debugging a production issue? What was the root cause?",
    "Tell me about a project where you had to learn a new technology quickly.",
    "Explain an achievement you are most proud of and how you would quantify its impact.",
  ],
  Legal: [
    "Walk me through the most complex legal matter you have handled.",
    "Describe a time you had to interpret ambiguous statutory language.",
    "Tell me about a contract negotiation where you achieved a favorable outcome.",
    "How did you manage competing client deadlines in your last role?",
    "Explain an instance where your legal research changed the outcome of a case.",
    "Describe your experience with due diligence and what you found.",
  ],
  Healthcare: [
    "Describe a complex patient case and how you managed it.",
    "Tell me about a time you caught an error before it reached a patient.",
    "Walk me through your approach to a difficult diagnosis.",
    "How have you handled a disagreement with a fellow clinician?",
    "Describe a quality improvement initiative you led or contributed to.",
    "Tell me about a time you had to deliver difficult news to a patient or family.",
  ],
  Sales: [
    "Walk me through your most successful deal and what made it work.",
    "Describe a time you lost a deal. What did you learn?",
    "Tell me about a time you exceeded your quota. How did you do it?",
    "How have you built a pipeline from scratch in a new territory?",
    "Describe your approach to a multi-stakeholder enterprise deal.",
    "Tell me about a long sales cycle you navigated and how you kept momentum.",
  ],
  Marketing: [
    "Walk me through a campaign you owned end-to-end.",
    "Tell me about a marketing experiment that failed. What did you learn?",
    "Describe the most impactful growth initiative you ran.",
    "How have you used data to change a marketing strategy mid-campaign?",
    "Tell me about a brand challenge you overcame.",
    "Describe your process for prioritizing marketing channels for a new product.",
  ],
  Product: [
    "Walk me through a product you took from concept to launch.",
    "Tell me about a feature you decided NOT to build. Why?",
    "Describe how you handled conflicting priorities from engineering and business.",
    "What is the product decision you are most proud of?",
    "Tell me about a time your roadmap had to change dramatically. How did you adapt?",
    "Describe your process for writing a product spec.",
  ],
  General: [
    "Walk me through your most significant professional accomplishment.",
    "Describe a challenge at work and how you resolved it.",
    "Tell me about a time you took ownership of something beyond your job description.",
    "How have you contributed to your team's success in a measurable way?",
    "Describe a situation where you had to quickly learn something new.",
    "Tell me about a process you improved and what the impact was.",
  ],
};

// ── Section 2: JD / Role-based ──────────────────────────────────────────────

const JD_QUESTIONS: Record<ResumeCategory, string[]> = {
  Technology: [
    "Explain your experience with the core technologies listed in this role.",
    "How would you design a scalable REST API for high-throughput workloads?",
    "Describe your approach to code review. What do you look for?",
    "How have you ensured reliability and uptime in production systems?",
    "Walk me through how you would onboard to a new, large codebase.",
    "Describe your experience with cloud infrastructure and IaC tools.",
  ],
  Legal: [
    "How does your experience align with the practice areas listed in this role?",
    "Describe your familiarity with the regulatory frameworks relevant to this position.",
    "How have you handled high-volume contract review efficiently?",
    "Walk me through your experience with the deal types mentioned in the job description.",
    "How do you stay current on changes to relevant laws and regulations?",
    "Describe your approach to managing outside counsel.",
  ],
  Healthcare: [
    "How does your clinical experience align with the patient population for this role?",
    "Describe your familiarity with the EMR systems listed in the job posting.",
    "How have you handled high patient volume while maintaining quality of care?",
    "Tell me about your experience with the procedures or specialties listed in the JD.",
    "How do you stay current with evidence-based clinical guidelines?",
    "Describe your experience with quality metrics and reporting.",
  ],
  Sales: [
    "How does your sales experience map to the market segment in this role?",
    "Describe your experience with the CRM tools listed in the job description.",
    "What is your average deal size and how does that compare to this role's targets?",
    "How have you sold to the buyer personas mentioned in the job description?",
    "Describe your approach to the sales methodology the company uses.",
    "How do you build credibility quickly in a new vertical?",
  ],
  Marketing: [
    "How does your channel expertise align with this role's requirements?",
    "Describe your experience with the tools and platforms listed in the job description.",
    "Walk me through a campaign you ran for a similar audience or product.",
    "How have you met the types of growth targets described in the JD?",
    "Describe your approach to attribution modeling in the context of this role.",
    "How do you balance brand and performance marketing?",
  ],
  Product: [
    "How does your product background align with the domain this role focuses on?",
    "Describe your experience with the development methodology listed in the job description.",
    "How have you worked with the types of stakeholders mentioned in the JD?",
    "Walk me through your approach to the product stage described (0-to-1 vs. scaling).",
    "Describe your experience with the metrics framework this company uses.",
    "How do you manage the tension between technical debt and feature velocity?",
  ],
  General: [
    "How does your background align with the key requirements of this role?",
    "Describe your experience with the tools and systems mentioned in the job description.",
    "Walk me through how you would approach the core responsibilities of this position.",
    "How have you met targets or goals similar to those described in the JD?",
    "Describe your experience working in a similar environment or company stage.",
    "How would your previous work translate directly to this role?",
  ],
};

// ── Section 3: Behavioral ───────────────────────────────────────────────────

const BEHAVIORAL_QUESTIONS: Record<ResumeCategory, string[]> = {
  Technology: [
    "Tell me about a conflict with a colleague over a technical decision. How did you resolve it?",
    "Describe a time you pushed back on a product decision. What happened?",
    "Give an example of when you had to ship despite incomplete information.",
    "Tell me about mentoring a junior engineer. What approach did you take?",
    "Describe a situation where you had to balance technical debt with feature delivery.",
    "Tell me about a time you delivered bad news to a stakeholder.",
  ],
  Legal: [
    "Describe a time you disagreed with a senior partner. How did you handle it?",
    "Tell me about a situation where you had to deliver unwelcome advice to a client.",
    "Give an example of managing multiple urgent matters simultaneously.",
    "Describe a time you advocated for a client position you found challenging to support.",
    "Tell me about collaborating cross-functionally with a non-legal business team.",
    "Describe how you handled a mistake in a filing or document.",
  ],
  Healthcare: [
    "Describe a time you disagreed with a physician's order. What did you do?",
    "Tell me about a situation involving a difficult family member.",
    "Give an example of prioritizing patient safety under time pressure.",
    "Describe a time you worked through a conflict with a colleague.",
    "Tell me about a near-miss incident. How did you respond?",
    "Describe your approach to a patient who refused treatment.",
  ],
  Sales: [
    "Tell me about a time you lost a major deal. What did you learn?",
    "Describe a situation where you had to rebuild a damaged customer relationship.",
    "Give an example of navigating internal conflict to close a deal.",
    "Tell me about a time you missed quota. How did you respond?",
    "Describe how you handle a prospect who ghosts you after a promising demo.",
    "Tell me about collaborating with marketing or product to close a deal.",
  ],
  Marketing: [
    "Describe a campaign that failed. What did you learn and what did you change?",
    "Tell me about a time you had to kill a project mid-flight.",
    "Give an example of influencing a decision without direct authority.",
    "Describe a situation where data conflicted with your gut instinct. What did you do?",
    "Tell me about managing a brand crisis or sensitive communication.",
    "Describe how you worked with a demanding or skeptical executive.",
  ],
  Product: [
    "Tell me about a time you shipped something you knew was imperfect.",
    "Describe a situation where you had to say no to an important stakeholder.",
    "Give an example of using data to change someone's mind.",
    "Tell me about a product bet that did not pay off. What did you learn?",
    "Describe how you've handled a team that missed a sprint commitment.",
    "Tell me about aligning engineering, design, and business on a difficult tradeoff.",
  ],
  General: [
    "Tell me about a time you resolved a conflict at work.",
    "Describe a situation where you handled competing priorities.",
    "Give an example of going above and beyond in your role.",
    "Tell me about a time you received critical feedback. How did you respond?",
    "Describe a situation where you demonstrated leadership without formal authority.",
    "Tell me about a time you made a mistake. What did you do next?",
  ],
};

// ── Section 4: Company-specific ─────────────────────────────────────────────

const COMPANY_QUESTIONS: Record<string, string[]> = {
  amazon: [
    "Tell me about a time you demonstrated customer obsession.",
    "Describe a situation where you disagreed and committed.",
    "Give an example of diving deep into data to solve a problem.",
    "Tell me about a time you delivered results under tight constraints.",
    "Describe a time you raised the bar for yourself or your team.",
    "Tell me about inventing a simple solution to a complex problem.",
  ],
  google: [
    "Explain a technically challenging project and how you approached it.",
    "Describe a time you used data to drive a significant decision.",
    "Tell me about a project you led that had ambiguous requirements.",
    "How have you contributed to the success of a team beyond your own output?",
    "Describe a time you advocated for a user despite internal resistance.",
    "Tell me about a time you improved a process or system at scale.",
  ],
  meta: [
    "Tell me about a time you moved fast and it paid off.",
    "Describe how you have built something with significant scale.",
    "Give an example of iterating quickly based on feedback.",
    "Tell me about a time you prioritized impact over perfection.",
    "Describe a situation where you had to make a decision with incomplete data.",
    "Tell me about a time you collaborated across teams to deliver something big.",
  ],
  microsoft: [
    "Describe a time you demonstrated a growth mindset.",
    "Tell me about empowering others to do their best work.",
    "Give an example of building trust with a customer or stakeholder.",
    "Describe a time you navigated ambiguity in a large organization.",
    "Tell me about a time you drove inclusion on your team.",
    "Describe a situation where you turned a setback into a learning.",
  ],
  stripe: [
    "Tell me about a time you improved a developer or user experience.",
    "Describe a situation where you had to balance speed and correctness.",
    "Give an example of working on a complex technical system end-to-end.",
    "Tell me about navigating a high-stakes customer issue.",
    "Describe a time you made something meaningfully more reliable or performant.",
    "Tell me about working across functions to launch something new.",
  ],
  apple: [
    "Describe a time you made a significant quality improvement.",
    "Tell me about a product decision that required deep user empathy.",
    "Give an example of attention to detail that changed an outcome.",
    "Tell me about advocating for simplicity in a complex system.",
    "Describe a time you pushed back to maintain high standards.",
    "Tell me about a time you collaborated on hardware-software integration.",
  ],
};

const GENERIC_COMPANY_QUESTIONS: Record<ResumeCategory, string[]> = {
  Technology: [
    "How does this company's engineering culture align with your values?",
    "What drew you to this company's product and technical challenges?",
    "Describe a product from this company you find particularly well-built.",
    "How would you contribute to the team's culture in your first 90 days?",
    "Tell me about a time you worked in a culture similar to this company's.",
    "How do you see this role helping the company achieve its mission?",
  ],
  Legal: [
    "Why are you interested in this firm's practice areas?",
    "How does your experience align with this firm's client base?",
    "Describe a company value here that resonates with you and why.",
    "What do you know about this firm's approach to client relationships?",
    "How would you contribute to the firm's culture as a new member?",
    "What appeals to you about this company's position in the market?",
  ],
  Healthcare: [
    "Why do you want to work for this healthcare organization specifically?",
    "How does your clinical philosophy align with our patient-care model?",
    "What do you know about our accreditation standards and quality goals?",
    "Describe a value of ours that matches your own professional values.",
    "How would you contribute to our team in the first 60 days?",
    "Tell me about your experience in a similar care setting.",
  ],
  Sales: [
    "Why do you want to sell this company's product?",
    "What do you know about our ICP and target market?",
    "How would you approach your first 30/60/90 days in this role?",
    "Describe a competing product and how you would position us against it.",
    "Why do you think you will succeed in our sales environment specifically?",
    "What questions do you have about our current pipeline or process?",
  ],
  Marketing: [
    "Why are you excited about this company's brand and positioning?",
    "How does your channel expertise fit our go-to-market strategy?",
    "What would you change about our current marketing presence?",
    "Describe how you would approach your first 60 days in this role.",
    "Tell me about a campaign you would run for our product.",
    "Why this company over competitors in the space?",
  ],
  Product: [
    "What excites you about our product roadmap?",
    "Describe a problem our users face that you would want to solve.",
    "How would you approach your first 30/60/90 days as PM here?",
    "What would you change about our product if you started tomorrow?",
    "Tell me about a product decision we made that you would have made differently.",
    "How do you see this role contributing to our company's mission?",
  ],
  General: [
    "Why do you want to work here specifically?",
    "How does this company's mission resonate with your own values?",
    "What do you know about our culture and how do you see yourself fitting in?",
    "How would you approach your first 90 days in this role?",
    "What questions do you have for us about the team and the role?",
    "Tell me about a time you thrived in a similar environment.",
  ],
};

// ── Public builder ───────────────────────────────────────────────────────────

/** Build the 4 question sections for a given context. */
export function buildQuestionSections(
  category: ResumeCategory,
  company: string,
  role: string,
  selectedInterviewType: string | null,
  questionCount: number,
): QuestionSection[] {
  const limit = Math.max(4, Math.min(questionCount, 6));

  const companyKey = company.trim().toLowerCase();
  const companyQs =
    COMPANY_QUESTIONS[companyKey] ?? GENERIC_COMPANY_QUESTIONS[category];

  const companyTitle = company.trim()
    ? `${company} — Company-Specific Questions`
    : "Company-Specific Questions";
  const companyDesc = company.trim()
    ? `Questions tailored to ${company}'s known interview patterns, leadership principles, and culture.`
    : "Questions tailored to your target company's values and interview style.";

  // Determine section labels from interview type
  const typeToSection: Record<string, { title: string; desc: string }> = {
    technical:            { title: "Technical Questions", desc: "Deep-dives into your technology stack, architecture decisions, and engineering practices." },
    coding:               { title: "Coding & Algorithms", desc: "Algorithm design, data structure selection, and problem-solving under time pressure." },
    "system-design":      { title: "System Design Questions", desc: "Architect scalable systems — databases, APIs, microservices, and tradeoffs." },
    "legal-knowledge":    { title: "Legal Knowledge Questions", desc: "Core legal principles, case law analysis, and practice area questions." },
    "case-analysis":      { title: "Case Analysis Questions", desc: "Structured analysis of legal cases — issue spotting, rule application, reasoning." },
    "contract-review":    { title: "Contract Review Questions", desc: "Identifying key clauses, risk areas, and negotiation points in legal agreements." },
    "clinical-knowledge": { title: "Clinical Knowledge Questions", desc: "Evidence-based clinical decision-making and specialty-specific scenarios." },
    "patient-care":       { title: "Patient Care Questions", desc: "Situational questions around patient communication, safety, and advocacy." },
    "compliance-regulations": { title: "Compliance & Regulatory Questions", desc: "HIPAA, CMS regulations, and healthcare accreditation standards." },
    "sales-scenarios":    { title: "Sales Scenario Questions", desc: "Role-plays around prospecting, discovery, demos, and deal-closing." },
    "objection-handling": { title: "Objection Handling Questions", desc: "Navigating price, timing, and competitive objections." },
    "crm-pipeline":       { title: "CRM & Pipeline Questions", desc: "Salesforce, HubSpot, forecasting, and pipeline management." },
    "campaign-strategy":  { title: "Campaign Strategy Questions", desc: "End-to-end campaign planning, channel selection, and performance analysis." },
    "analytics-growth":   { title: "Analytics & Growth Questions", desc: "SEO, SEM, A/B testing, attribution, and growth strategy." },
    "content-branding":   { title: "Content & Brand Questions", desc: "Brand voice, content calendars, storytelling, and audience strategy." },
    "product-sense":      { title: "Product Sense Questions", desc: "Product intuition, user empathy, and prioritization frameworks." },
    execution:            { title: "Execution Questions", desc: "Sprint planning, stakeholder management, and delivering under constraints." },
    "metrics-analytics":  { title: "Metrics & Analytics Questions", desc: "Defining success metrics, funnel analysis, and diagnosing product health." },
  };

  const typeSection = selectedInterviewType
    ? (typeToSection[selectedInterviewType] ?? null)
    : null;

  // Section 2 is JD-based unless the type has a more specific section
  const section2 = typeSection ?? {
    title: "Job Description — Role Requirements",
    desc: "Generated from ATS keyword extraction and the job's core requirements.",
  };

  return [
    {
      id: "resume",
      title: "Resume-Based Questions",
      description:
        "Generated from your projects, achievements, responsibilities, and experience.",
      questions: RESUME_QUESTIONS[category].slice(0, limit),
    },
    {
      id: "jd",
      title: section2.title,
      description: section2.desc,
      questions: JD_QUESTIONS[category].slice(0, limit),
    },
    {
      id: "behavioral",
      title: "Behavioral Questions",
      description: "STAR-method and leadership-focused interview preparation.",
      questions: BEHAVIORAL_QUESTIONS[category].slice(0, limit),
    },
    {
      id: "company",
      title: companyTitle,
      description: companyDesc,
      questions: companyQs.slice(0, limit),
    },
  ];
}
