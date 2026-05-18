import type { Metadata } from "next";
import Link from "next/link";
import BlogArticleLayout, { Section, List } from "@/components/blog/BlogArticleLayout";
import { RESEARCH_QUICK_CHECKLIST } from "@/lib/atsBestPracticesContent";
import { ATS_RESEARCH_SECTIONS } from "@/lib/atsResearchContent";

export const metadata: Metadata = {
  title: "How ATS Really Works · Resunova Blog",
  description:
    "Parsing research across major ATS platforms: visibility vs rejection, exact job titles, keyword bands, layout traps, and a quick-fix checklist.",
  robots: { index: true, follow: true },
};

export default function HowAtsReallyWorksPage() {
  return (
    <BlogArticleLayout
      title="How ATS Really Works (And Why You’re Invisible, Not Rejected)"
      subtitle="What systematic parsing tests across Workday, Greenhouse, Lever, iCIMS, Taleo, and similar systems suggest — and how Resunova checks your PDF against these patterns."
    >
      {ATS_RESEARCH_SECTIONS.map((sec) => (
        <Section key={sec.title} title={sec.title}>
          {sec.paragraphs.map((p, i) => (
            <p key={i} style={{ margin: "0 0 14px" }}>{p}</p>
          ))}
        </Section>
      ))}

      <Section title="TL;DR — quick-fix checklist">
        <List items={RESEARCH_QUICK_CHECKLIST.map((item) => ({ text: item.text }))} />
        <p style={{ marginTop: 16, fontSize: 13, color: "var(--dim)" }}>
          Run an ATS check in Resunova after tailoring — the <strong style={{ color: "var(--text)" }}>ATS best practices</strong> panel
          scores many of these items automatically from your PDF text.
        </p>
      </Section>

      <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 24 }}>
        Also see our{" "}
        <Link href="/blog/optimizing-resumes-for-ats" style={{ color: "var(--accent)" }}>
          UIC formatting guide
        </Link>{" "}
        for university career-center dos and don’ts.
      </p>
    </BlogArticleLayout>
  );
}
