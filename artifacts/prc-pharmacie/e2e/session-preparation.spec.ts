import { expect, test, type Page } from "@playwright/test";
const user = {
  id: "teacher",
  username: "Professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const observations = Array.from({ length: 20 }, (_, i) => ({
  id: `o${i}`,
  text: `Observation ${i + 1}`,
  category: "Examen physique",
  position: i,
}));
const diagnostics = [
  { id: "a", label: "Asthme" },
  { id: "b", label: "Reflux" },
];
const grading = (maximum: number) => ({
  maximum,
  attainableMaximum: maximum,
  mainDiagnosisMaximum: maximum - 12,
  alternativeDiagnosisMaximum: 2,
  clinicalMaximum: 5,
});
const caseData = (id: string, maximum: number) => ({
  id,
  name: id === "one" ? "Toux" : "Dyspnée",
  version: 2,
  corrected: true,
  scenario: "Un cas clinique fictif pour vérifier la séance.",
  instructions: "Deux impressions cliniques et cinq données chacune.",
  diagnostics,
  observations,
  grading: grading(maximum),
});
async function base(page: Page) {
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { user } }));
  await page.route("**/api/teaching-sessions/options", (r) =>
    r.fulfill({
      json: [
        { id: "one", name: "Toux", version: 2, ready: true, corrected: true },
        {
          id: "two",
          name: "Dyspnée",
          version: 2,
          ready: true,
          corrected: true,
        },
      ],
    }),
  );
}
async function fill(page: Page) {
  await page.goto("/seances?new=1");
  await page
    .getByLabel("Nom de la séance", { exact: true })
    .fill("Atelier clinique");
  await page.getByRole("checkbox", { name: /Toux/ }).check();
  await page.getByRole("checkbox", { name: /Dyspnée/ }).check();
}

