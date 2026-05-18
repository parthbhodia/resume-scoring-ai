/**
 * Turn internal library folder ids into user-facing labels.
 * Examples:
 *   Harshibar_Template1 → "Harshibar"
 *   Harshibar_Template1_structured_3a82d6d3 → "Tailored · Harshibar"
 *   ParthBhodia_Google_SoftwareDeveloper → "Parth Bhodia · Google · Software Developer"
 */

import { RESUME_STYLE_TEMPLATES } from "./resumeTemplates";

const KNOWN_TEMPLATE_LABELS: Record<string, string> = {
  Adobe_FullStack: "Classic professional",
  Harshibar_Template1: "Harshibar",
  MaltaCV_Modern: "Malta Modern",
};

const STRUCTURED_SUFFIX_RE = /_structured_[a-f0-9]{6,12}$/i;

function templateLabelForFolder(folder: string): string | null {
  const fromCatalog = RESUME_STYLE_TEMPLATES.find((t) => t.referenceFolder === folder);
  if (fromCatalog) return fromCatalog.label;
  return KNOWN_TEMPLATE_LABELS[folder] ?? null;
}

function humanizeSlugPart(part: string): string {
  const s = (part || "").trim();
  if (!s) return "";
  if (/\s/.test(s)) return s;
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function formatStemAsTitle(stem: string): string {
  const parts = stem.split("_").map(humanizeSlugPart).filter(Boolean);
  if (parts.length >= 2) return parts.join(" · ");
  return humanizeSlugPart(stem) || stem;
}

/** Short label for any library folder id. */
export function formatLibraryFolderLabel(folder: string | null | undefined): string {
  const f = (folder ?? "").trim();
  if (!f) return "";

  const direct = templateLabelForFolder(f);
  if (direct) return direct;

  const structured = f.match(/^(.+)_structured_[a-f0-9]{6,12}$/i);
  if (structured) {
    const stem = structured[1];
    const stemLabel = templateLabelForFolder(stem) ?? formatStemAsTitle(stem);
    return `Tailored · ${stemLabel}`;
  }

  return formatStemAsTitle(f);
}

export type BaseResumeBanner = {
  heading: string;
  detail: string;
};

/** Copy for the builder “base résumé” chip above the job form. */
export function getBaseResumeBanner(folder: string | null | undefined): BaseResumeBanner | null {
  const f = (folder ?? "").trim();
  if (!f) return null;

  const template = templateLabelForFolder(f);
  if (template) {
    return { heading: "Layout template", detail: template };
  }

  if (STRUCTURED_SUFFIX_RE.test(f)) {
    return {
      heading: "Starting from your last tailored résumé",
      detail: formatLibraryFolderLabel(f),
    };
  }

  return {
    heading: "Based on saved résumé",
    detail: formatLibraryFolderLabel(f),
  };
}
