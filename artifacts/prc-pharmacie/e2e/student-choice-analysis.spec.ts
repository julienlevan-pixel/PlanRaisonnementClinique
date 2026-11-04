import { expect, test, type Page } from "@playwright/test";
const user = {
  id: "teacher",
  username: "Professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const observations = Array.from({ length: 20 }, (_, i) => ({
  observationId: `o${i}`,
  label:
    i === 0
      ? "Toux nocturne"
      : i === 1
        ? "Absence de fièvre"
        : `Donnée clinique ${i + 1}`,
  category: i < 2 ? "Description de la plainte" : "Examen physique",
  positive: i === 0 ? 2 : 0,
  negative: i === 1 ? 1 : 0,
  notSelected: i === 0 ? 0 : i === 1 ? 1 : 2,
  positivePercent: i === 0 ? 100 : 0,
  negativePercent: i === 1 ? 50 : 0,
  panelPositive: i === 0 ? 6 : 0,
  panelNegative: i === 1 ? 6 : 0,
  panelPositivePercent: i === 0 ? 75 : 0,
  panelNegativePercent: i === 1 ? 75 : 0,
}));
const data = (name = "Toux", empty = false) => ({
  caseName: name,
  status: "published",
  participantCount: 6,
  submittedCount: empty ? 0 : 4,
  excludedCount: empty ? 6 : 2,
  panelTotal: 10,
  diagnostics: [
    {
      diagnosticId: "a",
      label: "Asthme",
      mainCount: empty ? 0 : 1,
      alternativeCount: empty ? 0 : 1,
      totalCount: empty ? 0 : 2,
      mainPercent: 25,
      alternativePercent: 25,
      totalPercent: 50,
      panelCount: 8,
      panelPercent: 80,
      observations,
    },
    {
      diagnosticId: "b",
      label: "Reflux",
      mainCount: empty ? 0 : 3,
      alternativeCount: empty ? 0 : 1,
      totalCount: empty ? 0 : 4,
      mainPercent: 75,
      alternativePercent: 25,
      totalPercent: 100,
      panelCount: 2,
      panelPercent: 20,
      observations: observations.map((row) => ({
        ...row,
        positive: 0,
        negative: 0,
        notSelected: 4,
        positivePercent: 0,
        negativePercent: 0,
        panelPositive: 0,
        panelNegative: 0,
        panelPositivePercent: 0,
        panelNegativePercent: 0,
      })),
    },
    {
      diagnosticId: "c",
      label: "Infection",
      mainCount: 0,
      alternativeCount: empty ? 0 : 2,
      totalCount: empty ? 0 : 2,
      mainPercent: 0,
      alternativePercent: 50,
      totalPercent: 50,
      panelCount: 0,
      panelPercent: 0,
      observations: observations.map((row) => ({
        ...row,
        positive: 0,
        negative: 0,
        notSelected: 2,
        positivePercent: 0,
        negativePercent: 0,
        panelPositive: 0,
        panelNegative: 0,
        panelPositivePercent: 0,
        panelNegativePercent: 0,
      })),
    },
  ],
});
async function authenticated(page: Page) {
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { user } }));
}
async function activity(page: Page) {
  await authenticated(page);
  await page.route("**/api/launches/live", (r) =>
    r.fulfill({
      json: {
        id: "live",
        prcId: "prc",
        name: "Toux",
        code: "ABCD2345",
        role: "students",
        status: "published",
        createdAt: "2026-11-04",
        participantCount: 6,
        submissionCount: 4,
        deliveryMode: "synchronous",
        reveals: {},
        case: { name: "Toux", diagnostics: [], observations: [] },
        grading: { maximum: 15 },
      },
    }),
  );
  await page.route("**/api/launches/live/results", (r) =>
    r.fulfill({
      json: {
        participants: [],
        submittedCount: 4,
        participantCount: 6,
        class: {},
        panel: {},
      },
    }),
  );
  await page.goto("/activity/live");
}

