import type { EmailKind } from "@/lib/tracker/format";

// Job-related emails get a tint, a coloured left edge and a matching pill, in
// the colours of the status each kind suggests. Shared by the dev inspector
// and the review tab.
export const KIND_TONE: Record<EmailKind, { row: string; edge: string; pill: string }> = {
  confirmation: {
    row: "bg-blue-50/60 dark:bg-blue-950/25",
    edge: "border-l-blue-400",
    pill: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  rejection: {
    row: "bg-red-50/60 dark:bg-red-950/25",
    edge: "border-l-red-400",
    pill: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  oa_invite: {
    row: "bg-sky-50/60 dark:bg-sky-950/25",
    edge: "border-l-sky-400",
    pill: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  video_invite: {
    row: "bg-indigo-50/60 dark:bg-indigo-950/25",
    edge: "border-l-indigo-400",
    pill: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
  interview_invite: {
    row: "bg-violet-50/60 dark:bg-violet-950/25",
    edge: "border-l-violet-400",
    pill: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
  assessment_done: {
    row: "bg-teal-50/60 dark:bg-teal-950/25",
    edge: "border-l-teal-400",
    pill: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  },
  reminder: {
    row: "bg-amber-50/60 dark:bg-amber-950/25",
    edge: "border-l-amber-400",
    pill: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};
