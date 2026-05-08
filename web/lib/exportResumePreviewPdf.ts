"use client";

/**
 * Rasterizes a DOM node (e.g. the résumé “paper” card) to a multi-page Letter PDF.
 */
export async function exportResumePreviewPdf(
  element: HTMLElement,
  filename = "resume-preview.pdf",
): Promise<void> {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    ignoreElements: (node) =>
      (node as HTMLElement).classList?.contains?.("az-pdf-ignore") ?? false,
  });

  const margin = 36;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const usableW = pageW - margin * 2;
  const usablePageH = pageH - margin * 2;

  const scalePtPerPx = usableW / canvas.width;
  const fullH_pt = canvas.height * scalePtPerPx;

  const addSlice = (sliceCanvas: HTMLCanvasElement, hPt: number) => {
    pdf.addImage(
      sliceCanvas.toDataURL("image/png", 0.92),
      "PNG",
      margin,
      margin,
      usableW,
      hPt,
      undefined,
      "FAST",
    );
  };

  if (fullH_pt <= usablePageH) {
    addSlice(canvas, fullH_pt);
    pdf.save(filename);
    return;
  }

  let yCanvasPx = 0;
  let pageIndex = 0;

  while (yCanvasPx < canvas.height) {
    if (pageIndex > 0) pdf.addPage();
    const slicePx = Math.min(
      canvas.height - yCanvasPx,
      Math.ceil(usablePageH / scalePtPerPx),
    );

    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = slicePx;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");
    ctx.drawImage(
      canvas,
      0,
      yCanvasPx,
      canvas.width,
      slicePx,
      0,
      0,
      canvas.width,
      slicePx,
    );

    addSlice(slice, slicePx * scalePtPerPx);
    yCanvasPx += slicePx;
    pageIndex += 1;
  }

  pdf.save(filename);
}
