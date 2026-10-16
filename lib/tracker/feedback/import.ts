import { changedKeys, toJson, type FeedbackInsert } from "@/lib/tracker/feedback/events";
import type { AssessmentTarget, ImportPlan, SheetReport } from "@/lib/tracker/io";

const targetKey = (t: AssessmentTarget) => (t === null ? "none" : "existing" in t ? `existing:${t.existing}` : `ref:${t.ref}`);

// A sheet's reading as a flat record: what it was read as, and which field each
// column feeds (by column index).
function sheetReading(sheet: SheetReport): Record<string, unknown> {
  return { kind: sheet.kind, ...Object.fromEntries(sheet.columns.map((c) => [`col:${c.index}`, c.key])) };
}

// What the importer guessed (`auto`: the plan built with no overrides) against
// what was committed (`final`). One event per sheet, with `changed` empty when
// the automatic reading stood; plus one for the assessments' application picks
// when the assessment lists line up row for row.
export function importMappingFeedback(auto: ImportPlan, final: ImportPlan, fileName: string): FeedbackInsert[] {
  const events: FeedbackInsert[] = final.sheets.map((sheet) => {
    const before = auto.sheets.find((s) => s.name === sheet.name);
    const guess = before ? sheetReading(before) : {};
    const after = sheetReading(sheet);
    return {
      surface: "import",
      action: "map",
      subject_id: sheet.name,
      guess: toJson(guess),
      final: toJson(after),
      changed: changedKeys(guess, after),
      context: toJson({
        file: fileName,
        auto_kind: sheet.autoKind,
        headers: sheet.columns.map((c) => ({ index: c.index, header: c.header, sample: c.sample, guessed: c.guessed, manual: c.manual })),
      }),
    };
  });

  if (auto.assessments.length === final.assessments.length && final.assessments.length > 0) {
    const guess: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const rows = final.assessments.map((a, i) => {
      const b = auto.assessments[i];
      guess[`a:${i}`] = { target: targetKey(b.target), include: b.include };
      after[`a:${i}`] = { target: targetKey(a.target), include: a.include };
      return { company: a.company, role: a.role, auto_match: b.match };
    });
    events.push({
      surface: "import",
      action: "map",
      subject_id: "assessment-targets",
      guess: toJson(guess),
      final: toJson(after),
      changed: changedKeys(guess, after),
      context: toJson({ file: fileName, rows }),
    });
  }
  return events;
}
