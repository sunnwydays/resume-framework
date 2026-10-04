import StatsPanel from "@/components/tracker/stats/StatsPanel";

// The strategy behind the page. Every number links to its source; keep it
// that way when editing (same rule as WhyThisExists).

const LINK =
  "underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-900 dark:decoration-neutral-700 dark:hover:text-neutral-100";

function Source({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

const ASHBY = "https://www.ashbyhq.com/talent-trends-report/reports/referrals";
const HUNTR = "https://huntr.co/research/2025-annual-job-search-trends-report";
const PIN = "https://www.pin.com/blog/recruiting-outreach-benchmark-report/";

const NUMBERS = [
  { value: "40% vs 3%", label: "of referred vs. cold-applied candidates get an interview", source: "Ashby, 2021–24", href: ASHBY },
  { value: "~1%", label: "of applications are referrals, so the channel isn't crowded", source: "Ashby, 2021–24", href: ASHBY },
  { value: "25%", label: "of sourced candidates (someone reached out to them) get an interview", source: "Ashby, 2021–24", href: ASHBY },
  { value: "1.6×", label: "better conversion for tailored applications than spray-and-pray", source: "Huntr 2025, ~600k apps", href: HUNTR },
] as const;

const PLAYS = [
  {
    title: "Turn conversations into referrals",
    body: "Message an engineer at a company you like and ask for a 15-minute chat about their work, not for a job. The referral comes out of the conversation.",
  },
  {
    title: "Go straight to founders",
    body: "At startups the founder often reads their own inbox. Find them on YC's Work at a Startup or Wellfound and email 3–5 sentences: who you are, one specific thing you'd build or fix for them, and a link.",
  },
  {
    title: "Ship proof-of-work",
    body: "Build something small aimed at a company's problem, then use it as the hook for the two plays above. It's also your portfolio, and sometimes the start of your own company.",
  },
  {
    title: "Be findable",
    body: "Hackathons, meetups, Discords and building in public get people reaching out to you, and sourced candidates convert far better than cold ones.",
  },
  {
    title: "Cold apply only when it's targeted",
    body: "Tailor it, use curated boards, apply early, and cap the time. That lives in the Applications tab; this page is everything else.",
  },
] as const;

export default function Playbook() {
  return (
    <StatsPanel id="arbitrage-playbook" title="The playbook" summary="why this works, and the five plays">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {NUMBERS.map((n) => (
          <div
            key={n.value}
            className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 dark:border-blue-900/40 dark:bg-blue-950/20"
          >
            <p className="text-xl font-semibold tracking-tight text-blue-800 dark:text-blue-300">{n.value}</p>
            <p className="mt-1 text-sm">{n.label}</p>
            <p className="mt-1 text-xs text-neutral-500">
              <Source href={n.href}>{n.source}</Source>
            </p>
          </div>
        ))}
      </div>

      <ol className="space-y-2">
        {PLAYS.map((p, i) => (
          <li key={p.title} className="flex gap-3 text-sm">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
              {i + 1}
            </span>
            <span>
              <span className="font-medium">{p.title}.</span>{" "}
              <span className="text-neutral-600 dark:text-neutral-400">{p.body}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        <span className="font-medium text-foreground">The flywheel:</span> build something → share it → message
        people with it → conversation → referral → interview (or a startup).
      </p>

      <p className="text-xs text-neutral-500">
        On follow-ups: more than half of replies to recruiter outreach come after the first message (
        <Source href={PIN}>Pin, 4M+ messages</Source>). That data is recruiters writing to candidates, so treat
        it as directional, but it&rsquo;s why the page nudges you to follow up twice.
      </p>
    </StatsPanel>
  );
}
