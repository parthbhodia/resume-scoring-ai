import type { Metadata } from "next";
import Link from "next/link";
import { LogoFull } from "@/components/BrandLogo";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Terms of Service · Resunova",
  description: "Read Resunova's Terms of Service governing your use of our AI resume tailoring platform.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "May 2026";
const EFFECTIVE    = "May 1, 2026";

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

      {/* ── Header ─────────────────────────────────────── */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        height: 56, padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "var(--glass-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--border)",
      }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <LogoFull markSize={26} textColor="var(--text)" />
        </Link>
        <Link href="/" style={{
          fontSize: 13, color: "var(--dim)", textDecoration: "none",
          display: "flex", alignItems: "center", gap: 6,
          transition: "color 0.15s",
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to home
        </Link>
      </header>

      {/* ── Content ────────────────────────────────────── */}
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px 100px" }}>

        {/* Title block */}
        <div style={{ marginBottom: 52, paddingBottom: 32, borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>
            Legal
          </p>
          <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.2, lineHeight: 1.1, margin: "0 0 18px" }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.6 }}>
            <b>Effective:</b> {EFFECTIVE} &nbsp;·&nbsp; <b>Last updated:</b> {LAST_UPDATED}
          </p>
        </div>

        <div style={{ fontSize: 15, lineHeight: 1.8, color: "var(--muted)" }}>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using Resunova (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.</p>
            <p>These Terms apply to all users of {SITE_URL}, including visitors, registered users, and anyone who accesses the Service in any way.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>Resunova is an AI-powered resume tailoring platform. The Service allows you to:</p>
            <ul>
              <li>Upload your existing resume (PDF) for text extraction</li>
              <li>Input job descriptions to tailor your resume</li>
              <li>Receive AI-generated resume analysis, match scores, and rewritten bullet points</li>
              <li>Export tailored resumes as ATS-compatible PDFs</li>
              <li>Save and manage multiple tailored resume versions</li>
            </ul>
            <p>The Service is provided &ldquo;as is.&rdquo; Features may change, be added, or be discontinued at any time.</p>
          </Section>

          <Section title="3. Account Registration">
            <p>Access to the Service requires authentication via your Google account. By signing in, you authorize Resunova to receive your name, email address, and profile picture from Google as provided by Google&apos;s OAuth 2.0 service.</p>
            <p>You are responsible for all activity that occurs under your account. You must notify us immediately at {CONTACT_EMAIL} if you suspect unauthorized use of your account.</p>
          </Section>

          <Section title="4. User Responsibilities">
            <p>You agree that you will:</p>
            <ul>
              <li>Provide accurate information about your own qualifications, experience, and skills</li>
              <li>Only upload resume content that you own or have the right to use</li>
              <li>Not use the Service for any unlawful or fraudulent purpose</li>
              <li>Not attempt to reverse-engineer, scrape, or abuse the Service or its AI systems</li>
              <li>Not misrepresent AI-generated content as independently authored</li>
              <li>Not use the Service to generate resumes for others on a commercial basis without our written permission</li>
            </ul>
          </Section>

          <Section title="5. AI-Generated Content Disclaimer">
            <Callout>
              The Service uses large language models (LLMs) to generate and rewrite resume content. AI-generated output may contain inaccuracies, be unsuitable for your specific application, or fail to reflect your actual experience.
            </Callout>
            <p>You are solely responsible for reviewing all AI-generated content before use. Resunova does not guarantee that AI-generated resumes will:</p>
            <ul>
              <li>Result in job interviews or employment offers</li>
              <li>Pass any specific applicant tracking system (ATS) or recruiter review</li>
              <li>Be free from errors, omissions, or inaccuracies</li>
            </ul>
            <p>Never include false credentials, fabricated experience, or misrepresented qualifications in any resume, regardless of what the AI suggests. Doing so may constitute fraud and is entirely your legal responsibility.</p>
          </Section>

          <Section title="6. Intellectual Property">
            <p><b>Your content:</b> You retain full ownership of the resume content, job descriptions, and other materials you submit. By using the Service, you grant Resunova a limited, non-exclusive license to process your content solely to provide the Service to you.</p>
            <p><b>Our IP:</b> The Resunova platform, brand, software, and all associated intellectual property are owned by Resunova and may not be reproduced, distributed, or modified without written permission.</p>
          </Section>

          <Section title="7. Privacy">
            <p>Your use of the Service is also governed by our <Link href="/privacy" style={{ color: "var(--accent)", textDecoration: "none" }}>Privacy Policy</Link>, which is incorporated into these Terms by reference. Please read it carefully to understand how we collect, use, and protect your information.</p>
            <p>Resunova does <b>not sell</b> your personal data. We use and retain data only as described there — including to operate the Service, for user analytics to improve the product, and for internal training and quality improvement — and not for unrelated commercial resale.</p>
          </Section>

          <Section title="8. Free Tier and Future Billing">
            <p>
              The Service is offered <b>completely free of charge</b> to support students and the broader job-seeking community — we believe in the greater good of equitable access to career tools.
              We reserve the right to introduce paid tiers or modify the free tier in the future. We will provide reasonable advance notice of any such changes.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <Callout>
              To the maximum extent permitted by applicable law, Resunova and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages — including but not limited to loss of employment opportunities, lost profits, or loss of data — arising from your use of the Service.
            </Callout>
            <p>Our total liability for any claim arising out of or relating to the Service shall not exceed the amount you paid for the Service in the 12 months preceding the claim (or $0 if you used the free tier).</p>
          </Section>

          <Section title="10. Disclaimers">
            <p>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE.&rdquo; RESUNOVA MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</p>
          </Section>

          <Section title="11. Modifications to Terms">
            <p>We may update these Terms at any time. Changes will be posted to this page with a revised &ldquo;Last updated&rdquo; date. Continued use of the Service after changes constitutes your acceptance of the updated Terms.</p>
          </Section>

          <Section title="12. Termination">
            <p>We reserve the right to suspend or terminate your access to the Service at any time, with or without notice, if we believe you have violated these Terms or for any other reason at our discretion.</p>
            <p>You may stop using the Service at any time. To request deletion of your data, email {CONTACT_EMAIL}.</p>
          </Section>

          <Section title="13. Governing Law">
            <p>These Terms shall be governed by and construed in accordance with applicable law. Any disputes shall be resolved through good-faith negotiation or, if necessary, binding arbitration.</p>
          </Section>

          <Section title="14. Contact">
            <p>If you have any questions about these Terms, please contact us:</p>
            <ContactCard />
          </Section>

        </div>
      </main>

      <PageFooter />
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, color: "var(--text)", margin: "0 0 14px", paddingTop: 8 }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </section>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 18px",
      background: "var(--surface2)",
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--accent)",
      borderRadius: 8,
      fontSize: 14,
      lineHeight: 1.7,
      color: "var(--muted)",
    }}>
      {children}
    </div>
  );
}

function ContactCard() {
  return (
    <div style={{
      display: "inline-flex", flexDirection: "column", gap: 8,
      padding: "18px 22px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
      fontSize: 14,
      marginTop: 8,
    }}>
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Resunova</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M1 5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{CONTACT_EMAIL}</a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M7 4v3.5l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <a href={SITE_URL} style={{ color: "var(--accent)", textDecoration: "none" }}>{SITE_URL.replace(/^https:\/\//, "")}</a>
      </div>
    </div>
  );
}

function PageFooter() {
  return (
    <footer style={{
      borderTop: "1px solid var(--border)",
      padding: "24px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      flexWrap: "wrap", gap: 12,
      background: "var(--bg)",
      fontSize: 13, color: "var(--dim)",
    }}>
      <span>© 2026 Resunova</span>
      <div style={{ display: "flex", gap: 20 }}>
        <Link href="/privacy" style={{ color: "var(--dim)", textDecoration: "none" }}>Privacy Policy</Link>
        <Link href="/terms" style={{ color: "var(--dim)", textDecoration: "none" }}>Terms of Service</Link>
        <Link href="/contact" style={{ color: "var(--dim)", textDecoration: "none" }}>Contact</Link>
      </div>
    </footer>
  );
}
