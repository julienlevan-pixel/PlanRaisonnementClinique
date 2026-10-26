import {
  combineDiagnostic,
  type Choice,
  type PanelDistribution,
  type ScoreResult,
} from "./scoring.js";

export const CUSTOM_SCORING_VERSION = "custom-rubric-v1";
export type Rubric = {
  version: typeof CUSTOM_SCORING_VERSION;
  revision: number;
  clinicalMaximum: number;
  diagnostics: {
    diagnosticId: string;
    mainPoints: number;
    alternativePoints: number;
    observations: {
      observationId: string;
      positivePoints: number;
      negativePoints: number;
    }[];
  }[];
};
export type RubricCase = {
  diagnostics: { id: string }[];
  observations: { id: string }[];
};
const round = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export function defaultRubric(
  caseData: RubricCase,
  panel: PanelDistribution[],
): Rubric {
  const counts = caseData.diagnostics.map(
    (diagnostic) => combineDiagnostic(panel, diagnostic.id).expertCount,
  );
  const highest = Math.max(0, ...counts);
  return {
    version: CUSTOM_SCORING_VERSION,
    revision: 1,
    clinicalMaximum: 5,
    diagnostics: caseData.diagnostics.map((diagnostic, index) => {
      const distribution = combineDiagnostic(panel, diagnostic.id);
      const points = (count: number) =>
        !distribution.expertCount
          ? 0
          : count * 4 >= distribution.expertCount * 3
            ? 1
            : count * 2 >= distribution.expertCount
              ? 0.5
              : 0;
      return {
        diagnosticId: diagnostic.id,
        mainPoints: counts[index] ? (counts[index] === highest ? 3 : 1) : 0,
        alternativePoints: counts[index] ? 2 : 0,
        observations: caseData.observations.map((observation) => {
          const row = distribution.observations.find(
            (row) => row.observationId === observation.id,
          );
          return {
            observationId: observation.id,
            positivePoints: points(row?.positive ?? 0),
            negativePoints: points(row?.negative ?? 0),
          };
        }),
      };
    }),
  };
}

export function rubricSummary(rubric: Rubric) {
  const mainDiagnosisMaximum = Math.max(
    0,
    ...rubric.diagnostics.map((row) => row.mainPoints),
  );
  const alternativeDiagnosisMaximum = Math.max(
    0,
    ...rubric.diagnostics.map((row) => row.alternativePoints),
  );
  const clinical = (row: Rubric["diagnostics"][number]) =>
    Math.min(
      rubric.clinicalMaximum,
      row.observations
        .map((observation) =>
          Math.max(observation.positivePoints, observation.negativePoints),
        )
        .sort((a, b) => b - a)
        .slice(0, 5)
        .reduce((a, b) => a + b, 0),
    );
  let attainableMaximum = 0;
  for (const main of rubric.diagnostics)
    for (const alternative of rubric.diagnostics)
      if (main.diagnosticId !== alternative.diagnosticId)
        attainableMaximum = Math.max(
          attainableMaximum,
          main.mainPoints +
            clinical(main) +
            alternative.alternativePoints +
            clinical(alternative),
        );
  return {
    maximum: round(
      mainDiagnosisMaximum +
        alternativeDiagnosisMaximum +
        2 * rubric.clinicalMaximum,
    ),
    attainableMaximum: round(attainableMaximum),
    mainDiagnosisMaximum,
    alternativeDiagnosisMaximum,
    clinicalMaximum: rubric.clinicalMaximum,
    rubricRevision: rubric.revision,
  };
}

export function parseRubric(
  value: unknown,
  caseData: RubricCase,
  revision: number,
): Rubric {
  const fail = (): never => {
    throw new Error(
      "Barème invalide : utilisez des points positifs ou nuls, avec au plus deux décimales et un total maximal de 100.",
    );
  };
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : fail();
  const points = (value: unknown): number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-7
      ? value
      : fail();
  const root = object(value);
  if (
    !Array.isArray(root.diagnostics) ||
    root.diagnostics.length !== caseData.diagnostics.length
  )
    fail();
  const diagnosticRows = (root.diagnostics as unknown[]).map(object);
  if (
    new Set(diagnosticRows.map((row) => row.diagnosticId)).size !==
    diagnosticRows.length
  )
    fail();
  const diagnostics = caseData.diagnostics.map((diagnostic) => {
    const row = diagnosticRows.find(
      (row) => row.diagnosticId === diagnostic.id,
    );
    if (
      !row ||
      !Array.isArray(row.observations) ||
      row.observations.length !== caseData.observations.length
    )
      return fail();
    const observations = row.observations.map(object);
    if (
      new Set(observations.map((observation) => observation.observationId))
        .size !== observations.length
    )
      return fail();
    return {
      diagnosticId: diagnostic.id,
      mainPoints: points(row.mainPoints),
      alternativePoints: points(row.alternativePoints),
      observations: caseData.observations.map((observation) => {
        const item = observations.find(
          (item) => item.observationId === observation.id,
        );
        if (!item) return fail();
        return {
          observationId: observation.id,
          positivePoints: points(item.positivePoints),
          negativePoints: points(item.negativePoints),
        };
      }),
    };
  });
  const result: Rubric = {
    version: CUSTOM_SCORING_VERSION,
    revision,
    clinicalMaximum: points(root.clinicalMaximum),
    diagnostics,
  };
  const summary = rubricSummary(result);
  if (
    summary.maximum <= 0 ||
    summary.maximum > 100 ||
    summary.attainableMaximum <= 0
  )
    fail();
  return result;
}

export function customRole(
  rubric: Rubric,
  diagnosticId: string,
  choices: Choice[],
  role: "main" | "alternative",
) {
  const row = rubric.diagnostics.find(
    (row) => row.diagnosticId === diagnosticId,
  );
  const diagnosis = row
    ? role === "main"
      ? row.mainPoints
      : row.alternativePoints
    : 0;
  const raw = choices.reduce((sum, choice) => {
    const observation = row?.observations.find(
      (row) => row.observationId === choice.observationId,
    );
    return (
      sum +
      (observation
        ? choice.sign === "+"
          ? observation.positivePoints
          : observation.negativePoints
        : 0)
    );
  }, 0);
  return {
    diagnosis,
    justification: round(Math.min(rubric.clinicalMaximum, raw)),
    raw: round(raw),
    ceiling: rubric.clinicalMaximum,
    represented:
      !!row &&
      (diagnosis > 0 ||
        row.observations.some(
          (row) => row.positivePoints > 0 || row.negativePoints > 0,
        )),
  };
}

export function scoreCustomSubmission(
  rubric: Rubric,
  response: {
    mainDiagnosticId: string | null;
    alternativeDiagnosticId: string | null;
    mainChoices: Choice[];
    alternativeChoices: Choice[];
  },
): ScoreResult {
  const main = customRole(
    rubric,
    response.mainDiagnosticId ?? "",
    response.mainChoices,
    "main",
  );
  const alternative = customRole(
    rubric,
    response.alternativeDiagnosticId ?? "",
    response.alternativeChoices,
    "alternative",
  );
  const maximum = rubricSummary(rubric).maximum;
  const total = round(
    main.diagnosis +
      main.justification +
      alternative.diagnosis +
      alternative.justification,
  );
  return {
    maximum,
    scoringVersion: CUSTOM_SCORING_VERSION,
    mainDiagnosis: main.diagnosis,
    mainJustification: main.justification,
    alternativeDiagnosis: alternative.diagnosis,
    alternativeJustification: alternative.justification,
    total,
    percentage: round((total / maximum) * 100),
    main,
    alternative,
  };
}
