import type * as feedback from "@/lib/tracker/feedback/client";

// Feedback capture for the demo: nothing is recorded, and nothing is read back
// (an empty list, so no dismissed row claims a reason it never had). A null id
// from recordFeedback hides the reason chips, which would have nowhere to save.
export const demoFeedback: typeof feedback = {
  recordFeedback: async () => null,
  recordFeedbackBatch: async () => {},
  markFeedbackUndone: async () => {},
  loadPostingDismissals: async () => [],
  setFeedbackLabel: async () => {},
};
