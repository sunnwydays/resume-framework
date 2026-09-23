// Public, production-visible sample resumes for the "Try a sample" gallery
// (components/SampleGallery.tsx). Unlike lib/mocks (dev-only, gitignored,
// real PII), everything here is meant to be committed and shown to anyone.
//
// To add a sample:
//   1. Drop the PDF in public/samples/<slug>.pdf
//   2. Run it through the real parse flow once (upload it via the app, or
//      POST it to /api/ats-parse) and save the JSON response verbatim as
//      lib/samples/<slug>.json — never hand-write/fabricate this, it has
//      to match what Affinda actually returns for that exact PDF.
//   3. Import the JSON below and add a SAMPLE_RESUMES entry for it.

import { AtsParseResult } from "@/lib/types";

import pragmaticEngineerResult from "./pragmatic_engineer.json";
import genericSoftwareResumeResult from "./generic_software_resume.json";

export interface SampleResume {
  id: string;
  label: string;
  description: string;
  pdfPath: string;
  fileName: string;
  result: AtsParseResult;
}

export const SAMPLE_RESUMES: SampleResume[] = [
  {
    id: "pragmatic-engineer",
    label: "Engineering leader resume",
    description: "A well-known resume template shared publicly via pragmaticengineer.com.",
    pdfPath: "/samples/pragmatic_engineer.pdf",
    fileName: "pragmatic_engineer.pdf",
    result: pragmaticEngineerResult as AtsParseResult,
  },
  {
    id: "generic-software-resume",
    label: "Software engineer resume",
    description: "A widely used open-source software engineer resume template.",
    pdfPath: "/samples/generic_software_resume.pdf",
    fileName: "generic_software_resume.pdf",
    result: genericSoftwareResumeResult as AtsParseResult,
  },
];
