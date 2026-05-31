"use client";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TBResumeData, TBFont } from "./types";
import { getPageWidth, getStylePreset } from "./templateStyles";

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

function makeBoldFamily(font: TBFont): string {
  if (font === "Times-Roman") return "Times-Bold";
  if (font === "Courier") return "Courier-Bold";
  return "Helvetica-Bold";
}

function makeStyles(font: TBFont, accent: string, stylePreset = getStylePreset(), pageWidth = getPageWidth()) {
  const bold = makeBoldFamily(font);
  return StyleSheet.create({
    page: {
      fontFamily: font,
      fontSize: stylePreset.baseFont,
      paddingTop: pageWidth.paddingY,
      paddingBottom: pageWidth.paddingY,
      paddingHorizontal: pageWidth.paddingX,
      color: "#1a1a1a",
      lineHeight: stylePreset.lineHeight,
    },
    name: {
      fontSize: stylePreset.nameFont,
      fontFamily: bold,
      letterSpacing: 0.5,
      marginBottom: 4,
      color: "#111111",
      width: "100%",
    },
    contactLine: {
      fontSize: stylePreset.metaFont,
      color: "#555555",
      flexDirection: "row",
      flexWrap: "wrap",
      width: "100%",
    },
    contactItem: { marginRight: 6 },
    sectionTitle: {
      fontSize: stylePreset.sectionFont,
      fontFamily: bold,
      textTransform: "uppercase",
      letterSpacing: stylePreset.letterSpacing,
      color: accent,
      marginBottom: 5,
      paddingBottom: 2,
      borderBottomWidth: 0.5,
      borderBottomColor: accent,
    },
    section: { marginBottom: stylePreset.sectionGap },
    jobRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
    jobTitle: { fontSize: stylePreset.baseFont, fontFamily: bold, color: "#111111" },
    company: { fontSize: stylePreset.baseFont - 0.5, color: "#333333" },
    dateLocation: { fontSize: stylePreset.metaFont, color: "#666666" },
    bullet: { fontSize: stylePreset.bodyFont, color: "#222222", marginLeft: 12, marginBottom: stylePreset.bulletGap, flexDirection: "row" },
    bulletDot: { width: 10, color: "#444444" },
    bulletText: { flex: 1 },
    summaryText: { fontSize: stylePreset.bodyFont, color: "#333333", lineHeight: stylePreset.summaryLineHeight },
    skillsText: { fontSize: stylePreset.bodyFont, color: "#333333", lineHeight: stylePreset.skillsLineHeight },
    metaSmall: { fontSize: stylePreset.metaFont, color: "#666666" },
  });
}

