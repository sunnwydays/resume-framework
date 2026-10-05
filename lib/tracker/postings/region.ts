// US, Canada or elsewhere, from the posting's own text. Derived on every render (never
// stored), so tuning these lists re-labels old rows too. Sunny is a Canadian
// citizen, so US roles are wanted (they'd need a J-1): every region is a category
// to sort by, never a reason to hide anything.

export type Region = "us" | "canada" | "other" | "unknown";

export const REGION_LABEL: Record<Region, string> = { us: "US", canada: "Canada", other: "Elsewhere", unknown: "?" };
// Sort order: US, Canada, unclear, then everywhere else.
export const REGION_ORDER: Record<Region, number> = { us: 0, canada: 1, unknown: 2, other: 3 };

export interface RegionResult {
  region: Region;
  why: string;
}

interface Located {
  role: string;
  location: string | null;
  pay: string | null;
}

// "Pleasanton, CA" is California; Canada's codes never collide with these.
const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" ")
);
const CA_PROVINCE_CODES = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));

const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia",
  "hawaii", "idaho", "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts",
  "michigan", "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
  "new mexico", "new york", "north carolina", "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington", "west virginia",
  "wisconsin", "wyoming", "district of columbia",
];
const CA_PROVINCE_NAMES = [
  "alberta", "british columbia", "manitoba", "new brunswick", "newfoundland", "nova scotia", "northwest territories",
  "nunavut", "ontario", "prince edward island", "quebec", "québec", "saskatchewan", "yukon",
];

// Countries (and common spellings) other than the US and Canada.
const OTHER_COUNTRIES = [
  "united kingdom", "uk", "england", "scotland", "wales", "ireland", "india", "germany", "france", "netherlands", "spain",
  "italy", "poland", "sweden", "norway", "denmark", "finland", "switzerland", "austria", "belgium", "portugal", "israel",
  "singapore", "japan", "china", "hong kong", "taiwan", "south korea", "australia", "new zealand", "brazil", "mexico",
  "argentina", "colombia", "chile", "romania", "ukraine", "turkey", "uae", "united arab emirates", "saudi arabia", "egypt",
  "nigeria", "kenya", "south africa", "philippines", "vietnam", "indonesia", "malaysia", "thailand", "pakistan", "bangladesh",
];

const CA_CITIES = [
  "toronto", "montreal", "montréal", "vancouver", "ottawa", "waterloo", "calgary", "edmonton", "mississauga", "markham",
  "kitchener", "winnipeg", "quebec city", "halifax", "victoria", "burnaby", "brampton", "hamilton", "london, on",
  "richmond hill", "oakville", "burlington", "saskatoon", "regina",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (words: string[]) => new RegExp(`\\b(?:${words.map(escape).join("|")})\\b`, "i");

const US_STATE_NAME_RE = anyOf(US_STATE_NAMES);
const CA_PROVINCE_NAME_RE = anyOf(CA_PROVINCE_NAMES);
const OTHER_COUNTRY_RE = anyOf(OTHER_COUNTRIES);
const CA_CITY_RE = anyOf(CA_CITIES);

function fromLocation(location: string): RegionResult | null {
  if (/\bcanada\b/i.test(location)) return { region: "canada", why: `Location says Canada ("${location}")` };

  // The last ", XX" is the state or province ("Toronto, ON", "Austin, TX (Hybrid)").
  const codes = [...location.matchAll(/,\s*([A-Za-z]{2})\b/g)].map((m) => m[1]);
  const code = codes[codes.length - 1];
  if (code && code === code.toUpperCase()) {
    if (US_STATE_CODES.has(code)) return { region: "us", why: `US state code ${code} ("${location}")` };
    if (CA_PROVINCE_CODES.has(code)) return { region: "canada", why: `Canadian province code ${code} ("${location}")` };
  }

  if (CA_PROVINCE_NAME_RE.test(location)) return { region: "canada", why: `Canadian province named ("${location}")` };
  if (/\bUnited States\b|\bUSA\b|\bU\.S\.A?\.?(?!\w)|\bUS\b/.test(location)) {
    return { region: "us", why: `Location says United States ("${location}")` };
  }
  if (OTHER_COUNTRY_RE.test(location)) return { region: "other", why: `Location is outside the US and Canada ("${location}")` };
  if (US_STATE_NAME_RE.test(location)) return { region: "us", why: `US state named ("${location}")` };
  return null;
}

// Remote / "Multiple locations" / blank: fall back on the pay currency and
// what the title says. A bare "$" says nothing (CAD and USD both use it).
function fromRest({ role, location, pay }: Located): RegionResult {
  const where = location ? `"${location}" doesn't say` : "No location";
  if (pay && /\bCA\$|C\$|CAD\b/.test(pay)) return { region: "canada", why: `${where}; pay is in CA$` };
  if (CA_CITY_RE.test(role) || /\bcanada\b/i.test(role)) return { region: "canada", why: `${where}; the title names a Canadian place` };
  if (/\bUnited States\b|\bUSA\b|\bUS\b|\bU\.S\./.test(role)) return { region: "us", why: `${where}; the title says US` };
  return { region: "unknown", why: `${where}; nothing else in the posting shows the country` };
}

export function postingRegion(p: Located): RegionResult {
  const location = p.location?.trim();
  return (location ? fromLocation(location) : null) ?? fromRest(p);
}
