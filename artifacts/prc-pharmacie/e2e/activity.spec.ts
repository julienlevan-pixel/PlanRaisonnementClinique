import { expect, test, type Page } from "@playwright/test";

const reveals = {
  mainDiagnostic: true,
  mainArguments: false,
  alternativeDiagnostic: false,
  alternativeArguments: false,
  reference: false,
  mainDiagnosticTopOnly: false,
};
const aggregate = {
  totalSubmissions: 3,
  diagnostics: [
    {
      diagnosticId: "a",
      label: "Asthme",
      mainCount: 2,
      mainPercent: 200 / 3,
      alternativeCount: 1,
      alternativePercent: 100 / 3,
    },
    {
      diagnosticId: "b",
      label: "Reflux",
      mainCount: 1,
      mainPercent: 100 / 3,
      alternativeCount: 2,
      alternativePercent: 200 / 3,
    },
  ],
  distributions: [
    {
      diagnosticId: "a",
      role: "main",
      expertCount: 2,
      observations: [
        {
          observationId: "o1",
          label: "Toux nocturne",
          positive: 1,
          negative: 1,
          notSelected: 0,
        },
      ],
    },
  ],
};
function makeLaunch(status = "closed") {
  return {
    id: "launch-1",
    prcId: "prc-1",
    role: "students",
    name: "Ancien titre de séance",
    code: "TOUX1234",
    status,
    createdAt: "2026-01-01",
    participantCount: 5,
    submissionCount: 3,
    case: { name: "Toux", observations: [{ id: "o1", text: "Toux nocturne" }] },
    reveals: { ...reveals },
    reference: {
      status: "validated",
      explanation: "Discussion du cas",
      panelSize: 3,
      minimumPanelSize: 1,
      scoring: { version: "V1" },
    },
    referenceStatus: "validated",
  };
}
async function authenticated(page: Page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          id: "teacher-1",
          username: "teacher",
          role: "teacher",
          active: true,
          mustChangePassword: false,
        },
      },
    }),
  );
}

test("open panel shows a shared QR and link while retaining optional individual invitations", async ({
  page,
}) => {
  await authenticated(page);
  await page.route("**/api/launches/launch-1", (route) =>
    route.fulfill({ json: { ...makeLaunch("open"), role: "panel" } }),
  );
  await page.goto("/activity/launch-1");
  await expect(
    page.getByText("ACCÈS AU PANEL · SANS COMPTE", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Rejoindre le panel d’experts",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".access-card a")).toHaveAttribute(
    "href",
    /\/join\/TOUX1234$/,
  );
  await expect(
    page.getByRole("button", { name: "Copier le lien", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Invitation individuelle (facultative)",
      exact: true,
    }),
  ).toBeVisible();
});

test("a closed student activity can publish without a reveal prerequisite", async ({
  page,
}) => {
  await authenticated(page);
  const launch = makeLaunch();
  await page.route("**/api/launches/launch-1", (route) =>
    route.fulfill({ json: launch }),
  );
  await page.route("**/api/launches/launch-1/results", (route) =>
    route.fulfill({ json: { class: aggregate, panel: aggregate } }),
  );
  await page.route("**/api/launches/launch-1/publish", async (route) => {
    launch.status = "published";
    await route.fulfill({ json: launch });
  });
  await page.goto("/activity/launch-1");
  await expect(
    page.getByRole("heading", { name: "Toux", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publier les résultats" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Publier les résultats" }).click();
  await expect(
    page.getByRole("button", { name: "Résultats publiés" }),
  ).toBeDisabled();
});

test("reveal switches persist the server value after a reload", async ({
  page,
}) => {
  await authenticated(page);
  const launch = makeLaunch();
  await page.route("**/api/launches/launch-1", (route) =>
    route.fulfill({ json: launch }),
  );
  await page.route("**/api/launches/launch-1/results", (route) =>
    route.fulfill({ json: { class: aggregate, panel: aggregate } }),
  );
  await page.route("**/api/launches/launch-1/reveal", async (route) => {
    const input = route.request().postDataJSON();
    expect(input).toEqual({ mainDiagnostic: false });
    launch.reveals.mainDiagnostic = input.mainDiagnostic;
    await route.fulfill({ json: launch });
  });
  await page.goto("/activity/launch-1");
  await expect(page.getByTestId("toggle-reveal-mainDiagnostic")).toBeChecked();
  await page.getByTestId("toggle-reveal-mainDiagnostic").click();
  await expect(
    page.getByTestId("toggle-reveal-mainDiagnostic"),
  ).not.toBeChecked();
  await page.reload();
  await expect(
    page.getByTestId("toggle-reveal-mainDiagnostic"),
  ).not.toBeChecked();
});

test("closing names the non-submitted copies and avoids heavy polling during collection", async ({
  page,
}) => {
  await authenticated(page);
  const launch = makeLaunch("open");
  let aggregateRequests = 0;
  await page.route("**/api/launches/launch-1", (route) =>
    route.fulfill({ json: launch }),
  );
  await page.route("**/api/launches/launch-1/results", (route) => {
    aggregateRequests++;
    return route.fulfill({ json: { class: aggregate, panel: aggregate } });
  });
  await page.route("**/api/launches/launch-1/close", async (route) => {
    launch.status = "closed";
    await route.fulfill({ json: launch });
  });
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toContain("2 copie(s) restent non soumises");
    await dialog.accept();
  });
  await page.goto("/activity/launch-1");
  await expect(
    page.getByText(
      "Les résultats collectifs restent masqués pendant la collecte.",
      { exact: false },
    ),
  ).toBeVisible();
  expect(aggregateRequests).toBe(0);
  await expect(
    page.getByRole("button", { name: "Publier les résultats" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Fermer la collecte" }).click();
  await expect(
    page.getByRole("button", { name: "Publier les résultats" }),
  ).toBeEnabled();
});

test("projection contains only collective data and waits for each reveal", async ({
  page,
}) => {
  await page.route("**/api/launches/launch-1/projection", (route) =>
    route.fulfill({
      json: {
        launch: makeLaunch(),
        case: { name: "Toux" },
        role: "students",
        status: "closed",
        reveals,
        class: aggregate,
        panel: aggregate,
      },
    }),
  );
  await page.goto("/projection/launch-1");
  await expect(
    page.getByRole("heading", { name: "Toux", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Vue collective : aucune identité, copie individuelle ou note personnelle n’est affichée.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("rowheader", { name: "Asthme" })).toBeVisible();
  await expect(
    page.getByText("Les arguments principaux n’ont pas encore été révélés."),
  ).toBeVisible();
  await expect(page.getByTestId("button-logout")).toHaveCount(0);
});

test("panel projection uses the panel aggregate when the class aggregate is empty", async ({
  page,
}) => {
  await page.route("**/api/launches/launch-1/projection", (route) =>
    route.fulfill({
      json: {
        launch: { ...makeLaunch(), role: "panel" },
        case: { name: "Toux" },
        role: "panel",
        status: "closed",
        reveals: { ...reveals, mainArguments: true },
        class: {},
        panel: aggregate,
      },
    }),
  );
  await page.goto("/projection/launch-1");
  await expect(page.getByRole("rowheader", { name: "Asthme" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Toux nocturne" }),
  ).toBeVisible();
  await expect(page.getByText("Panel :", { exact: false })).toContainText("3");
});
