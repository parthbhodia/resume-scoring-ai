import type { Metadata } from "next";
import type { ReactNode } from "react";

const SITE_URL = "https://www.resunova.io";

export const metadata: Metadata = {
  title: "Shared Resume",
  description: "View a shared resume link from Resunova.",
  alternates: {
    canonical: `${SITE_URL}/r/`,
  },
  robots: {
    index: false,
    follow: true,
  },
};

export default function ShareLayout({ children }: { children: ReactNode }) {
  return children;
}
