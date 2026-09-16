"use client";

import { useEffect, useRef, useState } from "react";
import ApprovalBar from "@/components/ApprovalBar";
import InputSection from "@/components/InputSection";
import IterationLog from "@/components/IterationLog";
import ResumePreview from "@/components/ResumePreview";
import SectionReview from "@/components/SectionReview";
import { downloadPdf, downloadText } from "@/lib/export";
import { runPipeline } from "@/lib/pipeline";
import { loadSettings, saveSettings } from "@/lib/storage";
import {
  DEFAULT_SETTINGS,
  type GapAnalysis,
  type IterationRecord,
  type KeywordExtraction,
  type ResumeJson,
  type Settings,
} from "@/lib/types";

type FinalStatus = "approved" | "max_iterations_reached" | null;

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  const [resumeText, setResumeText] = useState("");
  const [resumePdf, setResumePdf] = useState<File | null>(null);

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<KeywordExtraction | null>(null);
  const [gap, setGap] = useState<GapAnalysis | null>(null);
  const [iterations, setIterations] = useState<IterationRecord[]>([]);
  const [finalStatus, setFinalStatus] = useState<FinalStatus>(null);
  const [currentResume, setCurrentResume] = useState<ResumeJson | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [sectionReview, setSectionReview] = useState(false);
  const [showFlags, setShowFlags] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reads localStorage (an external system unavailable during SSR), so
    // this can't be a lazy useState initializer without a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(loadSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSettings(settings);
  }, [settings, hydrated]);

  const canRun =
    !running &&
    settings.apiKey.trim().length > 0 &&
    resumeText.trim().length > 50;

  async function run(userFeedback?: string) {
    const abort = new AbortController();
    abortRef.current = abort;
    setRunning(true);
    setError(null);
    setFinalStatus(null);
    setSectionReview(false);

    const resumeFrom =
      userFeedback && keywords && gap && currentResume
        ? { keywords, gap, previousResume: currentResume }
        : undefined;
    if (!resumeFrom) {
      setKeywords(null);
      setGap(null);
    }
    setIterations([]);

    try {
      for await (const event of runPipeline(
        {
          settings,
          rawResume: resumeText,
          extraDetails: "",
          jd: "",
          userFeedback: userFeedback ?? null,
          resumeFrom,
        },
        abort.signal
      )) {
        switch (event.type) {
          case "phase":
            setPhase(event.label);
            break;
          case "keywords":
            setKeywords(event.data);
            break;
          case "gap":
            setGap(event.data);
            break;
          case "iteration-done":
            setIterations((prev) => [...prev, event.record]);
            setCurrentResume(event.record.resume);
            break;
          case "approved":
            setFinalStatus("approved");
            break;
          case "max-iterations":
            setFinalStatus("max_iterations_reached");
            break;
          case "error":
            setError(event.message);
            break;
        }
      }
    } finally {
      setRunning(false);
      setPhase(null);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function exportPdf() {
    if (!previewRef.current) return;
    setPdfBusy(true);
    const hadFlags = showFlags;
    setShowFlags(false);
    // Let React re-render without flag markers before capturing.
    await new Promise((r) => setTimeout(r, 50));
    try {
      await downloadPdf(previewRef.current);
    } finally {
      setShowFlags(hadFlags);
      setPdfBusy(false);
    }
  }

  const flagCount = currentResume
    ? JSON.stringify(currentResume).match(/\[(assumed|fabricated|TRIMMED)\]/gi)
        ?.length ?? 0
    : 0;

  return (
    <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">
          Resume Review Agent
        </h1>
        <p className="text-sm text-neutral-500">
          Reviser → Sentiment Checker → Recruiter, iterating until your resume
          passes.
        </p>
      </header>

      <div className="mx-auto max-w-3xl">
        <div className="space-y-6 min-w-0">
          <InputSection
            resumeText={resumeText}
            setResumeText={setResumeText}
            resumePdf={resumePdf}
            setResumePdf={setResumePdf}
            disabled={running}
          />

          <div className="flex items-center gap-3">
            <button
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={!canRun}
              onClick={() => run()}
            >
              {running ? "Running…" : "Run review pipeline"}
            </button>
            {running && (
              <button
                className="rounded border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={stop}
              >
                Stop
              </button>
            )}
            {!settings.apiKey.trim() && (
              <span className="text-xs text-neutral-500">
                Set apiKey in DEFAULT_SETTINGS (lib/types.ts) to start — the
                config sidebar is disabled for now.
              </span>
            )}
          </div>

          {error && (
            <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 dark:border-red-900 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {(keywords || gap || iterations.length > 0 || running) && (
            <section>
              <h2 className="text-sm font-semibold mb-3">Pipeline activity</h2>
              <IterationLog
                keywords={keywords}
                gap={gap}
                iterations={iterations}
                phase={phase}
                running={running}
              />
            </section>
          )}

          {finalStatus && currentResume && !sectionReview && (
            <ApprovalBar
              finalStatus={finalStatus}
              onExportTxt={() => downloadText(currentResume)}
              onExportPdf={exportPdf}
              onRevise={(fb) => run(fb)}
              onSectionReview={() => setSectionReview(true)}
              pdfBusy={pdfBusy}
              disabled={running}
            />
          )}

          {sectionReview && currentResume && (
            <SectionReview
              resume={currentResume}
              settings={settings}
              onDone={(updated) => {
                setCurrentResume(updated);
                setSectionReview(false);
              }}
              onCancel={() => setSectionReview(false)}
            />
          )}

          {currentResume && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold">Resume preview</h2>
                {flagCount > 0 && (
                  <label className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <input
                      type="checkbox"
                      checked={showFlags}
                      onChange={(e) => setShowFlags(e.target.checked)}
                    />
                    Show {flagCount} flag{flagCount === 1 ? "" : "s"} (assumed /
                    fabricated / trimmed)
                  </label>
                )}
              </div>
              <ResumePreview
                ref={previewRef}
                resume={currentResume}
                showFlags={showFlags}
              />
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
