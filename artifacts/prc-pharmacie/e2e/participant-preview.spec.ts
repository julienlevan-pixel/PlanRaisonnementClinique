import { expect, test } from "@playwright/test";

const diagnostics = [
  { id: "a", label: "Asthme" },
  { id: "b", label: "Reflux" },
];
const data = {
  name: "Toux",
  scenario: "Une toux sèche persistante depuis trois semaines.",
  instructions: "Deux impressions cliniques distinctes.",
  diagnostics,
  observations: Array.from({ length: 20 }, (_, i) => ({
    id: `o${i}`,
    text: `Observation fictive ${i + 1}`,
    category: "Examen physique",
    position: i,
  })),
};

test("the professor can compare both preview roles without changing the authored case", async ({
  page,
}) => {
  const id = "10000000-0000-4000-8000-000000000001";
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
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
  await page.route(`**/api/prcs/${id}`, (r) =>
    r.fulfill({
      json: {
        ...data,
        id,
        version: 1,
        status: "ready",
        updatedAt: "2026-11-04T12:00:00Z",
        launchCount: 0,
        launches: [],
        archived: false,
        isDemo: false,
        workflow: {
          step: "panel",
          missing: [],
          panelLaunchId: null,
          referenceStatus: null,
        },
      },
    }),
  );
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto(`/prc/${id}`);
  await page
    .getByRole("button", {
      name: "Prévisualiser le questionnaire",
      exact: true,
    })
    .click();
  const preview = page.getByRole("region", {
    name: "Prévisualisation du questionnaire",
    exact: true,
  });
  await preview
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("preview-diagnostic-0");
  await preview.getByTestId("choice-main-positive-o0").click();
  await preview
    .getByRole("button", { name: "Vue expert", exact: true })
    .click();
  await preview.getByTestId("choice-main-negative-o1").click();
  await preview.getByRole("radio", { name: /^2/ }).click();
  await preview
    .getByRole("button", { name: "Vue étudiant", exact: true })
    .click();
  await expect(preview.getByTestId("choice-main-positive-o0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(preview.getByRole("radiogroup")).toHaveCount(0);
  await expect(
    page.getByLabel("Texte de l’observation 1", { exact: true }),
  ).toHaveValue("Observation fictive 1");
  await expect(
    page.getByLabel("Texte de l’observation 2", { exact: true }),
  ).toHaveValue("Observation fictive 2");
  await expect(page.getByLabel("Diagnostic 1", { exact: true })).toHaveValue(
    "Asthme",
  );
  expect(writes).toEqual([]);
});

test("the Toux preview uses mobile participant controls and keeps independent student and expert trials without writes", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 401, json: { error: "Connexion requise." } }),
  );
  await page.route("**/api/demo-case", (r) => r.fulfill({ json: data }));
  const writes: string[] = [];
  page.on("request", (r) => {
    if (!["GET", "HEAD"].includes(r.method())) writes.push(r.url());
  });
  await page.goto("/");
  await page
    .getByRole("link", { name: "Découvrir l’exemple « Toux »", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Toux — essai du tableau",
    exact: true,
  });
  await expect(
    preview.getByRole("button", { name: "Vue étudiant", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await preview
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("a");
  for (let i = 0; i < 5; i++)
    await preview.getByTestId(`choice-main-positive-o${i}`).click();
  await preview.getByTestId("choice-main-positive-o5").click();
  await expect(preview.getByRole("alert")).toContainText(
    "Cinq données au maximum",
  );
  await expect(preview.getByRole("radiogroup")).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Alternative · 0/5", exact: true })
    .click();
  await preview
    .getByLabel("Impression clinique alternative", { exact: true })
    .selectOption("b");
  await expect(
    preview
      .getByLabel("Impression clinique alternative", { exact: true })
      .locator('option[value="a"]'),
  ).toHaveJSProperty("disabled", true);
  await preview.getByTestId("choice-alternative-negative-o6").click();
  await preview
    .getByRole("button", { name: "Vue expert", exact: true })
    .click();
  await expect(
    preview.getByLabel("Impression clinique", { exact: true }),
  ).toHaveValue("");
  await expect(preview).toContainText("Attribuez une importance clinique");
  await preview
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("b");
  await preview.getByTestId("choice-main-positive-o0").click();
  const points = preview.getByRole("radiogroup", {
    name: "Points impression clinique — Observation fictive 1",
    exact: true,
  });
  await expect(points.getByRole("radio", { checked: true })).toHaveCount(0);
  await points.getByRole("radio", { name: /^3/ }).click();
  await preview.getByTestId("choice-main-negative-o0").click();
  await expect(points.getByRole("radio", { name: /^3/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await preview
    .getByRole("button", { name: "Alternative · 0/5", exact: true })
    .click();
  await preview.getByTestId("choice-alternative-positive-o1").click();
  await preview
    .getByRole("radiogroup", {
      name: "Points impression clinique alternative — Observation fictive 2",
      exact: true,
    })
    .getByRole("radio", { name: /^2/ })
    .click();
  await preview
    .getByRole("button", { name: "Vue étudiant", exact: true })
    .click();
  await expect(
    preview.getByLabel("Impression clinique alternative", { exact: true }),
  ).toHaveValue("b");
  await expect(
    preview.getByTestId("choice-alternative-negative-o6"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(preview.getByRole("radiogroup")).toHaveCount(0);
  await preview
    .getByRole("button", { name: "Principale · 5/5", exact: true })
    .click();
  await expect(
    preview.getByLabel("Impression clinique", { exact: true }),
  ).toHaveValue("a");
  await expect(preview.getByTestId("choice-main-positive-o0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(preview.getByTestId("choice-main-positive-o5")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await preview
    .getByRole("button", { name: "Vue expert", exact: true })
    .click();
  await preview
    .getByRole("button", { name: "Principale · 1/5", exact: true })
    .click();
  await expect(
    preview.getByLabel("Impression clinique", { exact: true }),
  ).toHaveValue("b");
  await expect(points.getByRole("radio", { name: /^3/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const matrix = preview.getByRole("region", {
      name: "Justification des deux impressions cliniques",
      exact: true,
    });
    expect(await matrix.evaluate((n) => n.scrollWidth <= n.clientWidth)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await preview
    .getByRole("button", { name: "Revoir le cas", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Observation fictive 20",
  );
  await page.keyboard.press("Escape");
  await expect(
    preview.getByRole("button", { name: "Revoir le cas", exact: true }),
  ).toBeFocused();
  await preview.screenshot({
    path: testInfo.outputPath("preview-expert-mobile.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(
    preview.getByLabel("Impression clinique", { exact: true }),
  ).toBeVisible();
  await expect(
    preview.getByLabel("Impression clinique alternative", { exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});
