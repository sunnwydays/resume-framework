// Pull job details out of a posting URL, deterministically (no AI). Tries,
// in order: public ATS APIs keyed off the URL (Greenhouse, Lever, Ashby,
// Workday), JSON-LD JobPosting in the page, meta/title tags, and finally a
// company guess from the domain. Each step only fills fields still empty,
// and nothing here throws: failure just means more `missing` fields for the
// user to type in.

export type ExtractField = "company" | "role" | "location" | "description";
// Stored as applications.source (with "import" added by the importer), so
// the database's check constraint must allow every one of these.
export const EXTRACT_SOURCES = [
  "ashby",
  "greenhouse",
  "lever",
  "workday",
  "linkedin",
  "jsonld",
  "meta",
  "manual",
] as const;
export type ExtractSource = (typeof EXTRACT_SOURCES)[number];

export interface ExtractResult {
  fields: Partial<Record<ExtractField, string>>;
  // Where each filled field came from, for the "from Greenhouse" hints.
  origins: Partial<Record<ExtractField, ExtractSource | "domain">>;
  // Source of the role (else company), stored as applications.source.
  source: ExtractSource;
  // Fields the form should highlight. Description is optional, so never.
  missing: ExtractField[];
}

type Partial4 = Partial<Record<ExtractField, string | null | undefined>>;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const TIMEOUT_MS = 8000;
const MAX_DESCRIPTION = 20_000;

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

function isPublicIpv4([a, b]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127) return false; // "this" network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local, incl. the cloud metadata address
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return a < 224; // multicast and reserved
}

// A job posting lives on a public host. The route fetches on a signed-in
// caller's behalf, so refuse anything that would reach the server's own
// network: localhost, private and link-local addresses, one-label names.
// (The URL parser has already turned "0x7f.1" or "2130706433" into dotted
// form, and writes an IPv6 address inside brackets.) A public name that
// resolves to a private address isn't caught; there's no DNS lookup here.
export function isPublicHost(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");

  if (host.startsWith("[")) {
    const v6 = host.slice(1, -1);
    if (v6 === "::" || v6 === "::1") return false;
    if (/^fe[89ab]/.test(v6)) return false; // fe80::/10 link-local
    if (/^f[cd]/.test(v6)) return false; // fc00::/7 unique-local
    // IPv4-mapped (::ffff:7f00:1, which the parser writes in hex).
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
    if (mapped) {
      const hi = parseInt(mapped[1], 16);
      const lo = parseInt(mapped[2], 16);
      return isPublicIpv4([hi >> 8, hi & 255, lo >> 8, lo & 255]);
    }
    return true;
  }

  const v4 = ipv4Octets(host);
  if (v4) return isPublicIpv4(v4);
  if (!host.includes(".")) return false; // "localhost", "intranet"
  return !/\.(local|localhost|internal|lan|home|corp)$/.test(host);
}

