import { expect, test, type Page } from "@playwright/test";
const diagnostics = [
  { id: "a", label: "Asthme" },
  { id: "b", label: "Reflux" },
  { id: "c", label: "Pneumonie" },
];
const observations = Array.from({ length: 5 }, (_, i) => ({
  id: `o${i}`,
  text: `Donnée clinique ${i + 1}`,
  category: "Examen physique",
}));
const defaults = () => ({
  version: "custom-rubric-v1",
  revision: 1,
  clinicalMaximum: 5,
  diagnostics: diagnostics.map((row, i) => ({
    diagnosticId: row.id,
    mainPoints: [3, 1, 0][i],
    alternativePoints: i < 2 ? 2 : 0,
    observations: observations.map((observation, j) => ({
      observationId: observation.id,
      positivePoints: i === 0 ? [1, 1, 0.5, 0, 0][j] : i === 1 ? 0.5 : 0,
      negativePoints: 0,
    })),
  })),
});
async function setup(page: Page) {
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
  const rubric = defaults();
  const distributions = diagnostics.map((row, i) => ({
    diagnosticId: row.id,
    role: "main",
    expertCount: [4, 2, 0][i],
    observations: observations.map((observation, j) => ({
      observationId: observation.id,
      label: observation.text,
      positive: i === 0 ? [4, 3, 2, 1, 0][j] : i === 1 ? 1 : 0,
      negative: 0,
      notSelected: 0,
    })),
  }));
  const launch: any = {
    id: "panel",
    prcId: "case",
    role: "panel",
    name: "Cas du panel",
    code: "PANEL123",
    status: "closed",
    createdAt: "2026-01-01",
    participantCount: 4,
    submissionCount: 4,
    reveals: {
      mainDiagnostic: false,
      mainArguments: false,
      alternativeDiagnostic: false,
      alternativeArguments: false,
      reference: false,
    },
    case: { name: "Cas du panel", diagnostics, observations },
    referenceStatus: "validated",
    reference: {
      status: "validated",
      minimumPanelSize: 4,
      panelSize: 4,
      explanation: "",
      rubric,
      suggestedRubric: structuredClone(rubric),
      diagnostics: [],
      distributions,
    },
  };
  await page.route("**/api/launches/panel", (route) =>
    route.fulfill({ json: launch }),
  );
  await page.route("**/api/launches/panel/panel-results", (route) =>
    route.fulfill({
      json: { totalSubmissions: 4, diagnostics: [], distributions },
    }),
  );
  return launch;
}
test("professor edits diagnosis and signed clinical points, saves and restores the personalized rubric", async ({
  page,
}, testInfo) => {
  const launch = await setup(page);
  let saved: any;
  await page.route("**/api/launches/panel/reference/rubric", async (route) => {
    expect(route.request().method()).toBe("PUT");
    const payload = route.request().postDataJSON();
    expect(payload.revision).toBe(1);
    saved = payload.rubric;
    launch.reference.rubric = { ...saved, revision: 2 };
    await route.fulfill({ json: launch.reference });
  });
  await page.goto("/activity/panel");
  const editor = page.getByRole("region", {
    name: "Barème personnalisable du professeur",
    exact: true,
  });
  await expect(editor).toContainText("Note maximale : 15 points");
  await expect(editor).toContainText("75 % et plus = 1 point");
  await expect(editor).toContainText("50 % à moins de 75 % = 0,5");
  await editor.locator(".rubric-diagnostic").first().locator("summary").click();
  await editor
    .getByRole("spinbutton", {
      name: "Diagnostic principal — Asthme",
      exact: true,
    })
    .fill("4");
  await editor
    .getByRole("spinbutton", {
      name: "Points + — Asthme — Donnée clinique 3",
      exact: true,
    })
    .fill("0.75");
  await editor
    .getByRole("spinbutton", {
      name: "Points − — Asthme — Donnée clinique 4",
      exact: true,
    })
    .fill("0.5");
  await expect(editor).toContainText("Note maximale : 16 points");
  await editor
    .getByRole("button", { name: "Enregistrer le barème", exact: true })
    .click();
  await expect(editor.getByRole("status")).toContainText("version 2");
  expect(saved.diagnostics[0].mainPoints).toBe(4);
  expect(saved.diagnostics[0].observations[2].positivePoints).toBe(0.75);
  expect(saved.diagnostics[0].observations[3].negativePoints).toBe(0.5);
  await page.reload();
  await editor.locator(".rubric-diagnostic").first().locator("summary").click();
  await expect(
    editor.getByRole("spinbutton", {
      name: "Diagnostic principal — Asthme",
      exact: true,
    }),
  ).toHaveValue("4");
  await editor.screenshot({
    path: testInfo.outputPath("professor-rubric-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= innerWidth,
    width: document.documentElement.scrollWidth,
    viewport: innerWidth,
    scroll: scrollX,
    overflow: [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > innerWidth &&
          !element.closest(".rubric-table-scroll,.activity-table-scroll"),
      )
      .slice(0, 20)
      .map(
        (element) =>
          `${element.tagName}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`,
      ),
    containers: [
      ...document.querySelectorAll(
        ".rubric-table-scroll,.activity-table-scroll",
      ),
    ].map((element) => ({
      overflow: getComputedStyle(element).overflowX,
      width: element.clientWidth,
      scroll: element.scrollWidth,
      right: element.getBoundingClientRect().right,
    })),
  }));
  expect(layout.fits, JSON.stringify(layout)).toBe(true);
  await editor.screenshot({
    path: testInfo.outputPath("professor-rubric-mobile.png"),
    animations: "disabled",
  });
});
test("stale rubric save preserves local edits and reload fetches the latest server revision", async ({
  page,
}) => {
  const launch = await setup(page);
  await page.route("**/api/launches/panel/reference/rubric", async (route) => {
    launch.reference.rubric = structuredClone(launch.reference.rubric);
    launch.reference.rubric.revision = 2;
    launch.reference.rubric.diagnostics[0].mainPoints = 5;
    await route.fulfill({
      status: 409,
      json: {
        error:
          "Ce barème a été modifié ailleurs. Rechargez-le avant d’enregistrer.",
      },
    });
  });
  await page.goto("/activity/panel");
  const editor = page.getByRole("region", {
    name: "Barème personnalisable du professeur",
    exact: true,
  });
  await editor.locator(".rubric-diagnostic").first().locator("summary").click();
  const points = editor.getByRole("spinbutton", {
    name: "Diagnostic principal — Asthme",
    exact: true,
  });
  await points.fill("4");
  await editor
    .getByRole("button", { name: "Enregistrer le barème", exact: true })
    .click();
  await expect(editor.getByRole("alert")).toContainText("modifié ailleurs");
  await expect(points).toHaveValue("4");
  page.once("dialog", (dialog) => dialog.accept());
  await editor
    .getByRole("button", {
      name: "Recharger le barème enregistré",
      exact: true,
    })
    .click();
  await expect(points).toHaveValue("5");
  await expect(editor.getByRole("status")).toContainText("version 2");
});
