import { expect, test } from "@playwright/test";

const observations = Array.from({ length: 20 }, (_, i) => ({
  id: `o${i}`,
  text: `Donnée clinique ${i + 1}`,
  category: "Examen physique",
  position: i,
}));
const diagnostics = [
  { id: "a", label: "Asthme" },
  { id: "b", label: "Reflux" },
];
const clinicalCase = {
  name: "Cas de toux",
  launchId: "case",
  role: "students",
  status: "published",
  deliveryMode: "asynchronous",
  scenario: "Une toux sèche depuis trois semaines.",
  instructions: "Deux impressions cliniques distinctes.",
  diagnostics,
  observations,
};

for (const sample of [
  { score: 0, maximum: 15, label: "0 / 15", alternative: 2 },
  { score: 15.2, maximum: 15.2, label: "15,2 / 15,2", alternative: 2.2 },
]) {
  test(`the published ${sample.label} stays prominent and readable on small screens without changing its maximum`, async ({
    page,
  }, testInfo) => {
    await page.route("**/api/participant/teaching-session", (r) =>
      r.fulfill({ json: { session: null } }),
    );
    await page.route("**/api/participant/state", (r) =>
      r.fulfill({
        json: {
          status: "published",
          role: "students",
          published: true,
          responseState: "submitted",
          revision: 1,
          reveals: {},
        },
      }),
    );
    await page.route("**/api/participant/results", (r) =>
      r.fulfill({
        json: {
          case: {
            ...clinicalCase,
            grading: {
              maximum: sample.maximum,
              attainableMaximum: sample.maximum,
              mainDiagnosisMaximum: 3,
              alternativeDiagnosisMaximum: sample.alternative,
              clinicalMaximum: 5,
            },
          },
          published: true,
          score: sample.score,
          percentage: sample.score === 0 ? 0 : 100,
          components:
            sample.score === 0
              ? {}
              : {
                  mainDiagnosis: 3,
                  alternativeDiagnosis: 2.2,
                  mainJustification: 5,
                  alternativeJustification: 5,
                },
          response: {
            state: "submitted",
            revision: 1,
            mainDiagnosticId: "a",
            alternativeDiagnosticId: "b",
            mainChoices: observations
              .slice(0, 5)
              .map((o) => ({ observationId: o.id, sign: "+" })),
            alternativeChoices: observations
              .slice(5, 10)
              .map((o) => ({ observationId: o.id, sign: "-" })),
          },
          role: "students",
          status: "published",
          deliveryMode: "asynchronous",
          panel: {},
          class: {},
        },
      }),
    );
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/participant/results");
    const score = page.getByRole("region", {
      name: "Votre résultat",
      exact: true,
    });
    await expect(score.locator(".score-summary-value strong")).toHaveText(
      sample.label,
    );
    await expect(score.locator("meter")).toHaveAttribute(
      "max",
      String(sample.maximum),
    );
    await expect(score.locator("meter")).toHaveAttribute(
      "value",
      String(sample.score),
    );
    await expect(
      score.getByRole("heading", {
        name: "Impression clinique alternative",
        exact: true,
      }),
    ).toBeVisible();
    const scoreTop = (await score.boundingBox())!.y;
    const progressTop = (await page
      .getByRole("region", {
        name: "Votre progression dans le cas",
        exact: true,
      })
      .boundingBox())!.y;
    expect(scoreTop).toBeLessThan(progressTop);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await score.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(
        true,
      );
    }
    await score.screenshot({
      path: testInfo.outputPath("published-score-desktop.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await score.screenshot({
      path: testInfo.outputPath("published-score-mobile.png"),
      animations: "disabled",
    });
  });
}

test("the same readable preview preserves selections and expert importance at 320 pixels", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 401, json: { error: "Non connecté" } }),
  );
  await page.route("**/api/participant/resume", (r) =>
    r.fulfill({ json: { available: false } }),
  );
  await page.route("**/api/demo-case", (r) =>
    r.fulfill({ json: clinicalCase }),
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Découvrir l’exemple « Toux »", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Toux — essai du tableau",
    exact: true,
  });
  await preview
    .getByRole("button", { name: "Vue expert", exact: true })
    .click();
  await preview
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("a");
  await preview.getByTestId("choice-main-positive-o0").click();
  await preview.getByRole("radio", { name: /^3/ }).click();
  await preview
    .getByRole("button", { name: "Alternative · 0/5", exact: true })
    .click();
  await preview
    .getByLabel("Impression clinique alternative", { exact: true })
    .selectOption("b");
  await preview.getByTestId("choice-alternative-negative-o1").click();
  await preview
    .getByRole("button", { name: "Principale · 1/5", exact: true })
    .click();
  await expect(preview.getByRole("radio", { name: /^3/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const select = preview.getByLabel("Impression clinique", { exact: true });
  expect(
    await select.evaluate((n) => parseFloat(getComputedStyle(n).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  expect(
    await preview
      .getByTestId("choice-main-positive-o0")
      .evaluate((n) => n.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(48);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await preview.screenshot({
    path: testInfo.outputPath("expert-table-mobile.png"),
    animations: "disabled",
  });
});
