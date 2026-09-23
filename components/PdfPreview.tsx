"use client";

interface Props {
  // A blob: URL (user's own upload) or a static /samples/... path — this
  // component doesn't care which, the caller owns that distinction and any
  // object-URL lifecycle (creation/revocation).
  src: string;
  // Suggested filename for the download link. Matters most for blob URLs,
  // where the browser otherwise offers a meaningless blob-id filename.
  fileName?: string;
}

export default function PdfPreview({ src, fileName }: Props) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          PDF preview
        </p>
        <a
          href={src}
          download={fileName}
          className="text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
        >
          Download
        </a>
      </div>
      <iframe
        src={src}
        title={fileName ?? "PDF preview"}
        className="h-[32rem] w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-surface"
      />
    </div>
  );
}
