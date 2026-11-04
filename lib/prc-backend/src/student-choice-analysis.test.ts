import test from "node:test";
import assert from "node:assert/strict";
import {
  studentChoiceAnalysis,
  type ChoiceResponse,
} from "./student-choice-analysis.js";
import type { PanelDistribution } from "./scoring.js";
const caseData = {
  name: "Toux",
  diagnostics: [
    { id: "a", label: "Asthme" },
    { id: "b", label: "Reflux" },
    { id: "c", label: "Autre" },
  ],
  observations: [
    { id: "o1", text: "Toux nocturne", category: "Symptômes" },
    { id: "o2", text: "Absence de fièvre" },
    { id: "o3", text: "Donnée non retenue" },
  ],
};
const row = (
  main = "a",
  alternative = "b",
  sign: "+" | "-" = "+",
  state = "submitted",
): ChoiceResponse => ({
  state,
  main_diagnostic_id: main,
  alternative_diagnostic_id: alternative,
  main_choices: [{ observationId: "o1", sign }],
  alternative_choices: [{ observationId: "o2", sign: "-" }],
});
const panel: PanelDistribution[] = [
  {
    diagnosticId: "a",
    role: "main",
    expertCount: 2,
    ceiling: 5,
    observations: [
      {
        observationId: "o1",
        positive: 2,
        negative: 0,
        notSelected: 0,
        positivePoints: 6,
      },
    ],
  },
  {
    diagnosticId: "a",
    role: "alternative",
    expertCount: 1,
    ceiling: 5,
    observations: [
      {
        observationId: "o1",
        positive: 0,
        negative: 1,
        notSelected: 0,
        negativePoints: 3,
      },
    ],
  },
];

test("choice percentages combine roles and use the selected diagnosis's students as the clinical denominator", () => {
  const data = studentChoiceAnalysis(
    caseData,
    [
      row(),
      row("b", "a"),
      row("a", "c", "-"),
      row("b", "c"),
      row("a", "b", "+", "draft"),
    ],
    { totalSubmissions: 4, distributions: panel },
  );
  assert.equal(data.submittedCount, 4);
  assert.equal(data.excludedCount, 1);
  const a = data.diagnostics[0];
  assert.equal(a.mainCount, 2);
  assert.equal(a.alternativeCount, 1);
  assert.equal(a.totalCount, 3);
  assert.equal(a.totalPercent, 75);
  assert.equal(a.panelCount, 3);
  assert.equal(a.panelPercent, 75);
  const clinical = a.observations[0];
  assert.equal(clinical.positive, 1);
  assert.equal(clinical.negative, 1);
  assert.equal(clinical.notSelected, 1);
  assert.equal(clinical.positivePercent, 33.3);
  assert.equal(clinical.panelPositive, 2);
  assert.equal(clinical.panelNegative, 1);
  assert.equal(clinical.panelPositivePercent, 66.7);
  assert.equal(a.observations[1].negative, 1);
  assert.equal(a.observations[2].notSelected, 3);
  assert.equal(
    data.diagnostics.reduce((sum, row) => sum + row.totalPercent, 0),
    200,
  );
  assert.equal("copies" in data, false);
  assert.equal("participants" in data, false);
});

test("empty and unselected diagnoses contain all case observations without invented percentages or notes", () => {
  const empty = studentChoiceAnalysis(caseData, [row("a", "b", "+", "draft")]);
  assert.equal(empty.submittedCount, 0);
  assert.equal(empty.panelTotal, 0);
  assert.equal(empty.excludedCount, 1);
  for (const diagnostic of empty.diagnostics) {
    assert.equal(diagnostic.totalCount, 0);
    assert.equal(diagnostic.observations.length, 3);
    assert.equal(diagnostic.observations[0].positivePercent, 0);
  }
  const data = studentChoiceAnalysis(caseData, [row()]);
  assert.equal(data.diagnostics[2].totalCount, 0);
  assert.equal(data.diagnostics[2].observations[0].notSelected, 0);
  assert.equal(JSON.stringify(data).includes("score"), false);
});
