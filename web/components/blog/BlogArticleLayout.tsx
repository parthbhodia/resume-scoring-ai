import Link from "next/link";
import type { ReactNode } from "react";
import { LogoFull } from "@/components/BrandLogo";

export default function BlogArticleLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: "'DM Sans', -apple-system, sans-serif",
      }}
    >
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          height: 56,
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--glass-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <LogoFull markSize={26} textColor="var(--text)" />
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
          <Link href="/blog" style={{ color: "var(--dim)", textDecoration: "none" }}>
            Blog
          </Link>
          <Link href="/" style={{ color: "var(--dim)", textDecoration: "none", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            App
          </Link>
        </nav>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 100px" }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 12 }}>
          Blog
        </p>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1.1, lineHeight: 1.12, margin: "0 0 14px" }}>
          {title}
        </h1>
        {subtitle ? (
          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.65, margin: "0 0 36px", paddingBottom: 28, borderBottom: "1px solid var(--border)" }}>
            {subtitle}
          </p>
        ) : null}
        <article style={{ fontSize: 15, lineHeight: 1.75, color: "var(--muted)" }}>{children}</article>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: -0.4, margin: "0 0 12px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items }: { items: { text: string }[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((item, i) => (
        <li key={i} style={{ color: "var(--muted)" }}>{item.text}</li>
      ))}
    </ul>
  );
}

export { Section, List };