test("the review shows actual case maxima and a local student preview before creating anything", async ({
  page,
}, testInfo) => {
  await base(page);
  let creations = 0;
  const writes: string[] = [];
  await page.route("**/api/teaching-sessions", (r) => {
    if (r.request().method() === "POST") creations++;
    return r.fulfill({ json: [] });
  });
  await page.route("**/api/teaching-sessions/preview", (r) => {
    expect(r.request().postDataJSON()).toEqual({
      role: "students",
      deliveryMode: "synchronous",
      prcIds: ["two", "one"],
    });
    return r.fulfill({
      json: {
        role: "students",
        deliveryMode: "synchronous",
        maximum: 30.3,
        attainableMaximum: 30.3,
        preparationToken: "a".repeat(64),
        cases: [caseData("two", 15.2), caseData("one", 15.1)],
      },
    });
  });
  page.on("request", (r) => {
    if (r.method() !== "GET") writes.push(new URL(r.url()).pathname);
  });
  await fill(page);
  await page
    .getByRole("button", { name: "Monter le cas 2", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Créer la séance (2 cas)", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Vérifier la séance", exact: true })
    .click();
  const review = page.getByRole("region", {
    name: "Récapitulatif de la séance",
    exact: true,
  });
  await expect(review).toContainText("30,3 points");
  await expect(review.locator(".preparation-cases>li").first()).toContainText(
    "Cas 1 · Dyspnée",
  );
  await expect(review).toContainText("Version 2 · 15,2 points");
  await review.getByText("Aperçu étudiant · Dyspnée", { exact: true }).click();
  const preview = review
    .locator(".preparation-cases>li")
    .first()
    .getByRole("region", {
      name: "Essayer le questionnaire",
      exact: true,
    });
  await preview
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("a");
  await preview.getByTestId("choice-main-positive-o0").click();
  await expect(preview.getByTestId("choice-main-positive-o0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await review.getByText("Aperçu étudiant · Toux", { exact: true }).click();
  const other = review
    .locator(".preparation-cases>li")
    .nth(1)
    .getByRole("region", {
      name: "Essayer le questionnaire",
      exact: true,
    });
  await other
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("b");
  await expect(
    preview.getByLabel("Impression clinique", { exact: true }),
  ).toHaveValue("a");
  await expect(
    other.getByLabel("Impression clinique", { exact: true }),
  ).toHaveValue("b");
  const controlIds = await review
    .locator("select[id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  expect(new Set(controlIds).size).toBe(controlIds.length);
  await review.getByText("Aperçu étudiant · Toux", { exact: true }).click();
  expect(creations).toBe(0);
  expect(writes).toEqual(["/api/teaching-sessions/preview"]);
  await review.getByText("Aperçu étudiant · Dyspnée", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await review.screenshot({
    path: testInfo.outputPath("session-recap-mobile.png"),
    animations: "disabled",
  });
  await review
    .getByRole("button", { name: "Modifier la préparation", exact: true })
    .click();
  await expect(
    page.getByLabel("Nom de la séance", { exact: true }),
  ).toHaveValue("Atelier clinique");
  await expect(page.getByRole("checkbox", { name: /Dyspnée/ })).toBeChecked();
  await expect(page.locator(".session-order li").first()).toContainText(
    "Dyspnée",
  );
  expect(creations).toBe(0);
});

test("a stale recap stays reviewable and can be refreshed before confirming the updated rubric", async ({
  page,
}) => {
  await base(page);
  let previews = 0,
    creates = 0;
  let confirmed: any;
  await page.route("**/api/teaching-sessions", (r) => {
    if (r.request().method() === "POST") {
      creates++;
      confirmed = r.request().postDataJSON();
      if (creates === 1)
        return r.fulfill({
          status: 409,
          json: {
            error:
              "Les cas ou leurs barèmes ont changé. Actualisez le récapitulatif avant de créer la séance.",
          },
        });
      return r.fulfill({ status: 201, json: { id: "created", code: "S-NEW" } });
    }
    return r.fulfill({ json: [] });
  });
  await page.route("**/api/teaching-sessions/created", (r) =>
    r.fulfill({
      json: {
        id: "created",
        name: "Atelier clinique",
        role: "students",
        deliveryMode: "asynchronous",
        status: "finished",
        code: "S-NEW",
        currentPosition: 0,
        cases: [],
        report: { maximum: 32, caseCount: 2, memberCount: 0, members: [] },
      },
    }),
  );
  await page.route("**/api/teaching-sessions/preview", (r) => {
    previews++;
    const request = r.request().postDataJSON();
    return r.fulfill({
      json: {
        ...request,
        maximum: previews === 1 ? 30 : 32,
        attainableMaximum: previews === 1 ? 30 : 32,
        preparationToken: (previews === 1 ? "a" : "b").repeat(64),
        cases: [caseData("one", previews === 1 ? 15 : 17), caseData("two", 15)],
      },
    });
  });
  await fill(page);
  await page
    .getByRole("button", { name: "Vérifier la séance", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Créer la séance (2 cas)", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Actualisez le récapitulatif",
  );
  await expect(
    page.getByRole("region", {
      name: "Récapitulatif de la séance",
      exact: true,
    }),
  ).toContainText("30 points");
  await page
    .getByRole("button", { name: "Actualiser le récapitulatif", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Récapitulatif de la séance",
      exact: true,
    }),
  ).toContainText("32 points");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(creates).toBe(1);
  await page
    .getByRole("button", { name: "Créer la séance (2 cas)", exact: true })
    .click();
  await expect(page).toHaveURL("/seances/created");
  expect(confirmed.preparationToken).toBe("b".repeat(64));
  expect(creates).toBe(2);
});

test("expert preparation shows no student grade and lets the professor try the importance selector locally", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/teaching-sessions", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/teaching-sessions/preview", (r) => {
    const input = r.request().postDataJSON();
    expect(input.role).toBe("panel");
    return r.fulfill({
      json: {
        ...input,
        maximum: null,
        attainableMaximum: null,
        preparationToken: "a".repeat(64),
        cases: [{ ...caseData("one", 15), grading: null, corrected: false }],
      },
    });
  });
  await page.goto("/seances?new=1&prcId=one");
  await page
    .getByLabel("Nom de la séance", { exact: true })
    .fill("Panel expert");
  await page
    .getByRole("combobox", { name: "Participants de la séance", exact: true })
    .selectOption("panel");
  await page
    .getByRole("button", { name: "Vérifier la séance", exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Récapitulatif de la séance",
      exact: true,
    }),
  ).toContainText("Sans note étudiante");
  await page.getByText("Aperçu expert · Toux", { exact: true }).click();
  const preview = page.getByRole("region", {
    name: "Essayer le questionnaire",
    exact: true,
  });
  await expect(
    preview.getByRole("button", { name: "Vue expert", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await preview.getByTestId("choice-main-positive-o0").click();
  await preview
    .getByRole("radiogroup", {
      name: "Points impression clinique — Observation 1",
      exact: true,
    })
    .getByRole("radio", { name: /^3/ })
    .click();
  await preview.getByTestId("choice-main-negative-o0").click();
  await expect(
    preview
      .getByRole("radiogroup", {
        name: "Points impression clinique — Observation 1",
        exact: true,
      })
      .getByRole("radio", { name: /^3/ }),
  ).toHaveAttribute("aria-checked", "true");
  await preview
    .getByRole("button", { name: "Vue étudiant", exact: true })
    .click();
  await expect(preview.getByRole("radiogroup")).toHaveCount(0);
  await expect(preview.getByTestId("choice-main-negative-o0")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await preview
    .getByRole("button", { name: "Vue expert", exact: true })
    .click();
  await expect(preview.getByRole("radio", { name: /^3/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
