import type { Metadata } from "next";
import Link from "next/link";
import BlogArticleLayout, { Section, List } from "@/components/blog/BlogArticleLayout";

export const metadata: Metadata = {
  title: "How to Tailor Your Resume to a Job Description · Resunova Blog",
  description:
    "A step-by-step guide to matching your resume to any job posting — keyword extraction, bullet rewrites, ATS checks, and the mistakes that get you filtered out.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://www.resunova.io/blog/tailor-resume-to-job-description/" },
};

const CHECKLIST = [
  "Copy the exact job title into your resume headline or summary.",
  "Underline every repeated word in the posting — those are your must-have keywords.",
  "Match 25–35 role-specific terms from the JD, used naturally in bullet points.",
  "Rewrite your top 3–5 bullets to reflect the specific outcomes the role cares about.",
  "Add a number (%, $, ×, headcount) to every achievement bullet possible.",
  "Move your most relevant section to just below the summary.",
  "Run an ATS check — look for missing contact info, two-column layout, or table usage.",
  "Read it aloud: does it sound like you wrote it for this role, or for any role?",
];

export default function TailorResumeToJobDescriptionPage() {
  return (
    <BlogArticleLayout
      title="How to Tailor Your Resume to a Job Description (Step-by-Step)"
      subtitle="Generic applications rarely land interviews — not because applicants are unqualified, but because their resume doesn't mirror what the recruiter is scanning for. Here's how to fix that."
    >
      <Section title="Why tailoring works (and generic applications don't)">
        <p style={{ margin: "0 0 14px" }}>
          When you send the same resume to 50 jobs, you're competing on luck, not relevance. Recruiters
          search their Applicant Tracking System (ATS) like a database — by keyword, title, and experience
          band. If your resume doesn't match what they type, you don't appear. You're not rejected;
          you're invisible.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          Tailoring solves two problems at once. It passes the machine filter, and it signals to the
          human reading your resume that you understood the role — not just applied to everything in
          the ballpark. A hiring manager can tell in 10 seconds whether a candidate actually read the
          posting or bulk-blasted a generic document.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          You don't need to rewrite your resume from scratch for every application. A strategic edit
          of 4–6 bullets and your summary takes 15–20 minutes and dramatically improves your match
          score.
        </p>
      </Section>

      <Section title="Step 1: Read the job description like a recruiter would">
        <p style={{ margin: "0 0 14px" }}>
          Read the posting twice before you touch your resume. On the first pass, circle every technical
          skill, tool name, and certification mentioned (Python, Salesforce, Series B, GAAP, PMP).
          On the second pass, underline every soft-skill phrase and repeated word — if "cross-functional
          collaboration" appears three times, that phrase is load-bearing.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          You're looking for two types of terms:
        </p>
        <List items={[
          { text: "Hard keywords — specific tools, technologies, methodologies, or credentials the role requires. These need to appear verbatim." },
          { text: "Role-framing words — how the company describes the work: strategy, operations, pipeline, stakeholder, roadmap. These tell you the register your bullets should match." },
          { text: "Required vs. preferred — \"required\" keywords must appear in your resume. \"Preferred\" keywords improve your score but are lower priority." },
        ]} />
        <p style={{ margin: "14px 0 0" }}>
          One practical trick: paste the posting into a word-frequency tool or just count manually.
          If a word appears 4+ times, it belongs in your resume.
        </p>
      </Section>

      <Section title="Step 2: Mirror the exact job title">
        <p style={{ margin: "0 0 14px" }}>
          This is the single highest-ROI edit you can make. ATS keyword matching is still largely
          literal — "Senior Product Manager" and "Head of Product Strategy" are different strings.
          If the posting says "Senior Product Manager," those exact three words should appear in
          your headline, summary, or a recent job title.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          You don't have to change your actual title (which is a factual record). Instead, add a
          professional headline directly below your name: <em>"Senior Product Manager — SaaS / B2B Growth"</em>.
          That line is indexable text and can carry your target title without misrepresenting your history.
        </p>
      </Section>

      <Section title="Step 3: Weave keywords into context — don't stuff them">
        <p style={{ margin: "0 0 14px" }}>
          Keyword stuffing (hiding white text, listing 60 skills in a row) is detectable by modern
          ATS platforms and flagged by AI-assisted screening tools. You want roughly 25–35 relevant,
          role-specific terms from the posting, used naturally inside accomplishment bullets.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          The best insertion point is an accomplishment bullet — it creates context:
        </p>
        <List items={[
          { text: "Weak: 'Proficient in SQL.' (keyword without context)" },
          { text: "Strong: 'Built SQL pipelines that reduced weekly reporting time by 6 hours across 3 teams.'" },
        ]} />
        <p style={{ margin: "14px 0 0" }}>
          The second version passes the same keyword check, proves competence, and is a better read
          for the human reviewer.
        </p>
      </Section>

      <Section title="Step 4: Rewrite your top bullets for the role">
        <p style={{ margin: "0 0 14px" }}>
          You don't need to rewrite everything — identify the 3–5 bullets in your most recent or
          most relevant role that are closest to what the job requires, then sharpen them.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          The formula: <strong>Action verb + specific scope + outcome the posting cares about.</strong>
        </p>
        <List items={[
          { text: "Before: 'Responsible for managing the data pipeline.'" },
          { text: "After: 'Redesigned ETL pipeline in Python/Airflow, cutting data latency from 4 hours to 15 minutes and unblocking 5 downstream ML teams.'" },
        ]} />
        <p style={{ margin: "14px 0 0" }}>
          Notice the "after" version contains: a strong ownership verb (Redesigned), specific tools
          (Python, Airflow), a quantified outcome (4 hours → 15 minutes), and stakeholder scope
          (5 downstream ML teams). All four are common filters in engineering hiring.
        </p>
      </Section>

      <Section title="Step 5: Quantify every achievement you can">
        <p style={{ margin: "0 0 14px" }}>
          Numbers compress credibility. "$2M ARR" or "40% churn reduction" communicates scale
          instantly. Recruiters spending 10 seconds on a resume scan for numbers — they're the fastest
          signal that a candidate has moved the needle, not just held a title.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          If you don't know an exact figure, use a reasonable approximation and flag it:
          "Reduced onboarding time by approximately 30%." Most hiring managers accept approximations;
          what they don't accept is a resume with zero numbers on a role that clearly had
          measurable outcomes.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          Common quantification angles you might be missing:
        </p>
        <List items={[
          { text: "Team / headcount: 'Led a team of 8 engineers across 3 time zones.'" },
          { text: "Scale: 'System processed 2M events/day at peak load.'" },
          { text: "Speed: 'Reduced deployment cycle from 2 weeks to 2 days.'" },
          { text: "Revenue / cost: 'Identified $180K annual savings in vendor contracts.'" },
          { text: "Coverage: 'Rolled out new onboarding program to 200+ employees in Q3.'" },
        ]} />
      </Section>

      <Section title="Step 6: Reorder sections to lead with your strongest relevance">
        <p style={{ margin: "0 0 14px" }}>
          Most resumes default to: Contact → Summary → Experience → Education → Skills.
          That order works for linear career paths. For career changes, non-traditional backgrounds,
          or roles where your skills section is unusually strong, it can bury your best material.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          If you're applying to a role where your side projects are more relevant than your day job,
          surface Projects above later Experience entries. If the posting emphasizes credentials
          you have in your Education section, move it up. The rule is: whatever the recruiter most
          needs to see to say "qualified" should appear in the top third of the page.
        </p>
      </Section>

      <Section title="What not to do">
        <List items={[
          { text: "Don't use a two-column layout. Most ATS parsers read columns left-to-right, merging them into nonsense text." },
          { text: "Don't hide keywords in white text. Modern tools detect this and it's an instant disqualifier with some platforms." },
          { text: "Don't change your actual job titles. Misrepresenting your employment record is a background-check liability. Use a headline for your target title instead." },
          { text: "Don't pad with soft skills nobody asked for. 'Team player' and 'results-driven' add no signal — they use space where a keyword could live." },
          { text: "Don't over-optimize. A resume that reads like a keyword list won't survive the human review even if it passes the ATS." },
        ]} />
      </Section>

      <Section title="How to know if your tailoring worked">
        <p style={{ margin: "0 0 14px" }}>
          The practical check: re-read the job posting, then read your resume summary. Do the same
          words come back? Could a recruiter read your resume and immediately know you've done this
          specific type of work?
        </p>
        <p style={{ margin: "0 0 14px" }}>
          Automated tools help too. Running your tailored resume against the job description in an
          ATS checker shows which required keywords you're still missing and where your match score
          sits. Resunova scores your resume against any JD — match score, gap analysis,
          missing keywords, and bullet-level feedback — in under a minute.
        </p>
        <p style={{ margin: "0 0 14px" }}>
          A well-tailored resume typically shows a match score of 75–90% against the specific JD.
          Below 60%, you're likely missing key technical terms or your bullets don't reflect
          the role's core responsibilities.
        </p>
      </Section>

      <Section title="Quick checklist">
        <List items={CHECKLIST.map((text) => ({ text }))} />
      </Section>

      <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 28, lineHeight: 1.6 }}>
        Want to see your current match score?{" "}
        <Link href="/" style={{ color: "var(--accent)" }}>
          Upload your resume and paste a job description in Resunova
        </Link>{" "}
        — it's free and takes under a minute. Also see our guides on{" "}
        <Link href="/blog/how-ats-really-works" style={{ color: "var(--accent)" }}>
          how ATS systems really work
        </Link>{" "}
        and{" "}
        <Link href="/blog/optimizing-resumes-for-ats" style={{ color: "var(--accent)" }}>
          ATS formatting best practices
        </Link>
        .
      </p>
    </BlogArticleLayout>
  );
}
