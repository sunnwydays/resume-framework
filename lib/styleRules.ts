// Code-enforced style rules — the post-processing safety net behind the
// prompt-injected directives. Returns an audit log of every fix applied.

import type { ResumeJson, Settings, StyleFix } from "./types";

function fixEmDashes(text: string): string {
  // Heuristic: em-dash between clauses -> comma; before a list/expansion -> colon.
  return text.replace(/\s*—\s*/g, (m, offset: number, full: string) => {
    const after = full.slice(offset + m.length);
    return /^(including|such as|like|e\.g\.|for example)/i.test(after)
      ? ": "
      : ", ";
  });
}

function fixSemicolons(text: string): string {
  return text.replace(/;\s*/g, (_m, offset: number, full: string) => {
    void offset;
    void full;
    return ". ";
  }).replace(/\.\s+([a-z])/g, (_m, c: string) => `. ${c.toUpperCase()}`);
}

function truncateBullet(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd() + " [TRIMMED]";
}

export function applyStyleRules(
  resume: ResumeJson,
  settings: Settings
): { resume: ResumeJson; fixes: StyleFix[] } {
  const fixes: StyleFix[] = [];

  const process = (text: string, isBullet: boolean): string => {
    let out = text;
    if (settings.noEmDashes && out.includes("—")) {
      const before = out;
      out = fixEmDashes(out);
      fixes.push({ rule: "no-em-dashes", before, after: out });
    }
    if (settings.noSemicolons && out.includes(";")) {
      const before = out;
      out = fixSemicolons(out);
      fixes.push({ rule: "no-semicolons", before, after: out });
    }
    if (isBullet && settings.maxBulletLength && out.length > settings.maxBulletLength) {
      const before = out;
      out = truncateBullet(out, settings.maxBulletLength);
      fixes.push({ rule: "max-bullet-length", before, after: out });
    }
    return out;
  };

  const result: ResumeJson = {
    ...resume,
    summary: process(resume.summary, false),
    sections: resume.sections.map((sec) => ({
      title: sec.title,
      items: sec.items.map((item) => process(item, true)),
    })),
  };

  return { resume: result, fixes };
}
