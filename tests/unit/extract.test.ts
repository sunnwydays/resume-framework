import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  companyFromDomain,
  decodeEntities,
  extractJob,
  fromJsonLd,
  fromTitle,
  htmlToText,
  isPublicHost,
  prettifySlug,
} from "@/lib/tracker/extract";

describe("decodeEntities", () => {
  it.each([
    ["Tom &amp; Jerry", "Tom & Jerry"],
    ["&lt;b&gt;", "<b>"],
    ["it&#39;s", "it's"],
    ["it&#x27;s", "it's"],
    ["a&nbsp;b", "a b"],
    ["2020&ndash;2021", "2020–2021"],
    ["wait&hellip;", "wait…"],
    ["&AMP;", "&"],
    ["&#128512;", "😀"],
  ])("%j -> %j", (input, expected) => expect(decodeEntities(input)).toBe(expected));

  it("leaves unknown or broken entities alone", () => {
    expect(decodeEntities("&bogus; &amp &#; &#xZZ;")).toBe("&bogus; &amp &#; &#xZZ;");
  });

  it("does not throw on a number that isn't a character, and never emits NUL", () => {
    expect(decodeEntities("&#1114112;")).toBe("&#1114112;");
    expect(decodeEntities("&#99999999999;")).toBe("&#99999999999;");
    expect(decodeEntities("&#xFFFFFFFF;")).toBe("&#xFFFFFFFF;");
    expect(decodeEntities("a&#0;b")).toBe("a&#0;b");
  });
});

