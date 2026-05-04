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

export default function Home() {
  return <HomePageClient />;
}
