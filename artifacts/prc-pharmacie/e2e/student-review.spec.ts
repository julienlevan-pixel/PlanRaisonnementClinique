import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/participant/teaching-session", (route) =>
    route.fulfill({ json: { session: null } }),
  );
});

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
  maximum: 20,
  gradedCount: 6,
  excludedCount: 1,
  average: 65.6 / 6,
  median: 12,
  lowest: 0,
  highest: 20,
  bins: [1, 1, 0, 0, 0, 1, 0, 1, 0, 2].map((count, i) => ({
    lower: i * 2,
    upper: (i + 1) * 2,
    upperInclusive: i === 9,
    count,
    percentage: (count * 100) / 6,
  })),
};

test("final anonymous distribution explains the maximum and highlights the student’s grade on desktop and mobile", async ({
  page,
}, testInfo) => {
  await page.route("**/api/participant/results", (route) =>
    route.fulfill({
      json: {
        role: "students",
        guidedReview: true,
        deliveryMode: "synchronous",
        published: true,
        status: "published",
        case: { ...caseData, scoringVersion: "top-two-v1" },
        response: own,
        score: 3.6,
        percentage: 18,
        components: {
          mainDiagnosis: 2,
          mainJustification: 1.6,
          alternativeDiagnosis: 0,
          alternativeJustification: 0,
        },
        panel: {},
        class: {},
        gradeDistribution,
        studentReview: {
          scoringVersion: "top-two-v1",
          deliveryMode: "synchronous",
          comparisonVisible: true,
          comparison,
          choiceHistograms: choiceCharts(["d0", "d1", "d2"]),
          corrections: [correction("d0"), correction("d4")],
        },
      },
    }),
  );
  await page.goto("/participant/results");
  await expect(page.locator(".participant-score")).toContainText("3,6");
  await expect(page.locator(".participant-score")).toContainText("/ 20");
  await expect(
    page.getByRole("region", {
      name: "Comprendre la note maximale du cas",
      exact: true,
    }),
  ).toContainText("les deux impressions cliniques les plus choisies");
  const graph = page.getByRole("region", {
    name: "Distribution des notes du groupe",
    exact: true,
  });
  await expect(graph).toContainText("6 copie(s) notée(s)");
  await expect(graph).toContainText("1 copie(s) sans note");
  await expect(graph.locator(".distribution-own")).toHaveCount(1);
  await expect(graph.locator(".distribution-own")).toContainText("2–4");
  await expect(graph).toContainText("Votre note : 3,6 / 20");
  await graph.getByRole("button", { name: /^18 à 20 inclus/ }).click();
  await expect(graph.getByRole("status")).toContainText("2 copie(s)");
  await expect(graph.getByRole("status")).toContainText("33,33 %");
  await graph.screenshot({
    path: testInfo.outputPath("grade-distribution-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await graph.screenshot({
    path: testInfo.outputPath("grade-distribution-mobile.png"),
    animations: "disabled",
  });
});

test("asynchronous students receive the collective graph only when the professor publishes the final review", async ({
  page,
}) => {
  await page.clock.install();
  let finished = false;
  await page.route("**/api/participant/results", (route) =>
    route.fulfill({
      json: {
        role: "students",
        guidedReview: true,
        deliveryMode: "asynchronous",
        published: true,
        status: finished ? "published" : "open",
        reveals: {},
        case: { ...caseData, scoringVersion: "top-two-v1" },
        response: own,
        score: 3.6,
        components: {},
        panel: {},
        class: {},
        ...(finished ? { gradeDistribution } : {}),
        studentReview: {
          deliveryMode: "asynchronous",
          comparisonVisible: false,
          comparison: [],
          corrections: [correction("d0"), correction("d4")],
        },
      },
    }),
  );
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: finished ? "published" : "open",
        role: "students",
        reveals: {},
        published: true,
        guidedReview: true,
        deliveryMode: "asynchronous",
        responseState: "submitted",
        revision: 1,
      },
    }),
  );
  await page.goto("/participant/results");
  await expect(
    page.getByRole("heading", { name: "Votre résultat", exact: true }),
  ).toBeVisible();
  const graph = page.getByRole("region", {
    name: "Distribution des notes du groupe",
    exact: true,
  });
  await expect(graph).toHaveCount(0);
  finished = true;
  await page.clock.fastForward(5100);
  await expect(graph).toBeVisible();
});
const comparison = [1, 0, 2, 3, 4].map((index) => ({
  diagnosticId: diagnostics[index].id,
  label: diagnostics[index].label,
  panelCount: [2, 4, 2, 0, 0][index],
  panelTotal: 4,
  panelPercent: [50, 100, 50, 0, 0][index],
  studentCount: index === 0 ? 3 : 1,
  studentTotal: 4,
  studentPercent: index === 0 ? 75 : 25,
}));
function choiceCharts(revealed: string[] = [], full = false) {
  const forRole = (alternative: boolean) =>
    diagnostics
      .map((diagnostic, index) => {
        const count = (alternative ? [1, 2, 0, 0, 1] : [3, 1, 0, 0, 0])[index];
        const panelCount = (alternative ? [0, 3, 1, 0, 0] : [2, 1, 1, 0, 0])[
          index
        ];
        return {
          diagnosticId: diagnostic.id,
          label: diagnostic.label,
          count,
          percent: count * 25,
          panelCount,
          panelPercent: panelCount * 25,
          observations:
            revealed.includes(diagnostic.id) || full
              ? observations.map((row, i) => ({
                  observationId: row.id,
                  label: row.text,
                  count: i < 5 ? count : 0,
                  percent: i < 5 ? 100 : 0,
                  panelCount: i < 5 ? panelCount : 0,
                  panelPercent: i < 5 ? 100 : 0,
                }))
              : [],
        };
      })
      .filter((row) => full || row.panelCount > 0);
  return {
    submittedCount: 4,
    panelTotal: 4,
    main: forRole(false),
    alternative: forRole(true),
  };
}
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
          comparison: reveals.diagnosticComparison
            ? comparison.filter((row) => row.panelCount > 0)
            : [],
          ...(reveals.diagnosticComparison
            ? {
                choiceHistograms: choiceCharts(
                  reveals.correctedDiagnosticIds ?? [],
                ),
              }
            : {}),
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
      name: "Comparaison des impressions cliniques",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.locator(".hypothesis-comparison .choice-histogram"),
  ).toHaveCount(2);
  await expect(page.locator(".hypothesis-comparison")).not.toContainText(
    "Hypothèse E",
  );
  await expect(page.locator(".choice-clinical .choice-histogram")).toHaveCount(
    0,
  );
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
  await expect(chosen).toContainText(
    "Total de cette impression clinique : 3,6 / 10",
  );
  await expect(chosen.locator("tbody tr")).toHaveCount(20);
  await expect(
    page.getByRole("article", { name: "Corrigé Hypothèse E", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".choice-clinical .choice-histogram")).toHaveCount(
    3,
  );
  await expect(page.locator(".participant-score")).toHaveCount(0);
  await page
    .getByRole("region", {
      name: "Comparaison des impressions cliniques",
      exact: true,
    })
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
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "open",
        role: "students",
        reveals: {},
        published: true,
        responseState: "submitted",
        revision: 1,
      },
    }),
  );
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
      name: "Comparaison des impressions cliniques",
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
          choiceHistograms: choiceCharts(["d0", "d1", "d2"]),
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
      name: "Afficher la comparaison des impressions cliniques",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("combobox", {
      name: "Impression clinique à corriger",
      exact: true,
    }),
  ).toHaveValue("d1");
  await page
    .getByRole("button", {
      name: "Afficher le corrigé : Hypothèse B",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("1 / 3 corrigé(s) révélé(s).", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", {
      name: "Impression clinique à corriger",
      exact: true,
    }),
  ).toHaveValue("d0");
  await page.reload();
  await expect(
    page.getByText("1 / 3 corrigé(s) révélé(s).", { exact: false }),
  ).toBeVisible();
});

