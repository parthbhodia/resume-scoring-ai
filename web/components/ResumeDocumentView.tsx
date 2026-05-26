"use client";
import React from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ResumeDocData {
  full_name?: string;
  name?: string; // fallback
  headline?: string;
  location?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  summary?: string;
  skills?: Array<[string, string[]] | { category: string; items: string[] }>;
  experience?: Array<{
    company: string;
    role?: string;
    title?: string;
    dates?: string;
    start_date?: string;
    end_date?: string;
    location?: string;
    bullets?: string[];
    description?: string[];
  }>;
  education?: Array<{
    institution?: string;
    school?: string;
    degree?: string;
    dates?: string;
    start_date?: string;
    end_date?: string;
    location?: string;
    bullets?: string[];
  }>;
  projects?: Array<{ name: string; bullets?: string[]; description?: string[] }>;
  extra_sections?: Array<[string, string[]] | { title: string; items: string[] }>;
  section_order?: string[];
}

interface Props {
  doc: ResumeDocData;
  /** Ref to the root div for HTML extraction */
  containerRef?: React.RefObject<HTMLDivElement>;
  /** Scale factor for preview (default 1). Use <1 to fit in small panels. */
  scale?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeSkills(
  skills: ResumeDocData["skills"]
): Array<{ category: string; items: string[] }> {
  if (!skills) return [];
  return skills.map((s) => {
    if (Array.isArray(s)) {
      return { category: s[0], items: s[1] };
    }
    return s as { category: string; items: string[] };
  });
}

function normalizeExtraSections(
  extra: ResumeDocData["extra_sections"]
): Array<{ title: string; items: string[] }> {
  if (!extra) return [];
  return extra.map((e) => {
    if (Array.isArray(e)) {
      return { title: e[0], items: e[1] };
    }
    return e as { title: string; items: string[] };
  });
}

function getExperienceDates(exp: NonNullable<ResumeDocData["experience"]>[number]): string {
  if (exp.dates) return exp.dates;
  const parts: string[] = [];
  if (exp.start_date) parts.push(exp.start_date);
  if (exp.end_date) parts.push(exp.end_date);
  return parts.join(" – ");
}

function getEducationDates(edu: NonNullable<ResumeDocData["education"]>[number]): string {
  if (edu.dates) return edu.dates;
  const parts: string[] = [];
  if (edu.start_date) parts.push(edu.start_date);
  if (edu.end_date) parts.push(edu.end_date);
  return parts.join(" – ");
}

function getBullets(
  item: { bullets?: string[]; description?: string[] } | undefined
): string[] {
  if (!item) return [];
  return item.bullets ?? item.description ?? [];
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: "10.5px",
  lineHeight: 1.4,
  color: "#000",
  background: "#fff",
  width: "816px",
  minHeight: "1056px",
  paddingTop: "40px",
  paddingBottom: "40px",
  paddingLeft: "52px",
  paddingRight: "52px",
  boxSizing: "border-box",
};

const nameStyle: React.CSSProperties = {
  fontSize: "22px",
  fontWeight: "bold",
  textAlign: "center",
  marginBottom: "3px",
  letterSpacing: "0.02em",
};

const contactStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: "10px",
  marginBottom: "10px",
  color: "#222",
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: "bold",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: "1px solid #000",
  paddingBottom: "1px",
  marginTop: "10px",
  marginBottom: "4px",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
};

const boldStyle: React.CSSProperties = { fontWeight: "bold" };
const italicStyle: React.CSSProperties = { fontStyle: "italic" };

const bulletStyle: React.CSSProperties = {
  marginLeft: "14px",
  marginBottom: "1px",
  listStyleType: "disc",
  listStylePosition: "outside",
};

const bulletItemStyle: React.CSSProperties = {
  marginBottom: "1px",
};

// ─── Section renderers ────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return <div style={sectionHeaderStyle}>{title}</div>;
}

