import assert from "node:assert/strict";
import test from "node:test";
import {
  computeCeiling,
  scoreSubmission,
  diagnosisConsensus,
  TOP_TWO_SCORING_VERSION,
  type PanelDistribution,
} from "./scoring.js";

test("the new maximum requires top-two diagnoses and five optimal signed data; minorities keep partial credit", () => {
  const panel: PanelDistribution[] = [10, 8, 4, 8, 0].map((expertCount, index) => ({
    diagnosticId: `d${index}`, role: "main", expertCount,
    observations: [9, 8, 7, 6, 5, 1].map((weight, i) => ({ observationId: `o${i}`, positive: Math.ceil(weight / 3), negative: 0, positivePoints: weight, negativePoints: 0, notSelected: 0 })),
    ceiling: 35,
  }));
  const best = panel[0].observations.slice(0, 5).map(row => ({ observationId: row.observationId, sign: '+' as const }));
  const grade = (main = 'd0', alternative = 'd1', choices = best, scoringVersion: string | undefined = TOP_TWO_SCORING_VERSION) => scoreSubmission({ mainDiagnosticId: main, alternativeDiagnosticId: alternative, mainChoices: choices, alternativeChoices: best, panel, combineRoles: true, scoringVersion });
  assert.equal(grade().total, 20);
  assert.equal(grade('d1', 'd0').total, 20);
  assert.equal(grade('d0', 'd3').total, 20); // A tie at rank two is accepted.
  assert.ok(grade('d1', 'd3').total < 20); // The sole highest-frequency diagnosis cannot be omitted.
  assert.equal(grade('d1', 'd3').mainDiagnosis, grade('d1', 'd3').alternativeDiagnosis);
  const minority = grade('d0', 'd2');
  assert.equal(minority.alternativeDiagnosis, 1);
  assert.equal(minority.alternativeJustification, 8);
  assert.equal(minority.total, 19);
  assert.equal(grade('d0', 'd4').total, 10);
  assert.equal(grade('d1', 'd4').total, 10); // A valid second-place diagnosis keeps its own credit.
  assert.equal(grade('d0', 'd1', [...best.slice(0, 4), { observationId: 'o5', sign: '+' }]).total < 20, true);
  assert.equal(grade('d0', 'd1', best.map(row => ({ ...row, sign: '-' as any }))).mainJustification, 0);
  assert.equal(grade('d0', 'd2', best, 'panel-weighted-v2').total, 20); // Historical rule unchanged.
  panel[0].observations[5].positivePoints = 5;
  assert.equal(grade('d0', 'd1', [...best.slice(0, 4), { observationId: 'o5', sign: '+' }]).total, 20); // Fifth-place data tie.
  assert.equal(diagnosisConsensus(panel, 'missing').topDiagnosis, false);
});

test("rounding cannot turn a non-optimal new response into a perfect displayed score", () => {
  const observations = [100000, 100000, 100000, 100000, 100000, 99999].map((weight, i) => ({ observationId: `o${i}`, positive: weight, negative: 0, notSelected: 0 }));
  const panel: PanelDistribution[] = [100000, 100000, 99999].map((expertCount, i) => ({ diagnosticId: `d${i}`, role: 'main', expertCount, observations, ceiling: 500000 }));
  const best = observations.slice(0, 5).map(row => ({ observationId: row.observationId, sign: '+' as const }));
  const grade = scoreSubmission({ mainDiagnosticId: 'd0', alternativeDiagnosticId: 'd2', mainChoices: [...best.slice(0, 4), { observationId: 'o5', sign: '+' }], alternativeChoices: best, panel, scoringVersion: TOP_TWO_SCORING_VERSION });
  assert.equal(grade.mainJustification, 7.99);
  assert.equal(grade.alternativeDiagnosis, 1.99);
  assert.ok(Number(grade.total.toFixed(2)) < 20);
  panel[1].expertCount = 99999;
  const tiedRunnersUp = scoreSubmission({ mainDiagnosticId: 'd1', alternativeDiagnosticId: 'd2', mainChoices: best, alternativeChoices: best, panel, scoringVersion: TOP_TWO_SCORING_VERSION });
  assert.ok(tiedRunnersUp.total < 20);
});

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
