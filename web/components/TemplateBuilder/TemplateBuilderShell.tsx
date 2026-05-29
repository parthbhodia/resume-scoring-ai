"use client";
// Dynamic import with ssr:false must live in a Client Component in Next.js 16+
import dynamic from "next/dynamic";

const TemplateBuilderClient = dynamic(
  () => import("./TemplateBuilderClient"),
  { ssr: false }
);

export default function TemplateBuilderShell() {
  return <TemplateBuilderClient />;
}
