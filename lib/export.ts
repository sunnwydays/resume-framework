// Export helpers: ATS-safe plain text, and styled PDF via html2pdf.js.

import type { ResumeJson } from "./types";

// Strip pipeline annotation markers for final export.
export function stripFlags(text: string): string {
  return text
    .replace(/\s*\[(assumed|fabricated|TRIMMED)\]/gi, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function resumeToPlainText(resume: ResumeJson): string {
  const lines: string[] = [];
  if (resume.name) lines.push(resume.name.toUpperCase());
  if (resume.contact) lines.push(resume.contact);
  lines.push("");
  lines.push("SUMMARY");
  lines.push(stripFlags(resume.summary));
  for (const sec of resume.sections) {
    lines.push("");
    lines.push(sec.title.toUpperCase());
    for (const item of sec.items) {
      lines.push(`- ${stripFlags(item)}`);
    }
  }
  return lines.join("\n");
}

export function downloadText(resume: ResumeJson): void {
  const blob = new Blob([resumeToPlainText(resume)], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "resume.txt";
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPdf(element: HTMLElement): Promise<void> {
  const html2pdf = (await import("html2pdf.js")).default;
  await html2pdf()
    .set({
      margin: [12, 14],
      filename: "resume.pdf",
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    })
    .from(element)
    .save();
}
