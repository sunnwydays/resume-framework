"use client";

import { useEffect, useState } from "react";

interface Props {
  // Static /samples/... path to a .tex file.
  src: string;
  fileName?: string;
}

// Companion to PdfPreview for samples that also have LaTeX source available.
// Fetches the raw .tex text client-side and renders it rather than relying
// on an <iframe>, since browsers don't reliably preview unrecognized file
// extensions inline.
export default function LatexPreview({ src, fileName }: Props) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setSource(text);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleCopy = () => {
    if (!source) return;
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          LaTeX source
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!source}
            className="text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            href={src}
            download={fileName}
            className="text-xs font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:decoration-neutral-700 dark:hover:text-neutral-100"
          >
            Download
          </a>
        </div>
      </div>
      <pre className="h-128 w-full overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-surface p-3 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
        {error ? "Couldn't load LaTeX source." : (source ?? "Loading…")}
      </pre>
    </div>
  );
}
