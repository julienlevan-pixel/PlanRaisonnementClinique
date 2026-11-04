import { expect, test, type Page } from "@playwright/test";
const user = {
  id: "teacher",
  username: "Professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const observations = (count: number, panelCount: number) =>
  Array.from({ length: 20 }, (_, i) => ({
    observationId: `o${i}`,
    label:
      i === 0
        ? "Toux nocturne"
        : i === 1
          ? "Absence de fièvre"
          : `Donnée clinique ${i + 1}`,
    count: i === 0 ? count : 0,
    percent: i === 0 ? 100 : 0,
    panelCount: i === 0 ? panelCount : 0,
    panelPercent: i === 0 ? 75 : 0,
  }));
function data(name = "Toux", empty = false) {
  const diagnostic = (
    id: string,
    label: string,
    count: number,
    panelCount: number,
  ) => ({
    diagnosticId: id,
    label,
    count: empty ? 0 : count,
    percent: count * 25,
    panelCount,
    panelPercent: panelCount * 10,
    observations: observations(
      empty ? 0 : count,
      Math.floor(panelCount * 0.75),
    ),
  });
  return {
    caseName: name,
    status: "published",
    submittedCount: empty ? 0 : 4,
    panelTotal: 10,
    main: [
      diagnostic("a", "Asthme", 1, 8),
      diagnostic("b", "Reflux", 2, 2),
      diagnostic("c", "Infection", 1, 0),
    ],
    alternative: [
      diagnostic("a", "Asthme", 1, 2),
      diagnostic("b", "Reflux", 1, 5),
      diagnostic("c", "Infection", 2, 3),
    ],
  };
}
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

test("four simple histograms compare roles separately and show unsigned clinical selections without extra controls or counts", async ({
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
  await expect(report.locator(".choice-histogram")).toHaveCount(4);
  await expect(report).not.toContainText(
    /non soumi|sans réponse|reçue|en faveur|en défaveur|écarts|parmi|200 %/i,
  );
  await expect(
    report.locator(".distribution-metrics,.choice-second"),
  ).toHaveCount(0);
  await expect(report.getByRole("textbox")).toHaveCount(0);
  const main = report.getByRole("region", {
    name: "1. Impression clinique",
    exact: true,
  });
  const alternative = report.getByRole("region", {
    name: "2. Impression clinique alternative",
    exact: true,
  });
  await expect(
    main.getByRole("img", { name: "Étudiants : 1 sur 4, 25 %", exact: true }),
  ).toHaveCount(1);
  await expect(
    main.getByRole("img", { name: "Experts : 8 sur 10, 80 %", exact: true }),
  ).toHaveCount(1);
  await expect(
    alternative.getByRole("img", {
      name: "Experts : 5 sur 10, 50 %",
      exact: true,
    }),
  ).toHaveCount(1);
  const clinical = report.getByRole("region", {
    name: "3. Données cliniques de l’impression",
    exact: true,
  });
  const clinicalAlternative = report.getByRole("region", {
    name: "4. Données cliniques de l’alternative",
    exact: true,
  });
  await clinical
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("a");
  await clinicalAlternative
    .getByLabel("Impression clinique alternative", { exact: true })
    .selectOption("b");
  await expect(clinical.locator(".choice-bars > li")).toHaveCount(20);
  await expect(clinicalAlternative.locator(".choice-bars > li")).toHaveCount(
    20,
  );
  await expect(
    clinical
      .locator("li")
      .first()
      .getByRole("img", { name: "Étudiants : 1 sur 1, 100 %", exact: true }),
  ).toBeVisible();
  await expect(
    clinical
      .locator("li")
      .first()
      .getByRole("img", { name: "Experts : 6 sur 8, 75 %", exact: true }),
  ).toBeVisible();
  await expect(
    clinicalAlternative.getByLabel("Impression clinique alternative", {
      exact: true,
    }),
  ).toHaveValue("b");
  await expect(main).not.toContainText("Infection");
  await report
    .getByRole("checkbox", {
      name: "Afficher tous les choix des étudiants",
      exact: true,
    })
    .check();
  await expect(main).toContainText("Infection");
  await clinical
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("c");
  await expect(clinical.locator("li").first()).not.toContainText("0/0");
  await expect(clinical.locator("li").first()).toContainText("—");
  await clinical
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("a");
  await page.setViewportSize({ width: 1280, height: 900 });
  const left = await main.boundingBox(),
    right = await alternative.boundingBox();
  expect(right!.x).toBeGreaterThan(left!.x);
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
  await main.screenshot({
    path: testInfo.outputPath("impression-principale-mobile.png"),
    animations: "disabled",
  });
  await alternative.screenshot({
    path: testInfo.outputPath("impression-alternative-mobile.png"),
    animations: "disabled",
  });
  await clinical.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({
    path: testInfo.outputPath("donnees-principales-mobile.png"),
    animations: "disabled",
  });
  await clinicalAlternative.evaluate((el) =>
    el.scrollIntoView({ block: "start" }),
  );
  await page.screenshot({
    path: testInfo.outputPath("donnees-alternative-mobile.png"),
    animations: "disabled",
  });
  expect(requests).toEqual(["GET"]);
});

test("case selector keeps submissions separate and an empty case has no histogram or non-response count", async ({
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
  await expect(report).toContainText("après la première soumission");
  await expect(report.locator(".choice-histogram")).toHaveCount(0);
  await picker.selectOption("one");
  await expect(report.locator(".choice-case-title")).toHaveText("Toux");
  await expect(report.locator(".choice-histogram")).toHaveCount(4);
  expect(visits).toEqual(["two", "one"]);
});

test("a read failure offers retry without inventing empty histograms", async ({
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
  await expect(report.locator(".choice-histogram")).toHaveCount(0);
  await report.getByRole("button", { name: /Réessayer/ }).click();
  await expect(report.locator(".choice-histogram")).toHaveCount(4);
});
