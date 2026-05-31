import type { Metadata } from "next";
import Link from "next/link";
import { LogoFull } from "@/components/BrandLogo";
import { CONTACT_EMAIL, PRIVACY_EMAIL, SITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Privacy Policy · Resunova",
  description:
    "Resunova does not sell your data. Learn how we use information only to run the service, analytics, and internal improvements to serve you better.",
  robots: { index: true, follow: true },
};

const LAST_UPDATED = "May 2026";
const EFFECTIVE    = "May 1, 2026";

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: "var(--dim)", lineHeight: 1.6 }}>
            <b>Effective:</b> {EFFECTIVE} &nbsp;·&nbsp; <b>Last updated:</b> {LAST_UPDATED}
          </p>
          <p style={{ fontSize: 14, color: "var(--muted)", marginTop: 16, lineHeight: 1.7, maxWidth: 580 }}>
            We believe privacy is a fundamental right. <b style={{ color: "var(--text)" }}>We do not sell your personal data.</b> We retain and use it only to operate the Service for you, for user and product analytics that help us improve the experience, and for internal training and quality work so we can serve the community better — never for ad resale or data brokerage.
          </p>
        </div>

        <div style={{ fontSize: 15, lineHeight: 1.8, color: "var(--muted)" }}>

          {/* Quick overview */}
          <Section title="At a Glance">
            <DataTable rows={[
              ["What we collect", "Email address, name, resume text, job descriptions, analysis results, usage analytics"],
              ["Why we collect it", "To run the Service for you; for analytics to improve the product; and for internal training / quality improvement — not for sale"],
              ["Who we share with", "Supabase (storage), Google (OAuth + AI + Analytics) — no third-party ad networks"],
              ["Do we sell your data?", "No. We do not sell, rent, or trade your personal information."],
              ["How long we keep it", "Until you delete it or close your account (analytics may follow GA4 retention)"],
              ["Your rights", "Access, correct, export, or delete your data at any time"],
            ]} />
          </Section>

          <Section title="No sale of data; how we use what we store">
            <Callout>
              <b>We do not sell your personal data.</b> It is not a product, and it is not licensed to advertisers, data brokers, or list vendors. Period.
            </Callout>
            <p>We store and process the information described in this policy <b>only</b> for the following purposes, each aimed at serving you and the user community better:</p>
            <ul>
              <li><b>Operating the Service:</b> authentication, saving your resumes and analyses, generating tailored content and PDFs, and support when you contact us.</li>
              <li><b>User and product analytics:</b> understanding how features are used (including through tools such as Google Analytics 4), so we can fix friction, prioritize improvements, and measure reliability — typically in aggregated or otherwise privacy-preserving form where feasible.</li>
              <li><b>Internal training and quality improvement:</b> improving prompts, scoring, ATS checks, and related workflows; validating outputs; and building a safer, more accurate experience for everyone. This work uses data only as permitted by this policy and applicable law — not for unrelated commercial exploitation.</li>
            </ul>
            <p>We do not use your information for third‑party targeted advertising, and we do not monetize personal data by selling it.</p>
            <p>
              <b>Separate from the above:</b> when you use AI features, portions of your content are sent to <b>Google&apos;s generative AI API</b> as described in <b>Section 5</b>. Google processes that traffic under <b>its own</b> terms and privacy rules — which are distinct from Resunova&apos;s no-sale and limited-use commitments in this section.
            </p>
          </Section>

          <Section title="1. Who We Are">
            <p>Resunova (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the AI resume tailoring platform at <a href={SITE_URL} style={{ color: "var(--accent)" }}>{SITE_URL.replace(/^https:\/\//, "")}</a>.</p>
            <p>For data-related inquiries, contact: <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)" }}>{PRIVACY_EMAIL}</a></p>
          </Section>

          <Section title="2. Information We Collect">

            <SubSection title="2.1 Account Information">
              <p>When you sign in with Google, we receive from Google&apos;s OAuth 2.0 service:</p>
              <ul>
                <li>Your email address</li>
                <li>Your name</li>
                <li>Your Google profile picture URL</li>
                <li>A unique Google user ID</li>
              </ul>
              <p>We use this to create and identify your account. We do not access your Google Drive, Gmail, or any other Google service.</p>
            </SubSection>

            <SubSection title="2.2 Resume & Job Content">
              <p>To provide the core service, we process:</p>
              <ul>
                <li><b>Uploaded resume PDFs:</b> Text is extracted from your PDF and sent to our AI to generate tailored content. The original PDF is not permanently stored.</li>
                <li><b>Job descriptions:</b> The text you paste or import is used to tailor your resume. It is stored temporarily during your session.</li>
                <li><b>Generated resume content:</b> Your tailored LaTeX source and compiled PDFs are stored in Supabase Storage, associated with your account.</li>
                <li><b>Analysis results:</b> Match scores, criteria breakdowns, ATS reports, and AI rewrite history are stored in our database.</li>
              </ul>
            </SubSection>

            <SubSection title="2.3 Usage & Analytics">
              <p>We use <b>Google Analytics 4 (GA4)</b> to collect anonymous usage data including pages visited, session duration, and general geographic region. This data is aggregated and not linked to your identity.</p>
              <p>You can opt out of Google Analytics by installing the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Google Analytics Opt-out Browser Add-on</a>.</p>
            </SubSection>

          </Section>

          <Section title="3. How We Use Your Information">
            <p>Consistent with the commitments above, we use information <b>only</b> as needed for the Service, analytics, and internal training and quality improvement — <b>never</b> by selling it.</p>
            <ul>
              <li><b>To deliver the Service:</b> Processing your resume with AI, generating tailored versions, computing match scores, running ATS checks</li>
              <li><b>To maintain your account:</b> Storing your saved resumes, analysis history, and preferences</li>
              <li><b>User analytics:</b> Usage patterns and product metrics (including via GA4) help us understand how the product is used and where to invest so we can serve users better</li>
              <li><b>Internal training and improvement:</b> Calibrating prompts, scoring, ATS checks, and QA workflows using stored content and outcomes where appropriate, so accuracy and safety improve over time for the community</li>
              <li><b>To communicate with you:</b> Transactional emails only (e.g., password resets if applicable). We do not send marketing emails without your explicit consent</li>
            </ul>
          </Section>

          <Section title="4. Third-Party Services">
            <Callout>
              We carefully select third-party processors and only share the minimum data needed for each service to function.
            </Callout>

            <ThirdPartyTable rows={[
              {
                name: "Supabase",
                purpose: "Database and file storage for your account data, saved resumes, and analysis results",
                data: "Email, user ID, resume content, analysis results, generated PDFs",
                location: "US/EU (varies by Supabase region)",
                link: "https://supabase.com/privacy",
              },
              {
                name: "Google OAuth 2.0",
                purpose: "Authentication — sign in with your Google account",
                data: "Email, name, profile picture, Google user ID",
                location: "US (Google LLC)",
                link: "https://policies.google.com/privacy",
              },
              {
                name: "Google generative AI API",
                purpose: "AI used to tailor your resume, rewrite bullets, and generate analysis",
                data: "Resume text, job description text",
                location: "US (Google LLC)",
                link: "https://ai.google.dev/terms",
              },
              {
                name: "Google Analytics 4",
                purpose: "Anonymous usage analytics to understand how the product is used",
                data: "Page views, session data, anonymized device/browser info",
                location: "US (Google LLC)",
                link: "https://policies.google.com/privacy",
              },
            ]} />

            <p style={{ marginTop: 20 }}>
              We do <b>not</b> sell, rent, or trade your personal data. We do <b>not</b> share it with advertising networks, data brokers, or any other third party for their independent marketing or resale. Processors listed above receive data <b>only</b> to perform services on our behalf (hosting, auth, AI inference, analytics) under contractual and legal safeguards — not so they can sell your résumé or profile.
            </p>
          </Section>

          <Section title="5. AI Processing Notice">
            <Callout>
              <b>Important:</b> When you use AI features (resume tailoring, bullet rewrites, match scoring), your resume text and job description are sent to Google&apos;s generative AI API for processing. Google&apos;s <a href="https://ai.google.dev/terms" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Google AI for Developers Terms</a> and <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Privacy Policy</a> apply to that processing — including how Google may log, retain, secure, or use API traffic under its own rules (which can change from time to time).
            </Callout>
            <p>
              <b>Resunova vs. Google:</b> The commitments elsewhere in this policy — for example that <b>we do not sell your personal data</b> and that we use data stored on our side only to operate the Service, run analytics, and improve quality for users — describe <b>Resunova&apos;s</b> practices and our agreements with you. They are not a substitute for Google&apos;s terms. When your content is transmitted to Google&apos;s generative AI API, it is processed on <b>Google&apos;s infrastructure</b> as an independent service provider; we do not control Google&apos;s internal systems, retention windows for transient API traffic, or any product-improvement or safety practices Google applies to its APIs as described in Google&apos;s own documentation.
            </p>
            <p>
              We send Google only what is reasonably necessary to fulfill each AI request (typically the résumé and job-description text you are actively working with). Outputs are returned to Resunova so we can show you results and save them to your account when you choose to save. For the most current rules on what Google does with API inputs and outputs, rely on Google&apos;s published terms and privacy materials linked above.
            </p>
            <p>We recommend you do not include sensitive personal information (Social Security numbers, financial account details, passwords) in any content submitted to the Service.</p>
          </Section>

          <Section title="6. Data Retention">
            <p>We keep personal data no longer than necessary for the purposes in this policy — principally running the Service for you, analytics to improve the product, and internal training and quality work.</p>
            <ul>
              <li><b>Account data</b> (email, name): Retained until you delete your account</li>
              <li><b>Saved resumes and analysis history:</b> Retained until you delete individual records or your account</li>
              <li><b>Uploaded PDF text:</b> Processed in memory during generation; not permanently stored</li>
              <li><b>Analytics data:</b> Governed by Google Analytics retention settings (typically 14 months)</li>
            </ul>
          </Section>

          <Section title="7. Your Rights">
            <p>Depending on your location, you may have the following rights regarding your personal data:</p>
            <ul>
              <li><b>Access:</b> Request a copy of the data we hold about you</li>
              <li><b>Correction:</b> Request correction of inaccurate data</li>
              <li><b>Deletion:</b> Request deletion of your account and associated data</li>
              <li><b>Portability:</b> Request an export of your data in a machine-readable format</li>
              <li><b>Objection:</b> Object to certain types of processing (e.g., analytics)</li>
            </ul>
            <p>To exercise any of these rights, email <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)" }}>{PRIVACY_EMAIL}</a>. We will respond within 30 days.</p>
          </Section>

          <Section title="8. Cookies">
            <p>We use only essential session cookies required for authentication (managed by Supabase) and Google Analytics cookies for anonymous usage tracking. We do not use advertising or tracking cookies.</p>
          </Section>

          <Section title="9. Security">
            <p>We implement industry-standard measures to protect your data:</p>
            <ul>
              <li>All data is transmitted over HTTPS/TLS</li>
              <li>Database access is controlled by Row-Level Security (RLS) policies — your data is only accessible to your account</li>
              <li>Authentication is handled by Supabase Auth with Google OAuth 2.0</li>
            </ul>
            <p>No system is 100% secure. If you discover a security vulnerability, please disclose it responsibly to <a href="mailto:parthbhodia08@gmail.com" style={{ color: "var(--accent)" }}>parthbhodia08@gmail.com</a>.</p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>The Service is not directed to individuals under 16. We do not knowingly collect personal information from children. If you believe a child has provided us with personal data, contact us and we will delete it promptly.</p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>We may update this Privacy Policy periodically. Material changes will be communicated via email (if we have your contact) or a notice on the Service. The &ldquo;Last updated&rdquo; date at the top of this page reflects the most recent revision.</p>
            <p>Your continued use of the Service after changes constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="12. Contact">
            <p>For privacy-related questions, data requests, or concerns:</p>
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

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 8px", letterSpacing: -0.2 }}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
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

function DataTable({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden",
    }}>
      {rows.map(([key, val], i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "180px 1fr",
          gap: 0,
          borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
          background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
        }}>
          <div style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--text)", borderRight: "1px solid var(--border)" }}>
            {key}
          </div>
          <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>
            {val}
          </div>
        </div>
      ))}
    </div>
  );
}

function ThirdPartyTable({ rows }: { rows: { name: string; purpose: string; data: string; location: string; link: string }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          padding: "16px 18px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>{r.name}</span>
            <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>Privacy policy ↗</a>
          </div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 6px" }}><b style={{ color: "var(--text)" }}>Purpose:</b> {r.purpose}</p>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 6px" }}><b style={{ color: "var(--text)" }}>Data shared:</b> {r.data}</p>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}><b style={{ color: "var(--text)" }}>Location:</b> {r.location}</p>
        </div>
      ))}
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
      <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Resunova — Privacy Team</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M1 5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{PRIVACY_EMAIL}</a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)" }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M1 5l6 4 6-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--accent)", textDecoration: "none" }}>{CONTACT_EMAIL}</a>
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
