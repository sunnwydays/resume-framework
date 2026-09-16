"use client";

import {
  AtsDateRange,
  AtsLocation,
  AtsParseResponse,
  AtsSkill,
} from "@/lib/types";
import { ReactNode } from "react";

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

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex gap-2 text-sm">
      <div className="w-32 shrink-0 text-neutral-500">{label}</div>
      <div className="min-w-0">
        <GenericValue value={value} />
      </div>
    </div>
  );
}

// Smaller nested label/value pair, used inside a Field's value to break a
// structured value (location, date range) into its individual source fields
// instead of collapsing them into one display string.
function SubField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex gap-2">
      <div className="w-28 shrink-0 text-neutral-500">{label}:</div>
      <div className="min-w-0">
        <GenericValue value={value} />
      </div>
    </div>
  );
}

const LOCATION_KNOWN = ["city", "state", "country", "countryCode", "formatted", "raw"];

function LocationRow({ label, loc }: { label: string; loc?: AtsLocation }) {
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
      </div>
    </div>
  );
}

function DateRangeRow({ label, range }: { label: string; range?: AtsDateRange }) {
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
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="border-b border-neutral-200 dark:border-neutral-800 pb-1 text-sm font-semibold">
        {title}
      </h3>
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
  if (!result) return null;
  if ("error" in result)
    return <p className="text-sm text-red-600">{String(result.error)}</p>;

  const { data, meta } = result;
  const contact = data.contact ?? { emails: [], phoneNumbers: [], websites: [] };
  const person = data.person ?? { name: {} };
  const education = data.education ?? [];
  const workExperience = data.workExperience ?? [];
  const projects = data.projects ?? [];
  const skills = data.skills ?? [];
  const achievements = data.achievements ?? [];

  const otherTopLevel = Object.entries(asRecord(data)).filter(
    ([k]) => !KNOWN_TOP_LEVEL.includes(k)
  );

  return (
    <div className="space-y-6">
      <h2 className="text-sm font-semibold">
        Raw json from resume parser
      </h2>
      <pre className="text-xs overflow-auto max-h-96 bg-neutral-100 dark:bg-neutral-900 p-2 rounded">
        {JSON.stringify(result, null, 2)}
      </pre>

      <hr />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Here is what your resume looks like when parsed
        </h2>
        {meta?.document != null && (
          <span className="text-xs text-neutral-500">
            <GenericValue value={meta.document} />
          </span>
        )}
      </div>

      <Section title="Contact & personal info">
        <div className="space-y-1.5">
          <div className="flex gap-2 text-sm">
            <div className="w-32 shrink-0 text-neutral-500">Name</div>
            <div className="min-w-0 space-y-0.5">
              <SubField label="First" value={person.name?.given} />
              <SubField label="Middle" value={person.name?.middle} />
              <SubField label="Last" value={person.name?.family} />
              <OtherFields
                obj={asRecord(person.name)}
                known={["given", "middle", "family"]}
              />
            </div>
          </div>
          <LocationRow label="Location" loc={person.location} />
          <div className="grid gap-1.5 sm:grid-cols-2">
            <Field
              label="Emails"
              value={contact.emails.length ? contact.emails : undefined}
            />
            <Field
              label="Phone numbers"
              value={
                contact.phoneNumbers.length ? contact.phoneNumbers : undefined
              }
            />
            <Field
              label="Websites"
              value={contact.websites.length ? contact.websites : undefined}
            />
          </div>
        </div>
        <OtherFields obj={asRecord(person)} known={["name", "location"]} />
        <OtherFields
          obj={asRecord(contact)}
          known={["emails", "phoneNumbers", "websites"]}
        />
      </Section>

      <Section title={`Education (${education.length})`}>
        {education.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {education.map((ed, i) => (
              <Card key={i}>
                <div className="text-sm font-medium">
                  {ed.institution || <Empty />}
                </div>
                <Field label="Qualification" value={ed.qualification} />
                <Field label="Level" value={ed.level} />
                <Field
                  label="Field(s) of study"
                  value={ed.fieldsOfStudy}
                />
                <DateRangeRow label="Dates" range={ed.dateRange} />
                <LocationRow label="Location" loc={ed.location} />
                <OtherFields
                  obj={asRecord(ed)}
                  known={[
                    "institution",
                    "level",
                    "qualification",
                    "fieldsOfStudy",
                    "dateRange",
                    "location",
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Work experience (${workExperience.length})`}>
        {workExperience.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {workExperience.map((we, i) => (
              <Card key={i}>
                <div className="text-sm font-medium">
                  {we.jobTitle || <Empty />}
                </div>
                <Field label="Organization" value={we.organization} />
                <Field label="Employment type" value={we.employmentType} />
                <DateRangeRow label="Dates" range={we.dateRange} />
                <LocationRow label="Location" loc={we.location} />
                <Field label="Description" value={we.description} />
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
            ))}
          </div>
        )}
      </Section>

      <Section title={`Projects (${projects.length})`}>
        {projects.length === 0 ? (
          <Empty />
        ) : (
          <div className="space-y-2">
            {projects.map((p, i) => (
              <Card key={i}>
                <div className="text-sm font-medium">
                  {p.title || <Empty />}
                </div>
                <DateRangeRow label="Dates" range={p.dateRange} />
                <Field label="Description" value={p.description} />
                <OtherFields
                  obj={asRecord(p)}
                  known={["title", "description", "dateRange"]}
                />
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Skills (${skills.length}) - hover to see more details`}>
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

      <Section title={`Achievements (${achievements.length})`}>
        {achievements.length === 0 ? (
          <Empty />
        ) : (
          <ul className="list-disc list-inside space-y-0.5 text-sm">
            {achievements.map((a, i) => (
              <li key={i}>{a}</li>
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
    </div>
  );
}
