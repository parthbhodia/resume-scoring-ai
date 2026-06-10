import type { Metadata } from "next";
import HomePageClient from "@/components/HomePageClient";

const SITE_URL = "https://www.resunova.io";

export const metadata: Metadata = {
  title: "Resunova — AI Resume Tailoring for Every Job Description",
  description:
    "Completely free AI resume tailoring for students and the job-seeking community. Paste any job description, get a match score, gap analysis, and an ATS-friendly PDF in under a minute.",
  alternates: {
    canonical: `${SITE_URL}/`,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Resunova free to use?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, Resunova is completely free for students and the broader job-seeking community. Upload your resume, paste any job description, and get a match score, gap analysis, and ATS-friendly PDF export — no credit card required.",
      },
    },
    {
      "@type": "Question",
      "name": "What is an ATS resume score?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "An ATS (Applicant Tracking System) score measures how well your resume matches a specific job description. Resunova scores keyword coverage, achievement quality, readability, language, and ATS formatting across 8 categories, then shows you exactly which bullets to improve.",
      },
    },
    {
      "@type": "Question",
      "name": "How does resume tailoring work in Resunova?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Upload your resume PDF and paste the job description. Resunova's AI extracts keywords, scores your match, identifies gaps between your experience and the role's requirements, and suggests specific bullet-level rewrites. You can apply fixes directly in the editor and download the updated resume as a PDF.",
      },
    },
    {
      "@type": "Question",
      "name": "Does Resunova work with any job description?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes — paste any text-based job description from any industry or role. Resunova dynamically extracts the requirements and keywords from the posting, so it adapts to engineering, design, finance, marketing, healthcare, and any other field.",
      },
    },
    {
      "@type": "Question",
      "name": "How long does it take to tailor a resume?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Most users see their match score and gap analysis within 60 seconds of uploading. Applying the suggested fixes and downloading an updated PDF typically takes 5–15 minutes depending on how many changes are needed.",
      },
    },
  ],
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <HomePageClient />
    </>
  );
}
