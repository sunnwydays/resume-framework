// Masters / PhD-only postings, read from the title. Hidden by default (Sunny
// is an undergrad); MBA is left out on purpose, and a title that also names an
// undergrad route ("[UG/Masters]") isn't flagged.

export const DEGREE_RULES = {
  grad: /\bmasters?\b|\bmaster['’]s\b|\bMS\b|\bph\.?d\b|\bdoctoral\b|\bgraduate students?\b|\(graduate\)/i,
  undergrad: /\bbachelors?\b|\bbachelor['’]s\b|\bundergrad\w*|\bUG\b|\bBS\b/i,
};

// Why the title is a grad-degree role (the matched words), or null.
export function postingGradDegree(role: string): string | null {
  const hit = DEGREE_RULES.grad.exec(role);
  if (!hit || DEGREE_RULES.undergrad.test(role)) return null;
  return `The title says "${hit[0]}"`;
}
