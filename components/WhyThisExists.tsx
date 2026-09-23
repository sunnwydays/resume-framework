// Marketing/motivation block at the top of the page: sourced facts about
// ATS filtering. Numbers are sourced. Show depth through uncommon facts
// about the process and misconceptions.

const LINK =
  "underline decoration-neutral-300 underline-offset-2 transition-colors hover:text-neutral-900 dark:decoration-neutral-700 dark:hover:text-neutral-100";

const STATS = [
  {
    value: "97.8%",
    label: "of Fortune 500 companies used a detectable ATS in 2025.",
    source: "Jobscan ATS Usage Report",
    href: "https://www.jobscan.co/blog/fortune-500-use-applicant-tracking-systems/",
  },
  {
    value: "88%",
    label:
      "of employers agree qualified high-skills candidates get vetted out for not matching exact criteria (94% for middle-skills roles).",
    source: "Harvard Business School & Accenture, 2021",
    href: "https://www.hbs.edu/managing-the-future-of-work/research/Pages/hidden-workers-untapped-talent.aspx",
  },
  {
    value: "27M+",
    label:
      "“hidden workers” in the US are screened out by hiring systems despite being able to do the job.",
    source: "Harvard Business School & Accenture, 2021",
    href: "https://www.hbs.edu/managing-the-future-of-work/research/Pages/hidden-workers-untapped-talent.aspx",
  },
  {
    value: "7.4s",
    label:
      "is the first skim recruiters use to decide whether to keep reading — not their total time on a resume (see below).",
    source: "Ladders eye-tracking study, 2018",
    href: "https://www.theladders.com/career-advice/you-only-get-6-seconds-of-fame-make-it-count",
  },
] as const;

const DEEPER_FACTS = [
  {
    title: "The skim is just a sorting step.",
    body: (
      <>
        7.4 seconds is how long it takes a recruiter to decide whether a resume
        is worth a closer look, not how long they spend on you overall. In a
        separate{" "}
        <a
          href="https://www.interviewpal.com/blog/how-long-recruiters-actually-spend-reading-your-resume-data-study"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          2025 study of 4,289 resume reviews
        </a>
        , 72% of recruiters spent under two minutes on a resume once it made the
        shortlist.
      </>
    ),
  },
  {
    title: "ATS isn't built to auto-reject you.",
    body: (
      <>
        Having a good resume and the keywords will give you higher priority, but
        won&rsquo;t auto-reject; recruiters write the search and filter queries
        themselves. In a survey of 25 US recruiters, only 8% ever configured
        hard auto-rejection by keyword score, and{" "}
        <a
          href="https://blog.theinterviewguys.com/ats-resume-rejection-myth/"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          the famous &ldquo;75% rejected&rdquo; claim
        </a>{" "}
        traces back to an unsourced 2012 vendor pitch.
      </>
    ),
  },
  {
    title: "The parser is dumb.",
    body: (
      <>
        Contact info tucked into a header might be dropped, two-column layouts
        often get flattened into a single jumbled column, and{" "}
        <a
          href="https://www.atshiring.com/en/learn/can-ats-read-tables-columns-icons-design"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          tables used for layout have a high failure rate
        </a>{" "}
        that attaches a job title to the wrong employer&rsquo;s dates.
      </>
    ),
  },
  {
    title: "From the recruiter's perspective.",
    body: (
      <>
        The average corporate job posting drew{" "}
        <a
          href="https://www.hrdive.com/news/hiring-benchmarks-report-employ-2025-more-applicants/809604/"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          257.6 applications in 2025, up from 207.2 the year before
        </a>
        . So algorithmic rejection is just being applicant #200 in the stack.
      </>
    ),
  },
] as const;

export default function WhyThisExists() {
  return (
    <section aria-labelledby="why-heading" className="mt-8">
      <h2
        id="why-heading"
        className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
      >
        Why this exists
      </h2>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {STATS.map((stat) => (
          <li
            key={stat.value}
            className="rounded-lg border border-blue-100 bg-blue-50/40 p-4 dark:border-blue-900/40 dark:bg-blue-950/20"
          >
            <p className="text-2xl font-semibold tracking-tight text-blue-800 dark:text-blue-300">
              {stat.value}
            </p>
            <p className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-400">
              {stat.label}
            </p>
            <a
              href={stat.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-2 inline-block text-xs text-neutral-500 ${LINK}`}
            >
              {stat.source}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        But it makes sense to use a parser: Automate what you can, let the
        recruiter consider what matters.&nbsp;
        <strong>
          And just because you filter out one good candidate doesn&rsquo;t mean
          there aren&rsquo;t more to fill in that gap.
        </strong>
      </p>

      <h3 className="mt-6 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        What I learned about job application pipelines
      </h3>

      <dl className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        {DEEPER_FACTS.map((fact) => (
          <div key={fact.title}>
            <dt className="font-medium text-neutral-900 dark:text-neutral-100">
              {fact.title}
            </dt>
            <dd className="mt-0.5">{fact.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
