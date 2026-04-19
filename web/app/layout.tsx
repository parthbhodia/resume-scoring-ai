import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import AuthGate from "@/components/AuthGate";

const SITE_URL  = "https://www.resunova.io";
const SITE_NAME = "Resunova";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  "Resunova — AI Resume Tailoring for Every Job Description",
    template: "%s · Resunova",
  },
  description:
    "Paste any job description and get an AI-tailored, ATS-friendly resume in under a minute. See your match score, fix the gaps, and land more interviews.",
  keywords: [
    "resume builder",
    "AI resume",
    "ATS resume",
    "job application",
    "resume tailoring",
    "tailor resume to job description",
    "match score",
    "cover letter",
    "career tools",
    "job search",
  ],
  authors: [{ name: "Resunova" }],
  creator: "Resunova",
  publisher: "Resunova",
  applicationName: SITE_NAME,
  category: "Productivity",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Resunova — AI Resume Tailoring for Every Job Description",
    description:
      "Paste any job description, get a tailored resume in 60 seconds. Match score, gap analysis, and ATS-friendly PDF included.",
    locale: "en_US",
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Resunova — AI Resume Tailoring",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Resunova — AI Resume Tailoring for Every Job Description",
    description:
      "Paste any job description, get a tailored resume in 60 seconds. Match score, gap analysis, ATS-friendly PDF.",
    images: [`${SITE_URL}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon:     [{ url: "/favicon.ico" }],
    shortcut: "/favicon.ico",
    apple:    "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
  verification: {
    // add Google Search Console + Bing verification tokens here when available
    // google: "…",
    // other:  { "msvalidate.01": "…" },
  },
};

export const viewport: Viewport = {
  themeColor: "#0071e3",
  width: "device-width",
  initialScale: 1,
};

const GA_ID = "G-77DE1SKZVP";

// JSON-LD structured data — helps Google understand the product.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id":   `${SITE_URL}/#org`,
      "name":  SITE_NAME,
      "url":   SITE_URL,
      "logo":  `${SITE_URL}/favicon.ico`,
    },
    {
      "@type": "WebSite",
      "@id":   `${SITE_URL}/#website`,
      "url":   SITE_URL,
      "name":  SITE_NAME,
      "publisher": { "@id": `${SITE_URL}/#org` },
      "inLanguage": "en-US",
    },
    {
      "@type": "SoftwareApplication",
      "name": SITE_NAME,
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Web",
      "url": SITE_URL,
      "description":
        "AI resume builder that tailors your resume to any job description, scores your fit, and exports an ATS-friendly PDF.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "2400",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://eiumlptnsmowvkxucprl.supabase.co" />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
        <Script
          id="ld-json"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
