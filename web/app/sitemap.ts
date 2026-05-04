import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/brand";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const indexablePaths = ["/", "/terms", "/privacy", "/contact"];

  return [
    ...indexablePaths.map((path) => ({
      url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}/`,
      lastModified: now,
      changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "/" ? 1.0 : 0.6,
    })),
  ];
}
