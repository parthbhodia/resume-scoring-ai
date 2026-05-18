/** Editorial content for /blog/how-ats-really-works (parsing research summary). */

export const ATS_RESEARCH_ATTRIBUTION = {
  title: "How ATS Really Works",
  slug: "how-ats-really-works",
} as const;

export type ResearchSection = { title: string; paragraphs: string[] };

export const ATS_RESEARCH_SECTIONS: ResearchSection[] = [
  {
    title: "You’re probably invisible — not rejected",
    paragraphs: [
      "The popular “75% auto-rejection” stat is misleading. Many recruiters report their ATS does not auto-reject on content alone — the scarier pattern is that strong candidates never surface in search.",
      "Recruiters query the ATS like a database: keywords, titles, experience bands. If your résumé does not match what they type, you simply do not appear. You are not getting a “no” — you are invisible.",
    ],
  },
  {
    title: "The single biggest lever: exact job title in the header",
    paragraphs: [
      "In systematic parsing tests across platforms like Workday, Greenhouse, Lever, iCIMS, and Taleo, the strongest signal was blunt: use the exact job title from the posting in your header or summary — not a synonym.",
      "If the posting says “Senior Product Manager,” write “Senior Product Manager,” not “Product Lead” or “Head of Product Strategy.” ATS keyword matching is still largely literal, and most recruiters filter by exact phrases.",
      "This takes seconds per application and is one of the highest-ROI edits you can make.",
    ],
  },
  {
    title: "The “pretty résumé” tax",
    paragraphs: [
      "Design-forward layouts often score worse — not because candidates are less qualified, but because parsers cannot read the file cleanly.",
      "Two-column layouts scramble reading order (column A job titles merge with column B skills). Icons and emojis become blank or garbage characters. Creative section names (“My Journey,” “Toolkit”) land in miscellaneous fields recruiters never search. Contact details trapped in PDF headers/footers are frequently ignored entirely.",
    ],
  },
  {
    title: "Keyword band: about 25–35 literal terms",
    paragraphs: [
      "Résumés that matched roughly 25–35 relevant, role-specific terms from the posting tended to align best with high ATS match scores in our tests. Below that band, you miss recruiter searches; far above it, stuffing detectors and AI-assisted screening may penalize you.",
      "Use the exact words from the posting where truthful — “Adobe Creative Cloud” and “Adobe Creative Suite” are different strings to a parser. Hidden white text and synonym swaps are risky; natural use inside accomplishment bullets works.",
    ],
  },
  {
    title: "Dates and file format",
    paragraphs: [
      "Mixed date formats (“Jan 2019,” “2019-01,” “January ’19”) caused systems to miscalculate tenure. Pick one format everywhere — “Month Year” (e.g. Jan 2020 – Mar 2023) parsed most reliably.",
      "Text-based PDFs from a word processor are usually fine, but .docx remained the most consistent upload in cross-platform tests. Keep a master Word file; use PDF only when the employer requires it.",
    ],
  },
  {
    title: "The bar is lower than you think",
    paragraphs: [
      "Interview rates are tough market-wide, but a large share of applicants are filtered for fixable technical reasons: formatting, missing keywords, invisible contact info, non-standard headers.",
      "You do not have to be the best candidate on paper — you have to be visible to the systems and searches recruiters actually use.",
    ],
  },
];
