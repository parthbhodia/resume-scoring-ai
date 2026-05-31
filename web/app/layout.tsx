import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import AuthGate from "@/components/AuthGate";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const SITE_URL  = "https://www.resunova.io";
const SITE_NAME = "Resunova";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default:  "Resunova — AI Resume Tailoring for Every Job Description",
    template: "%s · Resunova",
  },
  description:
    "Completely free AI resume tailoring for students and the job-seeking community. Paste any job description, get a match score, gap analysis, and an ATS-friendly PDF in under a minute.",
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
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "Resunova — AI Resume Tailoring for Every Job Description",
    description:
      "Completely free for students and the community. Tailor your resume in 60 seconds — match score, gap analysis, and ATS-friendly PDF included.",
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
      "Completely free for students and the community. Tailor your resume in 60 seconds — match score, gap analysis, and ATS-friendly PDF.",
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
  themeColor: "#2f81f7",
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
        "Completely free AI resume builder for students and the community — tailors your resume to any job description, scores your fit, and exports an ATS-friendly PDF.",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <head>
        {/* Inline theme-init: read localStorage before first paint → no FOUC. Default = light. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('rn-theme')||'light';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();` }} />
        {/* Editorial fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Inter — product UI; DM Sans — marketing emphasis */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;1,9..40,400;1,9..40,500&display=swap" rel="stylesheet" />
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        {process.env.NEXT_PUBLIC_SUPABASE_URL && (
          <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL} />
        )}
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
