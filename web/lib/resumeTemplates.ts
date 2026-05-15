/**
 * LaTeX layout templates for Résumé Builder / generate-stream.
 * Each `referenceFolder` must exist under the backend LIBRARY_ROOT with a .tex file.
 * Add entries here when you add new reference folders on the server.
 */

export interface ResumeStyleTemplate {
  id: string;
  label: string;
  description: string;
  /** Folder name under LIBRARY_ROOT whose .tex defines macros and visual structure */
  referenceFolder: string;
}

export const RESUME_STYLE_TEMPLATES: ResumeStyleTemplate[] = [
  {
    id: "harshibar-ats",
    label: "Harshibar",
    description:
      "MIT-style ATS layout: \\resumeSubheading, \\resumeProjectHeading, fontawesome5 icons, sans-serif (tgheros). Requires pdflatex + texlive-fontawesome5 + Fira Mono.",
    referenceFolder: "Harshibar_Template1",
  },
  {
    id: "ats-professional",
    label: "Classic professional",
    description: "Original library reference (often Adobe_FullStack on deployed servers).",
    referenceFolder: "Adobe_FullStack",
  },
  {
    id: "malta-modern",
    label: "Malta Modern",
    description:
      "Accent-color section headers (flame orange), multi-column skills, bio summary block. Uses \\cvsection, \\cvexperience, \\cvuniversity, \\cvlistitem. Clean and visually distinctive.",
    referenceFolder: "MaltaCV_Modern",
  },
];

export const DEFAULT_REFERENCE_FOLDER = "Adobe_FullStack";

export function isValidResumeStyleFolder(folder: string): boolean {
  return RESUME_STYLE_TEMPLATES.some((t) => t.referenceFolder === folder);
}

/** One chip per distinct referenceFolder (multiple labels can share a folder while you grow the library). */
export function distinctStyleTemplates(): ResumeStyleTemplate[] {
  const seen = new Set<string>();
  const out: ResumeStyleTemplate[] = [];
  for (const t of RESUME_STYLE_TEMPLATES) {
    if (seen.has(t.referenceFolder)) continue;
    seen.add(t.referenceFolder);
    out.push(t);
  }
  return out;
}
