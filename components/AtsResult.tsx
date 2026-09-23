"use client";

import {
  GradeTone,
  ResumeGrade,
  SectionScore,
  Severity,
  SEVERITY_PENALTY,
} from "@/lib/atsGrade";
import { AtsReport, sectionId } from "@/lib/atsReport";
import { AtsIssue, DEFAULT_ISSUE_MESSAGES, issueMessage } from "@/lib/atsReview";
import {
  AtsDateRange,
  AtsLocation,
  AtsParseResponse,
  AtsSkill,
} from "@/lib/types";
import { SCORE_ID } from "@/components/SectionNav";
import { createContext, ReactNode, useContext, useState } from "react";

interface Props {
  result: AtsParseResponse | null;
  // buildAtsReport(result) when result is a successful parse; null otherwise.
  report: AtsReport | null;
}

// Anchor targets sit under the sticky nav strip below lg, so give them
// enough scroll margin to clear it; the rail on lg+ doesn't overlap anything.
export const SCROLL_MARGIN = "scroll-mt-16 lg:scroll-mt-8";

// Anything not explicitly rendered is surfaced by <OtherFields>

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function labelize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function formatDatePoint(d?: { date?: string; precision?: string }): string {
  if (!d?.date) return "";
  const parsed = new Date(d.date);
  if (Number.isNaN(parsed.getTime())) return d.date;
  if (d.precision === "year") return String(parsed.getFullYear());
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

// ---- generic renderers, used directly and by <OtherFields> ----

function Empty() {
  return (
    <span className="italic text-neutral-400 dark:text-neutral-600">
      None
    </span>
  );
}

function GenericValue({ value }: { value: unknown }) {
  if (isEmptyValue(value)) return <Empty />;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return <>{String(value)}</>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc list-inside space-y-1">
        {value.map((item, i) => (
          <li key={i}>
            <GenericValue value={item} />
          </li>
        ))}
      </ul>
    );
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return (
    <div className="space-y-1 border-l-2 border-neutral-200 dark:border-neutral-800 pl-3">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <div className="shrink-0 text-neutral-500">{labelize(k)}:</div>
          <div className="min-w-0 break-words">
            <GenericValue value={v} />
          </div>
        </div>
      ))}
    </div>
  );
}

const ISSUE_STYLES: Record<AtsIssue["severity"], string> = {
  critical: "text-red-600 dark:text-red-400",
  minor: "text-amber-600 dark:text-amber-400",
  info: "text-neutral-500",
};

// Lets the "Hide errors" / "Hide tips" toggles in AtsResult reach every
// IssueList without threading props through Field/DateRangeRow at each call
// site. "Tips" are an issue's evidence/fix detail lines, not the message itself.
const ShowIssuesContext = createContext({ showIssues: true, showTips: true });

