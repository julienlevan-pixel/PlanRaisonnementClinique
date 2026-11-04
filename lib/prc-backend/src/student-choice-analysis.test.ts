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

test("four histograms keep roles separate and count a clinical selection regardless of sign or points", () => {
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
  assert.equal("participantCount" in data, false);
  assert.equal("excludedCount" in data, false);
  const main = data.main[0],
    alternative = data.alternative[0];
  assert.equal(main.count, 2);
  assert.equal(main.percent, 50);
  assert.equal(main.panelCount, 2);
  assert.equal(main.panelPercent, 50);
  assert.equal(alternative.count, 1);
  assert.equal(alternative.percent, 25);
  assert.equal(alternative.panelCount, 1);
  assert.equal(alternative.panelPercent, 25);
  assert.equal(main.observations[0].count, 2);
  assert.equal(main.observations[0].percent, 100);
  assert.equal(main.observations[0].panelCount, 2);
  assert.equal(main.observations[0].panelPercent, 100);
  assert.equal(alternative.observations[0].count, 0);
  assert.equal(alternative.observations[0].panelCount, 1);
  assert.equal(alternative.observations[0].panelPercent, 100);
  assert.equal(alternative.observations[1].count, 1);
  assert.equal(alternative.observations[1].percent, 100);
  assert.equal(
    data.main.reduce((n, row) => n + row.percent, 0),
    100,
  );
  assert.equal(
    data.alternative.reduce((n, row) => n + row.percent, 0),
    100,
  );
  assert.equal("copies" in data, false);
  assert.equal("participants" in data, false);
  assert.equal("positive" in main.observations[0], false);
  assert.equal("negative" in main.observations[0], false);
  assert.equal("notSelected" in main.observations[0], false);
});

test("empty and unselected diagnoses retain case labels without fabricating clinical selections", () => {
  const empty = studentChoiceAnalysis(caseData, [row("a", "b", "+", "draft")]);
  assert.equal(empty.submittedCount, 0);
  assert.equal(empty.panelTotal, 0);
  for (const diagnostic of [...empty.main, ...empty.alternative]) {
    assert.equal(diagnostic.count, 0);
    assert.equal(diagnostic.observations.length, 3);
    assert.equal(diagnostic.observations[0].percent, 0);
  }
  const data = studentChoiceAnalysis(caseData, [row()]);
  assert.equal(data.main[2].count, 0);
  assert.equal(data.main[2].observations[0].count, 0);
  assert.equal(JSON.stringify(data).includes("score"), false);
});
