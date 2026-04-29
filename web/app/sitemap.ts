import type { MetadataRoute } from "next";

const SITE_URL = "https://www.resunova.io";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const indexablePaths = ["/"];

  return [
    ...indexablePaths.map((path) => ({
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1.0 : 0.7,
    })),
  ];
}
