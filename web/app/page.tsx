import type { Metadata } from "next";
import HomePageClient from "@/components/HomePageClient";

const SITE_URL = "https://www.resunova.io";

export const metadata: Metadata = {
  title: "Resunova — AI Resume Tailoring for Every Job Description",
  description:
    "Paste any job description and get an AI-tailored, ATS-friendly resume in under a minute. See your match score, fix the gaps, and land more interviews.",
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
