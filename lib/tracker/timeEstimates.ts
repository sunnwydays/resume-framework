import type { AssessmentKind } from "@/lib/tracker/format";

// One application, start to submit. The Arbitrage page lets you override it.
export const DEFAULT_MINUTES_PER_APP = 3;

// One assessment of each kind, including prep
export const ROUND_MINUTES: Record<AssessmentKind, number> = {
  oa: 120,
  video_interview: 90,
  interview: 150,
};
