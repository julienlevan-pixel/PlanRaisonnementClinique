import assert from "node:assert/strict";
import test from "node:test";
import { demoCase } from "./demo-case.js";
import { demoExperts, demoStudents } from "./demo-responses.js";
import { computeCeiling, scoreSubmission, type PanelDistribution } from "./scoring.js";

test("the public Toux exercise contains exactly twenty distinct observations", () => {
  assert.equal(demoCase.observations.length, 20);
  assert.equal(new Set(demoCase.observations.map(row => row.id)).size, 20);
  assert.equal(demoCase.diagnostics.length >= 2, true);
  assert.match(demoCase.demonstrationLabel, /données fictives/);
  assert.equal("experts" in demoCase, false);
  assert.equal("score" in demoCase, false);
});

test("all ten fictitious experts have two distinct diagnoses and five signed choices per role", () => {
  assert.equal(demoExperts.length, 10);
  const observationIds = new Set(demoCase.observations.map(row => row.id));
  const diagnosticIds = new Set(demoCase.diagnostics.map(row => row.id));
  for (const response of demoExperts) {
    assert.notEqual(response.mainDiagnosticId, response.alternativeDiagnosticId);
    assert.ok(diagnosticIds.has(response.mainDiagnosticId));
    assert.ok(diagnosticIds.has(response.alternativeDiagnosticId));
    for (const selected of [response.mainChoices, response.alternativeChoices]) {
      assert.equal(selected.length, 5);
      assert.equal(new Set(selected.map(row => row.observationId)).size, 5);
      assert.ok(selected.every(row => observationIds.has(row.observationId) && ["+", "-"].includes(row.sign)));
    }
  }
});

test("Toux retains minority diagnoses and divergent signs and derives varied student grades", () => {
  const panel: PanelDistribution[] = [];
  for (const role of ["main", "alternative"] as const) {
    for (const diagnostic of demoCase.diagnostics) {
      const experts = demoExperts.filter(row => (role === "main" ? row.mainDiagnosticId : row.alternativeDiagnosticId) === diagnostic.id);
      const observations = demoCase.observations.map(observation => {
        const selected = experts.flatMap(row => role === "main" ? row.mainChoices : row.alternativeChoices)
          .filter(row => row.observationId === observation.id);
        const positive = selected.filter(row => row.sign === "+").length;
        const negative = selected.filter(row => row.sign === "-").length;
        return { observationId: observation.id, positive, negative, notSelected: experts.length - positive - negative };
      });
      panel.push({ diagnosticId: diagnostic.id, role, expertCount: experts.length, observations, ceiling: computeCeiling(observations) });
    }
  }
  assert.ok(panel.some(row => row.expertCount === 1));
  assert.ok(panel.some(row => row.observations.some(observation => observation.positive > 0 && observation.negative > 0)));
  assert.ok(panel.filter(row => row.expertCount > 0).every(row => row.ceiling > 0));
  const grades = demoStudents.filter(row => row.submitted).map(row => scoreSubmission({ ...row.answer, panel }));
  assert.equal(grades.length, 4);
  assert.ok(grades.every(row => Number.isFinite(row.total) && row.total >= 0 && row.total <= 20));
  assert.ok(new Set(grades.map(row => row.total)).size > 1);
  assert.ok(grades.some(row => !row.alternative.represented));
  assert.equal(demoStudents.filter(row => !row.submitted).length, 1);
  assert.ok(demoStudents.every(row => !("score" in row) && !("score" in row.answer)));
});
