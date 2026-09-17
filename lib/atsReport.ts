// Runs every atsReview rule over a parse result and grades it, in one place,
// so page.tsx can compute it once and hand the same report to both the
// section nav (counts + dots) and AtsResult (the full breakdown).

import {
  flattenEntriesReview,
  flattenSectionReview,
  gradeSections,
  ResumeGrade,
} from "./atsGrade";
import {
  AchievementsReview,
  AtsIssue,
  ContactIssues,
  EducationReview,
  PersonIssues,
  ProjectsReview,
  reviewAchievements,
  reviewContact,
  reviewEducation,
  reviewMeta,
  reviewPerson,
  reviewProjects,
  reviewRawText,
  reviewWorkExperiences,
  SectionReview,
  WorkExperiencesReview,
} from "./atsReview";
import {
  AtsContact,
  AtsEducation,
  AtsParseResult,
  AtsPerson,
  AtsProject,
  AtsSkill,
  AtsWorkExperience,
} from "./types";

// Derives a stable anchor id from a section label (e.g. "Work experience"
// -> "section-work-experience"). Used for the <Section id> in AtsResult and
// for every link that targets it (score card rows, SectionNav).
export function sectionId(label: string): string {
  return `section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export interface AtsReport {
  contact: Required<AtsContact>;
  contactIssues: SectionReview<ContactIssues>;
  person: AtsPerson;
  personIssues: SectionReview<PersonIssues>;
  education: AtsEducation[];
  educationReview: EducationReview;
  workExperience: AtsWorkExperience[];
  workReview: WorkExperiencesReview;
  projects: AtsProject[];
  projectReview: ProjectsReview;
  skills: AtsSkill[];
  achievements: string[];
  achievementsReview: AchievementsReview;
  metaIssues: AtsIssue[];
  rawTextIssues: AtsIssue[];
  grade: ResumeGrade;
}

export function buildAtsReport(result: AtsParseResult): AtsReport {
  const { data, meta } = result;
  const contact = {
    emails: data.contact?.emails ?? [],
    phoneNumbers: data.contact?.phoneNumbers ?? [],
    websites: data.contact?.websites ?? [],
  };
  const contactIssues = reviewContact(contact, data.rawText ?? "");
  const person = { name: data.person?.name ?? {}, location: data.person?.location };
  const personIssues = reviewPerson(person);
  const education = data.education ?? [];
  const educationReview = reviewEducation(education);
  const workExperience = data.workExperience ?? [];
  const workReview = reviewWorkExperiences(workExperience);
  const projects = data.projects ?? [];
  const projectReview = reviewProjects(projects);
  const skills = data.skills ?? [];
  const achievements = data.achievements ?? [];
  const achievementsReview = reviewAchievements(achievements);
  const metaIssues = reviewMeta(meta);
  const rawTextIssues = reviewRawText(data.rawText ?? "");

  // Same order as the sections in AtsResult so the breakdown reads
  // top-to-bottom.
  const grade = gradeSections([
    { label: "Parse quality", issues: [...metaIssues, ...rawTextIssues] },
    { label: "Personal info", issues: flattenSectionReview(personIssues) },
    { label: "Contact", issues: flattenSectionReview(contactIssues) },
    { label: "Education", issues: flattenEntriesReview(educationReview) },
    { label: "Work experience", issues: flattenEntriesReview(workReview) },
    { label: "Projects", issues: flattenEntriesReview(projectReview) },
    { label: "Achievements", issues: flattenEntriesReview(achievementsReview) },
  ]);

  return {
    contact,
    contactIssues,
    person,
    personIssues,
    education,
    educationReview,
    workExperience,
    workReview,
    projects,
    projectReview,
    skills,
    achievements,
    achievementsReview,
    metaIssues,
    rawTextIssues,
    grade,
  };
}
