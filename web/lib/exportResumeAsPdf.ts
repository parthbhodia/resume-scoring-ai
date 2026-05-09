import { jsPDF } from "jspdf";
import { buildBlocks } from "@/components/AnalyzeLiveResumeBody";
import type { LiveBulletItem } from "@/components/AnalyzeLiveResumeBody";

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN_X = 18;
const MARGIN_TOP = 18;
const MARGIN_BOTTOM = 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

/** Strip TeX/markdown bold markers for plain text output. */
function stripMarkup(s: string): string {
  return s
    .replace(/\\textbf\{([^}]*)\}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

/** Strip leading bullet char so we can add our own. */
function stripBulletChar(s: string): string {
  return s.replace(/^\s*[•*·\-–—]+\s*/, "").trim();
}

export async function exportResumeAsPdf(
  extractedText: string,
  bulletAnalysis: LiveBulletItem[],
  lineOverrides: Record<number, string>,
  resumeHeader: string[],
  filename = "resume.pdf",
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  const lines = extractedText.split(/\r?\n/);
  const blocks = buildBlocks(lines, bulletAnalysis);

  // If first block is not a header, inject resumeHeader as fallback
  if (blocks[0]?.type !== "header" && resumeHeader.length > 0) {
    blocks.unshift({ type: "header", lines: resumeHeader });
  }

  let y = MARGIN_TOP;

  function checkPageBreak(needed: number): void {
    if (y + needed > PAGE_H - MARGIN_BOTTOM) {
      doc.addPage();
      y = MARGIN_TOP;
    }
  }

  function addWrappedText(
    text: string,
    fontSize: number,
    fontStyle: "normal" | "bold" | "italic",
    color: [number, number, number],
    align: "left" | "center",
    indent = 0,
    lineHeightMult = 1.35,
  ): void {
    doc.setFont("times", fontStyle);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
    const maxW = CONTENT_W - indent;
    const wrapped = doc.splitTextToSize(stripMarkup(text), maxW) as string[];
    const lineH = (fontSize / 2.835) * lineHeightMult; // pt to mm approx
    for (const wline of wrapped) {
      checkPageBreak(lineH + 1);
      const x = align === "center" ? PAGE_W / 2 : MARGIN_X + indent;
      doc.text(wline, x, y, { align });
      y += lineH;
    }
  }

  for (const block of blocks) {
    if (block.type === "header") {
      // Name: first line, large bold centered
      const [nameLine, ...rest] = block.lines;
      if (nameLine?.trim()) {
        addWrappedText(stripMarkup(nameLine), 17, "bold", [17, 24, 39], "center", 0, 1.2);
        y += 1.5;
      }
      // Contact/subtitle lines: smaller centered
      for (const l of rest) {
        if (l.trim()) {
          addWrappedText(stripMarkup(l), 9, "normal", [55, 65, 81], "center", 0, 1.25);
        }
      }
      y += 3;
    } else if (block.type === "section") {
      y += 3;
      checkPageBreak(8);
      // Section heading: navy bold uppercase, full-width underline
      const label = block.text.toUpperCase();
      doc.setFont("times", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(26, 35, 126); // navy
      doc.text(label, MARGIN_X, y);
      y += 1.2;
      doc.setDrawColor(26, 35, 126);
      doc.setLineWidth(0.45);
      doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
      y += 3.5;
    } else if (block.type === "paragraph") {
      for (const l of block.lines) {
        const t = l.trim();
        if (!t) { y += 1.5; continue; }
        // Entry headers (job title | company | date) — bold left, date right
        const isEntryHeader =
          t.includes("|") ||
          /\b(19|20)\d{2}\s*[–—\-]\s*((19|20)\d{2}|present|current)/i.test(t) ||
          /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(19|20)\d{2}/i.test(t);

        if (isEntryHeader && t.includes("|")) {
          checkPageBreak(6);
          const parts = t.split("|").map(p => p.trim()).filter(Boolean);
          const last = parts[parts.length - 1];
          const isLastDate = /\b(19|20)\d{2}\b/.test(last) || /present|current/i.test(last);
          const mains = isLastDate ? parts.slice(0, -1) : parts;
          const datePart = isLastDate ? last : null;

          doc.setFont("times", "bold");
          doc.setFontSize(10);
          doc.setTextColor(17, 24, 39);
          const mainText = mains.join("  ·  ");
          doc.text(stripMarkup(mainText), MARGIN_X, y);

          if (datePart) {
            doc.setFont("times", "normal");
            doc.setFontSize(9);
            doc.setTextColor(75, 85, 99);
            doc.text(stripMarkup(datePart), PAGE_W - MARGIN_X, y, { align: "right" });
          }
          y += 5;
        } else {
          addWrappedText(t, 9.5, "normal", [31, 41, 55], "left", 0, 1.3);
        }
      }
      y += 1;
    } else if (block.type === "bullets") {
      for (const item of block.items) {
        const override = lineOverrides[item.bulletIdx];
        const rawText = override != null ? override : item.rawLine;
        const bulletText = stripBulletChar(stripMarkup(rawText));
        if (!bulletText) continue;

        doc.setFont("times", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(31, 41, 55);
        const indent = 5;
        const bulletIndent = 3;
        const maxW = CONTENT_W - indent;
        const wrapped = doc.splitTextToSize(bulletText, maxW) as string[];
        const lineH = (9.5 / 2.835) * 1.35;
        const blockH = wrapped.length * lineH;
        checkPageBreak(blockH + 1);

        // Draw bullet dot
        doc.text("•", MARGIN_X + bulletIndent - 3, y);
        // First wrapped line
        doc.text(wrapped[0], MARGIN_X + indent, y);
        y += lineH;
        // Continuation lines (hanging indent)
        for (let wi = 1; wi < wrapped.length; wi++) {
          doc.text(wrapped[wi], MARGIN_X + indent, y);
          y += lineH;
        }
      }
      y += 1;
    }
  }

  doc.save(filename);
}