function IssueList({ issues }: { issues?: AtsIssue[] }) {
  const { showIssues, showTips } = useContext(ShowIssuesContext);
  if (!showIssues || !issues || issues.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {issues.map((issue, i) => (
        <div key={i} className={`flex gap-1.5 text-xs leading-snug ${ISSUE_STYLES[issue.severity]}`}>
          <span aria-hidden="true">&#8594;</span>
          <div className="space-y-0.5">
            <div>{issueMessage(issue)}</div>
            {showTips && issue.evidence && (
              <div className="text-neutral-500">Found: {issue.evidence}</div>
            )}
            {showTips && issue.fix && (
              <div className="text-neutral-500">{issue.fix}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- score card ----

// Exported so SectionNav can tint its score badge the same way.
export const TONE_STYLES: Record<GradeTone, { text: string; fill: string; track: string }> = {
  good: {
    text: "text-emerald-600 dark:text-emerald-400",
    fill: "bg-emerald-500",
    track: "bg-emerald-100 dark:bg-emerald-950",
  },
  warn: {
    text: "text-amber-600 dark:text-amber-400",
    fill: "bg-amber-500",
    track: "bg-amber-100 dark:bg-amber-950",
  },
  bad: {
    text: "text-red-600 dark:text-red-400",
    fill: "bg-red-500",
    track: "bg-red-100 dark:bg-red-950",
  },
};

const SEVERITIES: Severity[] = ["critical", "minor", "info"];

// "3 critical [-30] · 4 minor [-12]", omitting severities with no issues.
function SeverityCountsLine({ counts }: { counts: SectionScore["counts"] }) {
  const parts = SEVERITIES.filter((s) => counts[s] > 0);
  if (parts.length === 0) {
    return <span className="text-neutral-400 dark:text-neutral-600">No issues</span>;
  }
  return (
    <>
      {parts.map((s, i) => (
        <span key={s}>
          {i > 0 && <span className="text-neutral-400 dark:text-neutral-600"> · </span>}
          <span className={ISSUE_STYLES[s]}>
            {counts[s]} {s}
          </span>{" "}
          <span className="text-neutral-500">[-{counts[s] * SEVERITY_PENALTY[s]}]</span>
        </span>
      ))}
    </>
  );
}

interface BreakdownRow {
  key: string;
  label: ReactNode;
  counts: SectionScore["counts"];
  penalty: number;
}

// Fixed column widths so a long label wraps instead of squeezing the counts.
function BreakdownTable({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-neutral-500">{title}</div>
      <table className="w-full table-fixed text-xs">
        <colgroup>
          <col className="w-[40%]" />
          <col />
          <col className="w-10" />
        </colgroup>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 border-y border-neutral-200 dark:border-neutral-800">
          {rows.map((row) => (
            <tr key={row.key} className="align-top">
              <td className="py-2 pr-4 text-neutral-500">{row.label}</td>
              <td className="py-2">
                <SeverityCountsLine counts={row.counts} />
              </td>
              <td className={`py-2 text-right tabular-nums ${row.penalty > 0 ? "" : "text-neutral-400 dark:text-neutral-600"}`}>
                {row.penalty > 0 ? `-${row.penalty}` : "0"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreCard({ grade }: { grade: ResumeGrade }) {
  const tone = TONE_STYLES[grade.band.tone];
  // The score itself isn't floored, but a bar can't be less than empty.
  const fillPercent = Math.max(0, Math.min(100, grade.score));

  return (
    <div
      id={SCORE_ID}
      className={`rounded-md border border-neutral-200 dark:border-neutral-800 bg-surface p-5 sm:p-6 space-y-6 ${SCROLL_MARGIN}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <div className="text-sm font-medium text-neutral-500">ATS parse score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-5xl font-semibold leading-none tracking-tight tabular-nums ${tone.text}`}>
              {grade.score < 0 ? `-${-grade.score}` : grade.score}
            </span>
            <span className="text-sm text-neutral-500">/ 100</span>
          </div>
          <div className={`mt-2 text-sm font-medium ${tone.text}`}>
            {grade.band.label}
          </div>
        </div>
        <div className="text-sm">
          <SeverityCountsLine counts={grade.counts} />
        </div>
      </div>

      <div className={`h-1.5 w-full overflow-hidden rounded-full ${tone.track}`}>
        <div
          className={`h-full rounded-full transition-[width] ${tone.fill}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      <BreakdownTable
        title="By section (click to jump)"
        rows={grade.sections.map((section) => ({
          key: section.label,
          label: (
            <a
              href={`#${sectionId(section.label)}`}
              className="hover:underline hover:text-neutral-900 dark:hover:text-neutral-100"
            >
              {section.label}
            </a>
          ),
          counts: section.counts,
          penalty: section.penalty,
        }))}
      />

      <BreakdownTable
        title="By issue type"
        rows={grade.byCode.map((c) => ({
          key: c.code,
          label: DEFAULT_ISSUE_MESSAGES[c.code],
          counts: c.counts,
          penalty: c.penalty,
        }))}
      />
    </div>
  );
}

function Field({
  label,
  value,
  issues,
}: {
  label: string;
  value: unknown;
  issues?: AtsIssue[];
}) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="w-32 shrink-0 text-neutral-500">{label}</div>
      <div className="min-w-0">
        <GenericValue value={value} />
        <IssueList issues={issues} />
      </div>
    </div>
  );
}

// Smaller nested label/value pair, used inside a Field's value to break a
// structured value (location, date range) into its individual source fields
// instead of collapsing them into one display string.
function SubField({
  label,
  value,
  issues,
}: {
  label: string;
  value: unknown;
  issues?: AtsIssue[];
}) {
  return (
    <div className="flex gap-2">
      <div className="w-28 shrink-0 text-neutral-500">{label}:</div>
      <div className="min-w-0">
        <GenericValue value={value} />
        <IssueList issues={issues} />
      </div>
    </div>
  );
}

const LOCATION_KNOWN = ["city", "state", "country", "countryCode", "formatted", "raw"];

function LocationRow({ label, loc, issues }: { label: string; loc?: AtsLocation; issues?: AtsIssue[] }) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="w-32 shrink-0 text-neutral-500">{label}</div>
      <div className="min-w-0 space-y-1.5">
        <div>
          <GenericValue value={loc?.formatted || loc?.raw} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span>
            City: <GenericValue value={loc?.city} />
          </span>
          <span>
            State: <GenericValue value={loc?.state} />
          </span>
          <span>
            Country: <GenericValue value={loc?.country} />
          </span>
          <span>
            Country code: <GenericValue value={loc?.countryCode} />
          </span>
        </div>
        {loc && <OtherFields obj={asRecord(loc)} known={LOCATION_KNOWN} />}
        <IssueList issues={issues} />
      </div>
    </div>
  );
}

function DateRangeRow({
  label,
  range,
  issues,
}: {
  label: string;
  range?: AtsDateRange;
  issues?: AtsIssue[];
}) {
  return (
    <div className="flex gap-3 text-sm">
      <div className="w-32 shrink-0 text-neutral-500">{label}</div>
      <div className="min-w-0 space-y-1">
        <SubField
          label="Start"
          value={
            range?.start?.date
              ? `${formatDatePoint(range.start)} (${range.start.precision})`
              : undefined
          }
        />
        <SubField
          label="End"
          value={
            range?.end?.date
              ? `${formatDatePoint(range.end)} (${range.end.precision})`
              : undefined
          }
        />
        <SubField
          label="Duration"
          value={
            range?.durationMonths != null
              ? `${range.durationMonths} mo`
              : undefined
          }
        />
        <IssueList issues={issues} />
      </div>
    </div>
  );
}

function OtherFields({
  obj,
  known,
}: {
  obj: Record<string, unknown>;
  known: string[];
}) {
  const rest = Object.entries(obj).filter(([k]) => !known.includes(k));
  if (rest.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5 border-t border-dashed border-neutral-200 dark:border-neutral-800 pt-2 text-xs text-neutral-500">
      {rest.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <div className="shrink-0">{labelize(k)}:</div>
          <div className="min-w-0">
            <GenericValue value={v} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  count,
  description,
  id,
  issues,
  children,
}: {
  title: string;
  count?: number;
  description?: string;
  id?: string;
  issues?: AtsIssue[];
  children: ReactNode;
}) {
  return (
    <section id={id} className={`space-y-4 ${SCROLL_MARGIN}`}>
      <div className="border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <h3 className="text-lg font-semibold tracking-tight">
          {title}
          {count !== undefined && (
            <span className="ml-2 font-normal tabular-nums text-neutral-400 dark:text-neutral-600">
              {count}
            </span>
          )}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </p>
        )}
      </div>
      <IssueList issues={issues} />
      {children}
    </section>
  );
}

// One education / work / project entry. Siblings are separated by hairlines
// rather than boxed, so the section heading's rule stays the only frame.
function EntryList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {children}
    </div>
  );
}

function Entry({
  title,
  issues,
  children,
}: {
  title?: string;
  issues?: AtsIssue[];
  children: ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0 space-y-1.5">
      <div className="text-sm font-semibold">{title || <Empty />}</div>
      <IssueList issues={issues} />
      {children}
    </div>
  );
}

// Hover on skill shows additional details
function SkillPill({ skill }: { skill: AtsSkill }) {
  const extra = Object.entries(asRecord(skill)).filter(
    ([k]) => !["name", "text"].includes(k)
  );
  const hasDetails = extra.length > 0;

  return (
    <div className="relative group">
      <span className="inline-block rounded-full border border-neutral-300 dark:border-neutral-700 bg-surface px-2.5 py-0.5 text-xs transition-colors group-hover:border-neutral-500 dark:group-hover:border-neutral-500">
        {skill.text || skill.name}
      </span>
      {hasDetails && (
        <div className="absolute left-0 top-full z-10 mt-1.5 hidden w-64 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-3 text-xs shadow-md group-hover:block">
          <div className="mb-1.5 font-semibold">{skill.name}</div>
          <div className="space-y-1">
            {extra.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <div className="shrink-0 text-neutral-500">{labelize(k)}:</div>
                <div className="min-w-0 break-words">
                  <GenericValue value={v} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-2.5 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-900 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
    >
      {children}
    </button>
  );
}

const preCls =
  "max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md border border-neutral-200 dark:border-neutral-800 bg-surface p-3 text-xs leading-relaxed";

// Copies `text` to the clipboard, showing brief "Copied" feedback. Lives
// inside a <summary> in RawDetails, so clicks must not bubble up and toggle
// the <details> open/closed.
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-auto shrink-0 rounded-md border border-neutral-300 dark:border-neutral-700 bg-surface px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-900 dark:hover:border-neutral-500 dark:hover:text-neutral-100"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// Collapsible row in the "Raw output" section. The raw JSON is `open` by
// default since showing the unmodified parser response is the point of Stage 1.
function RawDetails({
  summary,
  open,
  copyText,
  children,
}: {
  summary: string;
  open?: boolean;
  copyText?: string;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group py-3 first:pt-0 last:pb-0">
      <summary className="flex list-none cursor-pointer select-none items-center gap-2 text-sm font-medium hover:text-neutral-600 dark:hover:text-neutral-300 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="text-neutral-400 transition-transform group-open:rotate-90"
        >
          &#9656;
        </span>
        {summary}
        {copyText && <CopyButton text={copyText} />}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// Top-level keys of AtsResumeData rendered by a dedicated section below.
// Any other key the parser returns still shows up in "Other extracted data".
const KNOWN_TOP_LEVEL = [
  "contact",
  "person",
  "education",
  "workExperience",
  "projects",
  "skills",
  "achievements",
  "rawText",
  "redactedText",
];

export default function AtsResult({ result, report }: Props) {
  const [showIssues, setShowIssues] = useState(true);
  const [showTips, setShowTips] = useState(true);

  if (!result) return null;
  if ("error" in result || !report)
    return (
      <p className="rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
        {"error" in result ? String(result.error) : "No report for this result"}
      </p>
    );

  const { data, meta } = result;
  const {
    contact,
    contactIssues,
    person,
    personIssues,
    education,
    educationReview,
    workExperience,
    workReview,
    projects,
    projectReview,
    skills,
    achievements,
    achievementsReview,
    metaIssues,
    rawTextIssues,
    grade,
  } = report;

  const otherTopLevel = Object.entries(asRecord(data)).filter(
    ([k]) => !KNOWN_TOP_LEVEL.includes(k)
  );
  const rawJson = JSON.stringify(result, null, 2);

  return (
    <ShowIssuesContext.Provider value={{ showIssues, showTips }}>
      <div className="space-y-10 border-t border-neutral-200 dark:border-neutral-800 pt-12">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Here is what your resume looks like when parsed
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {showIssues && (
              <ToggleButton onClick={() => setShowTips((v) => !v)}>
                {showTips ? "Hide tips" : "Show tips"}
              </ToggleButton>
            )}
            <ToggleButton onClick={() => setShowIssues((v) => !v)}>
              {showIssues ? "Hide errors" : "Show errors"}
            </ToggleButton>
          </div>
        </div>

        <ScoreCard grade={grade} />

        <Section
          title="Parse quality"
          id={sectionId("Parse quality")}
          issues={[...metaIssues, ...rawTextIssues]}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Classification"
              value={
                meta?.document?.classification
                  ? `${meta.document.classification.label ?? "unknown"} (${
                      typeof meta.document.classification.confidence === "number"
                        ? meta.document.classification.confidence.toFixed(2)
                        : "?"
                    })`
                  : undefined
              }
            />
            <Field
              label="Extraction quality"
              value={
                meta?.document?.extractionQuality
                  ? `${meta.document.extractionQuality.band ?? "unknown"} (${
                      typeof meta.document.extractionQuality.score === "number"
                        ? meta.document.extractionQuality.score.toFixed(2)
                        : "?"
                    })`
                  : undefined
              }
            />
          </div>
        </Section>

        <Section title="Personal info" id={sectionId("Personal info")}>
          <div className="space-y-2">
            <div className="flex gap-3 text-sm">
              <div className="w-32 shrink-0 text-neutral-500">Name</div>
              <div className="min-w-0 space-y-1">
                <SubField
                  label="First"
                  value={person.name?.given}
                  issues={personIssues.fields.given}
                />
                <SubField
                  label="Middle"
                  value={person.name?.middle}
                  issues={personIssues.fields.middle}
                />
                <SubField
                  label="Last"
                  value={person.name?.family}
                  issues={personIssues.fields.family}
                />
                <OtherFields
                  obj={asRecord(person.name)}
                  known={["given", "middle", "family"]}
                />
              </div>
            </div>
            <LocationRow label="Location" loc={person.location} issues={personIssues.fields.location}/>
          </div>
          <OtherFields obj={asRecord(person)} known={["name", "location"]} />
        </Section>

        <Section title="Contact" id={sectionId("Contact")} issues={contactIssues.section}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Emails"
              value={contact.emails.length ? contact.emails : undefined}
              issues={contactIssues.fields.emails}
            />
            <Field
              label="Phone numbers"
              value={
                contact.phoneNumbers.length ? contact.phoneNumbers : undefined
              }
              issues={contactIssues.fields.phoneNumbers}
            />
            <Field
              label="Websites"
              value={contact.websites.length ? contact.websites : undefined}
              issues={contactIssues.fields.websites}
            />
          </div>
          <OtherFields
            obj={asRecord(contact)}
            known={["emails", "phoneNumbers", "websites"]}
          />
        </Section>

        <Section
          title="Education"
          count={education.length}
          id={sectionId("Education")}
          issues={educationReview.section}
        >
          {education.length === 0 ? (
            <Empty />
          ) : (
            <EntryList>
              {education.map((ed, i) => {
                const edIssues = educationReview.entries[i];
                return (
                  <Entry key={i} title={ed.institution} issues={edIssues.institution}>
                    <Field
                      label="Qualification"
                      value={ed.qualification}
                      issues={edIssues.qualification}
                    />
                    <Field label="Level" value={ed.level} issues={edIssues.level} />
                    <Field
                      label="Field(s) of study"
                      value={ed.fieldsOfStudy}
                      issues={edIssues.fieldsOfStudy}
                    />
                    <DateRangeRow
                      label="Dates"
                      range={ed.dateRange}
                      issues={edIssues.dateRange}
                    />
                    <LocationRow label="Location" loc={ed.location} />
                    <Field label="Grade" value={ed.grade} issues={edIssues.grade} />
                    <OtherFields
                      obj={asRecord(ed)}
                      known={[
                        "institution",
                        "level",
                        "qualification",
                        "fieldsOfStudy",
                        "dateRange",
                        "location",
                        "grade",
                      ]}
                    />
                  </Entry>
                );
              })}
            </EntryList>
          )}
        </Section>

        <Section
          title="Work experience"
          count={workExperience.length}
          id={sectionId("Work experience")}
          issues={workReview.section}
        >
          {workExperience.length === 0 ? (
            <Empty />
          ) : (
            <EntryList>
              {workExperience.map((we, i) => {
                const weIssues = workReview.entries[i];
                return (
                  <Entry key={i} title={we.jobTitle} issues={weIssues.jobTitle}>
                    <Field
                      label="Organization"
                      value={we.organization}
                      issues={weIssues.organization}
                    />
                    <Field label="Employment type" value={we.employmentType} />
                    <DateRangeRow
                      label="Dates"
                      range={we.dateRange}
                      issues={weIssues.dateRange}
                    />
                    <LocationRow label="Location" loc={we.location} />
                    <Field
                      label="Description"
                      value={we.description}
                      issues={weIssues.description}
                    />
                    <OtherFields
                      obj={asRecord(we)}
                      known={[
                        "organization",
                        "jobTitle",
                        "description",
                        "dateRange",
                        "location",
                        "employmentType",
                      ]}
                    />
                  </Entry>
                );
              })}
            </EntryList>
          )}
        </Section>

        <Section
          title="Projects"
          count={projects.length}
          id={sectionId("Projects")}
          issues={projectReview.section}
        >
          {projects.length === 0 ? (
            <Empty />
          ) : (
            <EntryList>
              {projects.map((p, i) => {
                const pIssues = projectReview.entries[i];
                return (
                  <Entry key={i} title={p.title} issues={pIssues.title}>
                    <DateRangeRow
                      label="Dates"
                      range={p.dateRange}
                      issues={pIssues.dateRange}
                    />
                    <Field
                      label="Description"
                      value={p.description}
                      issues={pIssues.description}
                    />
                    <OtherFields
                      obj={asRecord(p)}
                      known={["title", "description", "dateRange"]}
                    />
                  </Entry>
                );
              })}
            </EntryList>
          )}
        </Section>

        <Section
          title="Skills"
          count={skills.length}
          id={sectionId("Skills")}
          description="Hover a skill for details. This section isn't reviewed for issues."
        >
          {skills.length === 0 ? (
            <Empty />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s, i) => (
                <SkillPill key={i} skill={s} />
              ))}
            </div>
          )}
        </Section>

        <Section
          title="Achievements"
          count={achievements.length}
          id={sectionId("Achievements")}
          issues={achievementsReview.section}
        >
          {achievements.length === 0 ? (
            <Empty />
          ) : (
            <ul className="list-disc pl-5 space-y-1.5 text-sm">
              {achievements.map((a, i) => (
                <li key={i}>
                  {a}
                  <IssueList issues={achievementsReview.entries[i]} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {otherTopLevel.length > 0 && (
          <Section title="Other extracted data">
            <div className="space-y-2">
              {otherTopLevel.map(([k, v]) => (
                <Field key={k} label={labelize(k)} value={v} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Raw output" id={sectionId("Raw output")}>
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {meta && Object.keys(meta).length > 0 && (
              <RawDetails summary="Parse metadata">
                <div className="text-sm">
                  <GenericValue value={meta} />
                </div>
              </RawDetails>
            )}

            {typeof data.rawText === "string" && data.rawText && (
              <RawDetails summary="Raw extracted text" copyText={data.rawText}>
                <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Spaces in odd places (&ldquo;Toronto , ON&rdquo;, &ldquo;1 st&rdquo;)?
                  The parser rebuilds text from where each letter sits on the page and
                  guesses spaces from the gaps. Narrow letters in wide slots (a
                  &ldquo;1&rdquo;, or &ldquo;i&rdquo;/&ldquo;l&rdquo; in a monospace
                  font) leave gaps it reads as spaces. Real spaces in the PDF don&rsquo;t
                  help, so fix it with the font.
                </p>
                <pre className={preCls}>{data.rawText}</pre>
              </RawDetails>
            )}

            {typeof data.redactedText === "string" && data.redactedText && (
              <RawDetails summary="Redacted text" copyText={data.redactedText}>
                <pre className={preCls}>{data.redactedText}</pre>
              </RawDetails>
            )}

            <RawDetails
              summary="Raw JSON from resume parser"
              open
              copyText={rawJson}
            >
              <pre className={preCls}>{rawJson}</pre>
            </RawDetails>
          </div>
        </Section>
      </div>
    </ShowIssuesContext.Provider>
  );
}
