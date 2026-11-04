import {
  combineDiagnostic,
  type Choice,
  type PanelDistribution,
} from "./scoring.js";

type Case = {
  name: string;
  diagnostics: { id: string; label: string }[];
  observations: { id: string; text: string; category?: string }[];
};
export type ChoiceResponse = {
  state: string | null;
  main_diagnostic_id: string | null;
  alternative_diagnostic_id: string | null;
  main_choices: Choice[] | null;
  alternative_choices: Choice[] | null;
};
const percent = (count: number, total: number) =>
  total ? Math.round((count * 1000) / total) / 10 : 0;

/** Teacher-only: all counts use definitive copies, never drafts or awarded points. */
export function studentChoiceAnalysis(
  caseData: Case,
  rows: ChoiceResponse[],
  panel?: {
    totalSubmissions: number;
    distributions: PanelDistribution[];
  } | null,
) {
  const copies = rows.filter((row) => row.state === "submitted");
  const panelTotal = panel?.totalSubmissions ?? 0;
  return {
    caseName: caseData.name,
    participantCount: rows.length,
    submittedCount: copies.length,
    excludedCount: rows.length - copies.length,
    panelTotal,
    diagnostics: caseData.diagnostics.map((diagnostic) => {
      const main = copies.filter(
        (copy) => copy.main_diagnostic_id === diagnostic.id,
      );
      const alternative = copies.filter(
        (copy) => copy.alternative_diagnostic_id === diagnostic.id,
      );
      const matching = copies.filter(
        (copy) =>
          copy.main_diagnostic_id === diagnostic.id ||
          copy.alternative_diagnostic_id === diagnostic.id,
      );
      const experts = combineDiagnostic(
        panel?.distributions ?? [],
        diagnostic.id,
      );
      return {
        diagnosticId: diagnostic.id,
        label: diagnostic.label,
        mainCount: main.length,
        alternativeCount: alternative.length,
        totalCount: matching.length,
        mainPercent: percent(main.length, copies.length),
        alternativePercent: percent(alternative.length, copies.length),
        totalPercent: percent(matching.length, copies.length),
        panelCount: experts.expertCount,
        panelPercent: percent(experts.expertCount, panelTotal),
        observations: caseData.observations.map((observation) => {
          let positive = 0,
            negative = 0;
          for (const copy of matching) {
            const choices =
              copy.main_diagnostic_id === diagnostic.id
                ? copy.main_choices
                : copy.alternative_choices;
            const selected = choices?.find(
              (choice) => choice.observationId === observation.id,
            );
            if (selected?.sign === "+") positive++;
            if (selected?.sign === "-") negative++;
          }
          const reference = experts.observations.find(
            (row) => row.observationId === observation.id,
          );
          const panelPositive = reference?.positive ?? 0,
            panelNegative = reference?.negative ?? 0;
          return {
            observationId: observation.id,
            label: observation.text,
            category: observation.category ?? "Autre",
            positive,
            negative,
            notSelected: matching.length - positive - negative,
            positivePercent: percent(positive, matching.length),
            negativePercent: percent(negative, matching.length),
            panelPositive,
            panelNegative,
            panelPositivePercent: percent(panelPositive, experts.expertCount),
            panelNegativePercent: percent(panelNegative, experts.expertCount),
          };
        }),
      };
    }),
  };
}
