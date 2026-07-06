// Prompt assembly for every agent in the pipeline.
// Slider values are 0..1 floats mapped to concrete prompt directives here.

import type {
  GapAnalysis,
  KeywordExtraction,
  PresetKey,
  RecruiterResult,
  ResumeJson,
  SentimentResult,
  Settings,
} from "./types";

export const PRESETS: Record<
  PresetKey,
  { label: string; recruiterLens: string; vibeSeed: string }
> = {
  software: {
    label: "Software Engineering",
    recruiterLens:
      "You are a senior technical recruiter for software engineering roles. Weight technical depth, scope of systems owned, and measurable outcomes most heavily. Penalize vague claims of impact without technical specifics.",
    vibeSeed: "Clear, results-driven, technically specific",
  },
  product: {
    label: "Product Management",
    recruiterLens:
      "You are a senior recruiter for product management roles. Weight cross-functional influence, metrics, and user outcomes most heavily.",
    vibeSeed: "Strategic, outcome-focused, concise",
  },
  design: {
    label: "Design",
    recruiterLens:
      "You are a senior recruiter for design roles. Weight craft, process, user empathy, and business impact most heavily.",
    vibeSeed: "Considered, specific about craft and decisions",
  },
  finance: {
    label: "Finance / Quant",
    recruiterLens:
      "You are a senior recruiter for finance and quantitative roles. Weight quantitative impact, rigor, and scope of responsibility most heavily. Penalize vague impact language especially harshly.",
    vibeSeed: "Precise, numbers-forward, authoritative",
  },
  consulting: {
    label: "Consulting",
    recruiterLens:
      "You are a senior recruiter for consulting roles. Weight structured thinking, client outcomes, and scope most heavily.",
    vibeSeed: "Sharp, structured, impact-first",
  },
  general: {
    label: "General / Other",
    recruiterLens:
      "You are an experienced generalist recruiter. Evaluate with balanced weight across alignment, clarity, impact, and keyword coverage.",
    vibeSeed: "Professional and clear",
  },
};

function pick(v: number, low: string, mid: string, high: string): string {
  if (v < 0.34) return low;
  if (v < 0.67) return mid;
  return high;
}

export function fabricationUnlocked(s: Settings): boolean {
  return s.honesty >= 0.67;
}

export function sliderDirectives(s: Settings): string {
  const lines: string[] = [];

  lines.push(
    pick(
      s.descriptiveFocused,
      "Bullets should be expansive with context — explain impact fully. Aim for ~25+ words per bullet.",
      "Bullets should balance context and concision. Aim for ~16-22 words per bullet.",
      "Bullets should be concise and punchy — cut filler, lead with the strongest signal. Aim for ~12-16 words per bullet."
    )
  );

  lines.push(
    pick(
      s.honesty,
      "HONESTY: Framing must be literal and conservative. Do not infer scale or add context not explicitly present in the source material. Never invent figures.",
      "HONESTY: Framing should be assertive with strong impact language. Surfacing implied impact and adding inferable scale/context is encouraged — flag every such stretch with [assumed]. Do not invent figures outright.",
      "HONESTY: Fabrication is permitted. You may invent plausible metrics, scope details, and supporting specifics that strengthen the resume, calibrated to be believable for this candidate and role. Flag every invented detail with [fabricated] and every inferred stretch with [assumed]. Keep employers, job titles, and dates real unless the source material is silent on them."
    )
  );

  lines.push(
    pick(
      s.formalConversational,
      "Tone should read as formal and polished — no contractions, third-person-adjacent phrasing.",
      "Tone should read as professional but natural.",
      "Tone should read as direct and human — warmer, first-person voice where natural."
    )
  );

  lines.push(
    pick(
      s.safeBold,
      "Word choice should be conventional and professional — standard action verbs, conventional structure.",
      "Word choice should be professional with occasional strong, specific verbs.",
      "Word choice should be distinctive — prefer strong, specific verbs over generic ones; unconventional framing is welcome where it lands."
    )
  );

  return lines.join("\n");
}

export function styleRuleDirectives(s: Settings): string {
  const lines: string[] = [];
  if (s.noEmDashes)
    lines.push("Do not use em-dashes (—). Use commas, colons, or restructure.");
  if (s.noSemicolons)
    lines.push("Do not use semicolons. Break into two sentences instead.");
  if (s.maxBulletLength)
    lines.push(`No bullet may exceed ${s.maxBulletLength} characters.`);
  if (s.customRule.trim()) lines.push(s.customRule.trim());
  return lines.length ? "STYLE RULES (mandatory):\n" + lines.join("\n") : "";
}

