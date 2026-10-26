export type Role = "main" | "alternative";
export type Sign = "+" | "-";

export interface Choice {
  observationId: string;
  sign: Sign;
  points?: number;
}

export interface PanelDistribution {
  diagnosticId: string;
  role: Role;
  expertCount: number;
  observations: Array<{
    observationId: string;
    label?: string;
    category?: string;
    positive: number;
    negative: number;
    positivePoints?: number;
    negativePoints?: number;
    notSelected: number;
  }>;
  ceiling: number;
}

export interface ScoreComponent {
  diagnosis: number;
  justification: number;
  represented: boolean;
  raw: number;
  ceiling: number;
}

export interface ScoreResult {
  mainDiagnosis: number;
  mainJustification: number;
  alternativeDiagnosis: number;
  alternativeJustification: number;
  total: number;
  percentage: number;
  main: ScoreComponent;
  alternative: ScoreComponent;
}

/** Two distinct diagnoses per expert: combining roles never counts an expert twice. */
export function combineDiagnostic(
  panel: PanelDistribution[],
  diagnosticId: string,
): PanelDistribution {
  const matching = panel.filter((row) => row.diagnosticId === diagnosticId);
  const observations = new Map<
    string,
    PanelDistribution["observations"][number]
  >();
  for (const distribution of matching)
    for (const row of distribution.observations) {
      const prior = observations.get(row.observationId) ?? {
        observationId: row.observationId,
        label: row.label,
        category: row.category,
        positive: 0,
        negative: 0,
        positivePoints: 0,
        negativePoints: 0,
        notSelected: 0,
      };
      prior.positive += row.positive;
      prior.negative += row.negative;
      prior.positivePoints! += row.positivePoints ?? row.positive;
      prior.negativePoints! += row.negativePoints ?? row.negative;
      prior.notSelected += row.notSelected;
      observations.set(row.observationId, prior);
    }
  const rows = [...observations.values()];
  return {
    diagnosticId,
    role: "main",
    expertCount: matching.reduce((n, row) => n + row.expertCount, 0),
    observations: rows,
    ceiling: computeCeiling(rows),
  };
}

export function computeCeiling(
  observations: Array<{
    positive: number;
    negative: number;
    positivePoints?: number;
    negativePoints?: number;
  }>,
): number {
  return observations
    .map((observation) =>
      Math.max(
        observation.positivePoints ?? observation.positive,
        observation.negativePoints ?? observation.negative,
      ),
    )
    .sort((a, b) => b - a)
    .slice(0, 5)
    .reduce((sum, value) => sum + value, 0);
}

export function scoreRole(input: {
  diagnosisId: string;
  choices: Choice[];
  distribution?: PanelDistribution;
}): ScoreComponent {
  const distribution = input.distribution;
  if (!distribution || distribution.expertCount === 0) {
    return {
      diagnosis: 0,
      justification: 0,
      represented: false,
      raw: 0,
      ceiling: 0,
    };
  }

  const counts = new Map(
    distribution.observations.map((row) => [row.observationId, row]),
  );
  const raw = input.choices.reduce((sum, choice) => {
    const row = counts.get(choice.observationId);
    return (
      sum +
      (row
        ? choice.sign === "+"
          ? (row.positivePoints ?? row.positive)
          : (row.negativePoints ?? row.negative)
        : 0)
    );
  }, 0);
  const ceiling = distribution.ceiling;

  return {
    diagnosis: 2,
    justification: ceiling > 0 ? (8 * raw) / ceiling : 0,
    represented: true,
    raw,
    ceiling,
  };
}

export function scoreSubmission(input: {
  mainDiagnosticId: string | null;
  alternativeDiagnosticId: string | null;
  mainChoices: Choice[];
  alternativeChoices: Choice[];
  panel: PanelDistribution[];
  combineRoles?: boolean;
}): ScoreResult {
  const mainDistribution = input.combineRoles
    ? combineDiagnostic(input.panel, input.mainDiagnosticId ?? "")
    : input.panel.find(
        (row) =>
          row.role === "main" && row.diagnosticId === input.mainDiagnosticId,
      );
  const alternativeDistribution = input.combineRoles
    ? combineDiagnostic(input.panel, input.alternativeDiagnosticId ?? "")
    : input.panel.find(
        (row) =>
          row.role === "alternative" &&
          row.diagnosticId === input.alternativeDiagnosticId,
      );
  const main = scoreRole({
    diagnosisId: input.mainDiagnosticId ?? "",
    choices: input.mainChoices,
    distribution: mainDistribution,
  });
  const alternative = scoreRole({
    diagnosisId: input.alternativeDiagnosticId ?? "",
    choices: input.alternativeChoices,
    distribution: alternativeDistribution,
  });
  const mainDiagnosis = main.diagnosis;
  const mainJustification = main.justification;
  const alternativeDiagnosis = alternative.diagnosis;
  const alternativeJustification = alternative.justification;
  const total =
    mainDiagnosis +
    mainJustification +
    alternativeDiagnosis +
    alternativeJustification;

  return {
    mainDiagnosis,
    mainJustification,
    alternativeDiagnosis,
    alternativeJustification,
    total,
    percentage: (total / 20) * 100,
    main,
    alternative,
  };
}
