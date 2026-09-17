"use client";

import {
  flattenEntriesReview,
  flattenSectionReview,
  gradeSections,
  GradeTone,
  ResumeGrade,
  SectionScore,
  Severity,
  SEVERITY_PENALTY,
} from "@/lib/atsGrade";
import {
  AtsIssue,
  DEFAULT_ISSUE_MESSAGES,
  issueMessage,
  reviewAchievements,
  reviewContact,
  reviewEducation,
  reviewMeta,
  reviewPerson,
  reviewProjects,
  reviewRawText,
  reviewWorkExperiences,
} from "@/lib/atsReview";
import {
  AtsDateRange,
  AtsLocation,
  AtsParseResponse,
  AtsSkill,
} from "@/lib/types";
import { createContext, ReactNode, useContext, useState } from "react";

interface Props {
  result: AtsParseResponse | null;
}

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

function formatDatePoint(d?: { date: string; precision: string }): string {
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
      <ul className="list-disc list-inside space-y-0.5">
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
    <div className="space-y-0.5 border-l border-neutral-200 dark:border-neutral-800 pl-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <div className="shrink-0 text-neutral-500">{labelize(k)}:</div>
          <div className="min-w-0">
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
    <div className="mt-0.5 space-y-0.5">
      {issues.map((issue, i) => (
        <div key={i} className={`text-xs ${ISSUE_STYLES[issue.severity]}`}>
          {issueMessage(issue)}
          {showTips && issue.evidence && (
            <div className="text-neutral-500">Found: {issue.evidence}</div>
          )}
          {showTips && issue.fix && (
            <div className="text-neutral-500">{issue.fix}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- score card ----

const TONE_STYLES: Record<GradeTone, { text: string; fill: string; track: string }> = {
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

function ScoreCard({ grade }: { grade: ResumeGrade }) {
  const tone = TONE_STYLES[grade.band.tone];
  // The score itself isn't floored, but a bar can't be less than empty.
  const fillPercent = Math.max(0, Math.min(100, grade.score));

  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="text-xs text-neutral-500">ATS parse score</div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-5xl font-semibold leading-none ${tone.text}`}>
              {grade.score < 0 ? `-${-grade.score}` : grade.score}
            </span>
            <span className="text-sm text-neutral-500">/ 100</span>
          </div>
          <div className={`mt-1 text-sm font-medium ${tone.text}`}>
            {grade.band.label}
          </div>
        </div>
        <div className="text-sm">
          <SeverityCountsLine counts={grade.counts} />
        </div>
      </div>

      <div className={`h-1.5 w-full overflow-hidden rounded-full ${tone.track}`}>
        <div
          className={`h-full rounded-full ${tone.fill}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      <div>
        <div className="text-sm font-medium text-neutral-400">By section</div>
        <table className="w-full text-xs">
          <tbody>
            {grade.sections.map((section) => (
              <tr key={section.label} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-3 text-neutral-500 whitespace-nowrap">{section.label}</td>
                <td className="py-1 w-full">
                  <SeverityCountsLine counts={section.counts} />
                </td>
                <td className={`py-1 pl-3 text-right tabular-nums ${section.penalty > 0 ? "" : "text-neutral-400 dark:text-neutral-600"}`}>
                  {section.penalty > 0 ? `-${section.penalty}` : "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="text-sm font-medium text-neutral-400">By issue type</div>
        <table className="w-full text-xs">
          <tbody>
            {grade.byCode.map((c) => (
              <tr key={c.code} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1 pr-3 text-neutral-500 whitespace-nowrap">{DEFAULT_ISSUE_MESSAGES[c.code]}</td>
                <td className="py-1 w-full">
                  <SeverityCountsLine counts={c.counts} />
                </td>
                <td className={`py-1 pl-3 text-right tabular-nums ${c.penalty > 0 ? "" : "text-neutral-400 dark:text-neutral-600"}`}>
                  {c.penalty > 0 ? `-${c.penalty}` : "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <div className="flex gap-2 text-sm">
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
    <div className="flex gap-2 text-sm">
      <div className="w-32 shrink-0 text-neutral-500">{label}</div>
      <div className="min-w-0 space-y-1">
        <div>
          <GenericValue value={loc?.formatted || loc?.raw} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
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
    <div className="flex gap-2 text-sm">
      <div className="w-32 shrink-0 text-neutral-500">{label}</div>
      <div className="min-w-0 space-y-0.5">
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
    <div className="mt-1.5 space-y-1 border-t border-dashed border-neutral-200 dark:border-neutral-800 pt-1.5 text-xs text-neutral-500">
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
  issues,
  children,
}: {
  title: string;
  issues?: AtsIssue[];
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="border-b border-neutral-200 dark:border-neutral-800 pb-1 text-sm font-semibold">
        {title}
      </h3>
      <IssueList issues={issues} />
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-neutral-200 dark:border-neutral-800 p-2.5 space-y-1">
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
      <span className="rounded-full border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 text-xs">
        {skill.text || skill.name}
      </span>
      {hasDetails && (
        <div className="absolute left-0 top-full z-10 mt-1 hidden w-64 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2 text-xs shadow-lg group-hover:block">
          <div className="mb-1 font-medium">{skill.name}</div>
          <div className="space-y-0.5">
            {extra.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <div className="shrink-0 text-neutral-500">{labelize(k)}:</div>
                <div className="min-w-0">
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

export default function AtsResult({ result }: Props) {
  const [showIssues, setShowIssues] = useState(true);
  const [showTips, setShowTips] = useState(true);

  if (!result) return null;
  if ("error" in result)
    return <p className="text-sm text-red-600">{String(result.error)}</p>;

  const { data, meta } = result;
  const contact = {
    emails: data.contact?.emails ?? [],
    phoneNumbers: data.contact?.phoneNumbers ?? [],
    websites: data.contact?.websites ?? [],
  };
  const contactIssues = reviewContact(contact, data.rawText ?? "");
  const person = { name: data.person?.name ?? {}, location: data.person?.location };
  const personIssues = reviewPerson(person);
  const education = data.education ?? [];
  const educationReview = reviewEducation(education);
  const workExperience = data.workExperience ?? [];
  const workReview = reviewWorkExperiences(workExperience);
  const projects = data.projects ?? [];
  const projectReview = reviewProjects(projects);
  const skills = data.skills ?? [];
  const achievements = data.achievements ?? [];
  const achievementsReview = reviewAchievements(achievements);
  const metaIssues = reviewMeta(meta);
  const rawTextIssues = reviewRawText(data.rawText ?? "");

  // Same order as the sections below so the breakdown reads top-to-bottom.
  const grade = gradeSections([
    { label: "Parse quality", issues: [...metaIssues, ...rawTextIssues] },
    { label: "Personal info", issues: flattenSectionReview(personIssues) },
    { label: "Contact", issues: flattenSectionReview(contactIssues) },
    { label: "Education", issues: flattenEntriesReview(educationReview) },
    { label: "Work experience", issues: flattenEntriesReview(workReview) },
    { label: "Projects", issues: flattenEntriesReview(projectReview) },
    { label: "Achievements", issues: flattenEntriesReview(achievementsReview) },
  ]);

  const otherTopLevel = Object.entries(asRecord(data)).filter(
    ([k]) => !KNOWN_TOP_LEVEL.includes(k)
  );

  return (
    <ShowIssuesContext.Provider value={{ showIssues, showTips }}>
    <div className="space-y-6">
        <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Here is what your resume looks like when parsed
        </h2>
        <div className="flex items-center gap-3">
          {showIssues && (
            <button
              type="button"
              onClick={() => setShowTips((v) => !v)}
              className="rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
            >
              {showTips ? "Hide tips" : "Show tips"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowIssues((v) => !v)}
            className="rounded border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            {showIssues ? "Hide errors" : "Show errors"}
          </button>
        </div>
      </div>

      <ScoreCard grade={grade} />

      <Section title="Parse quality" issues={[...metaIssues, ...rawTextIssues]}>
        <div className="grid gap-1.5 sm:grid-cols-2">
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

      <Section title="Personal info">
        <div className="space-y-1.5">
          <div className="flex gap-2 text-sm">
            <div className="w-32 shrink-0 text-neutral-500">Name</div>
            <div className="min-w-0 space-y-0.5">
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

      <Section title="Contact" issues={contactIssues.section}>
        <div className="grid gap-1.5 sm:grid-cols-2">
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
        title={`Education (${education.length})`}
        issues={educationReview.section}
      >
        {education.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {education.map((ed, i) => {
              const edIssues = educationReview.entries[i];
              return (
                <Card key={i}>
                  <div className="text-sm font-medium">
                    {ed.institution || <Empty />}
                  </div>
                  <IssueList issues={edIssues.institution} />
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
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title={`Work experience (${workExperience.length})`}
        issues={workReview.section}
      >
        {workExperience.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {workExperience.map((we, i) => {
              const weIssues = workReview.entries[i];
              return (
                <Card key={i}>
                  <div className="text-sm font-medium">
                    {we.jobTitle || <Empty />}
                  </div>
                  <IssueList issues={weIssues.jobTitle} />
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
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title={`Projects (${projects.length})`}
        issues={projectReview.section}
      >
        {projects.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {projects.map((p, i) => {
              const pIssues = projectReview.entries[i];
              return (
                <Card key={i}>
                  <div className="text-sm font-medium">
                    {p.title || <Empty />}
                  </div>
                  <IssueList issues={pIssues.title} />
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
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={`Skills (${skills.length}) - hover to see more details, skills section not automatically reviewed for issues`}>
        {skills.length === 0 ? (
          <Empty />
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {skills.map((s, i) => (
              <SkillPill key={i} skill={s} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title={`Achievements (${achievements.length})`}
        issues={achievementsReview.section}
      >
        {achievements.length === 0 ? (
          <Empty />
        ) : (
          <ul className="list-disc list-inside space-y-0.5 text-sm">
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
          <div className="space-y-1.5">
            {otherTopLevel.map(([k, v]) => (
              <Field key={k} label={labelize(k)} value={v} />
            ))}
          </div>
        </Section>
      )}

      {meta && Object.keys(meta).length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            Parse metadata
          </summary>
          <div className="mt-2">
            <GenericValue value={meta} />
          </div>
        </details>
      )}

      {typeof data.rawText === "string" && data.rawText && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            Raw extracted text
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 dark:bg-neutral-900 p-2 text-xs">
            {data.rawText}
          </pre>
        </details>
      )}

      {typeof data.redactedText === "string" && data.redactedText && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold">
            Redacted text
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 dark:bg-neutral-900 p-2 text-xs">
            {data.redactedText}
          </pre>
        </details>
      )}

      <hr />

      <h2 className="text-sm font-semibold">
        Raw json from resume parser
      </h2>
      <pre className="text-xs overflow-auto max-h-96 bg-neutral-100 dark:bg-neutral-900 p-2 rounded">
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
    </ShowIssuesContext.Provider>
  );
}