test("collective charts separate impression roles, compare experts and use the diagnosis denominator for clinical data", async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  await page.route("**/api/launches/live/choice-analysis", (r) => {
    requests.push(r.request().method());
    return r.fulfill({ json: data() });
  });
  await activity(page);
  expect(requests).toEqual([]);
  const report = page.locator(".choice-analysis");
  await report.locator("summary").first().click();
  await expect(report).toContainText("4 / 6");
  await expect(report).toContainText("Non soumises · exclues");
  await expect(report).toContainText("aucun nom ni réponse individuelle");
  const asthme = report.getByRole("button", {
    name: "Voir les données pour Asthme",
    exact: true,
  });
  await expect(asthme).toContainText(
    "Impression clinique : 1/4 (25 %) · Alternative : 1/4 (25 %)",
  );
  await expect(asthme).toContainText("8/10 (80 %)");
  await asthme.click();
  await expect(asthme).toHaveAttribute("aria-pressed", "true");
  const clinical = report.getByRole("region", {
    name: "Données cliniques pour Asthme",
    exact: true,
  });
  await expect(clinical).toContainText("2 étudiants");
  await expect(clinical.locator(".choice-observation-list > li")).toHaveCount(
    20,
  );
  const first = clinical.locator("li").first();
  await expect(first).toContainText("+ 2/2 (100 %)");
  await expect(first).toContainText("+ 6/8 (75 %)");
  await clinical
    .getByLabel("Ordre des données", { exact: true })
    .selectOption("gap");
  await expect(clinical).toContainText("ne constitue pas une note");
  await clinical
    .getByLabel("Rechercher une donnée clinique", { exact: true })
    .fill("fievre");
  await expect(clinical.locator("li")).toHaveCount(1);
  await expect(clinical.locator("li")).toContainText("− 1/2 (50 %)");
  await report
    .getByRole("button", {
      name: "Voir les données pour Infection",
      exact: true,
    })
    .click();
  await expect(report).toContainText(
    "Aucun expert n’a retenu cette impression",
  );
  expect(requests).toEqual(["GET"]);
  await expect(
    report.getByRole("textbox", { name: /étudiant|participant/i }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await asthme.click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await report.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("choix-groupe-mobile.png"),
  });
  await report
    .getByRole("list", { name: "Répartition des impressions cliniques" })
    .screenshot({ path: testInfo.outputPath("choix-impressions-mobile.png") });
  await clinical.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("choix-donnees-mobile.png"),
  });
});

test("finished session exposes a selector and preserves the separation of cases including empty cases", async ({
  page,
}) => {
  await authenticated(page);
  await page.route("**/api/teaching-sessions/lesson", (r) =>
    r.fulfill({
      json: {
        id: "lesson",
        name: "Séance clinique",
        code: "S-2345",
        role: "students",
        status: "finished",
        deliveryMode: "synchronous",
        currentPosition: 1,
        cases: [
          {
            id: "one",
            name: "Toux",
            position: 0,
            status: "published",
            maximum: 15,
          },
          {
            id: "two",
            name: "Dyspnée",
            position: 1,
            status: "published",
            maximum: 15,
          },
        ],
        report: { maximum: 30, caseCount: 2, memberCount: 6, members: [] },
      },
    }),
  );
  const visits: string[] = [];
  await page.route("**/api/launches/*/choice-analysis", (r) => {
    const id = new URL(r.request().url()).pathname.split("/")[3];
    visits.push(id);
    return r.fulfill({
      json: data(id === "one" ? "Toux" : "Dyspnée", id === "two"),
    });
  });
  await page.goto("/seances/lesson");
  const report = page.locator(".choice-analysis");
  await report.locator("summary").first().click();
  const picker = report.getByLabel("Cas à analyser", { exact: true });
  await expect(picker).toHaveValue("two");
  await expect(report).toContainText("Aucune copie définitive pour ce cas");
  await picker.selectOption("one");
  await expect(report.locator(".choice-case-title")).toHaveText("Toux");
  await expect(
    report.getByRole("button", {
      name: "Voir les données pour Asthme",
      exact: true,
    }),
  ).toBeVisible();
  expect(visits).toEqual(["two", "one"]);
});

test("a read failure offers retry and never invents a zero-participation graph", async ({
  page,
}) => {
  let count = 0;
  await page.route("**/api/launches/live/choice-analysis", (r) =>
    ++count === 1
      ? r.fulfill({
          status: 503,
          json: { error: "Lecture temporairement indisponible" },
        })
      : r.fulfill({ json: data() }),
  );
  await activity(page);
  const report = page.locator(".choice-analysis");
  await report.locator("summary").first().click();
  await expect(report).toContainText("Lecture temporairement indisponible");
  await expect(report.locator(".choice-diagnostic-list")).toHaveCount(0);
  await report.getByRole("button", { name: /Réessayer/ }).click();
  await expect(
    report.getByRole("button", {
      name: "Voir les données pour Asthme",
      exact: true,
    }),
  ).toBeVisible();
});