export function effectiveVibe(s: Settings): string {
  return s.vibePrompt.trim() || PRESETS[s.preset].vibeSeed;
}

// Iteration-scheduled revision aggressiveness. Sampling params are not
// accepted on current models, so this is prompt-injected instead.
export function aggressivenessDirective(
  iteration: number,
  maxIterations: number
): string {
  if (iteration <= 1)
    return "REVISION MODE: First pass — creative restructuring is allowed. Reorganize sections, rewrite bullets from scratch, and make bold framing choices where they serve the job description.";
  if (iteration >= maxIterations || iteration >= 3)
    return "REVISION MODE: Final tightening pass — be conservative. Make surgical edits only to the specific items flagged by the recruiter. Do NOT restructure sections or rewrite bullets that were not flagged.";
  return "REVISION MODE: Refinement pass — moderate changes. Focus on flagged items; avoid restructuring unless a structural issue was explicitly flagged.";
}

// ---------- Agent prompt builders ----------

export function keywordExtractionPrompt(jd: string): {
  system: string;
  user: string;
} {
  return {
    system:
      "You are a job-description analyst. Extract the most important signals a recruiter and ATS would screen for. Return only what the schema asks for.",
    user: `Extract the 10-15 most important keywords and the explicitly required skills from this job description, plus a one-paragraph summary of the role.\n\n<job_description>\n${jd}\n</job_description>`,
  };
}

export function gapAnalysisPrompt(
  resume: string,
  extraDetails: string,
  jd: string,
  keywords: KeywordExtraction
): { system: string; user: string } {
  return {
    system:
      "You are a career strategist. Compare a candidate's raw materials to a job description and produce a strategic gap analysis. Be concrete and specific — name the exact experiences, skills, and keywords involved.",
    user: `Compare this resume (and additional details, if provided) against the job description. Classify the candidate's material into: present and strong, present but undersold, missing entirely, present but irrelevant. Then write a strategic brief for a resume writer: where to focus, what to amplify, what to cut.

<job_description>
${jd}
</job_description>

<jd_keywords>
${keywords.keywords.join(", ")}
Required skills: ${keywords.required_skills.join(", ")}
</jd_keywords>

<resume>
${resume}
</resume>
${extraDetails.trim() ? `\n<additional_candidate_details>\n${extraDetails}\n</additional_candidate_details>` : ""}`,
  };
}

export interface ReviserContext {
  settings: Settings;
  jd: string;
  keywords: KeywordExtraction;
  gap: GapAnalysis;
  rawResume: string;
  extraDetails: string;
  iteration: number;
  previousResume: ResumeJson | null;
  previousDiffSummary: string | null;
  recruiterFeedback: RecruiterResult | null;
  sentimentFeedback: SentimentResult | null;
  userFeedback: string | null;
}

