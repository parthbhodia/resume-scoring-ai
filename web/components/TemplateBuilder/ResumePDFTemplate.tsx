"use client";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TBResumeData } from "./types";

// Use Helvetica (always available in @react-pdf — no Font.register needed)
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 48,
    color: "#1a1a1a",
    lineHeight: 1.4,
  },
  name: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    marginBottom: 3,
    color: "#111111",
  },
  contactLine: {
    fontSize: 9,
    color: "#555555",
    marginBottom: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  contactItem: { marginRight: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#333333",
    marginBottom: 6,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#999999",
  },
  section: { marginBottom: 12 },
  jobRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 1 },
  jobTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111111" },
  company: { fontSize: 10, color: "#333333" },
  dateLocation: { fontSize: 9, color: "#666666" },
  bullet: { fontSize: 9.5, color: "#222222", marginLeft: 12, marginBottom: 1.5, flexDirection: "row" },
  bulletDot: { width: 10, color: "#444444" },
  bulletText: { flex: 1 },
  summaryText: { fontSize: 9.5, color: "#333333", lineHeight: 1.5 },
  skillsText: { fontSize: 9.5, color: "#333333", lineHeight: 1.6 },
});

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

function parseBullets(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
}

interface Props { data: TBResumeData }

export default function ResumePDFTemplate({ data }: Props) {
  const { profile, workExperiences, educations, projects, skills } = data;
  const contactParts = [
    profile.email, profile.phone, profile.location, profile.linkedin, profile.github,
  ].filter(Boolean);

  return (
    <Document title={profile.name ? `${profile.name} Resume` : "Resume"}>
      <Page size="LETTER" style={styles.page}>

        {/* Header */}
        <Text style={styles.name}>{profile.name || "Your Name"}</Text>
        <View style={styles.contactLine}>
          {contactParts.map((c, i) => (
            <Text key={i} style={styles.contactItem}>{c}{i < contactParts.length - 1 ? " | " : ""}</Text>
          ))}
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
                  {bullets.map((b, i) => <Bullet key={i} text={b} />)}
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
                  {e.location ? <Text style={{ fontSize: 9, color: "#666" }}>{e.location}</Text> : null}
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
                    <Text style={styles.jobTitle}>{p.name}</Text>
                    {p.date ? <Text style={styles.dateLocation}>{p.date}</Text> : null}
                  </View>
                  {bullets.map((b, i) => <Bullet key={i} text={b} />)}
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
