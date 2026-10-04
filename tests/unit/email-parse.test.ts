import { describe, expect, it } from "vitest";
import { classify } from "@/lib/tracker/email/classify";
import { extractFields } from "@/lib/tracker/email/fields";
import { cleanText, expandDigest, htmlToText, parseFrom, parseGmailMessage, type GmailMessage } from "@/lib/tracker/email/parse";
import { mail } from "../helpers/email";

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64url");

function gmail(parts: { mimeType: string; text: string; filename?: string }[], headers: Record<string, string> = {}): GmailMessage {
  return {
    id: "abc123",
    threadId: "thr1",
    internalDate: String(Date.UTC(2026, 8, 28, 12, 0, 0)),
    payload: {
      mimeType: "multipart/alternative",
      headers: Object.entries({ From: "Zephyr Recruiting <No-Reply@Zephyr.com>", Subject: "Thanks for applying", ...headers }).map(
        ([name, value]) => ({ name, value })
      ),
      parts: parts.map((p) => ({ mimeType: p.mimeType, filename: p.filename ?? "", body: { data: b64(p.text) } })),
    },
  };
}

describe("parseFrom", () => {
  it.each([
    ['"Zephyr Recruiting" <No-Reply@Zephyr.com>', "Zephyr Recruiting", "no-reply@zephyr.com"],
    ["Zephyr <jobs@zephyr.com>", "Zephyr", "jobs@zephyr.com"],
    ["jobs@zephyr.com", "", "jobs@zephyr.com"],
    ["<jobs@zephyr.com>", "", "jobs@zephyr.com"],
  ])("%s", (value, name, address) => {
    expect(parseFrom(value)).toEqual({ name, address });
  });
});

describe("cleanText", () => {
  it("straightens quotes and drops invisible padding", () => {
    const padding = String.fromCharCode(0x34f, 0x200b, 0xfeff);
    expect(cleanText(`We’re   excited${padding} “hello”`)).toBe(`We're excited "hello"`);
  });
  it("collapses blank lines and trims line edges", () => {
    expect(cleanText("a  \n\n\n\n  b\r\nc")).toBe("a\n\nb\nc");
  });
});

describe("htmlToText", () => {
  it("keeps block breaks, decodes entities, drops style/script, and records anchor text", () => {
    const { text, links } = htmlToText(
      `<html><head><style>.x{color:red}</style></head><body><p>Hi Sam,&nbsp;we&#39;re <b>glad</b> &amp; ready.</p>` +
        `<div>Click <a href="https://app.codesignal.com/t/1?a=1&amp;b=2">Start Test</a></div><script>evil()</script></body></html>`
    );
    expect(text).toBe("Hi Sam, we're glad & ready.\nClick Start Test");
    expect(links).toEqual([{ url: "https://app.codesignal.com/t/1?a=1&b=2", label: "Start Test" }]);
  });
});

describe("parseGmailMessage", () => {
  it("reads headers, date and a plain-text body", () => {
    const facts = parseGmailMessage(
      gmail([{ mimeType: "text/plain", text: "Thank you for applying to Zephyr. ".repeat(6) }])
    );
    expect(facts).toMatchObject({
      gmailId: "abc123",
      threadId: "thr1",
      receivedAt: "2026-09-28T12:00:00.000Z",
      fromName: "Zephyr Recruiting",
      fromAddress: "no-reply@zephyr.com",
      subject: "Thanks for applying",
    });
    expect(facts.text).toContain("Thank you for applying to Zephyr.");
  });

  it("uses the HTML part when the plain part is just a stub", () => {
    const facts = parseGmailMessage(
      gmail([
        { mimeType: "text/plain", text: "View this email in your browser" },
        { mimeType: "text/html", text: "<p>We have received your application for the Backend Intern position at Zephyr. We will be in touch soon.</p><a href='https://x.test/y'>this URL</a>" },
      ])
    );
    expect(facts.text).toContain("received your application for the Backend Intern position at Zephyr");
    expect(facts.links).toEqual([{ url: "https://x.test/y", label: "this URL" }]);
  });

  it("prefers a full plain part over HTML, and ignores attachments", () => {
    const facts = parseGmailMessage(
      gmail([
        { mimeType: "text/plain", text: "This is the full plain body. ".repeat(8) },
        { mimeType: "text/html", text: "<p>HTML version</p>" },
        { mimeType: "text/plain", text: "attached junk", filename: "notes.txt" },
      ])
    );
    expect(facts.text).toContain("full plain body");
    expect(facts.text).not.toContain("junk");
  });

  it("round-trips non-ASCII text", () => {
    const facts = parseGmailMessage(gmail([{ mimeType: "text/plain", text: "Merci pour votre candidature, Zoë — à bientôt! ".repeat(4) }]));
    expect(facts.text).toContain("Zoë");
    expect(facts.text).toContain("candidature");
  });

  it("feeds classification end to end", () => {
    const facts = parseGmailMessage(
      gmail(
        [{ mimeType: "text/plain", text: "Hi Sam, Thank you for taking the time to apply for the Backend Intern position. After careful consideration, we've decided not to move forward at this time. ".repeat(2) }],
        { From: "Zephyr <no-reply@us.greenhouse-mail.io>", Subject: "Thank you for applying to Zephyr" }
      )
    );
    expect(classify(facts).kind).toBe("rejection");
    expect(extractFields(facts, "rejection").company).toBe("Zephyr");
  });
});

describe("expandDigest", () => {
  const digest = (notifications: string[]) =>
    mail({
      fromAddress: "initrode@myworkday.com",
      subject: "Workday Inbox - Your Daily Digest",
      text:
        `Daily Digest for Sam Lee\nWednesday, September 30, 2026\n${notifications.length} Notification(s)\nCLICK HERE to sign-in to Workday\nNotifications (${notifications.length})\n` +
        notifications.map((n) => `${n}\nClick here to view the notification details.\n`).join("") +
        "This is a post-only email.",
    });

  const confirmation =
    "Thank you for applying!\nDear Sam,\n\nThank you for your interest in the position of Software Engineer - Intern with Initrode.\n\nWe have received your application and will contact you if more information is needed.\nBusiness Process: Job Application: Sam Lee - R04411 Software Engineer - Intern (CAND-100001) on 09/29/2026\nSubject: Sam Lee - R04411 Software Engineer - Intern (CAND-100001)";
  const rejection =
    "You were not selected\nHello Sam, you were not selected for the role of Platform Intern R-110022 at Initrode. We wish you luck.\nBusiness Process: Job Application: Sam Lee - R-110022 Platform Intern";

  it("passes other mail through untouched", () => {
    const m = mail({ fromAddress: "a@initech.com", subject: "Daily digest", text: "x" });
    expect(expandDigest(m)).toEqual([m]);
  });

  it("splits one email into its notifications, each classified on its own", () => {
    const parts = expandDigest(digest([confirmation, rejection]));
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.gmailId)).toEqual(["m1#1", "m1#2"]);
    expect(parts.map((p) => classify(p).kind)).toEqual(["confirmation", "rejection"]);
    const first = extractFields(parts[0], "confirmation");
    expect(first.company).toBe("Initrode");
    expect(first.role).toBe("Software Engineer - Intern");
    expect(first.jobId).toBe("R04411");
  });

  it("a single-notification digest becomes that notification", () => {
    const parts = expandDigest(digest([confirmation]));
    expect(parts).toHaveLength(1);
    expect(parts[0].subject).toBe("Thank you for applying!");
    expect(parts[0].text).not.toContain("Daily Digest");
  });
});
