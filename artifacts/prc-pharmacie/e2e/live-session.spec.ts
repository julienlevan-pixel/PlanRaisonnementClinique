import { expect, test } from "@playwright/test";

test.beforeEach(async ({page}) => {
  await page.route('**/api/participant/teaching-session', route => route.fulfill({json:{session:null}}));
});

const clinicalCase = {
  name: "Cas synchrone fictif",
  scenario:
    "Une personne consulte pour une toux persistante. Présentation sans données personnelles.",
  instructions: "Retenez deux impressions cliniques distinctes.",
  diagnostics: [
    { id: "a", label: "Asthme" },
    { id: "b", label: "Reflux" },
  ],
  observations: Array.from({ length: 6 }, (_, i) => ({
    id: `o${i}`,
    text: `Observation clinique ${i + 1}`,
    category: "Examen physique",
  })),
};
const teacher = {
  id: "teacher",
  username: "professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};

for (const role of ["panel", "students"] as const) {
  test(`${role} waits, reads the case, answers only after opening and resumes after reload`, async ({
    page,
  }, testInfo) => {
    await page.clock.install();
    let session: any = { phase: "lobby" };
    let count = 1;
    let saved = {
      state: "draft",
      revision: 0,
      mainDiagnosticId: null as string | null,
      alternativeDiagnosticId: null,
      mainChoices: [] as any[],
      alternativeChoices: [],
    };
    const info = () => ({
      ...clinicalCase,
      role,
      launchId: "live",
      status: "open",
      liveSession: session,
      requiredChoices: 5,
      ...(session.phase === "lobby"
        ? { scenario: "", instructions: "", observations: [], diagnostics: [] }
        : {}),
    });
    await page.route("**/api/participant/response", async (route) => {
      if (route.request().method() === "PUT")
        saved = {
          ...saved,
          ...route.request().postDataJSON(),
          revision: saved.revision + 1,
        };
      await route.fulfill({ json: { response: saved, joinInfo: info() } });
    });
    await page.route("**/api/participant/state", (route) =>
      route.fulfill({
        json: {
          status: "open",
          role,
          liveSession: session,
          participantCount: count,
          joinInfo: info(),
          reveals: {},
          responseState: "draft",
          revision: saved.revision,
        },
      }),
    );
    await page.goto("/participant");
    const waiting = page.getByRole("region", {
      name: "Salle d’attente de la séance",
      exact: true,
    });
    await expect(waiting).toContainText("1 personne(s) ont rejoint");
    await expect(
      page.getByText(clinicalCase.scenario, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Impression clinique", { exact: true }),
    ).toHaveCount(0);
    count = 2;
    await page.clock.fastForward(5100);
    await expect(waiting).toContainText("2 personne(s) ont rejoint");
    session = { phase: "case" };
    await page.clock.fastForward(5100);
    const presentation = page.getByRole("region", {
      name: "Présentation du cas clinique",
      exact: true,
    });
    await expect(presentation).toContainText(clinicalCase.scenario);
    await expect(presentation).toContainText("Observation clinique 6");
    await expect(
      page.getByLabel("Impression clinique", { exact: true }),
    ).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${role}-case-mobile.png`),
      fullPage: true,
    });
    await page.reload();
    await expect(presentation).toBeVisible();
    session = {
      phase: "answering",
      endsAt: new Date(
        (await page.evaluate(() => Date.now())) + 60000,
      ).toISOString(),
    };
    await page.clock.fastForward(5100);
    await expect(
      page.getByLabel("Impression clinique", { exact: true }),
    ).toBeVisible();
    await expect(waiting).toHaveCount(0);
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(
      page.getByText("Choisissez l’impression clinique la plus probable", {
        exact: false,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Impression clinique", { exact: true })
      .selectOption("a");
    await page.getByTestId("choice-main-positive-o0").click();
    await page.clock.fastForward(1000);
    await expect.poll(() => saved.mainChoices.length).toBe(1);
    await page.reload();
    await expect(page.getByTestId("choice-main-positive-o0")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.clock.fastForward(61000);
    await expect(page.getByRole("timer")).toHaveText("Temps écoulé");
    await expect(
      page.getByLabel("Impression clinique", { exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", {
        name: "Vérifier et transmettre",
        exact: true,
      }),
    ).toBeEnabled();
  });
}

test("teacher drives the persistent stages and projection keeps the case and QR visible while participants answer", async ({
  page,
  context,
}, testInfo) => {
  const launch: any = {
    id: "live",
    prcId: "case",
    role: "panel",
    code: "SYNCHRO",
    name: clinicalCase.name,
    status: "open",
    case: clinicalCase,
    createdAt: "2026-01-01",
    participantCount: 3,
    submissionCount: 0,
    reveals: {},
    liveSession: { phase: "lobby" },
  };
  await context.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user: teacher } }),
  );
  await context.route("**/api/launches/live", (route) =>
    route.fulfill({ json: launch }),
  );
  await context.route("**/api/launches/live/session", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "present") launch.liveSession = { phase: "case" };
    else {
      expect(body.durationMinutes).toBe(3);
      launch.liveSession = {
        phase: "answering",
        endsAt: new Date(Date.now() + 180000).toISOString(),
      };
    }
    return route.fulfill({ json: launch });
  });
  await context.route("**/api/launches/live/projection", (route) =>
    route.fulfill({ json: { launch, case: clinicalCase, status: "open" } }),
  );
  await page.goto("/activity/live");
  const control = page.getByRole("region", {
    name: "Piloter la séance synchrone",
    exact: true,
  });
  await expect(control).toContainText("Accueillir les participants");
  await expect(
    page.getByRole("button", { name: "Fermer la collecte", exact: true }),
  ).toHaveCount(0);
  const projection = await context.newPage();
  await projection.goto("/projection/live");
  await expect(
    projection.getByRole("img", { name: "Rejoindre la séance", exact: true }),
  ).toBeVisible();
  await expect(
    projection.getByRole("region", {
      name: "Présentation du cas clinique",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Présenter le cas", exact: true })
    .click();
  await expect(control).toContainText("Présenter avant de faire répondre");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Ouvrir les réponses", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("spinbutton", {
      name: "Chronomètre facultatif (minutes)",
      exact: true,
    })
    .fill("0");
  await expect(
    page.getByRole("button", { name: "Ouvrir les réponses", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("spinbutton", {
      name: "Chronomètre facultatif (minutes)",
      exact: true,
    })
    .fill("3");
  await page
    .getByRole("button", { name: "Ouvrir les réponses", exact: true })
    .click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fermer la collecte", exact: true }),
  ).toBeVisible();
  await projection.reload();
  await expect(
    projection.getByRole("region", {
      name: "Présentation du cas clinique",
      exact: true,
    }),
  ).toContainText(clinicalCase.scenario);
  await expect(
    projection.getByRole("img", { name: "Rejoindre la séance", exact: true }),
  ).toBeVisible();
  await expect(projection.getByRole("timer")).toBeVisible();
  await projection.screenshot({
    path: testInfo.outputPath("projection-case-desktop.png"),
    fullPage: true,
  });
  await projection.setViewportSize({ width: 390, height: 844 });
  expect(
    await projection.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("teacher-controls-mobile.png"),
    fullPage: true,
  });
});
