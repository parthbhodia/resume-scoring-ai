"use client";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TBResumeData, TBFont } from "./types";

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

function makeBoldFamily(font: TBFont): string {
  if (font === "Times-Roman") return "Times-Bold";
  if (font === "Courier") return "Courier-Bold";
  return "Helvetica-Bold";
}

function makeStyles(font: TBFont, accent: string) {
  const bold = makeBoldFamily(font);
  return StyleSheet.create({
    page: {
      fontFamily: font,
      fontSize: 10,
      paddingTop: 36,
      paddingBottom: 36,
      paddingHorizontal: 48,
      color: "#1a1a1a",
      lineHeight: 1.4,
    },
    name: {
      fontSize: 22,
      fontFamily: bold,
      letterSpacing: 0.5,
      marginBottom: 4,
      color: "#111111",
      width: "100%",
    },
    contactLine: {
      fontSize: 9,
      color: "#555555",
      flexDirection: "row",
      flexWrap: "wrap",
      width: "100%",
    },
    contactItem: { marginRight: 6 },
    sectionTitle: {
      fontSize: 10.5,
      fontFamily: bold,
      textTransform: "uppercase",
      letterSpacing: 1,
      color: accent,
      marginBottom: 5,
      paddingBottom: 2,
      borderBottomWidth: 0.5,
      borderBottomColor: accent,
    },
    section: { marginBottom: 11 },
    jobRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
    jobTitle: { fontSize: 10, fontFamily: bold, color: "#111111" },
    company: { fontSize: 10, color: "#333333" },
    dateLocation: { fontSize: 9, color: "#666666" },
    bullet: { fontSize: 9.5, color: "#222222", marginLeft: 12, marginBottom: 1.5, flexDirection: "row" },
    bulletDot: { width: 10, color: "#444444" },
    bulletText: { flex: 1 },
    summaryText: { fontSize: 9.5, color: "#333333", lineHeight: 1.5 },
    skillsText: { fontSize: 9.5, color: "#333333", lineHeight: 1.6 },
    metaSmall: { fontSize: 9, color: "#666666" },
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
  const font = customization?.font ?? "Helvetica";
  const accent = customization?.accentColor ?? "#1a1a1a";
  const styles = makeStyles(font, accent);

  const contactParts = [
    profile.email,
    profile.phone,
    profile.location,
    profile.website,
    profile.linkedin,
    profile.github,
  ].filter(Boolean);

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
                <View key={w.id} style={{ marginBottom: 8 }}>
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
                <View key={e.id} style={{ marginBottom: 6 }}>
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
                <View key={p.id} style={{ marginBottom: 6 }}>
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
        {skills.trim() ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            <Text style={styles.skillsText}>{skills}</Text>
          </View>
        ) : null}

      </Page>
    </Document>
  );
}
