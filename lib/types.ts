// Core data shapes shared across the pipeline, API routes, and UI.

export interface ResumeSection {
  title: string;
  items: string[];
}

export interface ResumeJson {
  name?: string;
  contact?: string;
  summary: string;
  sections: ResumeSection[];
}

export interface KeywordExtraction {
  keywords: string[];
  required_skills: string[];
  role_summary: string;
}

export interface GapAnalysis {
  present_and_strong: string[];
  present_but_undersold: string[];
  missing_entirely: string[];
  present_but_irrelevant: string[];
  strategic_brief: string;
}

export interface SentimentResult {
  tone_ok: boolean;
  issues: string[];
  vibe_match_score: number;
  replacements: { original: string; revised: string }[];
}

export interface WeakItem {
  index: number;
  reason: string;
}

export interface SectionScore {
  section: string;
  score: number;
  weak_items: WeakItem[];
}

export interface RecruiterResult {
  approved: boolean;
  scores: {
    jd_alignment: number;
    clarity: number;
    impact: number;
    ats_keywords: number;
  };
  section_scores: SectionScore[];
  missing_keywords: string[];
  weak_bullets: { section: string; index: number; reason: string }[];
  structural_issues: string[];
  critical_flags: string[];
  summary_note: string;
}

export interface StyleFix {
  rule: string;
  before: string;
  after: string;
}

export interface DiffEntry {
  section: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}

export interface IterationRecord {
  iteration: number;
  resume: ResumeJson;
  sentiment: SentimentResult | null;
  sentimentRerun: boolean;
  recruiter: RecruiterResult | null;
  styleFixes: StyleFix[];
  diff: DiffEntry[];
}

export type PipelineEvent =
  | { type: "phase"; label: string }
  | { type: "keywords"; data: KeywordExtraction }
  | { type: "gap"; data: GapAnalysis }
  | { type: "iteration-start"; iteration: number }
  | { type: "iteration-done"; record: IterationRecord }
  | { type: "approved"; record: IterationRecord }
  | { type: "max-iterations"; record: IterationRecord }
  | { type: "error"; message: string };

export type PresetKey =
  | "software"
  | "product"
  | "design"
  | "finance"
  | "consulting"
  | "general";

export interface Settings {
  apiKey: string;
  model: string;
  preset: PresetKey;
  vibePrompt: string;
  userSystemPrompt: string;
  // Sliders, 0..1, 0.5 = neutral center
  descriptiveFocused: number; // 0 = descriptive, 1 = focused
  honesty: number; // 0 = true to life, 0.5 = exaggerated, 1 = fabricated
  formalConversational: number;
  safeBold: number;
  // Toggles
  noEmDashes: boolean;
  noSemicolons: boolean;
  maxBulletLength: number | null;
  customRule: string;
  maxIterations: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "claude-opus-4-8",
  preset: "software",
  vibePrompt: "",
  userSystemPrompt: "",
  descriptiveFocused: 0.5,
  honesty: 0.33,
  formalConversational: 0.5,
  safeBold: 0.5,
  noEmDashes: false,
  noSemicolons: false,
  maxBulletLength: null,
  customRule: "",
  maxIterations: 3,
};

export const MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (best)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (fast + smart)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (cheapest)" },
];
