/** Blog index metadata for ATS / career content. */

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  readMinutes: number;
  tag: string;
};

export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "how-ats-really-works",
    title: "How ATS Really Works (And Why You’re Invisible, Not Rejected)",
    description:
      "Parsing tests across Workday, Greenhouse, Lever, and more — exact job titles, keyword bands, layout traps, and the quick-fix checklist.",
    readMinutes: 8,
    tag: "Research",
  },
  {
    slug: "optimizing-resumes-for-ats",
    title: "Optimizing Résumés for Applicant Tracking Systems",
    description:
      "UIC Office of Career Services guidance: formatting, keywords in context, and what parsers can and cannot read.",
    readMinutes: 6,
    tag: "Guide",
  },
];

export function blogPostHref(slug: string): string {
  return `/blog/${slug}`;
}