export function reviserPrompt(ctx: ReviserContext): {
  system: string;
  user: string;
} {
  const s = ctx.settings;
  const base = s.userSystemPrompt.trim()
    ? s.userSystemPrompt.trim()
    : `You are an expert resume writer. Rewrite resume content to match the target job description while following all tone and style directives exactly. Never modify employers, job titles, or dates unless the honesty directive explicitly permits fabrication. Distribute the JD keywords naturally — never keyword-stuff.`;

  const system = [
    base,
    `TARGET VIBE: ${effectiveVibe(s)}`,
    sliderDirectives(s),
    styleRuleDirectives(s),
    aggressivenessDirective(ctx.iteration, s.maxIterations),
    `Output the complete revised resume in the required JSON shape. Every section item is one bullet string.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts: string[] = [];
  parts.push(`<job_description>\n${ctx.jd}\n</job_description>`);
  parts.push(
    `<jd_keywords>\nWork these in naturally where truthful/permitted: ${ctx.keywords.keywords.join(", ")}\nRequired skills: ${ctx.keywords.required_skills.join(", ")}\n</jd_keywords>`
  );
  parts.push(
    `<gap_analysis>\nStrategic brief: ${ctx.gap.strategic_brief}\nUndersold (amplify): ${ctx.gap.present_but_undersold.join("; ") || "none"}\nMissing from resume: ${ctx.gap.missing_entirely.join("; ") || "none"}\nIrrelevant (trim): ${ctx.gap.present_but_irrelevant.join("; ") || "none"}\n</gap_analysis>`
  );
  parts.push(`<original_resume>\n${ctx.rawResume}\n</original_resume>`);
  if (ctx.extraDetails.trim())
    parts.push(
      `<additional_candidate_details>\n${ctx.extraDetails}\n</additional_candidate_details>`
    );

  if (ctx.previousResume) {
    parts.push(
      `<your_previous_version>\n${JSON.stringify(ctx.previousResume, null, 2)}\n</your_previous_version>`
    );
  }
  if (ctx.previousDiffSummary) {
    parts.push(
      `<what_you_changed_last_iteration>\n${ctx.previousDiffSummary}\n</what_you_changed_last_iteration>`
    );
  }
  if (ctx.recruiterFeedback) {
    const r = ctx.recruiterFeedback;
    parts.push(
      `<recruiter_critique>
Overall: JD alignment ${r.scores.jd_alignment}/10, clarity ${r.scores.clarity}/10, impact ${r.scores.impact}/10, ATS ${r.scores.ats_keywords}/10
Per-section: ${r.section_scores.map((ss) => `${ss.section} ${ss.score}/10${ss.weak_items.length ? ` (weak items: ${ss.weak_items.map((w) => `#${w.index + 1} ${w.reason}`).join("; ")})` : ""}`).join(" | ")}
Missing keywords: ${r.missing_keywords.join(", ") || "none"}
Weak bullets: ${r.weak_bullets.map((w) => `${w.section} #${w.index + 1}: ${w.reason}`).join("; ") || "none"}
Structural issues: ${r.structural_issues.join("; ") || "none"}
Critical flags: ${r.critical_flags.join("; ") || "none"}
Note: ${r.summary_note}
Fix the flagged items specifically. Items that were NOT flagged are working — keep them.
</recruiter_critique>`
    );
  }
  if (ctx.sentimentFeedback && !ctx.sentimentFeedback.tone_ok) {
    const sf = ctx.sentimentFeedback;
    parts.push(
      `<tone_feedback>\nIssues: ${sf.issues.join("; ")}\nApply these replacements (or equivalent rewrites): ${sf.replacements.map((rp) => `"${rp.original}" -> "${rp.revised}"`).join("; ")}\n</tone_feedback>`
    );
  }
  if (ctx.userFeedback) {
    parts.push(
      `<user_feedback>\nThe candidate reviewed the resume and asks: ${ctx.userFeedback}\n</user_feedback>`
    );
  }
  parts.push("Produce the revised resume now.");
  return { system, user: parts.join("\n\n") };
}

export function sentimentPrompt(
  s: Settings,
  resume: ResumeJson
): { system: string; user: string } {
  const base = s.userSystemPrompt.trim()
    ? s.userSystemPrompt.trim()
    : "You are a tone and sentiment checker for resumes.";
  const system = [
    base,
    `Check that the resume's tone matches the target vibe and slider settings below. Flag: passive voice overuse, hedging language ("helped with", "assisted in"), filler phrases, and tone mismatch with the vibe or industry.`,
    `TARGET VIBE: ${effectiveVibe(s)}`,
    sliderDirectives(s),
    `Cross-check the descriptive/focused directive: if bullets are thinner or more verbose than directed, flag it. Score vibe match 0-10. If tone is acceptable overall, set tone_ok true even with minor issues; set tone_ok false only when issues materially conflict with the directives. Provide concrete replacement suggestions for each issue.`,
  ].join("\n\n");
  return {
    system,
    user: `<resume>\n${JSON.stringify(resume, null, 2)}\n</resume>\n\nEvaluate the tone now.`,
  };
}

export function recruiterPrompt(
  s: Settings,
  resume: ResumeJson,
  jd: string,
  keywords: KeywordExtraction
): { system: string; user: string } {
  // Recruiter logic is NOT user-configurable and ignores tone preferences.
  const system = [
    PRESETS[s.preset].recruiterLens,
    `Evaluate the resume purely on professional effectiveness against the job description — do not apply any tone preferences.
Score 0-10 on: JD alignment, clarity, impact language, ATS keyword coverage.
Also score each resume section 0-10 and list weak items by zero-based index with a specific reason.
List: missing JD keywords, weak bullets (section + zero-based index + reason), structural issues, and critical flags (dealbreakers only).
Treat [assumed]/[fabricated]/[TRIMMED] markers as invisible annotation — do not penalize their presence.
Approve (approved: true) only if ALL four overall scores are >= 7 AND there are no critical flags.
Be specific in every reason — the resume writer will act on your critique verbatim.`,
  ].join("\n\n");
  return {
    system,
    user: `<job_description>\n${jd}\n</job_description>\n\n<jd_keywords>\n${keywords.keywords.join(", ")}\n</jd_keywords>\n\n<resume>\n${JSON.stringify(resume, null, 2)}\n</resume>\n\nEvaluate now.`,
  };
}
