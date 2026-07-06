// Client-side PDF text extraction with pdfjs-dist.

export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line: string[] = [];
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5] as number;
      if (lastY !== null && Math.abs(y - lastY) > 2) line.push("\n");
      else if (line.length) line.push(" ");
      line.push(item.str);
      lastY = y;
    }
    pages.push(line.join(""));
  }
  await doc.destroy();
  return pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
}
