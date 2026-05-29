import type { Metadata } from "next";
import TemplateBuilderShell from "@/components/TemplateBuilder/TemplateBuilderShell";

export const metadata: Metadata = {
  title: "Resume Template Builder",
  description:
    "Build and download a professional ATS-friendly resume PDF for free — no sign-up required. Everything runs in your browser.",
};

export default function TemplateBuilderPage() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--bg, #0d1117)",
      }}
    >
      <TemplateBuilderShell />
    </div>
  );
}
