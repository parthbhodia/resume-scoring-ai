import type { Metadata } from "next";
import Link from "next/link";
import { LogoFull } from "@/components/BrandLogo";
import { CONTACT_EMAIL, PRIVACY_EMAIL, SITE_URL } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Contact · Resunova",
  description:
    "Contact Resunova — a completely free AI resume tool for students and the community. Support, privacy requests, and general inquiries.",
  robots: { index: true, follow: true },
};

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>

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
          fontSize: "var(--font-size-base)", color: "var(--dim)", textDecoration: "none",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to home
        </Link>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", padding: "56px 24px 80px" }}>
        <p style={{ fontSize: "var(--font-size-sm)", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 14 }}>
          Contact
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, lineHeight: 1.12, margin: "0 0 16px" }}>
          We&apos;re here to help
        </h1>
        <p style={{ fontSize: "var(--font-size-lg)", color: "var(--muted)", lineHeight: 1.75, margin: "0 0 36px" }}>
          Resunova is <strong style={{ color: "var(--text)", fontWeight: 600 }}>completely free</strong>
          {" "}— built for the greater good of students and the wider job-seeking community. For product questions, partnerships, or anything else, use general support. For privacy and data rights, use the privacy inbox so we can route your message correctly.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ContactBlock
            title="General & support"
            email={CONTACT_EMAIL}
            hint="Account issues, feedback, and general inquiries. We aim to reply within two business days."
          />
          <ContactBlock
            title="Privacy & data rights"
            email={PRIVACY_EMAIL}
            hint="Access, correction, export, deletion, or other privacy-related requests under applicable law."
          />
        </div>

        <p style={{ fontSize: "var(--font-size-lg)", color: "var(--dim)", marginTop: 40, lineHeight: 1.65 }}>
          Website:{" "}
          <a href={SITE_URL} style={{ color: "var(--accent)", textDecoration: "none" }}>{SITE_URL.replace(/^https:\/\//, "")}</a>
        </p>

        <div style={{ marginTop: 32, paddingTop: 28, borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 16 }}>
          <Link href="/terms" style={{ fontSize: "var(--font-size-base)", color: "var(--accent)", textDecoration: "none" }}>Terms of Service</Link>
          <Link href="/privacy" style={{ fontSize: "var(--font-size-base)", color: "var(--accent)", textDecoration: "none" }}>Privacy Policy</Link>
        </div>
      </main>

      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 12,
        background: "var(--bg)",
        fontSize: "var(--font-size-base)", color: "var(--dim)",
      }}>
        <span>© 2026 Resunova</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/privacy" style={{ color: "var(--dim)", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ color: "var(--dim)", textDecoration: "none" }}>Terms</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--dim)", textDecoration: "none" }}>Email</a>
        </div>
      </footer>
    </div>
  );
}

function ContactBlock({ title, email, hint }: { title: string; email: string; hint: string }) {
  return (
    <div style={{
      padding: "22px 24px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 12,
    }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px", color: "var(--text)", letterSpacing: -0.2 }}>{title}</h2>
      <a href={`mailto:${email}`} style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}>{email}</a>
      <p style={{ fontSize: "var(--font-size-base)", color: "var(--muted)", margin: "12px 0 0", lineHeight: 1.65 }}>{hint}</p>
    </div>
  );
}
