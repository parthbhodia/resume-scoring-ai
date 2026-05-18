import type { Metadata } from "next";
import Link from "next/link";
import BlogArticleLayout, { Section, List } from "@/components/blog/BlogArticleLayout";
import {
  ATS_GUIDE_ATTRIBUTION,
  ATS_GUIDE_DONTS,
  ATS_GUIDE_DOS,
  ATS_GUIDE_FORMAT_CHECKLIST,
  ATS_GUIDE_TOP_TIPS,
} from "@/lib/atsBestPracticesContent";

export const metadata: Metadata = {
  title: "Optimizing Résumés for ATS · Resunova Blog",
  description:
    "Formatting and keyword guidance adapted from the UIC Office of Career Services — single column, standard headers, and keywords in context.",
  robots: { index: true, follow: true },
};

export default function OptimizingResumesForAtsPage() {
  return (
    <BlogArticleLayout
      title="Optimizing Résumés for Applicant Tracking Systems"
      subtitle={`Guidance adapted from the ${ATS_GUIDE_ATTRIBUTION.org}. Resunova’s ATS panel applies the detectable rules to your exported PDF.`}
    >
      <p style={{ margin: "0 0 24px" }}>
        Applicant tracking systems extract plain text from your file and map it into fields recruiters search.
        Fancy layouts often parse poorly even when they look great to humans.
      </p>

      <Section title="Top tips">
        <List items={ATS_GUIDE_TOP_TIPS.map((item) => ({ text: item.text }))} />
      </Section>

      <Section title="Format checklist">
        <List items={ATS_GUIDE_FORMAT_CHECKLIST.map((item) => ({ text: item.text }))} />
      </Section>

      <Section title="Do">
        <List items={ATS_GUIDE_DOS.map((item) => ({ text: item.text }))} />
      </Section>

      <Section title="Don’t">
        <List items={ATS_GUIDE_DONTS.map((item) => ({ text: item.text }))} />
      </Section>

      <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 24 }}>
        Source:{" "}
        <a href={ATS_GUIDE_ATTRIBUTION.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
          {ATS_GUIDE_ATTRIBUTION.org}
        </a>
        . For parsing research and the 25–35 keyword band, see{" "}
        <Link href="/blog/how-ats-really-works" style={{ color: "var(--accent)" }}>
          How ATS really works
        </Link>
        .
      </p>
    </BlogArticleLayout>
  );
}
