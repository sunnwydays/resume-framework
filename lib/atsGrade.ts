// Turns the issues found by atsReview.ts into a single score out of 100.
// atsReview finds problems; this file only scores them.

import { AtsIssue, FieldIssues, IssueCode, SectionReview } from "./atsReview";

export type Severity = AtsIssue["severity"];

// Points deducted per issue. Every occurrence counts, so five work entries
// each missing a description cost 5 × minor.
export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 10,
  minor: 3,
  info: 0,
};

// Highest `min` first; the first band with `min <= score` wins. The score
// isn't floored, so the last band also catches negatives.
export const GRADE_BANDS = [
  { min: 85, label: "ATS-ready", tone: "good" },
  { min: 70, label: "Recommend fixes", tone: "warn" },
  { min: 40, label: "Significant issues", tone: "bad" },
  { min: -Infinity, label: "Needs major, major cleanup", tone: "bad" },
] as const;

export type GradeBand = (typeof GRADE_BANDS)[number];
export type GradeTone = GradeBand["tone"];

export type SeverityCounts = Record<Severity, number>;

export interface SectionScore {
  label: string;
  counts: SeverityCounts;
  penalty: number;
}

export interface CodeScore {
  code: IssueCode;
  counts: SeverityCounts;
  penalty: number;
}

export interface ResumeGrade {
  score: number;            // 100 - penalty, deliberately not clamped
  band: GradeBand;
  counts: SeverityCounts;   // totals across all sections
  penalty: number;
  sections: SectionScore[]; // in the order given to gradeSections
  byCode: CodeScore[];      // sorted by penalty desc, ties broken by code
}

// Person/contact reviews: section-level issues + one list per field.
export function flattenSectionReview(
  review: SectionReview<FieldIssues<string>>
): AtsIssue[] {
  return [...review.section, ...flattenFields(review.fields)];
}

// List reviews (work, projects, education, achievements): section-level
// issues + one entry per list item, which is either a field map or, for
// achievements, a plain issue list.
export function flattenEntriesReview(review: {
  section: AtsIssue[];
  entries: (FieldIssues<string> | AtsIssue[])[];
}): AtsIssue[] {
  return [
    ...review.section,
    ...review.entries.flatMap((entry) =>
      Array.isArray(entry) ? entry : flattenFields(entry)
    ),
  ];
}

function flattenFields(fields: FieldIssues<string>): AtsIssue[] {
  return Object.values(fields).flatMap((issues) => issues ?? []);
}

function countBySeverity(issues: AtsIssue[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, minor: 0, info: 0 };
  for (const issue of issues) counts[issue.severity]++;
  return counts;
}

function penaltyFor(counts: SeverityCounts): number {
  return (
    counts.critical * SEVERITY_PENALTY.critical +
    counts.minor * SEVERITY_PENALTY.minor +
    counts.info * SEVERITY_PENALTY.info
  );
}

// Only codes that actually occurred are included. Sorted by penalty desc
// (biggest score impact first), ties broken alphabetically for stability.
function countByCode(issues: AtsIssue[]): CodeScore[] {
  const byCode = new Map<IssueCode, SeverityCounts>();
  for (const issue of issues) {
    const counts = byCode.get(issue.code) ?? { critical: 0, minor: 0, info: 0 };
    counts[issue.severity]++;
    byCode.set(issue.code, counts);
  }
  return [...byCode.entries()]
    .map(([code, counts]) => ({ code, counts, penalty: penaltyFor(counts) }))
    .sort((a, b) => b.penalty - a.penalty || a.code.localeCompare(b.code));
}

export function gradeSections(
  sections: { label: string; issues: AtsIssue[] }[]
): ResumeGrade {
  const scored: SectionScore[] = sections.map(({ label, issues }) => {
    const counts = countBySeverity(issues);
    return { label, counts, penalty: penaltyFor(counts) };
  });

  const allIssues = sections.flatMap((s) => s.issues);
  const counts = countBySeverity(allIssues);
  const penalty = penaltyFor(counts);
  const byCode = countByCode(allIssues);
  const score = 100 - penalty;
  const band = GRADE_BANDS.find((b) => score >= b.min) ?? GRADE_BANDS[GRADE_BANDS.length - 1];

  return { score, band, counts, penalty, sections: scored, byCode };
}
