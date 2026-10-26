import assert from "node:assert/strict";
import test from "node:test";
import {
  computeCeiling,
  scoreSubmission,
  type PanelDistribution,
} from "./scoring.js";

test("computes the V1 ceiling from the five largest direction counts", () => {
  assert.equal(
    computeCeiling([
      { positive: 5, negative: 1 },
      { positive: 3, negative: 2 },
      { positive: 2, negative: 0 },
      { positive: 1, negative: 2 },
      { positive: 1, negative: 0 },
      { positive: 100, negative: 1 },
    ]),
    112,
  );
});

test("scores the specified 12.8/20 example and handles divergent signs", () => {
  const panel: PanelDistribution[] = [
    {
      diagnosticId: "D1",
      role: "main",
      expertCount: 10,
      observations: [
        { observationId: "a", positive: 4, negative: 1, notSelected: 5 },
        { observationId: "b", positive: 2, negative: 3, notSelected: 5 },
        { observationId: "c", positive: 2, negative: 0, notSelected: 8 },
        { observationId: "d", positive: 1, negative: 1, notSelected: 8 },
        { observationId: "e", positive: 1, negative: 0, notSelected: 9 },
      ],
      ceiling: 10,
    },
    {
      diagnosticId: "D2",
      role: "alternative",
      expertCount: 10,
      observations: [
        { observationId: "a", positive: 3, negative: 2, notSelected: 5 },
        { observationId: "b", positive: 2, negative: 2, notSelected: 6 },
        { observationId: "c", positive: 2, negative: 0, notSelected: 8 },
        { observationId: "d", positive: 1, negative: 1, notSelected: 8 },
        { observationId: "e", positive: 1, negative: 0, notSelected: 9 },
      ],
      ceiling: 10,
    },
  ];
  const result = scoreSubmission({
    mainDiagnosticId: "D1",
    alternativeDiagnosticId: "D2",
    mainChoices: [
      { observationId: "a", sign: "+" },
      { observationId: "b", sign: "+" },
    ],
    alternativeChoices: [
      { observationId: "a", sign: "+" },
      { observationId: "b", sign: "-" },
    ],
    panel,
  });
  assert.equal(result.total, 12.8);
  assert.equal(result.percentage, 64);
  assert.equal(result.main.raw, 6);
  assert.equal(result.alternative.raw, 5);
});

test("an unrepresented diagnosis earns zero in that role", () => {
  const result = scoreSubmission({
    mainDiagnosticId: "missing",
    alternativeDiagnosticId: "D2",
    mainChoices: [{ observationId: "a", sign: "+" }],
    alternativeChoices: [{ observationId: "a", sign: "-" }],
    panel: [
      {
        diagnosticId: "D2",
        role: "alternative",
        expertCount: 2,
        observations: [
          { observationId: "a", positive: 1, negative: 1, notSelected: 0 },
        ],
        ceiling: 1,
      },
    ],
  });
  assert.equal(result.main.diagnosis, 0);
  assert.equal(result.main.justification, 0);
  assert.equal(result.main.represented, false);
  assert.equal(result.alternative.diagnosis, 2);
});

test("expert weights change credit without changing response counts or trusting student weights", () => {
  const observations = [
    {
      observationId: "a",
      positive: 1,
      negative: 1,
      positivePoints: 3,
      negativePoints: 1,
      notSelected: 0,
    },
    {
      observationId: "b",
      positive: 1,
      negative: 0,
      positivePoints: 1,
      negativePoints: 0,
      notSelected: 1,
    },
  ];
  const ceiling = computeCeiling(observations);
  assert.equal(ceiling, 4);
  const panel: PanelDistribution[] = [
    { diagnosticId: "D1", role: "main", expertCount: 2, observations, ceiling },
  ];
  const grade = (choices: any[]) =>
    scoreSubmission({
      mainDiagnosticId: "D1",
      alternativeDiagnosticId: null,
      mainChoices: choices,
      alternativeChoices: [],
      panel,
    });
  assert.equal(
    grade([{ observationId: "a", sign: "+" }]).main.justification,
    6,
  );
  assert.equal(
    grade([{ observationId: "b", sign: "+" }]).main.justification,
    2,
  );
  assert.equal(
    grade([{ observationId: "a", sign: "-", points: 3 }]).main.justification,
    2,
  );
  assert.equal(
    grade([
      { observationId: "a", sign: "+" },
      { observationId: "b", sign: "+" },
    ]).main.justification,
    8,
  );
});
