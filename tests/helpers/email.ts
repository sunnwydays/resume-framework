import type { EmailFacts } from "@/lib/tracker/email/parse";

// A made-up email, shaped like the real ones the rules were tuned on. Never
// paste real names or addresses into fixtures.
export function mail(partial: Partial<EmailFacts> & Pick<EmailFacts, "fromAddress" | "subject" | "text">): EmailFacts {
  return {
    gmailId: "m1",
    threadId: "t1",
    receivedAt: "2026-09-28T12:00:00.000Z",
    fromName: "",
    links: [],
    ...partial,
  };
}
