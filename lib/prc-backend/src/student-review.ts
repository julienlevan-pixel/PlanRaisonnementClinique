import {
  combineDiagnostic,
  scoreRole,
  diagnosisConsensus,
  diagnosisPairCredits,
  TOP_TWO_SCORING_VERSION,
  type Choice,
  type PanelDistribution,
} from "./scoring.js";
import { customRole, rubricSummary, type Rubric } from "./custom-rubric.js";

export type DeliveryMode = "synchronous" | "asynchronous";
export type ReviewCase = {
  diagnostics: { id: string; label: string }[];
  observations: { id: string; text: string; category: string }[];
};
export type ReviewSnapshot = {
  totalSubmissions: number;
  diagnostics: Record<string, unknown>[];
  distributions: PanelDistribution[];
};
export type ReviewResponse = {
  mainDiagnosticId: string | null;
  alternativeDiagnosticId: string | null;
  mainChoices: Choice[];
  alternativeChoices: Choice[];
};

export function buildStudentReview(input: {
  mode: DeliveryMode;
  caseData: ReviewCase;
  panel: ReviewSnapshot;
  classroom?: ReviewSnapshot;
  comparisonVisible: boolean;
  diagnosticIds: string[];
  activeDiagnosticId?: string;
  response?: ReviewResponse;
  scoringVersion?: string;
  rubric?: Rubric;
}) {
  const rubric = input.rubric;
  const grading = rubric ? rubricSummary(rubric) : undefined;
  const topTwo = input.scoringVersion === TOP_TWO_SCORING_VERSION;
  const pairCredits =
    topTwo && input.response
      ? diagnosisPairCredits(
          input.panel.distributions,
          input.response.mainDiagnosticId ?? "",
          input.response.alternativeDiagnosticId ?? "",
        )
      : undefined;
  const counts = (snapshot: ReviewSnapshot | undefined, id: string) => {
    const row = snapshot?.diagnostics.find((row) => row.diagnosticId === id);
    return Number(row?.mainCount ?? 0) + Number(row?.alternativeCount ?? 0);
  };
  const ranked = input.caseData.diagnostics
    .map((diagnostic) => ({
      diagnosticId: diagnostic.id,
      label: diagnostic.label,
      panelCount: counts(input.panel, diagnostic.id),
      ...(topTwo
        ? {
            topDiagnosis: diagnosisConsensus(
              input.panel.distributions,
              diagnostic.id,
            ).topDiagnosis,
          }
        : {}),
      panelTotal: input.panel.totalSubmissions,
      panelPercent: input.panel.totalSubmissions
        ? (counts(input.panel, diagnostic.id) * 100) /
          input.panel.totalSubmissions
        : 0,
      studentCount: counts(input.classroom, diagnostic.id),
      studentTotal: input.classroom?.totalSubmissions ?? 0,
      studentPercent: input.classroom?.totalSubmissions
        ? (counts(input.classroom, diagnostic.id) * 100) /
          input.classroom.totalSubmissions
        : 0,
    }))
    .sort((a, b) => b.panelCount - a.panelCount);
  const corrections = ranked
    .filter((row) => input.diagnosticIds.includes(row.diagnosticId))
    .map((diagnostic) => {
      const distribution = combineDiagnostic(
        input.panel.distributions,
        diagnostic.diagnosticId,
      );
      const ownRole =
        input.response?.mainDiagnosticId === diagnostic.diagnosticId
          ? "main"
          : input.response?.alternativeDiagnosticId === diagnostic.diagnosticId
            ? "alternative"
            : null;
      const choices =
        ownRole === "main"
          ? input.response!.mainChoices
          : ownRole === "alternative"
            ? input.response!.alternativeChoices
            : [];
      const component = ownRole
        ? rubric
          ? customRole(rubric, diagnostic.diagnosticId, choices, ownRole)
          : scoreRole({
              diagnosisId: diagnostic.diagnosticId,
              choices,
              distribution,
              strictMaximum: topTwo,
              ...(topTwo
                ? {
                    diagnosisPoints:
                      ownRole === "main"
                        ? pairCredits!.main
                        : pairCredits!.alternative,
                  }
                : {}),
            })
        : null;
      const rubricDiagnostic = rubric?.diagnostics.find(
        (row) => row.diagnosticId === diagnostic.diagnosticId,
      );
      const topFiveThreshold =
        (rubricDiagnostic
          ? rubricDiagnostic.observations.map((row) =>
              Math.max(row.positivePoints, row.negativePoints),
            )
          : distribution.observations.map((row) =>
              Math.max(
                row.positivePoints ?? row.positive,
                row.negativePoints ?? row.negative,
              ),
            )
        ).sort((a, b) => b - a)[4] ?? 0;
      return {
        diagnosticId: diagnostic.diagnosticId,
        label: diagnostic.label,
        panelCount: distribution.expertCount,
        represented: distribution.expertCount > 0,
        ...(topTwo
          ? {
              topDiagnosis: diagnosisConsensus(
                input.panel.distributions,
                diagnostic.diagnosticId,
              ).topDiagnosis,
            }
          : {}),
        ...(input.response
          ? {
              selectedRole: ownRole,
              score: component
                ? component.diagnosis + component.justification
                : null,
              diagnosisScore: component?.diagnosis ?? null,
              justificationScore: component?.justification ?? null,
              raw: component?.raw ?? null,
            }
          : {}),
        maximum: grading
          ? (ownRole === "alternative"
              ? grading.alternativeDiagnosisMaximum
              : grading.mainDiagnosisMaximum) + grading.clinicalMaximum
          : 10,
        diagnosisMaximum: grading
          ? ownRole === "alternative"
            ? grading.alternativeDiagnosisMaximum
            : grading.mainDiagnosisMaximum
          : 2,
        clinicalMaximum: grading?.clinicalMaximum ?? 8,
        zeroByRubric: rubricDiagnostic
          ? (ownRole === "alternative"
              ? rubricDiagnostic.alternativePoints
              : rubricDiagnostic.mainPoints) === 0 &&
            rubricDiagnostic.observations.every(
              (row) => !row.positivePoints && !row.negativePoints,
            )
          : !distribution.expertCount,
        ceiling: grading?.clinicalMaximum ?? distribution.ceiling,
        observations: input.caseData.observations.map((observation) => {
          const row = distribution.observations.find(
            (row) => row.observationId === observation.id,
          );
          const choice = choices.find(
            (choice) => choice.observationId === observation.id,
          );
          const positivePoints = row?.positivePoints ?? row?.positive ?? 0;
          const negativePoints = row?.negativePoints ?? row?.negative ?? 0;
          const rubricObservation = rubricDiagnostic?.observations.find(
            (row) => row.observationId === observation.id,
          );
          const positiveScorePoints =
            rubricObservation?.positivePoints ?? positivePoints;
          const negativeScorePoints =
            rubricObservation?.negativePoints ?? negativePoints;
          const bestPoints = Math.max(positiveScorePoints, negativeScorePoints);
          const earnedPoints =
            choice && (rubric || distribution.expertCount)
              ? choice.sign === "+"
                ? positiveScorePoints
                : negativeScorePoints
              : 0;
          return {
            observationId: observation.id,
            label: observation.text,
            category: observation.category,
            positive: row?.positive ?? 0,
            negative: row?.negative ?? 0,
            positivePoints,
            negativePoints,
            ...(rubric ? { positiveScorePoints, negativeScorePoints } : {}),
            topClinical: bestPoints > 0 && bestPoints >= topFiveThreshold,
            bestSigns: bestPoints
              ? [
                  ...(positiveScorePoints === bestPoints ? ["+"] : []),
                  ...(negativeScorePoints === bestPoints ? ["-"] : []),
                ]
              : [],
            referenceScorePoints: rubric
              ? bestPoints
              : distribution.ceiling
                ? (8 * bestPoints) / distribution.ceiling
                : 0,
            ...(input.response
              ? {
                  studentSign: choice?.sign ?? null,
                  earnedPoints: earnedPoints,
                  earnedScorePoints: rubric
                    ? earnedPoints
                    : distribution.ceiling
                      ? (8 * earnedPoints) / distribution.ceiling
                      : 0,
                }
              : {}),
          };
        }),
      };
    });
  return {
    maximum: grading?.maximum ?? 20,
    grading,
    scoringVersion: input.scoringVersion ?? "panel-weighted-v2",
    deliveryMode: input.mode,
    comparisonVisible: input.comparisonVisible,
    comparison: input.comparisonVisible ? ranked : [],
    corrections,
    activeDiagnosticId: corrections.some(
      (row) => row.diagnosticId === input.activeDiagnosticId,
    )
      ? input.activeDiagnosticId
      : null,
  };
}