test("session, projection and final report use identical histogram bars while the report can include student-only impressions", async ({
  page,
}, testInfo) => {
  const staged = choiceCharts(["d0"]);
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "teacher",
          username: "Professeur",
          role: "teacher",
          active: true,
          mustChangePassword: false,
        },
      },
    }),
  );
  await page.route("**/api/participant/results", (route) =>
    route.fulfill({
      json: {
        role: "students",
        guidedReview: true,
        deliveryMode: "synchronous",
        published: false,
        status: "revealed",
        case: caseData,
        response: own,
        score: null,
        components: {},
        panel: {},
        class: {},
        studentReview: {
          deliveryMode: "synchronous",
          comparisonVisible: true,
          comparison: comparison.filter((row) => row.panelCount > 0),
          choiceHistograms: staged,
          corrections: [correction("d0")],
          activeDiagnosticId: "d0",
        },
      },
    }),
  );
  await page.goto("/participant/results");
  const clinical = page.getByRole("region", {
    name: "3. Données cliniques de l’impression",
    exact: true,
  });
  await expect(clinical.locator(".choice-bars > li")).toHaveCount(20);
  const studentBars = await clinical
    .getByRole("img")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label")),
    );
  const studentImpressions = await page
    .getByRole("region", { name: "1. Impression clinique", exact: true })
    .getByRole("img")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("aria-label")),
    );
  await expect(page.locator(".hypothesis-comparison-table")).toHaveCount(0);
  await page.route("**/api/launches/student-launch/projection", (route) =>
    route.fulfill({
      json: {
        launch: {
          ...caseData,
          id: "student-launch",
          name: caseData.name,
          status: "revealed",
          guidedReview: true,
          reveals: {},
        },
        case: caseData,
        role: "students",
        status: "revealed",
        discussion: {
          deliveryMode: "synchronous",
          comparisonVisible: true,
          comparison: comparison.filter((row) => row.panelCount > 0),
          choiceHistograms: staged,
          corrections: [correction("d0", false)],
          activeDiagnosticId: "d0",
        },
      },
    }),
  );
  await page.goto("/projection/student-launch");
  const projected = page.getByRole("region", {
    name: "3. Données cliniques de l’impression",
    exact: true,
  });
  await expect
    .poll(() =>
      projected
        .getByRole("img")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        ),
    )
    .toEqual(studentBars);
  await page
    .getByText("Revoir la comparaison des impressions cliniques", {
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page
        .getByRole("region", { name: "1. Impression clinique", exact: true })
        .getByRole("img")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        ),
    )
    .toEqual(studentImpressions);
  await expect(page.getByText("Hypothèse E", { exact: true })).toHaveCount(0);
  await page.route("**/api/launches/student-launch", (route) =>
    route.fulfill({
      json: {
        ...caseData,
        id: "student-launch",
        prcId: "prc",
        name: caseData.name,
        status: "published",
        role: "students",
        createdAt: "2026-11-04",
        code: "ABCD2345",
        participantCount: 4,
        submissionCount: 4,
        reveals: {},
        case: caseData,
      },
    }),
  );
  await page.route("**/api/launches/student-launch/results", (route) =>
    route.fulfill({ json: { participants: [], class: {}, panel: {} } }),
  );
  await page.route("**/api/launches/student-launch/choice-analysis", (route) =>
    route.fulfill({
      json: {
        ...choiceCharts([], true),
        caseName: caseData.name,
        status: "published",
      },
    }),
  );
  await page.goto("/activity/student-launch");
  const report = page.locator(".choice-analysis");
  await report.locator("summary").click();
  const finalClinical = report.getByRole("region", {
    name: "3. Données cliniques de l’impression",
    exact: true,
  });
  await finalClinical
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("d0");
  await expect
    .poll(() =>
      finalClinical
        .getByRole("img")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        ),
    )
    .toEqual(studentBars);
  await expect
    .poll(() =>
      report
        .getByRole("region", { name: "1. Impression clinique", exact: true })
        .getByRole("img")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label")),
        ),
    )
    .toEqual(studentImpressions);
  await expect(report.getByText("Hypothèse E", { exact: true })).toHaveCount(0);
  await report
    .getByRole("checkbox", {
      name: "Afficher tous les choix des étudiants",
      exact: true,
    })
    .check();
  await expect(
    report.getByRole("region", {
      name: "2. Impression clinique alternative",
      exact: true,
    }),
  ).toContainText("Hypothèse E");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const box = await page.locator(".sidebar").boundingBox();
      return box ? box.x + box.width : 0;
    })
    .toBeLessThanOrEqual(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await report
    .getByRole("region", { name: "1. Impression clinique", exact: true })
    .screenshot({
      path: testInfo.outputPath("histogramme-commun-mobile.png"),
      animations: "disabled",
    });
});