function ExperienceSection({ experience }: { experience: ResumeDocData["experience"] }) {
  if (!experience?.length) return null;
  return (
    <>
      <SectionHeader title="Experience" />
      {experience.map((exp, i) => {
        const role = exp.role ?? exp.title ?? "";
        const dates = getExperienceDates(exp);
        const bullets = getBullets(exp);
        return (
          <div key={i} style={{ marginBottom: "6px" }}>
            <div style={rowStyle}>
              <span style={boldStyle}>{exp.company}</span>
              <span style={{ fontSize: "10px" }}>{dates}</span>
            </div>
            <div style={rowStyle}>
              <span style={italicStyle}>{role}</span>
              {exp.location && (
                <span style={{ fontSize: "10px", color: "#444" }}>{exp.location}</span>
              )}
            </div>
            {bullets.length > 0 && (
              <ul style={{ margin: "2px 0 0 0", padding: 0 }}>
                {bullets.map((b, bi) => (
                  <li key={bi} style={{ ...bulletStyle, ...bulletItemStyle }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

function EducationSection({ education }: { education: ResumeDocData["education"] }) {
  if (!education?.length) return null;
  return (
    <>
      <SectionHeader title="Education" />
      {education.map((edu, i) => {
        const institution = edu.institution ?? edu.school ?? "";
        const dates = getEducationDates(edu);
        const bullets = getBullets(edu);
        return (
          <div key={i} style={{ marginBottom: "6px" }}>
            <div style={rowStyle}>
              <span style={boldStyle}>{institution}</span>
              <span style={{ fontSize: "10px" }}>{dates}</span>
            </div>
            <div style={rowStyle}>
              <span style={italicStyle}>{edu.degree ?? ""}</span>
              {edu.location && (
                <span style={{ fontSize: "10px", color: "#444" }}>{edu.location}</span>
              )}
            </div>
            {bullets.length > 0 && (
              <ul style={{ margin: "2px 0 0 0", padding: 0 }}>
                {bullets.map((b, bi) => (
                  <li key={bi} style={{ ...bulletStyle, ...bulletItemStyle }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

function SkillsSection({ skills }: { skills: ResumeDocData["skills"] }) {
  const normalized = normalizeSkills(skills);
  if (!normalized.length) return null;
  return (
    <>
      <SectionHeader title="Skills" />
      <div style={{ marginBottom: "4px" }}>
        {normalized.map((sk, i) => (
          <div key={i} style={{ marginBottom: "2px" }}>
            <span style={boldStyle}>{sk.category}:</span>{" "}
            <span>{sk.items.join(", ")}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ProjectsSection({ projects }: { projects: ResumeDocData["projects"] }) {
  if (!projects?.length) return null;
  return (
    <>
      <SectionHeader title="Projects" />
      {projects.map((proj, i) => {
        const bullets = getBullets(proj);
        return (
          <div key={i} style={{ marginBottom: "6px" }}>
            <span style={boldStyle}>{proj.name}</span>
            {bullets.length > 0 && (
              <ul style={{ margin: "2px 0 0 0", padding: 0 }}>
                {bullets.map((b, bi) => (
                  <li key={bi} style={{ ...bulletStyle, ...bulletItemStyle }}>
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}

function SummarySection({ summary }: { summary: string }) {
  if (!summary) return null;
  return (
    <>
      <SectionHeader title="Summary" />
      <div style={{ marginBottom: "4px" }}>{summary}</div>
    </>
  );
}

function ExtraSections({
  extra_sections,
}: {
  extra_sections: ResumeDocData["extra_sections"];
}) {
  const normalized = normalizeExtraSections(extra_sections);
  if (!normalized.length) return null;
  return (
    <>
      {normalized.map((sec, i) => (
        <div key={i}>
          <SectionHeader title={sec.title} />
          <ul style={{ margin: "2px 0 4px 0", padding: 0 }}>
            {sec.items.map((item, ii) => (
              <li key={ii} style={{ ...bulletStyle, ...bulletItemStyle }}>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const DEFAULT_SECTION_ORDER = [
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "extra_sections",
];

export default function ResumeDocumentView({ doc, containerRef, scale = 1 }: Props) {
  const name = doc.full_name ?? doc.name ?? "";
  const sectionOrder = doc.section_order ?? DEFAULT_SECTION_ORDER;

  // Build contact line parts
  const contactParts: string[] = [];
  if (doc.phone) contactParts.push(doc.phone);
  if (doc.email) contactParts.push(doc.email);
  if (doc.linkedin) contactParts.push(doc.linkedin);
  if (doc.github) contactParts.push(doc.github);
  if (doc.website) contactParts.push(doc.website);
  if (doc.location) contactParts.push(doc.location);

  const sectionMap: Record<string, React.ReactNode> = {
    summary: <SummarySection key="summary" summary={doc.summary ?? ""} />,
    experience: <ExperienceSection key="experience" experience={doc.experience} />,
    education: <EducationSection key="education" education={doc.education} />,
    skills: <SkillsSection key="skills" skills={doc.skills} />,
    projects: <ProjectsSection key="projects" projects={doc.projects} />,
    extra_sections: (
      <ExtraSections key="extra_sections" extra_sections={doc.extra_sections} />
    ),
  };

  const outerStyle: React.CSSProperties =
    scale !== 1
      ? {
          transformOrigin: "top left",
          transform: `scale(${scale})`,
          width: "816px",
        }
      : {};

  return (
    <div style={outerStyle}>
      <div ref={containerRef} style={pageStyle}>
        {/* Header */}
        {name && <div style={nameStyle}>{name}</div>}
        {doc.headline && (
          <div
            style={{
              textAlign: "center",
              fontSize: "11px",
              fontStyle: "italic",
              marginBottom: "3px",
            }}
          >
            {doc.headline}
          </div>
        )}
        {contactParts.length > 0 && (
          <div style={contactStyle}>{contactParts.join("  |  ")}</div>
        )}

        {/* Sections in order */}
        {sectionOrder.map((sectionKey) => {
          const node = sectionMap[sectionKey];
          return node ?? null;
        })}

        {/* Render any extra sections not explicitly in section_order */}
        {!sectionOrder.includes("extra_sections") && doc.extra_sections && (
          <ExtraSections extra_sections={doc.extra_sections} />
        )}
      </div>
    </div>
  );
}