function Bullet({ text, styles }: { text: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

interface Props { data: TBResumeData }

export default function ResumePDFTemplate({ data }: Props) {
  const { profile, workExperiences, educations, projects, skills, customization } = data;
  const preset = getStylePreset(customization?.stylePreset);
  const pageWidth = getPageWidth(customization?.pageWidth);
  const font = customization?.font ?? preset.font;
  const accent = customization?.accentColor ?? preset.accentColor;
  const styles = makeStyles(font, accent, preset, pageWidth);

  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.website,
    profile.linkedin,
    profile.github,
  ].filter(Boolean);

  const featuredWithSkill = skills.featuredSkills.filter((f) => f.skill.trim());

  return (
    <Document title={profile.name ? `${profile.name} Resume` : "Resume"}>
      <Page size="LETTER" style={styles.page}>

        {/* Header */}
        <View style={{ flexDirection: "column", marginBottom: 14, width: "100%" }}>
          <Text style={styles.name}>{profile.name || "Your Name"}</Text>
          <View style={styles.contactLine}>
            {contactParts.map((c, i) => (
              <Text key={i} style={styles.contactItem}>
                {c}{i < contactParts.length - 1 ? "  |  " : ""}
              </Text>
            ))}
          </View>
        </View>

        {/* Summary */}
        {profile.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Summary</Text>
            <Text style={styles.summaryText}>{profile.summary}</Text>
          </View>
        ) : null}

        {/* Experience */}
        {workExperiences.filter((w) => w.company || w.jobTitle).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Experience</Text>
            {workExperiences.filter((w) => w.company || w.jobTitle).map((w) => {
              const dateStr = [w.startDate, w.current ? "Present" : w.endDate].filter(Boolean).join(" – ");
              const bullets = parseBullets(w.bullets);
              return (
                <View key={w.id} style={{ marginBottom: preset.entryGap }}>
                  <View style={styles.jobRow}>
                    <Text style={styles.jobTitle}>{w.jobTitle || "Job Title"}</Text>
                    <Text style={styles.dateLocation}>{dateStr}</Text>
                  </View>
                  <View style={styles.jobRow}>
                    <Text style={styles.company}>{w.company}</Text>
                    {w.location ? <Text style={styles.dateLocation}>{w.location}</Text> : null}
                  </View>
                  {bullets.map((b, i) => <Bullet key={i} text={b} styles={styles} />)}
                </View>
              );
            })}
          </View>
        )}

        {/* Education */}
        {educations.filter((e) => e.school || e.degree).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {educations.filter((e) => e.school || e.degree).map((e) => {
              const dateStr = [e.startDate, e.endDate].filter(Boolean).join(" – ");
              return (
                <View key={e.id} style={{ marginBottom: Math.max(5, preset.entryGap - 2) }}>
                  <View style={styles.jobRow}>
                    <Text style={styles.jobTitle}>{e.school || "School"}</Text>
                    <Text style={styles.dateLocation}>{dateStr}</Text>
                  </View>
                  <View style={styles.jobRow}>
                    <Text style={styles.company}>{e.degree}</Text>
                    {e.gpa ? <Text style={styles.dateLocation}>GPA: {e.gpa}</Text> : null}
                  </View>
                  {e.location ? <Text style={styles.metaSmall}>{e.location}</Text> : null}
                  {e.coursework ? (
                    <Text style={styles.metaSmall}>Coursework: {e.coursework}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {/* Projects */}
        {projects.filter((p) => p.name).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Projects</Text>
            {projects.filter((p) => p.name).map((p) => {
              const bullets = parseBullets(p.bullets);
              return (
                <View key={p.id} style={{ marginBottom: Math.max(5, preset.entryGap - 2) }}>
                  <View style={styles.jobRow}>
                    <Text style={styles.jobTitle}>
                      {p.name}{p.tech ? `  |  ${p.tech}` : ""}
                    </Text>
                    {p.date ? <Text style={styles.dateLocation}>{p.date}</Text> : null}
                  </View>
                  {p.link ? <Text style={styles.metaSmall}>{p.link}</Text> : null}
                  {bullets.map((b, i) => <Bullet key={i} text={b} styles={styles} />)}
                </View>
              );
            })}
          </View>
        )}

        {/* Skills */}
        {(featuredWithSkill.length > 0 || skills.descriptions.trim()) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>

            {/* Featured skills — 3-column grid, 2 per column */}
            {featuredWithSkill.length > 0 && (
              <View style={{ flexDirection: "row", marginBottom: 5 }}>
                {[0, 1, 2].map((col) => (
                  <View key={col} style={{ width: "33.33%" }}>
                    {[featuredWithSkill[col], featuredWithSkill[col + 3]]
                      .filter(Boolean)
                      .map((fs, i) => (
                        <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                          <Text style={{ fontSize: preset.metaFont, color: "#222", marginRight: 4 }}>{fs.skill}</Text>
                          {Array.from({ length: 5 }, (_, ci) => (
                            <View key={ci} style={{
                              width: 6, height: 6, borderRadius: 3, marginLeft: 2,
                              backgroundColor: ci < fs.rating ? accent : "#d9d9d9",
                            }} />
                          ))}
                        </View>
                      ))}
                  </View>
                ))}
              </View>
            )}

            {/* Category description lines */}
            {skills.descriptions.trim() ? (
              skills.descriptions.split("\n").filter(Boolean).map((line, i) => (
                <Text key={i} style={styles.skillsText}>{line}</Text>
              ))
            ) : null}
          </View>
        ) : null}

      </Page>
    </Document>
  );
}
