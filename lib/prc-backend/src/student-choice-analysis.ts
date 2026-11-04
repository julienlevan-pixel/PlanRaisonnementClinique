import type { Choice, PanelDistribution, Role } from "./scoring.js";

type Case = {
  name: string;
  diagnostics: { id: string; label: string }[];
  observations: { id: string; text: string }[];
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

/** Four teacher-only histograms, separated by role. Clinical selection ignores sign and importance. */
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
  const forRole = (role: Role) =>
    caseData.diagnostics.map((diagnostic) => {
      const matching = copies.filter(
        (copy) =>
          (role === "main"
            ? copy.main_diagnostic_id
            : copy.alternative_diagnostic_id) === diagnostic.id,
      );
      const experts = panel?.distributions.find(
        (row) => row.diagnosticId === diagnostic.id && row.role === role,
      );
      const panelCount = experts?.expertCount ?? 0;
      return {
        diagnosticId: diagnostic.id,
        label: diagnostic.label,
        count: matching.length,
        percent: percent(matching.length, copies.length),
        panelCount,
        panelPercent: percent(panelCount, panelTotal),
        observations: caseData.observations.map((observation) => {
          const count = matching.filter((copy) =>
            (role === "main"
              ? copy.main_choices
              : copy.alternative_choices
            )?.some((choice) => choice.observationId === observation.id),
          ).length;
          const reference = experts?.observations.find(
            (row) => row.observationId === observation.id,
          );
          const selectedByExperts =
            (reference?.positive ?? 0) + (reference?.negative ?? 0);
          return {
            observationId: observation.id,
            label: observation.text,
            count,
            percent: percent(count, matching.length),
            panelCount: selectedByExperts,
            panelPercent: percent(selectedByExperts, panelCount),
          };
        }),
      };
    });
  return {
    caseName: caseData.name,
    submittedCount: copies.length,
    panelTotal,
    main: forRole("main"),
    alternative: forRole("alternative"),
  };
}
