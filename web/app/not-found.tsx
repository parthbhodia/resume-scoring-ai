import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: {
    index: false,
    follow: true,
  },
};

export default function NotFound() {
  return (
    <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "32px" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Page not found</h1>
        <p style={{ color: "var(--dim)" }}>The page you requested does not exist.</p>
      </div>
    </main>
  );
}