describe("htmlToText", () => {
  it("drops scripts and styles, keeps the text", () => {
    expect(htmlToText("<style>p{}</style><p>Hello</p><script>alert(1)</script>")).toBe("Hello");
  });
  it("turns breaks, paragraphs and list items into lines", () => {
    expect(htmlToText("<p>One</p><p>Two<br>Three</p><ul><li>A</li><li>B</li></ul>")).toBe("One\nTwo\nThree\n\n• A\n• B");
  });
  it("decodes entities and collapses whitespace", () => {
    expect(htmlToText("<p>Build   &amp;\t ship fast</p>")).toBe("Build & ship fast");
  });
  it("never leaves more than one blank line", () => {
    expect(htmlToText("<p>a</p><p></p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });
  it("caps the length", () => {
    expect(htmlToText(`<p>${"x".repeat(30_000)}</p>`)).toHaveLength(20_000);
  });
  it("handles empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});

describe("prettifySlug", () => {
  it.each([
    ["superhuman", "Superhuman"],
    ["ibm", "IBM"],
    ["jane-street", "Jane Street"],
    ["acme_corp.inc", "Acme Corp INC"],
    ["", ""],
    ["--", ""],
  ])("%j -> %j", (input, expected) => expect(prettifySlug(input)).toBe(expected));
});

describe("fromJsonLd", () => {
  const page = (...blocks: unknown[]) =>
    `<html><head>${blocks
      .map((b) => `<script type="application/ld+json">${typeof b === "string" ? b : JSON.stringify(b)}</script>`)
      .join("")}</head></html>`;
  const posting = (extra: object = {}) => ({
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Software Engineer Intern",
    hiringOrganization: { "@type": "Organization", name: "Acme" },
    jobLocation: { address: { addressLocality: "Toronto", addressRegion: "ON", addressCountry: "Canada" } },
    description: "<p>Build &amp; ship</p>",
    ...extra,
  });

  it("reads title, company, location and description", () => {
    expect(fromJsonLd(page(posting()))).toEqual({
      role: "Software Engineer Intern",
      company: "Acme",
      location: "Toronto, ON, Canada",
      description: "Build & ship",
    });
  });

  it("finds a posting inside @graph, arrays and typed arrays", () => {
    expect(fromJsonLd(page({ "@graph": [{ "@type": "WebSite" }, posting()] }))?.role).toBe("Software Engineer Intern");
    expect(fromJsonLd(page([{ "@type": "Org" }, posting()]))?.role).toBe("Software Engineer Intern");
    expect(fromJsonLd(page(posting({ "@type": ["Thing", "JobPosting"] })))?.role).toBe("Software Engineer Intern");
  });

  it("skips malformed blocks and keeps looking", () => {
    expect(fromJsonLd(page("{not json", posting()))?.company).toBe("Acme");
  });

  it("is null when there is no posting", () => {
    expect(fromJsonLd(page({ "@type": "Organization", name: "Acme" }))).toBeNull();
    expect(fromJsonLd("<html></html>")).toBeNull();
    expect(fromJsonLd(page("{broken"))).toBeNull();
  });

  it("accepts the organization as a plain string", () => {
    expect(fromJsonLd(page(posting({ hiringOrganization: "Acme Inc" })))?.company).toBe("Acme Inc");
  });

  it("ignores placeholder address parts like 'N/A'", () => {
    const job = posting({ jobLocation: { address: { addressLocality: "Toronto", addressRegion: "N/A", addressCountry: "N/A" } } });
    expect(fromJsonLd(page(job))?.location).toBe("Toronto");
  });

  it("joins several locations, dropping repeats", () => {
    const job = posting({
      jobLocation: [
        { address: { addressLocality: "Toronto", addressRegion: "ON" } },
        { address: { addressLocality: "Toronto", addressRegion: "ON" } },
        { address: { addressLocality: "Vancouver", addressRegion: "BC" } },
      ],
    });
    expect(fromJsonLd(page(job))?.location).toBe("Toronto, ON, Vancouver, BC");
  });

  it.each([
    ["Toronto", "ON"],
    ["London", "ON"],
    ["Portland", "OR"],
    ["Indianapolis", "IN"],
    ["Ottawa", "ON"],
  ])("keeps the region of '%s, %s' even though the city's name contains it", (city, region) => {
    const job = posting({ jobLocation: { address: { addressLocality: city, addressRegion: region } } });
    expect(fromJsonLd(page(job))?.location).toBe(`${city}, ${region}`);
  });

  it("still drops a part that repeats an earlier one", () => {
    const job = posting({ jobLocation: { address: { addressLocality: "Toronto, ON, Canada", addressCountry: "Canada" } } });
    expect(fromJsonLd(page(job))?.location).toBe("Toronto, ON, Canada");
  });

  it("adds Remote for telecommute postings", () => {
    expect(fromJsonLd(page(posting({ jobLocationType: "TELECOMMUTE" })))?.location).toBe("Toronto, ON, Canada, Remote");
    const remoteOnly = posting({ jobLocation: undefined, jobLocationType: "TELECOMMUTE" });
    expect(fromJsonLd(page(remoteOnly))?.location).toBe("Remote");
  });

  it("takes a country given as an object, and an address given as text", () => {
    const withObject = posting({ jobLocation: { address: { addressLocality: "Paris", addressCountry: { name: "France" } } } });
    expect(fromJsonLd(page(withObject))?.location).toBe("Paris, France");
    expect(fromJsonLd(page(posting({ jobLocation: { address: "Berlin, Germany" } })))?.location).toBe("Berlin, Germany");
  });

  it("leaves out what the posting doesn't have", () => {
    const r = fromJsonLd(page({ "@type": "JobPosting", title: "Dev" }));
    expect(r).toMatchObject({ role: "Dev" });
    expect(r?.company).toBeUndefined();
    expect(r?.location).toBeUndefined();
    expect(r?.description).toBeUndefined();
  });
});

describe("fromTitle", () => {
  it.each([
    ["Software Engineer Intern @ Acme | Greenhouse", undefined, { role: "Software Engineer Intern", company: "Acme" }],
    ["Software Engineer at Acme", undefined, { role: "Software Engineer", company: "Acme" }],
    ["Software Engineer at Acme - Careers", undefined, { role: "Software Engineer", company: "Acme" }],
    ["Software Engineer - Acme", undefined, { role: "Software Engineer", company: "Acme" }],
    ["Software Engineer | Acme", undefined, { role: "Software Engineer", company: "Acme" }],
    ["SWE – Acme", undefined, { role: "SWE", company: "Acme" }],
    ["SWE — Acme", undefined, { role: "SWE", company: "Acme" }],
    ["Front-End Engineer - Acme", undefined, { role: "Front-End Engineer", company: "Acme" }],
  ])("%j", (title, site, expected) => expect(fromTitle(title, site)).toMatchObject(expected));

  it("reads LinkedIn's 'Company hiring Role in Place' form", () => {
    expect(fromTitle("Acme hiring Software Engineer Intern in Toronto, ON | LinkedIn")).toEqual({
      company: "Acme",
      role: "Software Engineer Intern",
      location: "Toronto, ON",
      linkedin: true,
    });
    expect(fromTitle("Acme hiring Data Intern")).toMatchObject({ company: "Acme", role: "Data Intern", linkedin: true });
  });

  it("drops a trailing site name", () => {
    expect(fromTitle("Software Engineer | Acme | Simplify Jobs", "Simplify Jobs")).toMatchObject({
      role: "Software Engineer",
      company: "Acme",
    });
  });

  it("when only the site name is left over, the site is the company", () => {
    expect(fromTitle("Software Engineer | Acme", "Acme")).toMatchObject({ role: "Software Engineer", company: "Acme" });
  });

  it("a careers landing page gives a company but no role", () => {
    const r = fromTitle("Explore open roles at Superhuman");
    expect(r?.company).toBe("Superhuman");
    expect(r?.role).toBeUndefined();
    expect(fromTitle("Careers | Acme")).toMatchObject({ company: "Acme", role: undefined });
  });

  it("gives up on a title with no structure", () => {
    expect(fromTitle("Acme")).toBeNull();
    expect(fromTitle("")).toBeNull();
  });
});

describe("companyFromDomain", () => {
  const of = (url: string) => companyFromDomain(new URL(url));
  it.each([
    ["https://careers.ibm.com/job/1", "IBM"],
    ["https://www.acme.com/jobs", "Acme"],
    ["https://jobs.example.co.uk/x", "Example"],
    ["https://jobs.foo.co.uk/x", "FOO"], // three letters or fewer read as an acronym
    ["https://jane-street.com/x", "Jane Street"],
    ["https://nvidia.wd5.myworkdayjobs.com/site/job/x", "Nvidia"],
  ])("%s -> %s", (url, expected) => expect(of(url)).toBe(expected));

  it.each([
    "https://www.linkedin.com/jobs/view/1",
    "https://boards.greenhouse.io/acme/jobs/1",
    "https://jobs.lever.co/acme/1",
    "https://jobs.ashbyhq.com/acme/1",
    "https://www.indeed.com/viewjob",
    "https://simplify.jobs/p/1",
    "http://localhost:3000/x",
    "http://127.0.0.1/x",
  ])("a job board or non-name gives nothing: %s", (url) => expect(of(url)).toBeUndefined());
});

// ------------------------------------------------------------ extractJob

type Reply = { status?: number; body: string; headers?: Record<string, string> } | Error;
let calls: string[] = [];

// Maps a URL (exact, or a regex) to a canned reply; anything else is a 404.
function mockFetch(routes: [string | RegExp, Reply][]) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      const hit = routes.find(([key]) => (typeof key === "string" ? key === url : key.test(url)));
      if (!hit) return new Response("not found", { status: 404 });
      if (hit[1] instanceof Error) throw hit[1];
      return new Response(hit[1].body, { status: hit[1].status ?? 200, headers: hit[1].headers });
    })
  );
}
const json = (value: unknown): Reply => ({ body: JSON.stringify(value) });
const html = (body: string): Reply => ({ body: `<html><head>${body}</head></html>` });

beforeEach(() => mockFetch([]));
afterEach(() => vi.unstubAllGlobals());

describe("extractJob: ATS APIs", () => {
  it("Greenhouse: reads the API and doesn't fetch the page", async () => {
    mockFetch([
      [
        "https://boards-api.greenhouse.io/v1/boards/acme/jobs/123",
        json({
          title: "SWE Intern",
          company_name: "Acme Corp",
          location: { name: "Toronto" },
          content: "&lt;p&gt;Build &amp;amp; ship&lt;/p&gt;",
        }),
      ],
    ]);
    const r = await extractJob("https://boards.greenhouse.io/acme/jobs/123");
    expect(r).toEqual({
      fields: { role: "SWE Intern", company: "Acme Corp", location: "Toronto", description: "Build & ship" },
      origins: { role: "greenhouse", company: "greenhouse", location: "greenhouse", description: "greenhouse" },
      source: "greenhouse",
      missing: [],
    });
    expect(calls).toEqual(["https://boards-api.greenhouse.io/v1/boards/acme/jobs/123"]);
  });

  it("Greenhouse: the board name stands in when the API gives no company", async () => {
    mockFetch([
      [/boards-api\.greenhouse\.io\/v1\/boards\/acme-corp\/jobs\/9/, json({ title: "Dev", location: { name: "Remote" } })],
    ]);
    const r = await extractJob("https://job-boards.greenhouse.io/acme-corp/jobs/9");
    expect(r.fields.company).toBe("Acme Corp");
  });

  it("Greenhouse: embed links with ?for= and ?token=", async () => {
    mockFetch([[/boards\/acme\/jobs\/77$/, json({ title: "Dev", location: { name: "NYC" } })]]);
    const r = await extractJob("https://boards.greenhouse.io/embed/job_app?for=acme&token=77");
    expect(r.fields.role).toBe("Dev");
    expect(r.source).toBe("greenhouse");
  });

  it("Lever: reads the posting, company from the URL slug", async () => {
    mockFetch([
      [
        "https://api.lever.co/v0/postings/acme/abc-123",
        json({
          text: "Backend Intern",
          categories: { location: "Toronto" },
          descriptionPlain: "About the job",
          lists: [{ text: "Requirements", content: "<li>Python</li><li>SQL</li>" }],
          additionalPlain: "Perks",
        }),
      ],
    ]);
    const r = await extractJob("https://jobs.lever.co/acme/abc-123");
    expect(r.fields).toMatchObject({ role: "Backend Intern", company: "Acme", location: "Toronto" });
    expect(r.fields.description).toBe("About the job\n\nRequirements\n• Python\n• SQL\n\nPerks");
    expect(r.source).toBe("lever");
  });

  it("Lever: uses the EU API for EU postings", async () => {
    mockFetch([["https://api.eu.lever.co/v0/postings/acme/x1", json({ text: "Dev", categories: { location: "Berlin" } })]]);
    const r = await extractJob("https://jobs.eu.lever.co/acme/x1");
    expect(r.fields).toMatchObject({ role: "Dev", location: "Berlin" });
  });

  it("Ashby: finds the job on the board by id", async () => {
    mockFetch([
      [
        "https://api.ashbyhq.com/posting-api/job-board/acme",
        json({
          jobs: [
            { id: "other", title: "Nope" },
            { id: "abc", title: "Platform Intern", location: "Toronto", descriptionPlain: "Hello\n\n\n\nthere" },
          ],
        }),
      ],
    ]);
    const r = await extractJob("https://jobs.ashbyhq.com/acme/abc");
    expect(r.fields).toEqual({
      role: "Platform Intern",
      company: "Acme",
      location: "Toronto",
      description: "Hello\n\nthere",
    });
    expect(r.source).toBe("ashby");
  });

  it("Ashby: a remote job with no location says Remote", async () => {
    mockFetch([[/job-board\/acme$/, json({ jobs: [{ id: "abc", title: "Dev", isRemote: true }] })]]);
    expect((await extractJob("https://jobs.ashbyhq.com/acme/abc")).fields.location).toBe("Remote");
  });

  it("Ashby: a job that isn't on the board falls back to the page", async () => {
    mockFetch([
      [/job-board\/acme$/, json({ jobs: [] })],
      ["https://jobs.ashbyhq.com/acme/gone", html("<title>Platform Intern at Acme</title>")],
    ]);
    const r = await extractJob("https://jobs.ashbyhq.com/acme/gone");
    expect(r.fields).toMatchObject({ role: "Platform Intern", company: "Acme" });
    expect(r.source).toBe("meta");
  });

  it("Workday: builds the cxs URL and uses the tenant as the company", async () => {
    mockFetch([
      [
        "https://nvidia.wd5.myworkdayjobs.com/wday/cxs/nvidia/NVIDIAExternalCareerSite/job/Canada-Toronto/Intern_JR1234",
        json({ jobPostingInfo: { title: "Software Intern", location: "Toronto", jobDescription: "<p>Hi</p>" } }),
      ],
    ]);
    const r = await extractJob("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/job/Canada-Toronto/Intern_JR1234");
    expect(r.fields).toEqual({ role: "Software Intern", company: "Nvidia", location: "Toronto", description: "Hi" });
    expect(r.source).toBe("workday");
  });

  it("Workday: a URL without /job/ can't be read as a posting", async () => {
    mockFetch([]);
    const r = await extractJob("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite");
    expect(r.fields.company).toBe("Nvidia"); // from the domain
    expect(r.missing).toEqual(["role", "location"]);
  });

  it("an embedded Greenhouse board on a company page (?gh_jid=)", async () => {
    mockFetch([
      ["https://acme.com/careers?gh_jid=555", html('<script src="https://boards.greenhouse.io/embed/job_board/js?for=acmeboard"></script>')],
      [/boards\/acmeboard\/jobs\/555$/, json({ title: "Dev", location: { name: "Toronto" } })],
    ]);
    const r = await extractJob("https://acme.com/careers?gh_jid=555");
    expect(r.fields).toMatchObject({ role: "Dev", location: "Toronto", company: "Acmeboard" });
    expect(r.source).toBe("greenhouse");
  });

  it("an embedded Ashby board guessed from the domain (?ashby_jid=), before fetching the page", async () => {
    mockFetch([[/job-board\/superhuman$/, json({ jobs: [{ id: "u1", title: "SWE Intern", location: "Remote" }] })]]);
    const r = await extractJob("https://superhuman.com/careers?ashby_jid=u1");
    expect(r.fields).toMatchObject({ role: "SWE Intern", company: "Superhuman" });
    expect(calls).toHaveLength(1);
  });
});

describe("extractJob: pages", () => {
  const url = "https://www.acme.com/jobs/1";

  it("JSON-LD fills what the page says", async () => {
    mockFetch([
      [
        url,
        html(
          `<script type="application/ld+json">${JSON.stringify({
            "@type": "JobPosting",
            title: "SWE Intern",
            hiringOrganization: { name: "Acme Inc" },
            jobLocation: { address: { addressLocality: "Toronto", addressRegion: "ON" } },
          })}</script>`
        ),
      ],
    ]);
    const r = await extractJob(url);
    expect(r).toMatchObject({
      fields: { role: "SWE Intern", company: "Acme Inc", location: "Toronto, ON" },
      origins: { role: "jsonld", company: "jsonld", location: "jsonld" },
      source: "jsonld",
      missing: [],
    });
  });

  it("falls back to the title when there is no JSON-LD, preferring og:title", async () => {
    mockFetch([[url, html('<meta property="og:title" content="Data Intern at Acme"><title>Something else entirely</title>')]]);
    const r = await extractJob(url);
    expect(r.fields).toMatchObject({ role: "Data Intern", company: "Acme" });
    expect(r.source).toBe("meta");
    expect(r.missing).toEqual(["location"]);
  });

  it("uses og:site_name to tell the company from the board", async () => {
    mockFetch([[url, html('<meta property="og:site_name" content="Acme"><title>Data Intern | Acme</title>')]]);
    const r = await extractJob(url);
    expect(r.fields).toMatchObject({ role: "Data Intern", company: "Acme" });
  });

  it("recognizes a LinkedIn-style title and takes its location", async () => {
    mockFetch([[url, html("<title>Acme hiring SWE Intern in Toronto, ON | LinkedIn</title>")]]);
    const r = await extractJob(url);
    expect(r).toMatchObject({ fields: { company: "Acme", role: "SWE Intern", location: "Toronto, ON" }, source: "linkedin", missing: [] });
  });

  it("earlier steps win; later ones only fill gaps", async () => {
    mockFetch([
      [
        url,
        html(
          `<script type="application/ld+json">${JSON.stringify({ "@type": "JobPosting", title: "From JSON-LD" })}</script><title>From Title at Titleco</title>`
        ),
      ],
    ]);
    const r = await extractJob(url);
    expect(r.fields).toMatchObject({ role: "From JSON-LD", company: "Titleco" });
    expect(r.origins).toMatchObject({ role: "jsonld", company: "meta" });
  });

  it("the domain gives a last-resort company, reported as a manual source", async () => {
    mockFetch([[url, html("<title>Welcome</title>")]]);
    const r = await extractJob(url);
    expect(r.fields).toEqual({ company: "Acme" });
    expect(r.origins).toEqual({ company: "domain" });
    expect(r.source).toBe("manual");
    expect(r.missing).toEqual(["role", "location"]);
  });

  it("never lists the description as missing", async () => {
    mockFetch([[url, html("<title>SWE at Acme</title>")]]);
    expect((await extractJob(url)).missing).not.toContain("description");
  });
});

describe("extractJob: failures never throw", () => {
  const url = "https://www.acme.com/jobs/1";
  const nothing = { fields: { company: "Acme" }, origins: { company: "domain" }, source: "manual", missing: ["role", "location"] };

  it("a network error", async () => {
    mockFetch([[/.*/, new TypeError("fetch failed")]]);
    expect(await extractJob(url)).toEqual(nothing);
  });

  it("a timeout", async () => {
    mockFetch([[/.*/, Object.assign(new Error("timed out"), { name: "TimeoutError" })]]);
    expect(await extractJob(url)).toEqual(nothing);
  });

  it.each([403, 404, 429, 500])("an HTTP %i (a bot wall, say)", async (status) => {
    mockFetch([[/.*/, { status, body: "blocked" }]]);
    expect(await extractJob(url)).toEqual(nothing);
  });

  it("a Greenhouse API that returns junk falls back to the page", async () => {
    mockFetch([
      [/boards-api/, { body: "<html>oops</html>" }],
      ["https://boards.greenhouse.io/acme/jobs/1", html("<title>Dev at Acme</title>")],
    ]);
    const r = await extractJob("https://boards.greenhouse.io/acme/jobs/1");
    expect(r.fields).toMatchObject({ role: "Dev", company: "Acme" });
  });

  it("a page full of hostile markup", async () => {
    mockFetch([[url, html('<script type="application/ld+json">{"@type":"JobPosting","title":"&#99999999999;&#0;"}</script>')]]);
    await expect(extractJob(url)).resolves.toBeTruthy();
  });

  it("a page with only a bare-IP address has no company to guess", async () => {
    mockFetch([]);
    const r = await extractJob("http://127.0.0.1:8080/jobs/1");
    expect(r.fields).toEqual({});
    expect(r.missing).toEqual(["company", "role", "location"]);
  });
});

describe("isPublicHost", () => {
  const ok = (u: string) => isPublicHost(new URL(u));

  it.each([
    "https://boards.greenhouse.io/acme/jobs/1",
    "http://jobs.example.co.uk/x",
    "https://93.184.216.34/x",
    "https://172.32.0.1/x",
    "https://100.63.0.1/x",
    "https://[2606:4700::1111]/x",
  ])("allows %s", (u) => expect(ok(u)).toBe(true));

  it.each([
    "http://localhost:3000/x",
    "http://LOCALHOST./x",
    "http://app.localhost/x",
    "http://intranet/x",
    "http://printer.local/x",
    "http://db.internal/x",
    "http://127.0.0.1/x",
    "http://127.255.0.9/x",
    "http://0.0.0.0/x",
    "http://10.1.2.3/x",
    "http://172.16.0.1/x",
    "http://172.31.255.255/x",
    "http://192.168.1.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1/x",
    "http://100.127.255.255/x",
    "http://224.0.0.1/x",
    "http://2130706433/x", // 127.0.0.1 as one number
    "http://0x7f.1/x",
    "http://[::1]/x",
    "http://[::]/x",
    "http://[fe80::1]/x",
    "http://[fd12:3456::1]/x",
    "http://[::ffff:127.0.0.1]/x",
    "http://[::ffff:169.254.169.254]/x",
    "ftp://example.com/x",
  ])("refuses %s", (u) => expect(ok(u)).toBe(false));
});

describe("extractJob: outbound requests stay on public hosts", () => {
  it("never fetches a private-address URL", async () => {
    mockFetch([[/.*/, html("<title>Dev at Acme</title>")]]);
    const r = await extractJob("http://169.254.169.254/latest/meta-data");
    expect(calls).toEqual([]);
    expect(r.fields).toEqual({});
  });

  it("refuses a redirect to a private address, without fetching it", async () => {
    mockFetch([
      ["https://www.acme.com/jobs/1", { status: 302, body: "", headers: { location: "http://127.0.0.1:8080/admin" } }],
      [/127\.0\.0\.1/, html("<title>Secret at Internal</title>")],
    ]);
    const r = await extractJob("https://www.acme.com/jobs/1");
    expect(calls).toEqual(["https://www.acme.com/jobs/1"]);
    expect(r.fields).toEqual({ company: "Acme" });
  });

  it("follows a normal redirect, including a relative one", async () => {
    mockFetch([
      ["https://acme.com/jobs/1", { status: 301, body: "", headers: { location: "https://www.acme.com/careers/1" } }],
      ["https://www.acme.com/careers/1", { status: 302, body: "", headers: { location: "/final" } }],
      ["https://www.acme.com/final", html("<title>Dev at Acme</title>")],
    ]);
    const r = await extractJob("https://acme.com/jobs/1");
    expect(r.fields).toMatchObject({ role: "Dev", company: "Acme" });
  });

  it("gives up on a redirect loop", async () => {
    mockFetch([[/.*/, { status: 302, body: "", headers: { location: "https://www.acme.com/loop" } }]]);
    const r = await extractJob("https://www.acme.com/loop");
    expect(calls.length).toBeLessThanOrEqual(6);
    expect(r.fields).toEqual({ company: "Acme" });
  });

  it("reads at most about 5 MB of a page", async () => {
    // The title sits past the cap, so it must not be read.
    const padding = "x".repeat(6 * 1024 * 1024);
    mockFetch([["https://www.acme.com/jobs/1", { body: `<html><head>${padding}<title>Late at Acme</title></head></html>` }]]);
    const r = await extractJob("https://www.acme.com/jobs/1");
    expect(r.fields.role).toBeUndefined();
  });

  it("still reads a page just under the cap", async () => {
    mockFetch([["https://www.acme.com/jobs/1", html(`<title>Dev at Acme</title>${"x".repeat(1024 * 1024)}`)]]);
    const r = await extractJob("https://www.acme.com/jobs/1");
    expect(r.fields).toMatchObject({ role: "Dev", company: "Acme" });
  });
});
