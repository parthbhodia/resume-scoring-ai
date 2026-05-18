/**
 * ATS guidance for blog + in-app best-practice checks.
 * Sources: UIC OCS (careers.uic.edu) + Resunova parsing research summary.
 */

export const ATS_GUIDE_ATTRIBUTION = {
  org: "UIC Office of Career Services",
  url: "https://careers.uic.edu",
  blogSlug: "optimizing-resumes-for-ats",
} as const;

export type AtsGuideItem = { id: string; text: string };

export const RESEARCH_QUICK_CHECKLIST: AtsGuideItem[] = [
  { id: "exact_title_header", text: "Match the exact job title from the posting in your header or summary (not a synonym)." },
  { id: "single_column", text: "Use a single-column layout — no tables, text boxes, or multi-column designer templates." },
  { id: "standard_headers", text: "Use standard section headers: “Work Experience,” “Education,” “Skills.”" },
  { id: "contact_in_body", text: "Keep name, email, and phone in the document body — not only in PDF headers/footers." },
  { id: "keyword_band", text: "Aim for about 25–35 relevant terms from the posting, woven naturally into bullets (not stuffed)." },
  { id: "consistent_dates", text: "Use one date format everywhere (e.g. Jan 2020 – Mar 2023)." },
  { id: "docx_when_asked", text: "Prefer .docx when the employer allows Word uploads; use text-based PDF when they require PDF." },
  { id: "no_decorative", text: "Skip icons, emojis, and decorative graphics that replace plain text." },
  { id: "no_stuffing", text: "Do not hide keywords or repeat terms unnaturally — AI-assisted screening flags stuffing." },
];

export const ATS_GUIDE_TOP_TIPS: AtsGuideItem[] = [
  {
    id: "simple_word_doc",
    text: "Prefer a simple Word layout saved as .doc when an employer asks for Word. Many ATS tools parse .doc most reliably; some struggle with complex .docx, RTF, or image-only files.",
  },
  {
    id: "simple_formatting",
    text: "Use simple formatting: avoid headers and footers for contact info, templates with heavy graphics, borders, shading, and decorative symbols (standard bullet points are fine).",
  },
  {
    id: "customize_per_job",
    text: "Customize each résumé for the specific role using language from the job description — not a one-size-fits-all file. Use specific tool names (e.g. “Adobe Photoshop”) instead of vague labels (“image-editing software”).",
  },
  {
    id: "keywords_in_context",
    text: "Place keywords in context inside accomplishment bullets, not only as a disconnected skills list.",
  },
  {
    id: "proofread",
    text: "Proofread carefully. ATS parsers and recruiters both penalize typos and garbled text.",
  },
];

export const ATS_GUIDE_FORMAT_CHECKLIST: AtsGuideItem[] = [
  { id: "no_special_chars", text: "Avoid special characters and accented letters in the file (e.g. “résumé” may parse as “r?sum?”)." },
  { id: "no_name_punctuation", text: "Do not put punctuation in your name line — no parentheses, commas, slashes, or hyphens in the name itself." },
  { id: "single_column", text: "Use a single-column layout (no tables, multi-column sections, or text boxes)." },
  { id: "readable_font_size", text: "Use readable body text (about 11 pt or larger in Word; our PDF export uses ATS-safe sizing)." },
  { id: "name_only_top_line", text: "Put only your name on the first line — move degrees and certifications to a separate line." },
  { id: "standard_fonts", text: "Stick to standard fonts (Arial, Georgia, Tahoma, Calibri, Verdana)." },
  { id: "dates_with_months", text: "Include months in date ranges (e.g. 06/2010 – 08/2012) and align dates to the right when possible." },
  { id: "no_letter_spacing_tricks", text: "Avoid condensed/expanded text or extra spaces between letters." },
  { id: "capitalization", text: "Use consistent capitalization and punctuation so parsers can assign fields correctly." },
  { id: "spell_out_acronyms", text: "Spell out terms plus abbreviations when space allows (Certified Public Accountant (CPA))." },
];

export const ATS_GUIDE_DOS: AtsGuideItem[] = [
  { id: "network_still_ats", text: "Submit through the company ATS even when you have an employee referral." },
  { id: "exact_job_title", text: "Use the exact job title from the posting on your résumé when applying for that role." },
  { id: "dates_on_right", text: "Place employment and education dates on the right side of each entry when possible." },
  { id: "caps_section_headers", text: "Consider ALL CAPS section headers (EXPERIENCE, EDUCATION) to help parsers categorize content." },
  { id: "upload_not_paste", text: "Upload the file when the form allows it instead of pasting into text boxes." },
];

export const ATS_GUIDE_DONTS: AtsGuideItem[] = [
  { id: "credentials_in_name", text: "Don’t put MBA, CPA, etc. next to your name — list credentials on their own line." },
  { id: "fake_skills", text: "Don’t list skills you can’t defend in an interview or skills assessment." },
  { id: "mixed_fonts", text: "Don’t mix many fonts or sizes across the document." },
  { id: "creative_headers", text: "Don’t rename sections (“My Journey,” “Toolkit”) — parsers may dump that text into uncategorized fields." },
];
