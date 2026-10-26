export type Role = "main" | "alternative";
export type Sign = "+" | "-";
export const TOP_TWO_SCORING_VERSION = "top-two-v1";

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
  maximum: number;
  scoringVersion: string;
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

/** Candidates for the two best frequencies, including ties at rank 2. */
export function diagnosisConsensus(
  panel: PanelDistribution[],
  diagnosticId: string,
) {
  const counts = new Map<string, number>();
  for (const row of panel)
    counts.set(
      row.diagnosticId,
      (counts.get(row.diagnosticId) ?? 0) + row.expertCount,
    );
  const positive = [...counts.values()]
    .filter((count) => count > 0)
    .sort((a, b) => b - a);
  const threshold = positive[Math.min(1, positive.length - 1)] ?? 0;
  const count = counts.get(diagnosticId) ?? 0;
  return {
    count,
    threshold,
    topDiagnosis: count > 0 && count >= threshold,
  };
}

/** Preserve each good diagnosis's credit while requiring a genuinely optimal pair for 4/4. */
export function diagnosisPairCredits(
  panel: PanelDistribution[],
  mainId: string,
  alternativeId: string,
) {
  const counts = new Map<string, number>();
  for (const row of panel)
    counts.set(
      row.diagnosticId,
      (counts.get(row.diagnosticId) ?? 0) + row.expertCount,
    );
  const best = [...counts.values()]
    .filter((value) => value > 0)
    .sort((a, b) => b - a);
  const mainCount = counts.get(mainId) ?? 0;
  const alternativeCount = counts.get(alternativeId) ?? 0;
  const credit = (count: number, reference: number) =>
    count > 0 && reference > 0
      ? count >= reference
        ? 2
        : Math.min(1.99, (2 * count) / reference)
      : 0;
  const threshold = best[Math.min(1, best.length - 1)] ?? 0;
  if (
    threshold > 0 &&
    mainCount >= threshold &&
    alternativeCount >= threshold &&
    Math.max(mainCount, alternativeCount) < best[0]
  ) {
    // Two runners-up tied for the second slot cannot replace the sole leader.
    // Share the pair's partial credit equally, without a main/alternative bias.
    const shared = Math.min(
      1.99,
      (credit(mainCount, best[0]) + credit(alternativeCount, threshold)) / 2,
    );
    return { main: shared, alternative: shared };
  }
  return {
    main: credit(mainCount, threshold),
    alternative: credit(alternativeCount, threshold),
  };
}

export function scoreRole(input: {
  diagnosisId: string;
  choices: Choice[];
  distribution?: PanelDistribution;
  diagnosisPoints?: number;
  strictMaximum?: boolean;
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
  const diagnosis = input.diagnosisPoints ?? 2;
  const justification =
    ceiling > 0
      ? Math.min(
          input.strictMaximum && raw < ceiling ? 7.99 : 8,
          (8 * raw) / ceiling,
        )
      : 0;
  const rounded = (value: number) =>
    Math.round((value + Number.EPSILON) * 100) / 100;

  return {
    diagnosis: input.strictMaximum
      ? Math.min(diagnosis < 2 ? 1.99 : 2, rounded(diagnosis))
      : diagnosis,
    justification: input.strictMaximum ? rounded(justification) : justification,
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
  scoringVersion?: string;
}): ScoreResult {
  const topTwo = input.scoringVersion === TOP_TWO_SCORING_VERSION;
  const pairCredits = topTwo
    ? diagnosisPairCredits(
        input.panel,
        input.mainDiagnosticId ?? "",
        input.alternativeDiagnosticId ?? "",
      )
    : undefined;
  const combineRoles = topTwo || input.combineRoles;
  const mainDistribution = combineRoles
    ? combineDiagnostic(input.panel, input.mainDiagnosticId ?? "")
    : input.panel.find(
        (row) =>
          row.role === "main" && row.diagnosticId === input.mainDiagnosticId,
      );
  const alternativeDistribution = combineRoles
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
    strictMaximum: topTwo,
    ...(topTwo
      ? {
          diagnosisPoints: pairCredits!.main,
        }
      : {}),
  });
  const alternative = scoreRole({
    diagnosisId: input.alternativeDiagnosticId ?? "",
    choices: input.alternativeChoices,
    distribution: alternativeDistribution,
    strictMaximum: topTwo,
    ...(topTwo
      ? {
          diagnosisPoints: pairCredits!.alternative,
        }
      : {}),
  });
  const mainDiagnosis = main.diagnosis;
  const mainJustification = main.justification;
  const alternativeDiagnosis = alternative.diagnosis;
  const alternativeJustification = alternative.justification;
  const summed =
    mainDiagnosis +
    mainJustification +
    alternativeDiagnosis +
    alternativeJustification;
  const total = topTwo
    ? Math.round((summed + Number.EPSILON) * 100) / 100
    : summed;

  return {
    maximum: 20,
    scoringVersion: topTwo
      ? TOP_TWO_SCORING_VERSION
      : combineRoles
        ? "panel-weighted-v2"
        : "role-weighted-v2",
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
