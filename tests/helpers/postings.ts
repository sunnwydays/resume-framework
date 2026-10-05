// Builds Jobright-shaped alert HTML for the posting parser tests. Companies,
// titles and ids are made up (the repo is public); the structure follows the
// real emails: each card is a link wrapping a table, with fields found by id.

export interface CardOptions {
  id: string; // 24 hex chars
  company: string;
  categories?: string;
  pct?: number;
  title: string;
  tags?: string[];
  age?: string;
  wrapperLink?: boolean; // false: only the title carries the link
  omit?: ("company" | "title")[];
}

export function card(o: CardOptions): string {
  const href = `https://jobright.ai/jobs/info/${o.id}?utm_source=alert&amp;utm_medium=email`;
  const inner = `<table id="job-section" width="100%"><tr><td>
    ${o.omit?.includes("company") ? "" : `<span id="job-company-name">${o.company}</span>`}
    ${o.categories ? `<span id="job-company-categories">${o.categories.split(" · ").join("<!-- --> · <!-- -->")}</span>` : ""}
    ${o.pct === undefined ? "" : `<div id="job-match-percentage"><span>${o.pct}<!-- -->%</span></div>`}
    ${o.omit?.includes("title") ? "" : `<a id="job-title" href="${href}">${o.title}</a>`}
    ${(o.tags ?? []).map((t) => `<div id="job-tag"><span>${t}</span></div>`).join("\n")}
    ${o.age ? `<span id="job-time-posted">${o.age}</span>` : ""}
  </td></tr></table>`;
  return o.wrapperLink === false ? inner : `<a href="${href}">${inner}</a>`;
}

export function alertHtml(cards: string[]): string {
  return `<html><body><p>Instant alert</p>${cards.join("\n<hr>\n")}<p>Unsubscribe</p></body></html>`;
}

export const IDS = {
  a: "0123456789abcdef01234567",
  b: "1123456789abcdef01234567",
  c: "2123456789abcdef01234567",
  d: "3123456789abcdef01234567",
};
