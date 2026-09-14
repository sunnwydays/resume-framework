// Client-side pipeline orchestrator. Runs as an async generator so the UI
// can render live progress. Each agent step is one call to /api/agent.

import { diffResumes, diffSummaryText } from "./diff";
import {
  gapAnalysisPrompt,
  keywordExtractionPrompt,
  recruiterPrompt,
  reviserPrompt,
  sentimentPrompt,
} from "./prompts";
import {
  GAP_SCHEMA,
  KEYWORD_SCHEMA,
  RECRUITER_SCHEMA,
  RESUME_SCHEMA,
  SENTIMENT_SCHEMA,
} from "./schemas";
import type {
  GapAnalysis,
  IterationRecord,
  KeywordExtraction,
  PipelineEvent,
  RecruiterResult,
  ResumeJson,
  SentimentResult,
  Settings,
} from "./types";
import { applyStyleRules } from "./styleRules";

async function callAgent<T>(
  settings: Settings,
  prompt: { system: string; user: string },
  schema: Record<string, unknown>,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-anthropic-key": settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      system: prompt.system,
      user: prompt.user,
      schema,
    }),
    signal,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Agent call failed (${res.status})`);
  return json.data as T;
}

export interface PipelineInput {
  settings: Settings;
  rawResume: string;
  extraDetails: string;
  jd: string;
  userFeedback?: string | null;
  // When re-running from user feedback, continue from an existing state:
  resumeFrom?: {
    keywords: KeywordExtraction;
    gap: GapAnalysis;
    previousResume: ResumeJson;
  };
}

export async function* runPipeline(
  input: PipelineInput,
  signal: AbortSignal
): AsyncGenerator<PipelineEvent> {
  const { settings, rawResume, extraDetails, jd } = input;

  try {
    // ---- Pre-processing (once) ----
    let keywords: KeywordExtraction;
    let gap: GapAnalysis;

    if (input.resumeFrom) {
      keywords = input.resumeFrom.keywords;
      gap = input.resumeFrom.gap;
    } else if (jd.trim()) {
      // JD-driven pre-processing — currently unreachable since the UI no
      // longer collects a job description, kept for when it's added back.
      yield { type: "phase", label: "Extracting job description keywords" };
      keywords = await callAgent<KeywordExtraction>(
        settings,
        keywordExtractionPrompt(jd),
        KEYWORD_SCHEMA,
        signal
      );
      yield { type: "keywords", data: keywords };

      yield { type: "phase", label: "Running gap analysis" };
      gap = await callAgent<GapAnalysis>(
        settings,
        gapAnalysisPrompt(rawResume, extraDetails, jd, keywords),
        GAP_SCHEMA,
        signal
      );
      yield { type: "gap", data: gap };
    } else {
      keywords = { keywords: [], required_skills: [], role_summary: "" };
      gap = {
        present_and_strong: [],
        present_but_undersold: [],
        missing_entirely: [],
        present_but_irrelevant: [],
        strategic_brief: "",
      };
    }

    // ---- Iteration loop ----
    let previousResume: ResumeJson | null = input.resumeFrom?.previousResume ?? null;
    let previousDiffSummary: string | null = null;
    let recruiterFeedback: RecruiterResult | null = null;
    let lastRecord: IterationRecord | null = null;

    for (let iteration = 1; iteration <= settings.maxIterations; iteration++) {
      yield { type: "iteration-start", iteration };

      // 1. Reviser
      yield { type: "phase", label: `Iteration ${iteration}: Reviser writing` };
      let resume: ResumeJson = await callAgent<ResumeJson>(
        settings,
        reviserPrompt({
          settings,
          jd,
          keywords,
          gap,
          rawResume,
          extraDetails,
          iteration,
          previousResume,
          previousDiffSummary,
          recruiterFeedback,
          sentimentFeedback: null,
          userFeedback: iteration === 1 ? (input.userFeedback ?? null) : null,
        }),
        RESUME_SCHEMA,
        signal
      );

      // 2. Sentiment check (+ one Reviser re-run if tone fails)
      yield { type: "phase", label: `Iteration ${iteration}: Sentiment check` };
      const sentiment = await callAgent<SentimentResult>(
        settings,
        sentimentPrompt(settings, resume),
        SENTIMENT_SCHEMA,
        signal
      );

      let sentimentRerun = false;
      if (!sentiment.tone_ok) {
        sentimentRerun = true;
        yield {
          type: "phase",
          label: `Iteration ${iteration}: Reviser fixing tone`,
        };
        resume = await callAgent<ResumeJson>(
          settings,
          reviserPrompt({
            settings,
            jd,
            keywords,
            gap,
            rawResume,
            extraDetails,
            iteration,
            previousResume: resume,
            previousDiffSummary,
            recruiterFeedback,
            sentimentFeedback: sentiment,
            userFeedback: null,
          }),
          RESUME_SCHEMA,
          signal
        );
      }

      // 3. Code-enforced style rules
      const { resume: styled, fixes } = applyStyleRules(resume, settings);
      resume = styled;

      // 4. Recruiter gate
      yield { type: "phase", label: `Iteration ${iteration}: Recruiter reviewing` };
      const recruiter = await callAgent<RecruiterResult>(
        settings,
        recruiterPrompt(settings, resume, jd, keywords),
        RECRUITER_SCHEMA,
        signal
      );

      // Enforce the threshold in code — the gate is not model-discretionary.
      const scores = recruiter.scores;
      const passes =
        scores.jd_alignment >= 7 &&
        scores.clarity >= 7 &&
        scores.impact >= 7 &&
        scores.ats_keywords >= 7 &&
        recruiter.critical_flags.length === 0;
      recruiter.approved = passes;

      const diff = previousResume ? diffResumes(previousResume, resume) : [];
      const record: IterationRecord = {
        iteration,
        resume,
        sentiment,
        sentimentRerun,
        recruiter,
        styleFixes: fixes,
        diff,
      };
      lastRecord = record;
      yield { type: "iteration-done", record };

      if (passes) {
        yield { type: "approved", record };
        return;
      }

      previousResume = resume;
      previousDiffSummary = diff.length ? diffSummaryText(diff) : null;
      recruiterFeedback = recruiter;
    }

    if (lastRecord) yield { type: "max-iterations", record: lastRecord };
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") return;
    yield { type: "error", message: (err as Error).message ?? "Pipeline failed" };
  }
}

// Single sentiment pass on one edited section (section-by-section review flow).
export async function checkSectionTone(
  settings: Settings,
  resume: ResumeJson,
  signal: AbortSignal
): Promise<SentimentResult> {
  const prompt = sentimentPrompt(settings, resume);
  return callAgent<SentimentResult>(settings, prompt, SENTIMENT_SCHEMA, signal);
}
