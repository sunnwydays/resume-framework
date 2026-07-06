// JSON Schemas for structured outputs (output_config.format).
// All objects use additionalProperties: false + required, per API constraints.

const str = { type: "string" } as const;
const num = { type: "integer" } as const;
const strArray = { type: "array", items: str } as const;

export const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: str,
    contact: str,
    summary: str,
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: { title: str, items: strArray },
        required: ["title", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "contact", "summary", "sections"],
  additionalProperties: false,
};

export const KEYWORD_SCHEMA = {
  type: "object",
  properties: {
    keywords: strArray,
    required_skills: strArray,
    role_summary: str,
  },
  required: ["keywords", "required_skills", "role_summary"],
  additionalProperties: false,
};

export const GAP_SCHEMA = {
  type: "object",
  properties: {
    present_and_strong: strArray,
    present_but_undersold: strArray,
    missing_entirely: strArray,
    present_but_irrelevant: strArray,
    strategic_brief: str,
  },
  required: [
    "present_and_strong",
    "present_but_undersold",
    "missing_entirely",
    "present_but_irrelevant",
    "strategic_brief",
  ],
  additionalProperties: false,
};

export const SENTIMENT_SCHEMA = {
  type: "object",
  properties: {
    tone_ok: { type: "boolean" },
    issues: strArray,
    vibe_match_score: num,
    replacements: {
      type: "array",
      items: {
        type: "object",
        properties: { original: str, revised: str },
        required: ["original", "revised"],
        additionalProperties: false,
      },
    },
  },
  required: ["tone_ok", "issues", "vibe_match_score", "replacements"],
  additionalProperties: false,
};

export const RECRUITER_SCHEMA = {
  type: "object",
  properties: {
    approved: { type: "boolean" },
    scores: {
      type: "object",
      properties: {
        jd_alignment: num,
        clarity: num,
        impact: num,
        ats_keywords: num,
      },
      required: ["jd_alignment", "clarity", "impact", "ats_keywords"],
      additionalProperties: false,
    },
    section_scores: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: str,
          score: num,
          weak_items: {
            type: "array",
            items: {
              type: "object",
              properties: { index: num, reason: str },
              required: ["index", "reason"],
              additionalProperties: false,
            },
          },
        },
        required: ["section", "score", "weak_items"],
        additionalProperties: false,
      },
    },
    missing_keywords: strArray,
    weak_bullets: {
      type: "array",
      items: {
        type: "object",
        properties: { section: str, index: num, reason: str },
        required: ["section", "index", "reason"],
        additionalProperties: false,
      },
    },
    structural_issues: strArray,
    critical_flags: strArray,
    summary_note: str,
  },
  required: [
    "approved",
    "scores",
    "section_scores",
    "missing_keywords",
    "weak_bullets",
    "structural_issues",
    "critical_flags",
    "summary_note",
  ],
  additionalProperties: false,
};