// Reads at most MAX_BODY_BYTES, so a huge or endless response can't fill memory.
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_BODY_BYTES);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (bytes < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, MAX_BODY_BYTES - bytes);
    bytes += chunk.byteLength;
    text += decoder.decode(chunk, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

// Follows redirects by hand so every hop is checked against isPublicHost.
async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  try {
    let current = new URL(url);
    for (let hops = 0; hops <= MAX_REDIRECTS; hops++) {
      if (!isPublicHost(current)) return null;
      const res = await fetch(current.toString(), {
        ...init,
        headers: { "User-Agent": UA, Accept: "text/html,application/json", ...init?.headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
        cache: "no-store",
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel().catch(() => {});
        if (!location) return null;
        current = new URL(location, current);
        continue;
      }
      if (!res.ok) return null;
      return await readCapped(res);
    }
    return null; // too many redirects
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const text = await fetchText(url, init);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- text utils

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // Out-of-range numbers make fromCodePoint throw, and a NUL can't be
      // stored in a Postgres text column.
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

export function htmlToText(html: string): string {
  return tidyText(
    decodeEntities(
      html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li[^>]*>/gi, "\n• ")
        // Not </li>: each <li> already starts its own line.
        .replace(/<\/(p|div|ul|ol|h[1-6]|section|tr)>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    )
  );
}

function tidyText(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = decodeEntities(value).replace(/\s+/g, " ").trim();
  // Simplify's JSON-LD fills unknown address parts with "N/A".
  if (!v || /^(n\/?a|null|undefined|-)$/i.test(v)) return undefined;
  return v;
}

// "superhuman" -> "Superhuman", "ibm" -> "IBM", "jane-street" -> "Jane Street"
export function prettifySlug(slug: string): string {
  return slug
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

// Does `text` contain `phrase` as whole words? ("Toronto" doesn't contain
// "ON", but "Toronto, ON, Canada" does.)
function hasPhrase(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

// Join location parts, skipping ones already contained in an earlier part
// ("Toronto, ON, Canada" + "Canada" -> "Toronto, ON, Canada").
function joinLocation(parts: (string | undefined)[]): string | undefined {
  const out: string[] = [];
  for (const p of parts) {
    if (p && !out.some((o) => hasPhrase(o, p))) out.push(p);
  }
  return out.length ? out.join(", ") : undefined;
}

// ------------------------------------------------------------ ATS adapters

interface AtsHit {
  fields: Partial4;
  source: ExtractSource;
}

async function greenhouse(board: string, id: string): Promise<AtsHit | null> {
  const job = await fetchJson<{
    title?: string;
    company_name?: string;
    location?: { name?: string };
    content?: string;
  }>(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`);
  if (!job) return null;
  return {
    source: "greenhouse",
    fields: {
      role: clean(job.title),
      company: clean(job.company_name) ?? prettifySlug(board),
      location: clean(job.location?.name),
      // Greenhouse double-encodes: entity-escaped HTML.
      description: job.content ? htmlToText(decodeEntities(job.content)) : undefined,
    },
  };
}

async function lever(host: string, company: string, id: string): Promise<AtsHit | null> {
  const api = host.includes(".eu.") ? "api.eu.lever.co" : "api.lever.co";
  const job = await fetchJson<{
    text?: string;
    categories?: { location?: string };
    descriptionPlain?: string;
    additionalPlain?: string;
    lists?: { text?: string; content?: string }[];
  }>(`https://${api}/v0/postings/${company}/${id}`);
  if (!job) return null;
  const lists = (job.lists ?? [])
    .map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`)
    .join("\n\n");
  return {
    source: "lever",
    fields: {
      role: clean(job.text),
      company: prettifySlug(company),
      location: clean(job.categories?.location),
      description: tidyText(
        [job.descriptionPlain, lists, job.additionalPlain].filter(Boolean).join("\n\n")
      ),
    },
  };
}

async function ashby(org: string, id: string): Promise<AtsHit | null> {
  const board = await fetchJson<{
    jobs?: {
      id: string;
      title?: string;
      location?: string;
      isRemote?: boolean;
      descriptionPlain?: string;
    }[];
  }>(`https://api.ashbyhq.com/posting-api/job-board/${org}`);
  const job = board?.jobs?.find((j) => j.id === id);
  if (!job) return null;
  return {
    source: "ashby",
    fields: {
      role: clean(job.title),
      company: prettifySlug(org),
      location: clean(job.location) ?? (job.isRemote ? "Remote" : undefined),
      description: job.descriptionPlain ? tidyText(job.descriptionPlain) : undefined,
    },
  };
}

// https://{tenant}.wd5.myworkdayjobs.com/[en-US/]{site}/job/{...}
async function workday(url: URL): Promise<AtsHit | null> {
  const tenant = url.hostname.split(".")[0];
  const segments = url.pathname.split("/").filter(Boolean);
  if (/^[a-z]{2}-[A-Z]{2}$/.test(segments[0] ?? "")) segments.shift();
  const jobAt = segments.indexOf("job");
  if (jobAt < 1) return null;
  const site = segments[jobAt - 1];
  const rest = segments.slice(jobAt).join("/");
  const data = await fetchJson<{
    jobPostingInfo?: { title?: string; location?: string; jobDescription?: string };
  }>(`https://${url.hostname}/wday/cxs/${tenant}/${site}/${rest}`, {
    headers: { Accept: "application/json" },
  });
  const info = data?.jobPostingInfo;
  if (!info) return null;
  return {
    source: "workday",
    fields: {
      role: clean(info.title),
      // hiringOrganization is usually a legal entity ("2100 NVIDIA USA"),
      // so the tenant slug makes a better company name.
      company: prettifySlug(tenant),
      location: clean(info.location),
      description: info.jobDescription ? htmlToText(info.jobDescription) : undefined,
    },
  };
}

// ATS adapters that only need the URL. `html` (if already fetched) lets the
// embedded-board cases find their board slug.
async function fromAts(url: URL, html: string | null): Promise<AtsHit | null> {
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);

  if (/(^|\.)greenhouse\.io$/.test(host)) {
    const jobsAt = parts.indexOf("jobs");
    if (jobsAt >= 1 && parts[jobsAt + 1]) return greenhouse(parts[jobsAt - 1], parts[jobsAt + 1]);
    const forBoard = url.searchParams.get("for");
    const token = url.searchParams.get("token") ?? url.searchParams.get("gh_jid");
    if (forBoard && token) return greenhouse(forBoard, token);
  }
  if (/(^|\.)lever\.co$/.test(host) && parts.length >= 2) {
    return lever(host, parts[0], parts[1]);
  }
  if (host === "jobs.ashbyhq.com" && parts.length >= 2) {
    return ashby(parts[0], parts[1]);
  }
  if (host.endsWith(".myworkdayjobs.com")) {
    return workday(url);
  }

  // Company career pages embedding a board: ?gh_jid= / ?ashby_jid=.
  const ghJid = url.searchParams.get("gh_jid");
  if (ghJid && html) {
    const board =
      /greenhouse\.io\/embed\/job_(?:board|app)(?:\/js)?\?for=([\w-]+)/.exec(html)?.[1] ??
      /(?:boards|job-boards)\.greenhouse\.io\/(?!embed\b)([\w-]+)/.exec(html)?.[1];
    if (board) return greenhouse(board, ghJid);
  }
  const ashbyJid = url.searchParams.get("ashby_jid");
  if (ashbyJid) {
    const fromHtml = html ? /jobs\.ashbyhq\.com\/([\w.-]+)/.exec(html)?.[1] : undefined;
    // Ashby boards often load by JS; the domain's name is a decent guess.
    for (const org of new Set([fromHtml, registrableLabel(host)])) {
      if (!org) continue;
      const hit = await ashby(org, ashbyJid);
      if (hit) return hit;
    }
  }
  return null;
}

// ------------------------------------------------------------ page parsing

function walkJsonLd(node: unknown, out: Record<string, unknown>[]) {
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, out));
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
      out.push(obj);
    }
    if (obj["@graph"]) walkJsonLd(obj["@graph"], out);
  }
}

export function fromJsonLd(html: string): Partial4 | null {
  const postings: Record<string, unknown>[] = [];
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      walkJsonLd(JSON.parse(m[1].trim()), postings);
    } catch {
      // Malformed blocks are common; skip them.
    }
  }
  const job = postings[0];
  if (!job) return null;

  const org = job.hiringOrganization;
  const company = typeof org === "string" ? clean(org) : clean((org as { name?: unknown })?.name);

  const places = ([] as unknown[]).concat(job.jobLocation ?? []);
  const locations = places
    .map((p) => {
      const a = (p as { address?: unknown })?.address;
      if (typeof a === "string") return clean(a);
      const addr = (a ?? {}) as Record<string, unknown>;
      const country = addr.addressCountry;
      return joinLocation([
        clean(addr.addressLocality),
        clean(addr.addressRegion),
        typeof country === "string" ? clean(country) : clean((country as { name?: unknown })?.name),
      ]);
    })
    .filter((l): l is string => Boolean(l));
  const remote = job.jobLocationType === "TELECOMMUTE" ? "Remote" : undefined;

  return {
    role: clean(job.title),
    company,
    location: joinLocation([...new Set(locations), remote]),
    description: typeof job.description === "string" ? htmlToText(job.description) : undefined,
  };
}

