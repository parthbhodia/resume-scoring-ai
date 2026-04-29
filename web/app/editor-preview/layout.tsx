import type { Metadata } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://www.resunova.io";

export const metadata: Metadata = {
  title: "Editor Preview",
  description: "Internal preview harness for Resunova's resume editor UI.",
  alternates: {
    canonical: `${SITE_URL}/editor-preview/`,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function EditorPreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
