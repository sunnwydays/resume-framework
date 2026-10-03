// Role types, derived from the free-text role (never stored). The rules are
// tuned to how roles actually get typed here ("swe", "sde", "swd", "front end
// swe", "be", "mle", "robo"…); to fix a misfiled role, edit the patterns.
// Order matters: the first match wins, so specific types sit above the
// general SWE catch-all ("swe robo" is Robotics, "swe ml" is ML / AI).

export const ROLE_TYPES = [
  { key: "robotics", label: "Robotics & autonomy", pattern: /\b(robo(tics?)?|autonom\w*)\b/ },
  { key: "data", label: "Data", pattern: /\b(data (scien\w*|eng\w*|analy\w*)|analyst)\b/ },
  { key: "research", label: "Research", pattern: /\bresearch\w*\b/ },
  {
    key: "ml",
    label: "ML / AI",
    pattern: /\b(mle|ml|machine learning|ai|llms?|deep learning|cv|computer vision)\b/,
  },
  { key: "embedded", label: "Embedded", pattern: /\b(embedded|firmware|hardware|fpga)\b/ },
  { key: "mobile", label: "Mobile", pattern: /\b(mobile|ios|android)\b/ },
  {
    key: "infra",
    label: "Infra & security",
    pattern: /\b(security|infra\w*|sre|site reliability|devops|cloud|platform|network\w*|db|databases?)\b/,
  },
  { key: "fullstack", label: "Full stack", pattern: /\bfullstack\b/ },
  { key: "frontend", label: "Frontend & web", pattern: /\b(frontend|fe|web|ui)\b/ },
  { key: "backend", label: "Backend", pattern: /\b(backend|be|api)\b/ },
  { key: "qa", label: "QA & test", pattern: /\b(validation|qa|test\w*|sdet|quality)\b/ },
  {
    key: "solutions",
    label: "Solutions & product",
    pattern: /\b(solutions?|product eng\w*|forward deployed|fde|sales eng\w*)\b/,
  },
  {
    key: "swe",
    label: "SWE (general)",
    pattern: /\b(swe|sde|swd|sd|sw|software|developer|dev|eng\w*|programmer)\b/,
  },
  { key: "other", label: "Other", pattern: null },
] as const;

export type RoleType = (typeof ROLE_TYPES)[number]["key"];

// Lowercase, join the split spellings ("front-end", "front end"), and turn
// punctuation into spaces so word boundaries work ("ai/ml" -> "ai ml").
export function normalizeRole(role: string): string {
  return role
    .toLowerCase()
    .replace(/front[\s-]*end/g, "frontend")
    .replace(/back[\s-]*end/g, "backend")
    .replace(/full[\s-]*stack/g, "fullstack")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function roleType(role: string): RoleType {
  const text = normalizeRole(role);
  for (const t of ROLE_TYPES) {
    if (t.pattern?.test(text)) return t.key;
  }
  return "other";
}

const LABELS = Object.fromEntries(ROLE_TYPES.map((t) => [t.key, t.label])) as Record<RoleType, string>;

export function roleTypeLabel(key: RoleType): string {
  return LABELS[key];
}

// Position in ROLE_TYPES, so sorting by type keeps related types together.
export const ROLE_TYPE_ORDER = Object.fromEntries(ROLE_TYPES.map((t, i) => [t.key, i])) as Record<RoleType, number>;
