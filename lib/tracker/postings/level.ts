// Who a posting is for: an intern (co-ops count as interns), a new grad, or someone with
// experience. Read from the title ("Software Engineer Graduate - 2027 Start",
// "Entry-Level Software Engineer") and, when the title says nothing, from the
// posting page (`level_text`: Jobright's seniority and employment type, "New
// Grad · Full-time"). Derived every render, like term and length.

export type Level = "intern" | "grad" | "experienced" | "unstated";

export const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: "intern", label: "Intern", hint: "Internships, co-ops and student roles" },
  { key: "grad", label: "New grad", hint: "New grad, graduate, entry level, early career, junior" },
  { key: "experienced", label: "Experienced", hint: "Mid level and up" },
  { key: "unstated", label: "Level not stated", hint: "Neither the title nor the posting page says" },
];

// Checked in this order, so the lowest level named wins: "Junior Developer
// Co-op" is a co-op, and a page's "New Grad, Mid Level" is new grad.
const RULES: [Exclude<Level, "unstated">, RegExp][] = [
  ["intern", /\b(?:interns?|internships?|co-?ops?|students?|stagiaires?|apprentices?|apprenticeships?)\b/i],
  // "Graduate" but not "Undergrad" (a co-op title's eligibility note).
  ["grad", /\bnew[\s-]?grads?\b|\bgraduates?\b|\bentry[\s-]?level\b|\bearly[\s-]?careers?\b|\bjunior\b|\bjr\b/i],
  ["experienced", /\b(?:senior|sr|staff|principal|lead|manager|director|architect|executive|mid[\s-]?level)\b|\bhead of\b/i],
];
// "Software Engineer II", case-sensitive so "ii" in a word never counts.
const NUMBERED = /\b(?:II|III|IV)\b/;

// Sort order: internships first, then new grad, experienced, and not stated last.
export const LEVEL_ORDER: Record<Level, number> = { intern: 0, grad: 1, experienced: 2, unstated: 3 };

export interface LevelResult {
  level: Level;
  why: string;
}

// The level and the word that gave it away.
function levelOf(text: string): { level: Exclude<Level, "unstated">; word: string } | null {
  for (const [level, re] of RULES) {
    const m = re.exec(text);
    if (m) return { level, word: m[0] };
  }
  const numbered = NUMBERED.exec(text);
  return numbered ? { level: "experienced", word: numbered[0] } : null;
}

// The title first, then what the posting page says.
export function postingLevel(role: string, levelText?: string | null): LevelResult {
  const fromTitle = levelOf(role);
  if (fromTitle) return { level: fromTitle.level, why: `Title says "${fromTitle.word}"` };
  if (!levelText) return { level: "unstated", why: "The title doesn't say, and the posting page hasn't been read or doesn't say" };
  const fromPage = levelOf(levelText);
  if (fromPage) return { level: fromPage.level, why: `Posting page says "${levelText}"` };
  return { level: "unstated", why: `Posting page says "${levelText}", which doesn't name a level` };
}

export const levelLabel = (level: Level) => LEVELS.find((l) => l.key === level)!.label;