function metaContent(html: string, key: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const name = /\b(?:property|name)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (name?.toLowerCase() === key) {
      return clean(/\bcontent=["']([^"']*)["']/i.exec(tag)?.[1]);
    }
  }
  return undefined;
}

// Guess role/company from a page title. Handles the common shapes:
//   "Role @ Company | Board", "Role at Company", "Company hiring Role in
//   Location | LinkedIn", "Role - Company", "Role | Company".
export function fromTitle(
  rawTitle: string,
  siteName?: string
): (Partial4 & { linkedin?: boolean }) | null {
  const guess = parseTitle(rawTitle.trim(), siteName);
  // A careers landing page ("Explore open roles at Superhuman") isn't a
  // role; keep only the company from it.
  if (guess?.role && GENERIC_ROLE.test(guess.role)) guess.role = undefined;
  return guess;
}

const GENERIC_ROLE =
  /\b(open (roles|positions)|careers?|job openings|jobs? (board|search)|join (us|our team)|explore|work with us)\b/i;

function parseTitle(
  title: string,
  siteName?: string
): (Partial4 & { linkedin?: boolean }) | null {
  const linkedin = /^(.+?) hiring (.+?)(?: in (.+?))?(?: \| LinkedIn)?$/i.exec(title);
  if (linkedin) {
    return { company: clean(linkedin[1]), role: clean(linkedin[2]), location: clean(linkedin[3]), linkedin: true };
  }

  // Drop a trailing board/site name ("… | Simplify Jobs").
  const segments = title.split(/\s+[|–—-]\s+/);
  if (siteName && segments.length > 1) {
    const site = siteName.toLowerCase();
    const rest = segments.filter((s) => !site.includes(s.toLowerCase()) && !s.toLowerCase().includes(site));
    if (rest.length && rest.length < segments.length) {
      if (rest.length === 1 && !/ (?:@|at) /i.test(rest[0])) {
        return { role: clean(rest[0]), company: clean(siteName) };
      }
      title = rest.join(" - ");
    }
  }

  const at = /^(.+?)\s+(?:@|at)\s+(.+)$/i.exec(title);
  if (at) return { role: clean(at[1]), company: clean(at[2].split(/\s+[|–—-]\s+/)[0]) };

  const parts = title.split(/\s+[|–—-]\s+/);
  if (parts.length >= 2) return { role: clean(parts[0]), company: clean(parts[parts.length - 1]) };
  return null;
}

