// The dictionary-entry header for the Arbitrage page: what the word means in
// finance, and what it means for a job search.
export default function ArbitrageHero() {
  return (
    <header className="rounded-xl border border-blue-100 bg-blue-50/40 px-5 py-6 sm:px-8 sm:py-8 dark:border-blue-900/40 dark:bg-blue-950/20">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-4xl font-semibold tracking-tight text-blue-900 sm:text-5xl dark:text-blue-200">
          ar·bi·trage
        </span>
        <span className="font-serif text-lg text-neutral-500">/ˈär-bə-ˌträzh/</span>
        <span className="font-serif text-lg italic text-neutral-500">noun</span>
      </p>
      <ol className="mt-4 max-w-3xl space-y-3 font-serif text-base leading-relaxed sm:text-lg">
        <li className="flex gap-3">
          <span className="font-semibold text-blue-800 dark:text-blue-300">1.</span>
          <span>
            <span className="mr-1.5 text-sm italic text-neutral-500">finance</span>
            Buying where something is underpriced and selling where it&rsquo;s worth more.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="font-semibold text-blue-800 dark:text-blue-300">2.</span>
          <span>
            <span className="mr-1.5 text-sm italic text-neutral-500">job search</span>
            Spending effort where it&rsquo;s underpriced &mdash; a message to a person, a shipped
            project, a founder&rsquo;s inbox &mdash; instead of throwing resumes into the void.
            Little time in, outsized return out.
          </span>
        </li>
      </ol>
      <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-blue-800 dark:text-blue-300">
        Find a job. Or make one.
      </p>
    </header>
  );
}
