// "Never suggest from this sender / company." Mutes hide emails from review
// and keep later scans from storing them; unmuting brings back what was
// already stored. Personal domains to always skip live in RULES / .env.local.

import { isAssessmentSender, isAtsSender } from "@/lib/tracker/email/classify";
import type { Analyzed } from "@/lib/tracker/email/group";
import { companyCloseness } from "@/lib/tracker/email/match";
import type { EmailMute, MuteKind } from "@/lib/tracker/format";

type Mute = Pick<EmailMute, "kind" | "value">;

const SAME_COMPANY = 85;

export function muteValue(kind: MuteKind, raw: string): string {
  return kind === "sender" ? raw.trim().toLowerCase() : raw.trim().replace(/\s+/g, " ");
}

// An ATS or assessment platform sends for many employers, so muting its
// address would silence all of them: mute the company instead.
export function canMuteSender(address: string): boolean {
  return !isAtsSender(address) && !isAssessmentSender(address);
}

export function isMuted(a: Analyzed, mutes: Mute[]): boolean {
  const company = a.fields.company;
  return mutes.some((m) =>
    m.kind === "sender"
      ? a.facts.fromAddress.toLowerCase() === m.value
      : company !== null && companyCloseness(company, m.value) >= SAME_COMPANY
  );
}
