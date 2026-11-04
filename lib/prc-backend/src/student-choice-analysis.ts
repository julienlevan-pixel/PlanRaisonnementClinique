import type { Choice, PanelDistribution, Role } from "./scoring.js";

type Case = {
  name?: string;
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

export type ChoiceSnapshot = {
  totalSubmissions: number;
  distributions: PanelDistribution[];
};
type Selection = { count: number; selected: (id: string) => number };

function buildAnalysis(
  caseData: Case,
  submittedCount: number,
  readStudents: (role: Role, id: string) => Selection,
  panel?: ChoiceSnapshot | null,
) {
  const panelTotal = panel?.totalSubmissions ?? 0;
  const forRole = (role: Role) =>
    caseData.diagnostics.map((diagnostic) => {
      const students = readStudents(role, diagnostic.id);
      const experts = panel?.distributions.find(
        (row) => row.diagnosticId === diagnostic.id && row.role === role,
      );
      const panelCount = experts?.expertCount ?? 0;
      return {
        diagnosticId: diagnostic.id,
        label: diagnostic.label,
        count: students.count,
        percent: percent(students.count, submittedCount),
        panelCount,
        panelPercent: percent(panelCount, panelTotal),
        observations: caseData.observations.map((observation) => {
          const count = students.selected(observation.id);
          const reference = experts?.observations.find(
            (row) => row.observationId === observation.id,
          );
          const selectedByExperts =
            (reference?.positive ?? 0) + (reference?.negative ?? 0);
          return {
            observationId: observation.id,
            label: observation.text,
            count,
            percent: percent(count, students.count),
            panelCount: selectedByExperts,
            panelPercent: percent(selectedByExperts, panelCount),
          };
        }),
      };
    });
  return {
    caseName: caseData.name ?? "",
    submittedCount,
    panelTotal,
    main: forRole("main"),
    alternative: forRole("alternative"),
  };
}

/** Four teacher-only histograms, separated by role. Clinical selection ignores sign and importance. */
export function studentChoiceAnalysis(
  caseData: Case,
  rows: ChoiceResponse[],
  panel?: ChoiceSnapshot | null,
) {
  const copies = rows.filter((row) => row.state === "submitted");
  return buildAnalysis(
    caseData,
    copies.length,
    (role, id) => {
      const matching = copies.filter(
        (copy) =>
          (role === "main"
            ? copy.main_diagnostic_id
            : copy.alternative_diagnostic_id) === id,
      );
      return {
        count: matching.length,
        selected: (observationId) =>
          matching.filter((copy) =>
            (role === "main"
              ? copy.main_choices
              : copy.alternative_choices
            )?.some((choice) => choice.observationId === observationId),
          ).length,
      };
    },
    panel,
  );
}

/** The live discussion reads the same counts from the frozen, anonymous snapshots. */
export function choiceAnalysisFromSnapshots(
  caseData: Case,
  students: ChoiceSnapshot | undefined,
  panel: ChoiceSnapshot,
) {
  return buildAnalysis(
    caseData,
    students?.totalSubmissions ?? 0,
    (role, id) => {
      const distribution = students?.distributions.find(
        (row) => row.role === role && row.diagnosticId === id,
      );
      return {
        count: distribution?.expertCount ?? 0,
        selected: (observationId) => {
          const row = distribution?.observations.find(
            (row) => row.observationId === observationId,
          );
          return (row?.positive ?? 0) + (row?.negative ?? 0);
        },
      };
    },
    panel,
  );
}
