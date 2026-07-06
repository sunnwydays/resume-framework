// Section/bullet-level diff between two resume versions, for the iteration
// log UI and for feeding "what you changed last iteration" back to the Reviser.

import type { DiffEntry, ResumeJson } from "./types";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function diffResumes(prev: ResumeJson, next: ResumeJson): DiffEntry[] {
  const entries: DiffEntry[] = [];

  if (normalize(prev.summary) !== normalize(next.summary)) {
    entries.push({
      section: "Summary",
      kind: "changed",
      before: prev.summary,
      after: next.summary,
    });
  }

  const prevSections = new Map(prev.sections.map((s) => [s.title.toLowerCase(), s]));
  const nextSections = new Map(next.sections.map((s) => [s.title.toLowerCase(), s]));

  for (const [key, sec] of nextSections) {
    const old = prevSections.get(key);
    if (!old) {
      entries.push({ section: sec.title, kind: "added", after: `${sec.items.length} items` });
      continue;
    }
    const oldNorm = old.items.map(normalize);
    const newNorm = sec.items.map(normalize);
    const oldSet = new Set(oldNorm);
    const newSet = new Set(newNorm);

    sec.items.forEach((item, i) => {
      if (!oldSet.has(newNorm[i])) {
        // Pair with a removed item at the same position as a "changed" if one exists.
        const oldAtI = old.items[i];
        if (oldAtI && !newSet.has(oldNorm[i])) {
          entries.push({ section: sec.title, kind: "changed", before: oldAtI, after: item });
        } else {
          entries.push({ section: sec.title, kind: "added", after: item });
        }
      }
    });
    old.items.forEach((item, i) => {
      if (!newSet.has(oldNorm[i]) && !(sec.items[i] && !oldSet.has(newNorm[i]))) {
        entries.push({ section: sec.title, kind: "removed", before: item });
      }
    });
  }

  for (const [key, sec] of prevSections) {
    if (!nextSections.has(key)) {
      entries.push({ section: sec.title, kind: "removed", before: `entire section (${sec.items.length} items)` });
    }
  }

  return entries;
}

export function diffSummaryText(diff: DiffEntry[]): string {
  if (!diff.length) return "No changes.";
  return diff
    .map((d) => {
      if (d.kind === "changed")
        return `[${d.section}] changed: "${d.before}" -> "${d.after}"`;
      if (d.kind === "added") return `[${d.section}] added: "${d.after}"`;
      return `[${d.section}] removed: "${d.before}"`;
    })
    .join("\n");
}
