import { expect, test } from "@playwright/test";

const diagnostics = ["A", "B", "C", "D", "E"].map((label, index) => ({
  id: `d${index}`,
  label: `Hypothèse ${label}`,
}));
const observations = Array.from({ length: 20 }, (_, index) => ({
  id: `o${index}`,
  text: `Donnée clinique ${index + 1}`,
  category: "Examen physique",
}));
const caseData = {
  launchId: "student-launch",
  name: "Discussion clinique",
  scenario: "Cas fictif",
  role: "students",
  status: "closed",
  guidedReview: true,
  requiredChoices: 5,
  diagnostics,
  observations,
};
const own = {
  state: "submitted",
  revision: 1,
  mainDiagnosticId: "d0",
  alternativeDiagnosticId: "d4",
  mainChoices: [observations[0], ...observations.slice(5, 9)].map((row) => ({
    observationId: row.id,
    sign: "+",
  })),
  alternativeChoices: observations
    .slice(5, 10)
    .map((row) => ({ observationId: row.id, sign: "-" })),
};

const gradeDistribution = {
  maximum: 20, gradedCount: 6, excludedCount: 1,
  average: 65.6 / 6, median: 12, lowest: 0, highest: 20,
  bins: [1, 1, 0, 0, 0, 1, 0, 1, 0, 2].map((count, i) => ({ lower: i * 2, upper: (i + 1) * 2, upperInclusive: i === 9, count, percentage: count * 100 / 6 })),
};

