"use client";

import { GradeTone, SeverityCounts } from "@/lib/atsGrade";
import { AtsReport, sectionId } from "@/lib/atsReport";
import { TONE_STYLES } from "@/components/AtsResult";
import { useEffect, useRef, useState } from "react";

interface Props {
  report: AtsReport | null;
  // Grid placement for the lg+ rail, owned by the page layout.
  railClassName?: string;
}

// Anchor ids that live outside the graded sections. The graded ones use
// sectionId(label) so they stay in sync with the <Section id> in AtsResult.
export const UPLOAD_ID = "upload";
export const SCORE_ID = "score";

interface NavItem {
  id: string;
  label: string;
  score?: { value: number; tone: GradeTone }; // Score item only
  count?: number;           // list sections: entries found
  counts?: SeverityCounts;  // reviewed sections: drives the dot + hover text
}

// How far below the viewport top a section heading has to be before it
// counts as "current". Roughly the mobile strip height plus a little slack.
const ACTIVE_OFFSET = 96;

function navItems(report: AtsReport | null): NavItem[] {
  const counts = (label: string) =>
    report?.grade.sections.find((s) => s.label === label)?.counts;

  return [
    { id: UPLOAD_ID, label: "Upload" },
    {
      id: SCORE_ID,
      label: "Score",
      score: report ? { value: report.grade.score, tone: report.grade.band.tone } : undefined,
    },
    { id: sectionId("Parse quality"), label: "Parse quality", counts: counts("Parse quality") },
    { id: sectionId("Personal info"), label: "Personal info", counts: counts("Personal info") },
    { id: sectionId("Contact"), label: "Contact", counts: counts("Contact") },
    { id: sectionId("Education"), label: "Education", count: report?.education.length, counts: counts("Education") },
    { id: sectionId("Work experience"), label: "Work experience", count: report?.workExperience.length, counts: counts("Work experience") },
    { id: sectionId("Projects"), label: "Projects", count: report?.projects.length, counts: counts("Projects") },
    { id: sectionId("Skills"), label: "Skills", count: report?.skills.length },
    { id: sectionId("Achievements"), label: "Achievements", count: report?.achievements.length, counts: counts("Achievements") },
    { id: sectionId("Raw output"), label: "Raw output" },
  ];
}

function countsTitle(counts: SeverityCounts): string {
  const parts = (["critical", "minor", "info"] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${s}`);
  return parts.length ? parts.join(" · ") : "No issues";
}

function Badge({ item }: { item: NavItem }) {
  if (item.score) {
    return (
      <span className={`tabular-nums font-medium ${TONE_STYLES[item.score.tone].text}`}>
        {item.score.value}
      </span>
    );
  }

  const dot =
    item.counts && item.counts.critical > 0
      ? "bg-red-500"
      : item.counts && item.counts.minor > 0
        ? "bg-amber-500"
        : null;

  if (item.count === undefined && !dot) return null;
  return (
    <span
      className="flex items-center gap-1.5 tabular-nums text-neutral-400 dark:text-neutral-500"
      title={item.counts ? countsTitle(item.counts) : undefined}
    >
      {item.count !== undefined && <span>{item.count}</span>}
      {dot && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
    </span>
  );
}

export default function SectionNav({ report, railClassName = "" }: Props) {
  const [spied, setActive] = useState(UPLOAD_ID);
  const stripRef = useRef<HTMLUListElement>(null);
  const items = navItems(report);
  // Before a parse there's only one place to be.
  const active = report ? spied : UPLOAD_ID;

  // Scroll-spy: the current section is the last one whose heading has
  // scrolled past the offset, or the last item once we're at the bottom
  // (the raw output never reaches the top of a tall viewport otherwise).
  useEffect(() => {
    if (!report) return;
    const ids = navItems(report).map((i) => i.id);
    let raf = 0;

    const update = () => {
      raf = 0;
      const doc = document.documentElement;
      const atBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;
      if (atBottom) {
        setActive(ids[ids.length - 1]);
        return;
      }
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= ACTIVE_OFFSET) current = id;
      }
      setActive(current);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [report]);

  // Keep the active pill visible in the horizontally scrolling strip. Done
  // by hand rather than scrollIntoView: the strip is sticky, and Chrome
  // scrolls the *page* to a sticky child's static position, which yanks the
  // page back to the strip's original spot every time the active item changes.
  useEffect(() => {
    const list = stripRef.current;
    const pill = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !pill) return;
    const pad = 20; // matches the strip's horizontal padding
    const left = pill.offsetLeft - pad;
    const right = pill.offsetLeft + pill.offsetWidth - list.clientWidth + pad;
    if (list.scrollLeft > left) list.scrollTo({ left, behavior: "smooth" });
    else if (list.scrollLeft < right) list.scrollTo({ left: right, behavior: "smooth" });
  }, [active]);

  // Only Upload is reachable before a parse — the rest have nothing to
  // point at yet, so they're shown muted and inert.
  const isLive = (item: NavItem) => item.id === UPLOAD_ID || report !== null;

  return (
    <>
      {/* lg+: sticky rail beside the content */}
      <nav
        aria-label="Page sections"
        className={`hidden lg:block sticky top-6 self-start ${railClassName}`}
      >
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          On this page
        </div>
        <ul className="border-l border-neutral-200 dark:border-neutral-800">
          {items.map((item) => {
            const current = active === item.id;
            const rowCls = `-ml-px flex items-center justify-between gap-2 border-l-2 py-1 pl-3 pr-1 text-[13px] leading-5 ${
              current
                ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                : "border-transparent"
            }`;
            return (
              <li key={item.id}>
                {isLive(item) ? (
                  <a
                    href={`#${item.id}`}
                    aria-current={current ? "location" : undefined}
                    className={`${rowCls} ${
                      current ? "" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <Badge item={item} />
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`${rowCls} text-neutral-400 dark:text-neutral-600`}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* < lg: sticky strip under the header, scrolls sideways */}
      <div className="lg:hidden sticky top-0 z-20 -mx-5 sm:-mx-6 mb-10 border-b border-neutral-200 dark:border-neutral-800 bg-background/95 backdrop-blur">
        <nav aria-label="Page sections">
          <ul
            ref={stripRef}
            className="relative flex gap-4 overflow-x-auto px-5 sm:px-6 text-xs whitespace-nowrap scrollbar-none"
          >
            {items.map((item) => {
              const current = active === item.id;
              const pillCls = `-mb-px flex items-center gap-1.5 border-b-2 py-2 ${
                current
                  ? "border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100"
                  : "border-transparent"
              }`;
              return (
                <li key={item.id} className="shrink-0">
                  {isLive(item) ? (
                    <a
                      href={`#${item.id}`}
                      aria-current={current ? "location" : undefined}
                      className={`${pillCls} ${
                        current ? "" : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                      }`}
                    >
                      {item.label}
                      <Badge item={item} />
                    </a>
                  ) : (
                    <span
                      aria-disabled="true"
                      className={`${pillCls} text-neutral-400 dark:text-neutral-600`}
                    >
                      {item.label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}
