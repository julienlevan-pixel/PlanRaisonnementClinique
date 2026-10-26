import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultRubric,
  parseRubric,
  rubricSummary,
  scoreCustomSubmission,
} from "./custom-rubric.js";
import type { PanelDistribution } from "./scoring.js";
const caseData = {
  diagnostics: ["A", "B", "C", "D"].map((id) => ({ id })),
  observations: ["a", "b", "c", "d", "e"].map((id) => ({ id })),
};
const panel: PanelDistribution[] = caseData.diagnostics.map(
  (diagnostic, i) => ({
    diagnosticId: diagnostic.id,
    role: "main",
    expertCount: [4, 2, 1, 0][i],
    ceiling: 5,
    observations: caseData.observations.map((row, j) => ({
      observationId: row.id,
      positive: i === 0 ? [4, 3, 2, 1, 0][j] : ([2, 1, 0][i - 1] ?? 0),
      negative: 0,
      positivePoints: 999,
      negativePoints: 0,
      notSelected: 0,
    })),
  }),
);
const choices = caseData.observations.map((row) => ({
  observationId: row.id,
  sign: "+" as const,
}));
test("proposed rubric follows exact 75% and 50% boundaries, ignores expert weights and uses diagnosis frequencies", () => {
  const rubric = defaultRubric(caseData, panel);
  assert.deepEqual(
    rubric.diagnostics.map((row) => row.mainPoints),
    [3, 1, 1, 0],
  );
  assert.deepEqual(
    rubric.diagnostics.map((row) => row.alternativePoints),
    [2, 2, 2, 0],
  );
  assert.deepEqual(
    rubric.diagnostics[0].observations.map((row) => row.positivePoints),
    [1, 1, 0.5, 0, 0],
  );
  assert.deepEqual(
    rubric.diagnostics[0].observations.map((row) => row.negativePoints),
    [0, 0, 0, 0, 0],
  );
  assert.equal(rubricSummary(rubric).maximum, 15);
  assert.equal(rubricSummary(rubric).attainableMaximum, 13);
  const grade = scoreCustomSubmission(rubric, {
    mainDiagnosticId: "A",
    alternativeDiagnosticId: "B",
    mainChoices: choices,
    alternativeChoices: choices,
  });
  assert.equal(grade.total, 12.5);
  assert.equal(grade.maximum, 15);
  assert.equal(grade.percentage, 83.33);
  const none = scoreCustomSubmission(rubric, {
    mainDiagnosticId: "D",
    alternativeDiagnosticId: "B",
    mainChoices: choices,
    alternativeChoices: choices,
  });
  assert.equal(none.mainDiagnosis, 0);
  assert.equal(none.mainJustification, 0);
});
test("signs are independent, ties are accepted and custom points stay capped without normalization", () => {
  const changed = structuredClone(panel);
  changed[1].expertCount = 4;
  changed[0].observations[2].negative = 2;
  const rubric = defaultRubric(caseData, changed);
  assert.equal(rubric.diagnostics[1].mainPoints, 3);
  assert.equal(rubric.diagnostics[0].observations[2].negativePoints, 0.5);
  rubric.diagnostics[0].mainPoints = 4;
  for (const row of rubric.diagnostics[0].observations) row.positivePoints = 2;
  const grade = scoreCustomSubmission(rubric, {
    mainDiagnosticId: "A",
    alternativeDiagnosticId: "B",
    mainChoices: choices,
    alternativeChoices: choices,
  });
  assert.equal(grade.mainDiagnosis, 4);
  assert.equal(grade.mainJustification, 5);
  assert.equal(grade.main.raw, 10);
  assert.equal(grade.maximum, 16);
});
test("rubric validation rejects foreign identifiers, duplicates, negative or fractional precision and excessive totals", () => {
  const rubric = defaultRubric(caseData, panel);
  assert.equal(parseRubric(rubric, caseData, 2).revision, 2);
  for (const mutate of [
    (r: typeof rubric) => {
      r.diagnostics[0].mainPoints = -1;
    },
    (r: typeof rubric) => {
      r.diagnostics[0].mainPoints = 0.333;
    },
    (r: typeof rubric) => {
      r.clinicalMaximum = 100;
    },
    (r: typeof rubric) => {
      r.diagnostics[0].diagnosticId = "foreign";
    },
    (r: typeof rubric) => {
      r.diagnostics[0].observations[0].observationId = "foreign";
    },
    (r: typeof rubric) => {
      r.diagnostics[0].observations[0].observationId = "b";
    },
  ]) {
    const invalid = structuredClone(rubric);
    mutate(invalid);
    assert.throws(() => parseRubric(invalid, caseData, 2));
  }
});