test('final anonymous distribution explains the maximum and highlights the student’s grade on desktop and mobile', async ({ page }, testInfo) => {
  await page.route('**/api/participant/results', route => route.fulfill({ json: {
    role: 'students', guidedReview: true, deliveryMode: 'synchronous', published: true, status: 'published',
    case: { ...caseData, scoringVersion: 'top-two-v1' }, response: own,
    score: 3.6, percentage: 18, components: { mainDiagnosis: 2, mainJustification: 1.6, alternativeDiagnosis: 0, alternativeJustification: 0 },
    panel: {}, class: {}, gradeDistribution,
    studentReview: { scoringVersion: 'top-two-v1', deliveryMode: 'synchronous', comparisonVisible: true, comparison, corrections: [correction('d0'), correction('d4')] },
  } }));
  await page.goto('/participant/results');
  await expect(page.locator('.participant-score')).toContainText('3,6');
  await expect(page.locator('.participant-score')).toContainText('/ 20');
  await expect(page.getByRole('region', { name: 'Comprendre la note maximale du cas', exact: true })).toContainText('les deux impressions les plus choisies');
  const graph = page.getByRole('region', { name: 'Distribution des notes du groupe', exact: true });
  await expect(graph).toContainText('6 copie(s) notée(s)');
  await expect(graph).toContainText('1 copie(s) sans note');
  await expect(graph.locator('.distribution-own')).toHaveCount(1);
  await expect(graph.locator('.distribution-own')).toContainText('2–4');
  await expect(graph).toContainText('Votre note : 3,6 / 20');
  await graph.getByRole('button', { name: /^18 à 20 inclus/ }).click();
  await expect(graph.getByRole('status')).toContainText('2 copie(s)');
  await expect(graph.getByRole('status')).toContainText('33,33 %');
  await graph.screenshot({ path: testInfo.outputPath('grade-distribution-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await graph.screenshot({ path: testInfo.outputPath('grade-distribution-mobile.png'), animations: 'disabled' });
});

test('asynchronous students receive the collective graph only when the professor publishes the final review', async ({ page }) => {
  await page.clock.install();
  let finished = false;
  await page.route('**/api/participant/results', route => route.fulfill({ json: {
    role: 'students', guidedReview: true, deliveryMode: 'asynchronous', published: true,
    status: finished ? 'published' : 'open', reveals: {}, case: { ...caseData, scoringVersion: 'top-two-v1' },
    response: own, score: 3.6, components: {}, panel: {}, class: {},
    ...(finished ? { gradeDistribution } : {}),
    studentReview: { deliveryMode: 'asynchronous', comparisonVisible: false, comparison: [], corrections: [correction('d0'), correction('d4')] },
  } }));
  await page.route('**/api/participant/state', route => route.fulfill({ json: {
    status: finished ? 'published' : 'open', role: 'students', reveals: {}, published: true,
    guidedReview: true, deliveryMode: 'asynchronous', responseState: 'submitted', revision: 1,
  } }));
  await page.goto('/participant/results');
  await expect(page.getByRole('heading', { name: 'Votre résultat', exact: true })).toBeVisible();
  const graph = page.getByRole('region', { name: 'Distribution des notes du groupe', exact: true });
  await expect(graph).toHaveCount(0);
  finished = true;
  await page.clock.fastForward(5100);
  await expect(graph).toBeVisible();
});
const comparison = [1, 0, 2, 3, 4].map((index, rank) => ({
  diagnosticId: diagnostics[index].id,
  label: diagnostics[index].label,
  panelCount: rank < 3 ? 3 - rank : 0,
  panelTotal: 4,
  panelPercent: rank < 3 ? (3 - rank) * 25 : 0,
  studentCount: index === 0 ? 3 : 1,
  studentTotal: 4,
  studentPercent: index === 0 ? 75 : 25,
}));
function correction(id: string, personal = true) {
  const selectedRole =
    id === "d0" ? "main" : id === "d4" ? "alternative" : null;
  const represented = ["d0", "d1", "d2"].includes(id);
  return {
    diagnosticId: id,
    label: diagnostics.find((row) => row.id === id)!.label,
    panelCount: represented ? 2 : 0,
    represented,
    ...(personal
      ? {
          selectedRole,
          score: selectedRole ? (represented ? 3.6 : 0) : null,
          diagnosisScore: selectedRole ? (represented ? 2 : 0) : null,
          justificationScore: selectedRole ? (represented ? 1.6 : 0) : null,
          raw: selectedRole ? (represented ? 3 : 0) : null,
        }
      : {}),
    maximum: 10,
    ceiling: represented ? 15 : 0,
    observations: observations.map((row, index) => ({
      observationId: row.id,
      label: row.text,
      category: row.category,
      positive: represented && index < 5 ? 1 : 0,
      negative: 0,
      positivePoints: represented && index < 5 ? 3 : 0,
      negativePoints: 0,
      ...(personal
        ? {
            studentSign: selectedRole
              ? ((selectedRole === "main"
                  ? own.mainChoices
                  : own.alternativeChoices
                ).find((choice) => choice.observationId === row.id)?.sign ??
                null)
              : null,
            earnedPoints: selectedRole && represented && index === 0 ? 3 : 0,
          }
        : {}),
    })),
  };
}

test("synchronous student follows comparison then each correction with personal scores and no premature final grade", async ({
  page,
}, testInfo) => {
  await page.clock.install();
  let reveals: any = {};
  await page.route("**/api/participant/results", (route) =>
    route.fulfill({
      json: {
        role: "students",
        guidedReview: true,
        deliveryMode: "synchronous",
        published: false,
        status: "closed",
        reveals,
        case: caseData,
        response: own,
        score: null,
        components: {},
        panel: {},
        class: {},
        studentReview: {
          deliveryMode: "synchronous",
          comparisonVisible: !!reveals.diagnosticComparison,
          comparison: reveals.diagnosticComparison ? comparison : [],
          corrections: (reveals.correctedDiagnosticIds ?? []).map(
            (id: string) => correction(id),
          ),
          activeDiagnosticId: reveals.activeDiagnosticId,
        },
      },
    }),
  );
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "closed",
        role: "students",
        reveals,
        published: false,
        responseState: "submitted",
        revision: 1,
      },
    }),
  );
  await page.goto("/participant/results");
  await expect(
    page.getByText("Le professeur terminera le temps de réponse", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator(".diagnostic-correction")).toHaveCount(0);
  reveals = { diagnosticComparison: true };
  await page.clock.fastForward(5_100);
  await expect(
    page.getByRole("region", {
      name: "Comparaison des hypothèses",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".hypothesis-comparison-table tbody tr"),
  ).toHaveCount(5);
  await expect(
    page.locator(".hypothesis-comparison-table tbody tr").first(),
  ).toContainText("Hypothèse B");
  reveals = {
    diagnosticComparison: true,
    correctedDiagnosticIds: ["d1"],
    activeDiagnosticId: "d1",
  };
  await page.clock.fastForward(5_100);
  await expect(
    page.getByText("Vous n’avez pas sélectionné cette réponse.", {
      exact: true,
    }),
  ).toBeVisible();
  reveals = {
    diagnosticComparison: true,
    correctedDiagnosticIds: ["d1", "d0", "d4"],
    activeDiagnosticId: "d0",
  };
  await page.clock.fastForward(5_100);
  const chosen = page.getByRole("article", {
    name: "Corrigé Hypothèse A",
    exact: true,
  });
  await expect(chosen).toContainText("Total de cette hypothèse : 3,6 / 10");
  await expect(chosen.locator("tbody tr")).toHaveCount(20);
  await expect(
    page.getByRole("article", { name: "Corrigé Hypothèse E", exact: true }),
  ).toContainText(
    "0 point pour le diagnostic et 0 point pour les données cliniques",
  );
  await expect(page.locator(".participant-score")).toHaveCount(0);
  await page
    .getByRole("region", { name: "Comparaison des hypothèses", exact: true })
    .screenshot({
      path: testInfo.outputPath("student-comparison.png"),
      animations: "disabled",
    });
  await chosen.screenshot({
    path: testInfo.outputPath("student-correction.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("asynchronous student immediately sees only own corrections and private grade", async ({
  page,
}) => {
  await page.route('**/api/participant/state', route => route.fulfill({ json: {
    status: 'open', role: 'students', reveals: {}, published: true, responseState: 'submitted', revision: 1,
  } }));
  await page.route("**/api/participant/results", (route) =>
    route.fulfill({
      json: {
        role: "students",
        guidedReview: true,
        deliveryMode: "asynchronous",
        published: true,
        status: "open",
        case: caseData,
        response: own,
        score: 3.6,
        percentage: 18,
        components: {},
        panel: {},
        class: {},
        studentReview: {
          deliveryMode: "asynchronous",
          comparisonVisible: false,
          comparison: [],
          corrections: [correction("d0"), correction("d4")],
        },
      },
    }),
  );
  await page.goto("/participant/results");
  await expect(page.locator(".participant-score")).toContainText("3,6");
  await expect(page.locator(".diagnostic-correction")).toHaveCount(2);
  await expect(
    page.getByRole("region", {
      name: "Comparaison des hypothèses",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Votre note reste privée et masquée", { exact: false }),
  ).toHaveCount(0);
});

test("teacher starts with highest expert choice and saves discussion stages", async ({
  page,
}) => {
  let reveals: any = {};
  const launch = () => ({
    id: "student-launch",
    prcId: "prc",
    role: "students",
    name: caseData.name,
    code: "CLASS123",
    status: "closed",
    guidedReview: true,
    deliveryMode: "synchronous",
    participantCount: 4,
    submissionCount: 4,
    reveals,
    case: caseData,
    referenceStatus: "validated",
    reference: { status: "validated" },
  });
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "teacher",
          username: "teacher",
          role: "teacher",
          active: true,
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route("**/api/launches/student-launch", (route) =>
    route.fulfill({ json: launch() }),
  );
  await page.route("**/api/launches/student-launch/results", (route) =>
    route.fulfill({
      json: {
        discussion: {
          deliveryMode: "synchronous",
          comparisonVisible: true,
          comparison,
          corrections: diagnostics.map((row) => correction(row.id, false)),
        },
      },
    }),
  );
  await page.route("**/api/launches/student-launch/discussion", (route) => {
    const input = route.request().postDataJSON();
    reveals =
      input.action === "comparison"
        ? { diagnosticComparison: true }
        : {
            ...reveals,
            correctedDiagnosticIds: [
              ...(reveals.correctedDiagnosticIds ?? []),
              input.diagnosticId,
            ],
            activeDiagnosticId: input.diagnosticId,
          };
    return route.fulfill({ json: launch() });
  });
  await page.goto("/activity/student-launch");
  await page
    .getByRole("button", {
      name: "Afficher la comparaison des hypothèses",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Hypothèse à corriger", exact: true }),
  ).toHaveValue("d1");
  await page
    .getByRole("button", {
      name: "Afficher le corrigé : Hypothèse B",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("1 / 5 corrigé(s) révélé(s).", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Hypothèse à corriger", exact: true }),
  ).toHaveValue("d0");
  await page.reload();
  await expect(
    page.getByText("1 / 5 corrigé(s) révélé(s).", { exact: false }),
  ).toBeVisible();
});
