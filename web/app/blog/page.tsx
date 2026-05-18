import type { Metadata } from "next";
import Link from "next/link";
import { LogoFull } from "@/components/BrandLogo";
import { BLOG_POSTS, blogPostHref } from "@/lib/atsBlogPosts";

export const metadata: Metadata = {
  title: "Blog · Resunova",
  description: "ATS formatting guides and parsing research to help your résumé get found — not filtered into silence.",
  robots: { index: true, follow: true },
};

export default function BlogIndexPage() {
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
        <Link href="/" style={{ color: "var(--dim)", textDecoration: "none", fontSize: 13 }}>
          App
        </Link>
      </header>

      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px" }}>
        <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: -1, margin: "0 0 10px" }}>Blog</h1>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 36px" }}>
          Practical ATS guidance — what parsers can read, what recruiters search for, and how Resunova scores your PDF.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}>
          {BLOG_POSTS.map((post) => (
            <li key={post.slug}>
              <Link
                href={blogPostHref(post.slug)}
                style={{
                  display: "block",
                  padding: "20px 22px",
                  borderRadius: 14,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--accent)" }}>
                    {post.tag}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--dim)" }}>{post.readMinutes} min read</span>
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", letterSpacing: -0.3 }}>{post.title}</h2>
                <p style={{ fontSize: 14, color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>{post.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