// Second-level label of a hostname: careers.ibm.com -> "ibm",
// foo.co.uk -> "foo".
function registrableLabel(host: string): string | undefined {
  const labels = host.toLowerCase().split(".");
  if (labels.length < 2) return undefined;
  const sldIsGeneric = labels.length >= 3 && /^(co|com|ac|org|net|gov)$/.test(labels[labels.length - 2]);
  return labels[labels.length - (sldIsGeneric ? 3 : 2)];
}

// Job boards/aggregators whose domain says nothing about the employer.
const AGGREGATORS = new Set([
  "linkedin",
  "simplify",
  "indeed",
  "glassdoor",
  "ziprecruiter",
  "wellfound",
  "handshake",
  "joinhandshake",
  "builtin",
  "greenhouse",
  "lever",
  "ashbyhq",
  "workable",
  "smartrecruiters",
  "icims",
  "myworkdayjobs",
  "google",
]);

export function companyFromDomain(url: URL): string | undefined {
  if (url.hostname.endsWith(".myworkdayjobs.com")) return prettifySlug(url.hostname.split(".")[0]);
  const label = registrableLabel(url.hostname);
  // A bare IP address has no name in it ("127.0.0.1" would give "0").
  if (!label || /^\d+$/.test(label) || AGGREGATORS.has(label)) return undefined;
  return prettifySlug(label);
}

// ---------------------------------------------------------------- pipeline

export async function extractJob(rawUrl: string): Promise<ExtractResult> {
  const url = new URL(rawUrl);
  const fields: ExtractResult["fields"] = {};
  const origins: ExtractResult["origins"] = {};

  const take = (found: Partial4 | null | undefined, origin: ExtractSource | "domain") => {
    if (!found) return;
    for (const key of ["company", "role", "location", "description"] as const) {
      const value = found[key]?.trim();
      if (value && !fields[key]) {
        fields[key] = value;
        origins[key] = origin;
      }
    }
  };
  const complete = () => Boolean(fields.company && fields.role && fields.location);

  let hit = await fromAts(url, null);
  take(hit?.fields, hit?.source ?? "manual");

  if (!complete()) {
    const html = await fetchText(url.toString());
    if (html) {
      if (!hit) {
        hit = await fromAts(url, html);
        take(hit?.fields, hit?.source ?? "manual");
      }
      take(fromJsonLd(html), "jsonld");
      const siteName = metaContent(html, "og:site_name");
      const pageTitle =
        metaContent(html, "og:title") ??
        clean(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]);
      if (pageTitle) {
        const guess = fromTitle(pageTitle, siteName);
        take(guess, guess?.linkedin ? "linkedin" : "meta");
      }
    }
  }

  take({ company: companyFromDomain(url) }, "domain");

  const sourceOf = origins.role ?? origins.company;
  return {
    fields,
    origins,
    source: !sourceOf || sourceOf === "domain" ? "manual" : sourceOf,
    missing: (["company", "role", "location"] as const).filter((k) => !fields[k]),
  };
}
