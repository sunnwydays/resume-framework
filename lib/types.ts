// Core data shapes shared across the app and API routes.

// Affinda resume parser response shape
// Only the fields the UI actually reads are typed strictly,
// other fields are set as unknown.

export interface AtsDateRange {
  start?: { date: string; precision: string };
  end?: { date: string; precision: string };
  durationMonths?: number;
}

export interface AtsLocation {
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  formatted?: string;
  raw?: string;
}

export interface AtsContact {
  emails?: string[];
  phoneNumbers?: {
    raw: string;
    formatted: string;
    nationalNumber: string;
    countryCode: string;
    callingCode: number;
  }[];
  websites?: { url: string; domain: string; type: string }[];
}

export interface AtsPerson {
  name?: { given?: string; middle?: string; family?: string } | null;
  location?: AtsLocation;
}

export interface AtsEducation {
  institution: string;
  level?: string;
  qualification?: string;
  fieldsOfStudy?: string[];
  dateRange?: AtsDateRange;
  location?: AtsLocation;
  grade?: { metric?: string; value?: string };
  minors?: string[];
}

export interface AtsWorkExperience {
  organization: string;
  jobTitle: string;
  description?: string;
  dateRange?: AtsDateRange;
  location?: AtsLocation;
  employmentType?: string;
}

export interface AtsProject {
  title?: string;
  description?: string;
  dateRange?: AtsDateRange;
}

export interface AtsSkill {
  name: string;
  text: string;
  experienceMonths?: number;
}

export interface AtsResumeData {
  contact: AtsContact;
  person: AtsPerson;
  education: AtsEducation[];
  workExperience: AtsWorkExperience[];
  projects: AtsProject[];
  skills: AtsSkill[];
  achievements: string[];
  rawText: string;
  [key: string]: unknown;
}

export interface AtsMeta {
  document?: {
    classification?: { confidence?: number; label?: string; modelVersion?: string };
    extractionQuality?: { band?: string; score?: number };
  };
  [key: string]: unknown;
}

export interface AtsParseResult {
  data: AtsResumeData;
  meta?: AtsMeta;
}

export type AtsParseResponse = AtsParseResult | { error: string };
