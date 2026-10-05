import { describe, expect, it } from "vitest";
import { classify } from "@/lib/tracker/email/classify";
import { extractFields } from "@/lib/tracker/email/fields";
import { mail } from "../helpers/email";

const kindOf = (m: Parameters<typeof classify>[0]) => {
  const c = classify(m);
  return c.kind;
};

describe("classify: rejections hide inside 'thank you' emails", () => {
  it("reads 'decision to not move forward' (a confirmation-style opening)", () => {
    const m = mail({
      fromAddress: "no-reply@talent.northwind.com",
      subject: "Important information about your application to Northwind",
      text: "Hi Sam, Thank you for taking the time to apply for the Software Engineering Intern, Backend (Summer 2027) position. We've been fortunate to have a fantastic response. However, after careful consideration, we've made the decision to not move forward with the interview process at this time.",
    });
    expect(kindOf(m)).toBe("rejection");
  });

  it("reads 'unable to proceed further' from an iCIMS auto-reply", () => {
    const m = mail({
      fromAddress: "acme+autoreply@talent.icims.com",
      subject: "Application Status from Canada",
      text: "Dear Sam, Thank you very much for your recent application to the Software Engineer Intern, 2027 Canada position at Acme. Unfortunately after careful review, we are unable to proceed further with your application as it does not meet the eligibility requirements.",
    });
    expect(kindOf(m)).toBe("rejection");
  });

  it.each([
    "we aren't moving forward with your application",
    "we will not be moving forward with your candidacy",
    "we won't be moving forward at this time",
    "we have decided not to move forward at this stage",
    "we have decided to move forward with other candidates",
    "you were not selected for the role",
    "You have not been selected to move forward in the hiring process",
    "we regret to inform you that",
    "we've determined that there isn't an ideal fit at this time",
    "your application was not successful this time",
    "after careful consideration of your background, we have decided to pursue other candidates",
  ])("rejection phrase: %s", (phrase) => {
    const m = mail({
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: "Thank you for applying to Zephyr",
      text: `Hi Sam, thank you for applying. ${phrase}.`,
    });
    expect(kindOf(m)).toBe("rejection");
  });

  it("does not treat 'we may not be able to reach out' as a rejection", () => {
    const m = mail({
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: "Thank you for your application for Software Engineer Intern, Test Automation (Summer 2027)!",
      text: "Hi Sam, Thank you for your interest in the Software Engineer Intern, Test Automation (Summer 2027) position. Due to the high volume of applications, we may not be able to reach out to every applicant. However, your application will be thoughtfully reviewed. Early Talent Programs at Zephyr",
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("reads LinkedIn's tracking URL when the text is empty", () => {
    const m = mail({
      fromAddress: "jobs-noreply@linkedin.com",
      subject: "Your application to Backend Developer Intern at Globex",
      text: "Your update from Globex. Learn why we included this: https://www.linkedin.com/help/linkedin/answer/4788?lipi=urn%3Ali%3Apage%3Aemail_email_jobs_application_rejected_01",
    });
    expect(kindOf(m)).toBe("rejection");
  });
});

describe("classify: other kinds", () => {
  it("confirmation", () => {
    const m = mail({
      fromAddress: "no-reply@ashbyhq.com",
      subject: "Thank you for applying to Hooli!",
      text: "Sam, Thanks so much for applying for the Software Engineer Intern (Summer 2027) role at Hooli!",
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("OA invite with a platform deadline", () => {
    const m = mail({
      fromAddress: "support@hackerrankforwork.com",
      subject: "Your HackerRank [Spring 2027] AI/ML SWE Intern Coding Test Invitation",
      text: "Thank you for your interest in joining Contoso! We're excited to invite you to the next step: the HackerRank coding test assessment.",
    });
    expect(kindOf(m)).toBe("oa_invite");
  });

  it("a company's own assessment invite", () => {
    const m = mail({
      fromAddress: "no-reply@umbrella.com",
      subject: "Invitation for assessments",
      text: "Thanks again for your interest in the Software Engineer Intern role. We would like to invite you to complete the assessments. Please complete the assessments by October 5, 2026.",
    });
    expect(kindOf(m)).toBe("oa_invite");
  });

  it("a reminder is not a second invite", () => {
    const m = mail({
      fromAddress: "no-reply@codesignal.com",
      subject: "Reminder: Acme is waiting for your Acme Frontend Challenge Assessment result on CodeSignal",
      text: "This is a reminder that you've just been invited by someone from Acme to take Acme Frontend Challenge Assessment.",
    });
    expect(kindOf(m)).toBe("reminder");
  });

  it("assessment completed", () => {
    const m = mail({
      fromAddress: "no-reply@codesignal.com",
      subject: "Assessment completed: Acme Frontend Challenge Assessment",
      text: "Hi Sam, You have completed the Acme Frontend Challenge Assessment on September 26th, 6:34 pm PDT.",
    });
    expect(kindOf(m)).toBe("assessment_done");
  });

  it("video interview", () => {
    const m = mail({
      fromAddress: "noreply@hirevue.com",
      subject: "Complete your HireVue interview for Initech",
      text: "You have been invited to record your answers to a few questions for your application.",
    });
    expect(kindOf(m)).toBe("video_invite");
  });

  it("interview invite", () => {
    const m = mail({
      fromAddress: "recruiting@initech.com",
      subject: "Next steps for your Initech application",
      text: "We were impressed by your application for the Software Engineer Intern position and would like to schedule an interview with you. Please pick a time that works.",
    });
    expect(kindOf(m)).toBe("interview_invite");
  });

  it("an interview's mention in a confirmation stays a confirmation", () => {
    const m = mail({
      fromAddress: "no-reply@umbrella.com",
      subject: "Prepare for your application process with Umbrella",
      text: "Exciting news! Your application has been received. We'd like to share some information to help prepare you for the interview process.",
    });
    expect(kindOf(m)).toBe("confirmation");
  });
});

describe("classify: things that are not job emails", () => {
  it("ignores a started-but-unfinished application", () => {
    const m = mail({
      fromAddress: "noreply@mail.bigshop.jobs",
      subject: "Keep track of your application",
      text: "Thank you for your interest in Software Development Engineer Intern. If you have completed the application: Great! You can now check its status.",
    });
    const c = classify(m);
    expect(c.kind).toBeNull();
  });

  it.each([
    ["a tryout cut from a personal address", "open.club@gmail.com", "Tryout update", "Unfortunately, you have not been selected for our A team. Thank you for your application."],
    ["a fitness app", "no-reply@strava.com", "Your missing heart rate data", "Unfortunately, you haven't allowed access."],
    ["the university", "registrar@campus.example.edu", "Reminder: Response requested. Assessment of Prof. Smith", "Professor Smith is being considered for promotion. Your application of feedback is requested."],
    ["a newsletter", "news@somestore.com", "Big sale this weekend", "Save 30% on everything. Unsubscribe anytime."],
    ["a Google account notice", "noreply-accounts@google.com", "You shared some Google Account data with CodeSignal", "You used Sign in with Google to sign in to CodeSignal."],
  ])("%s", (_name, from, subject, text) => {
    expect(classify(mail({ fromAddress: from, subject, text })).kind).toBeNull();
  });

  it.each([
    ["noreply@jobright.ai", "Globex just posted a 89% match Software Engineer Intern, Backend (Summer 2027) role 1 hour ago"],
    ["jobalerts-noreply@linkedin.com", "Software engineer intern: Initech and 12 more new jobs"],
    ["alerts@someboard.example", "New jobs for you: Backend Intern"],
  ])("job alerts are set aside, not read as applications: %s", (from, subject) => {
    const c = classify(mail({ fromAddress: from, subject, text: "Apply now. Thanks for applying to more roles with us!" }));
    expect(c).toEqual({ kind: null, reason: "job alert (not handled yet)" });
  });
});

describe("extractFields: company, role, job id", () => {
  it("Greenhouse confirmation: role from the subject, company from the signature", () => {
    const f = extractFields(
      mail({
        fromAddress: "no-reply@us.greenhouse-mail.io",
        subject: "Thank you for your application for Software Engineer Intern, Test Automation (Summer 2027)!",
        text: "Hi Sam, Thank you for your interest in the Software Engineer Intern, Test Automation (Summer 2027) position. We will contact you.\n\nThank you!\n\nEarly Talent Programs at Zephyr",
      }),
      "confirmation"
    );
    expect(f.role).toBe("Software Engineer Intern, Test Automation (Summer 2027)");
    expect(f.company).toBe("Zephyr");
    expect(f.origins.company).toMatch(/signature/);
  });

  it.each([
    ["Thank you for applying to Soylent", "Soylent"],
    ["Thank you for your interest in Tyrell, Sam Lee", "Tyrell"],
    ["Your application for Software Engineering Intern 2027 (Toronto) at Oscorp", "Oscorp"],
    ["Thanks for applying to Software Engineer Intern (Req ID 300003) at Massive Dynamic!", "Massive Dynamic"],
    ["You're In! Thanks For Applying To Pied Piper Robotix Inc", "Pied Piper Robotix Inc"],
    ["Thank you for applying to Hooli!", "Hooli"],
  ])("company from the subject: %s", (subject, company) => {
    const f = extractFields(
      mail({ fromAddress: "no-reply@us.greenhouse-mail.io", subject, text: "Thanks for applying." }),
      "confirmation"
    );
    expect(f.company).toBe(company);
  });

  it("Workday rejection: both from the subject, job id from the body", () => {
    const f = extractFields(
      mail({
        fromAddress: "orbital@myworkday.com",
        subject: "You were not selected for Software Engineering Intern - Robotics R&D at Orbital Health",
        text: "Hello Sam, you were not selected for the role of Software Engineering Intern - Robotics R&D R-055501.",
      }),
      "rejection"
    );
    expect(f.company).toBe("Orbital Health");
    expect(f.role).toBe("Software Engineering Intern - Robotics R&D");
    expect(f.jobId).toBe("R-055501");
  });

  it("Workday: tenant from the address when nothing better is in the mail", () => {
    const f = extractFields(
      mail({ fromAddress: "umbrella@myworkday.com", subject: "Update", text: "Thanks for applying." }),
      "confirmation"
    );
    expect(f.company).toBe("Umbrella");
    expect(f.origins.company).toMatch(/guess/);
  });

  it("iCIMS body template gives role and company", () => {
    const f = extractFields(
      mail({
        fromAddress: "acme+autoreply@talent.icims.com",
        subject: "Application Status from Canada",
        text: "Dear Sam, Thank you very much for your recent application to the Software Engineer Intern, 2027 Canada position at Acme. It's wonderful.",
      }),
      "rejection"
    );
    expect(f.role).toBe("Software Engineer Intern, 2027 Canada");
    expect(f.company).toBe("Acme");
  });

  it("Ashby assessment-instruction mail: company and role from the pipes", () => {
    const f = extractFields(
      mail({
        fromAddress: "no-reply@ashbyhq.com",
        subject: "Cyberdyne | HackerRank AI Instructions | Software Engineer Intern (AI / ML) - Spring 2027",
        text: "Hi Sam, Thank you for taking the time to apply! As a next step, we would like to invite you to complete our online assessment.",
      }),
      "oa_invite"
    );
    expect(f.company).toBe("Cyberdyne");
    expect(f.role).toBe("Software Engineer Intern (AI / ML) - Spring 2027");
  });

  it("LinkedIn subject", () => {
    const f = extractFields(
      mail({ fromAddress: "jobs-noreply@linkedin.com", subject: "Your application to Backend Developer Intern at Globex", text: "Your update from Globex" }),
      "rejection"
    );
    expect(f.role).toBe("Backend Developer Intern");
    expect(f.company).toBe("Globex");
  });

  it.each([
    ["Ref: 170001 - Software Developer Intern 2027", "170001"],
    ["position (ID: 20000001) Thank you", "20000001"],
    ["Req ID 300003 at Massive Dynamic", "300003"],
    ["Job number: 400000004", "400000004"],
    ["(Job ID: 055555 )", "055555"],
  ])("job id: %s", (text, id) => {
    const f = extractFields(mail({ fromAddress: "x@initech.com", subject: "Thanks for applying", text }), "confirmation");
    expect(f.jobId).toBe(id);
  });

  it("strips the job id out of the role", () => {
    const f = extractFields(
      mail({
        fromAddress: "no-reply@mail.bigshop.jobs",
        subject: "Thank you for applying",
        text: "We've received your application for the Software Development Engineer Intern, Cloud Database - 2027 (US) (ID: 20000001) position. What happens next?",
      }),
      "confirmation"
    );
    expect(f.role).toBe("Software Development Engineer Intern, Cloud Database - 2027 (US)");
    expect(f.jobId).toBe("20000001");
  });

  it("falls back to the sender's domain for the company", () => {
    const f = extractFields(
      mail({ fromAddress: "donotreply@email.careers.wonkaworks.com", subject: "Thank you for your application!", text: "Thank you." }),
      "confirmation"
    );
    expect(f.company).toBe("Wonkaworks");
    expect(f.origins.company).toMatch(/domain/);
  });
});

describe("fixes from the first inbox review", () => {
  it("a hackathon application is an event, not a job", () => {
    const viaLuma = mail({
      fromAddress: "initech.ai@calendar.luma-mail.com",
      subject: "Registration pending: Initech AI Toronto Hackathon",
      text: "You are pending approval for Initech AI Toronto Hackathon. Hey! Thanks for applying to Initech's Hackathon. We're reviewing every application ourselves.",
    });
    expect(classify(viaLuma)).toEqual({ kind: null, reason: "event, not a job" });
    const direct = mail({
      fromAddress: "events@initech.ai",
      subject: "Thanks for applying to our hackathon",
      text: "Thanks for applying! We received your application for the hackathon.",
    });
    expect(classify(direct).kind).toBeNull();
  });

  it("Indeed Apply confirms an application (it's not an Indeed job alert)", () => {
    const m = mail({
      fromAddress: "indeedapply@indeed.com",
      fromName: "Indeed Apply",
      subject: "Indeed Application: Robotics Intern",
      text: "Your application has been submitted. Good luck! If you notice an error in your application, please Contact Indeed",
      links: [
        { url: "https://apply.indeed.com/indeedapply/confirmemail/viewjob?next=http%3A%2F%2Fca.indeed.com%2Fjob%2Frobotics-intern", label: "Robotics Intern" },
        { url: "http://ca.indeed.com/cmp/Globex-Robotics-Limited?campaignid=IAconfirm", label: "Globex Robotics Limited" },
      ],
    });
    expect(classify(m).kind).toBe("confirmation");
    const f = extractFields(m, "confirmation");
    expect(f.role).toBe("Robotics Intern");
    expect(f.company).toBe("Globex Robotics Limited");
  });

  it("'thank you for completing the first part of your application' + a video interview is a video invite", () => {
    const m = mail({
      fromAddress: "zephyr@hiringplatform.com",
      subject: "Sam, you are moving forward to a Video Interview with Zephyr for the Summer 2027 Zephyr Software Engineering Intern position",
      text: "Hello Sam, Thank you for completing the first part of your Zephyr Internship application! As a next step in the process, please follow the instructions below to complete your VidCruiter video interview. Please complete your interview by No Deadline Configured .",
    });
    expect(classify(m).kind).toBe("video_invite");
    const f = extractFields(m, "video_invite");
    expect(f.company).toBe("Zephyr");
    expect(f.role).toBe("Summer 2027 Zephyr Software Engineering Intern");
    expect(f.dueAt).toBeNull();
  });

  it("'your assessments expire in 24 hours' is an OA reminder, with its deadline", () => {
    const m = mail({
      fromAddress: "noreply@email.initech.com",
      subject: "[Action Required] Your Initech Assessments Expire in 24 hours",
      text: "Your Assessments Expire in 24 Hours\nHi Sam,\n\nThank you for your continued interest in Initech! Quick reminder that your assessments expire in 24 hours at 06:00pm PT on Sunday, October 04, 2026.\n\nRobots (25 minutes): Incomplete",
    });
    expect(classify(m).kind).toBe("reminder");
    const f = extractFields(m, "reminder");
    expect(f.company).toBe("Initech");
    expect(f.dueAt).toBe("2026-10-05T01:00:00.000Z");
  });
});

describe("fixes from the second inbox review", () => {
  const fieldsOf = (m: Parameters<typeof mail>[0], kind: Parameters<typeof extractFields>[1] = "confirmation") =>
    extractFields(mail(m), kind);

  it("CodeSignal reminder: the company is in the subject and the 'sent from' line", () => {
    const f = fieldsOf(
      {
        fromAddress: "no-reply@codesignal.com",
        fromName: "CodeSignal",
        subject: "Reminder: Globex is waiting for your Globex Frontend Challenge Assessment result on CodeSignal",
        text: "This is a reminder that you've just been invited by someone from Globex to take Globex Frontend Challenge Assessment. Sent from Globex through CodeSignal.",
      },
      "reminder"
    );
    expect(f.company).toBe("Globex");
    expect(f.assessmentTitle).toBe("Globex Frontend Challenge Assessment");
  });

  it("'Next Steps' with a Ref line: role from the Ref line, not the boilerplate", () => {
    const f = fieldsOf(
      {
        fromAddress: "talent@bigco.com",
        fromName: "BigCo Talent Acquisition",
        subject: "Your BigCo Application: Next Steps",
        text: "Ref: 170002 - SW Developer Intern | AI Center of Excellence\n\nDear Sam,\n\nWe are excited to see that you have applied for a position at BigCo. Please note that this form must be completed for each position you apply for that requires an assessment.",
      },
      "oa_invite"
    );
    expect(f.role).toBe("SW Developer Intern | AI Center of Excellence");
    expect(f.jobId).toBe("170002");
  });

  it("'applying for other positions in the future' is not a role", () => {
    const f = fieldsOf({ fromAddress: "no-reply@globex.com", subject: "Thanks for your interest in Globex!", text: "We encourage you to keep applying for other positions in the future." }, "rejection");
    expect(f.role).toBeNull();
  });

  it("Workday: company from the display name, job id leading the role", () => {
    const f = fieldsOf(
      {
        fromAddress: "globalhr@myworkday.com",
        fromName: "Stark Workday Notifications",
        subject: "Update on your Application",
        text: "Hello Sam, we are writing to let you know that you were not selected for the role of 09999999 Software Engineering Intern (Summer 2027). We wish you the best.",
      },
      "rejection"
    );
    expect(f.company).toBe("Stark");
    expect(f.role).toBe("Software Engineering Intern (Summer 2027)");
    expect(f.jobId).toBe("09999999");
  });

  it("a department or recruiter name loses to the company's own domain", () => {
    expect(fieldsOf({ fromAddress: "assessment-support@initech.com", fromName: "Early Career Talent Support", subject: "Reminder from Initech!", text: "You haven't had a chance to complete your assessments yet." }, "reminder").company).toBe("Initech");
    expect(fieldsOf({ fromAddress: "pat@xwf.globex.com", fromName: "Pat Quinn Morgan S", subject: "Globex Application- Sam Lee", text: "Thank you for completing the coding exercise for your application." }, "assessment_done").company).toBe("Globex");
  });

  it("…but a display name that agrees with the domain keeps its nicer spelling", () => {
    expect(fieldsOf({ fromAddress: "no-reply@flyzephyr.com", fromName: "Zephyr", subject: "Update", text: "Thanks for applying." }).company).toBe("Zephyr");
  });

  it("an ATS display name like 'X Inc. Careers' is the company", () => {
    expect(fieldsOf({ fromAddress: "no-reply@ashbyhq.com", fromName: "Gringotts Inc. Careers", subject: "Gringotts Application", text: "After careful review we've made the decision to not move forward." }, "rejection").company).toMatch(/^Gringotts/);
  });

  it("'Thank you for applying to Technology Internship' names a role, and 'Update on your Application' names no company", () => {
    const f = fieldsOf({ fromAddress: "abco@myworkday.com", subject: "Thank you for applying to Technology Internship", text: "Thank you for considering a career with AB Co." });
    expect(f.role).toBe("Technology Internship");
    expect(f.company).toBe("AB Co");
    const g = fieldsOf({ fromAddress: "no-reply@initech.com", subject: "Update on your Application", text: "Thanks." }, "rejection");
    expect(g.company).toBe("Initech");
  });
});

describe("fixes from the live test", () => {
  it("a process timeline naming each round is a confirmation, not an invite", () => {
    const m = mail({
      fromAddress: "recruiting@globex.com",
      subject: "Globex Software Engineer Internship Timeline",
      text: [
        "Hi Sam,",
        "Thank you so much for applying to the Software Engineer, Intern role at Globex! Applications are now closed.",
        "Timeline & Next Steps:",
        "CodeSignal: All candidates invited to complete a CodeSignal will be notified by 10/7",
        "Karat: All candidates invited to complete a Karat will be notified by 10/16",
        "Virtual Onsites: Final round interview invites will be sent 10/20 - 10/30.",
        "Thank you for your patience.",
      ].join("\n"),
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("'if selected, you'll be invited to an assessment' is a confirmation", () => {
    const m = mail({
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: "Thanks for applying to Initech",
      text: "Thank you for applying to Initech. If you are selected to move forward, you will receive an invitation to complete our online assessment.",
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("'if you are not selected, keep an eye on our jobs page' is a confirmation, not a rejection", () => {
    const m = mail({
      fromAddress: "no-reply@hire.lever.co",
      subject: "Thank you for your application to Globex",
      text: [
        "Hi Sam,",
        "Thank you for your interest in Globex! We wanted to let you know we received your application for Product Research Internship - Summer 2027, and we are delighted that you would consider joining our team.",
        "Our team will review your application and will be in touch if your qualifications match our needs for the role. If you are not selected for this position, keep an eye on our jobs page as we're growing and adding openings.",
        "Best,\nThe Globex Team",
      ].join("\n\n"),
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("'we've made the decision to not move forward' (Lever follow-up) is a rejection", () => {
    const m = mail({
      fromAddress: "no-reply@hire.lever.co",
      subject: "Application Follow Up - Product Research Internship - Summer 2027 @ Globex",
      text: [
        "Hi Sam,",
        "Thank you for your interest in the Product Research Internship - Summer 2027 position at Globex. Thanks so much for sending your resume our way.",
        "After reviewing your work and experience, we've made the decision to not move forward at this time. This was a really competitive process. I hope you don't mind if we reach out to you if a similar position opens up down the line that would be a better fit.",
      ].join("\n"),
    });
    expect(kindOf(m)).toBe("rejection");
  });

  it("'you may receive an invitation to take a coding assessment' is a confirmation", () => {
    const m = mail({
      fromAddress: "initech@myworkday.com",
      subject: "Your application to 2027 Summer Intern - Robotics Engineer is in!",
      text: [
        "Dear Sam,",
        "Thanks for applying to Initech. We appreciate your interest and will review your application promptly.",
        "If you are applying to a role that requires coding skills, you may receive an invitation to take a coding assessment. You will receive a separate email within 24 hours (make sure to check your SPAM folder) providing further instructions to complete the coding assessment.",
        "Once your initial application and assessment results (if applicable) have been reviewed, you will receive an update.",
      ].join("\n\n"),
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("a portal's 'if the job goes inactive, you were not selected' is a confirmation, not a rejection", () => {
    const m = mail({
      fromAddress: "recruiting@globex.com",
      subject: "Thank you for applying to Globex",
      text: [
        "Hi Sam,",
        "Thank you for taking the time to submit your application for Software Engineer: Intern Opportunities, Springfield (Job number: 100000001). We're glad you're interested in a career at Globex.",
        "You may not receive feedback from us on your application directly. If you're selected for an interview, you'll be notified by the recruiting team.",
        "Updates regarding your application status can be viewed through your portal. If you see the job moved to an inactive state, that means the position is either no longer open, you withdrew from consideration, or you were not selected for the role.",
      ].join("\n\n"),
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("…while a plain 'you were not selected' is still a rejection", () => {
    const m = mail({
      fromAddress: "recruiting@globex.com",
      subject: "Your Globex application",
      text: "Hi Sam, thank you for your interest. After review, you were not selected for the role.",
    });
    expect(kindOf(m)).toBe("rejection");
  });

  it("RippleMatch: the company and role come from the body, not the recruiter's name", () => {
    const m = mail({
      fromAddress: "pat@ripplematch.com",
      fromName: "Pat Lee",
      subject: "Next steps with Vandelay Industries",
      text: [
        "Hi Sam,",
        "Great news! After reviewing your profile, Vandelay Industries would like to move forward with next steps for the position: Import Analyst Internship.",
        "A few more steps are required to get this moving forward:",
        "Formally submit your application directly to Vandelay Industries",
        "Best,\nPat @ RippleMatch",
      ].join("\n\n"),
    });
    const f = extractFields(m, classify(m).kind);
    expect(f.company).toBe("Vandelay Industries");
    expect(f.role).toBe("Import Analyst Internship");
  });

  it("a relay platform's display name is never the company", () => {
    const m = mail({ fromAddress: "pat@ripplematch.com", fromName: "Pat Lee", subject: "Checking in", text: "Thanks for applying." });
    expect(extractFields(m, "confirmation").company).toBeNull();
  });

  it.each([
    "If you are not selected for this position, keep an eye on our jobs page as we're growing.",
    "If you are a top candidate for the role, you will receive a message regarding next steps. If you are not selected, please continue to view our careers page.",
  ])("a confirmation's 'if you are not selected' aside is not a rejection: %s", (aside) => {
    const m = mail({
      fromAddress: "no-reply@ashbyhq.com",
      subject: "Thank you for applying to Globex!",
      text: `Hi Sam, Thanks for applying to our Software Engineer Intern (Summer 2027) position! Your application has been received. ${aside}`,
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("naming the meeting tool in boilerplate isn't an interview invite", () => {
    const m = mail({
      fromAddress: "no-reply@us.greenhouse-mail.io",
      subject: "Thank you for applying to Globex!",
      text: "Hi Sam, Thanks for applying to Globex! Your application for the Software Engineering Intern role has been received.\n\nPlease note that all official communication from Globex will come from email addresses ending with @globex.example or @goodtime.io (our meeting tool).",
    });
    expect(kindOf(m)).toBe("confirmation");
  });

  it("…while a booking link is one", () => {
    const m = mail({
      fromAddress: "recruiting@globex.example",
      subject: "Next steps with Globex",
      text: "Hi Sam, thanks for your application. Please pick a slot that works for you using the link below.",
      links: [{ url: "https://app.goodtime.io/booking/abc123", label: "Pick a time" }],
    });
    expect(kindOf(m)).toBe("interview_invite");
  });

  it("LinkedIn Easy Apply: company from the subject, role and job id from the job card", () => {
    const m = mail({
      fromAddress: "jobs-noreply@linkedin.com",
      fromName: "LinkedIn",
      subject: "Sam, your application was sent to Globex Labs",
      text: [
        "Your application was sent to Globex Labs",
        "",
        "Backend Developer Intern\nGlobex Labs\nSpringfield, OH (Remote)\nView job: https://www.linkedin.com/comm/jobs/view/4400000001/?trackingId=abc",
        "",
        "Applied on September 25, 2026",
        "View similar jobs you may be interested in",
        "Data Engineer Intern\nInitech\nToronto, ON\nView job: https://www.linkedin.com/comm/jobs/view/4400000002/?trackingId=def",
      ].join("\n"),
    });
    const f = extractFields(m, classify(m).kind);
    expect(kindOf(m)).toBe("confirmation");
    expect([f.company, f.role, f.jobId]).toEqual(["Globex Labs", "Backend Developer Intern", "4400000001"]);
  });

  describe("'once you've completed' is about later, not done", () => {
    const send = (text: string) =>
      mail({ fromAddress: "no-reply@globex.example", fromName: "Globex Assessments", subject: "Invitation for assessments", text });

    it("an invite", () => {
      const m = send(
        "Dear Sam, Thanks again for your interest in the Software Engineer Intern (Summer 2027) role here at Globex. We would like to invite you to complete the Globex assessments. Please complete the assessments by October 5, 2026.\n▪ Once you've completed all assessments, our team will review your results to determine next steps."
      );
      expect(kindOf(m)).toBe("oa_invite");
    });

    it("a reminder, with the company from the sender's name", () => {
      const m = send(
        "Dear Sam, This is a reminder to complete the Globex online assessments for the Software Engineer Intern role. Please ensure you complete the assessments by October 5, 2026.\nOnce you have completed all outstanding assessments, our recruiting team will review your results."
      );
      expect(kindOf(m)).toBe("reminder");
      expect(extractFields(m, "reminder").company).toBe("Globex");
    });

    it("…while 'you have completed' on its own still is", () => {
      expect(kindOf(send("Dear Sam, you have completed all Globex assessments. Our team will review your results."))).toBe("assessment_done");
    });
  });

  it("a real invite in the same mail still wins", () => {
    const m = mail({
      fromAddress: "recruiting@globex.com",
      subject: "Next steps with Globex",
      text: "Candidates selected for the final round will be notified separately.\nWe'd like to invite you to complete our coding assessment on CodeSignal by Friday.",
    });
    expect(kindOf(m)).toBe("oa_invite");
  });
});

describe("extractFields: deadlines and completion", () => {
  it("platform 'End Login Date/Time' with a zone", () => {
    const f = extractFields(
      mail({
        fromAddress: "support@hackerrankforwork.com",
        subject: "Your HackerRank Coding Test Invitation",
        text: "Duration: 90 min\n\nEnd Login Date/Time: 10 Oct 2026 05:37 AM PDT\n\n(America - Los Angeles)",
      }),
      "oa_invite"
    );
    expect(f.dueAt).toBe("2026-10-10T12:37:00.000Z");
  });

  it("'by 11:59pm PT on Oct 7, 2026' (time before the date, PT in daylight time)", () => {
    const f = extractFields(
      mail({
        fromAddress: "noreply@initech.com",
        subject: "Next steps",
        text: "Please complete the coding exercise by 11:59pm PT on Oct 7, 2026. We can only consider your application if it is completed by the deadline.",
      }),
      "oa_invite"
    );
    expect(f.dueAt).toBe("2026-10-08T06:59:00.000Z");
  });

  it("PT in standard time", () => {
    const f = extractFields(
      mail({ fromAddress: "a@initech.com", subject: "Invitation for assessments", text: "Please complete it by 5:00pm PT on Dec 4, 2026." }),
      "oa_invite"
    );
    expect(f.dueAt).toBe("2026-12-05T01:00:00.000Z");
  });

  it("a date alone means the end of that day, local time", () => {
    const f = extractFields(
      mail({ fromAddress: "no-reply@umbrella.com", subject: "Invitation for assessments", text: "Please complete the assessments by October 5, 2026. The full assessment takes about 2 hours." }),
      "oa_invite"
    );
    expect(f.dueAt).toBe(new Date(2026, 9, 5, 23, 59).toISOString());
  });

  it("'within 14 calendar days' counts from the day it arrived", () => {
    const f = extractFields(
      mail({ fromAddress: "a@initech.com", subject: "Invitation for assessments", text: "Please complete the assessment within 14 calendar days.", receivedAt: "2026-09-25T12:00:00.000Z" }),
      "oa_invite"
    );
    expect(f.dueAt).toBe("2026-10-09T12:00:00.000Z");
  });

  it("an invite with no deadline leaves it empty", () => {
    const f = extractFields(
      mail({ fromAddress: "a@initech.com", subject: "Invitation for assessments", text: "We would like to invite you to complete the assessment." }),
      "oa_invite"
    );
    expect(f.dueAt).toBeNull();
  });

  it("completion time and the test's name", () => {
    const f = extractFields(
      mail({
        fromAddress: "no-reply@codesignal.com",
        subject: "Assessment completed: Acme Frontend Challenge Assessment",
        text: "Hi Sam, You have completed the Acme Frontend Challenge Assessment on September 26th, 6:34 pm PDT.",
        receivedAt: "2026-09-27T01:34:33.000Z",
      }),
      "assessment_done"
    );
    expect(f.completedAt).toBe("2026-09-27T01:34:00.000Z");
    expect(f.assessmentTitle).toBe("Acme Frontend Challenge Assessment");
  });

  it("picks the assessment-platform link, else the 'start' link", () => {
    const platform = extractFields(
      mail({
        fromAddress: "x@initech.com",
        subject: "Invitation for assessments",
        text: "Start here",
        links: [
          { url: "https://initech.com/privacy", label: "Privacy" },
          { url: "https://app.codesignal.com/test/abc", label: "Start" },
        ],
      }),
      "oa_invite"
    );
    expect(platform.link).toBe("https://app.codesignal.com/test/abc");
    const tracked = extractFields(
      mail({
        fromAddress: "talent@bigco.com",
        subject: "Action Required: Coding Assessment",
        text: "Click this URL to start the assessment.",
        links: [{ url: "http://track.bigco.net/ltrk/abc", label: "this URL" }],
      }),
      "oa_invite"
    );
    expect(tracked.link).toBe("http://track.bigco.net/ltrk/abc");
  });
});
