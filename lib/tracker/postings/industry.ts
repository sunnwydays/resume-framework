// The industry line under a company in the Postings table. Jobright's category
// text looks like "Artificial Intelligence (AI) · Growth Stage"; only the first
// part is the industry, and a few long names have a shorter form. Display only:
// the stored text is unchanged, so search and the clearance check still see it all.
const SHORT: Record<string, string> = {
  "information technology": "IT",
  telecommunications: "Telecom",
  "telecom & communications": "Telecom",
  "cloud computing": "Cloud",
  "media and entertainment": "Media",
};

export function industryLabel(categories: string): string {
  const industry = categories.split(" · ")[0].trim();
  // "Artificial Intelligence (AI)" -> "AI"
  const acronym = /\(([A-Z][A-Z0-9]{1,5})\)\s*$/.exec(industry);
  if (acronym) return acronym[1];
  return SHORT[industry.toLowerCase()] ?? industry;
}
