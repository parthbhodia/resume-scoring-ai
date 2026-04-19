"use client";

interface Props {
  folder:  string | null;
  texPath: string | null;
  pdfUrl:  string | null;
  company: string;
  role:    string;
  model:   string;
}

function Row({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 0" }}>
      <span style={{ fontSize: 12, color: "var(--dim)", letterSpacing: -0.1, minWidth: 80, paddingTop: 1 }}>
        {label}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: "var(--accent)", wordBreak: "break-all" }}>
          {value}
        </a>
      ) : (
        <span style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all", fontFamily: "monospace" }}>
          {value || "—"}
        </span>
      )}
    </div>
  );
}

export default function InfoPanel({ folder, texPath, pdfUrl, company, role, model }: Props) {
  return (
    <div>
      <Row label="Company"  value={company} />
      <Row label="Role"     value={role} />
      <Row label="Model"    value={model} />
      <Row label="Folder"   value={folder || "—"} />
      <Row label=".tex"     value={texPath || "—"} />
      {pdfUrl && (
        <Row label="PDF"    value="Open PDF" link={pdfUrl} />
      )}
    </div>
  );
}
