import { demoCase } from "./demo-case.js";
import type { Choice } from "./scoring.js";

export interface DemoAnswer {
  mainDiagnosticId: string;
  alternativeDiagnosticId: string;
  mainChoices: Choice[];
  alternativeChoices: Choice[];
}

type Selection = number | [number, "-" | "+"];
const choices = (items: Selection[]): Choice[] => items.map(item => ({
  observationId: demoCase.observations[(typeof item === "number" ? item : item[0]) - 1].id,
  sign: typeof item === "number" ? "+" : item[1],
}));
const answer = (main: number, alternative: number, principal: Selection[], alternate: Selection[]): DemoAnswer => ({
  mainDiagnosticId: demoCase.diagnostics[main - 1].id,
  alternativeDiagnosticId: demoCase.diagnostics[alternative - 1].id,
  mainChoices: choices(principal),
  alternativeChoices: choices(alternate),
});

/** Raw fictitious responses only. References and grades are computed by the API. */
export const demoExperts: DemoAnswer[] = [
  answer(1, 2, [1, 2, 3, 6, 19], [8, 9, 10, 16, [4, "-"]]),
  answer(1, 2, [1, 2, 3, 19, 20], [8, 9, 10, 13, 16]),
  answer(1, 3, [1, 2, 3, 6, 19], [1, 11, 12, 13, [8, "-"]]),
  answer(1, 3, [1, 2, 3, 18, 19], [10, 11, 12, 13, [9, "-"]]),
  answer(1, 2, [1, 2, 3, [11, "-"], 19], [1, 8, 9, 10, 16]),
  answer(1, 4, [1, 2, 3, 19, [20, "-"]], [1, 13, 16, [15, "-"], [20, "-"]]),
  answer(1, 3, [1, 2, 3, 6, 20], [1, 11, 12, 13, [20, "-"]]),
  answer(2, 1, [1, 8, 9, 10, 16], [1, 2, 3, 19, [11, "-"]]),
  answer(3, 2, [1, 10, 11, 12, 13], [8, 9, 10, 16, [12, "-"]]),
  answer(4, 1, [1, 13, 16, [15, "-"], [20, "-"]], [1, 2, 3, 6, 19]),
];

export const demoStudents: Array<{ answer: DemoAnswer; submitted: boolean }> = [
  { answer: answer(1, 2, [1, 2, 3, 6, 19], [8, 9, 10, 13, 16]), submitted: true },
  { answer: answer(1, 3, [2, 3, 19], [11, 12, [8, "-"]]), submitted: true },
  { answer: answer(4, 1, [1, 13, [20, "+"]], [2, 19]), submitted: true },
  { answer: answer(2, 5, [8, 9], [[4, "-"], [17, "-"]]), submitted: true },
  { answer: answer(1, 3, [2], [11]), submitted: false },
];
