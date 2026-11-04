import { expect, test, type Page } from "@playwright/test";

const observations = Array.from({ length: 20 }, (_, i) => ({
  id: `o${i}`,
  text: `Observation clinique ${i + 1}`,
  category: "Examen physique",
}));
const caseData = {
  launchId: "live",
  name: "Atelier Toux",
  scenario: "Une toux persistante depuis trois semaines.",
  instructions: "Deux impressions cliniques distinctes.",
  diagnostics: [
    { id: "a", label: "Asthme" },
    { id: "b", label: "Reflux" },
  ],
  observations,
  requiredChoices: 5,
};
const entry = {
  ...caseData,
  role: "students",
  status: "open",
  teachingSessionId: "lesson",
  teacherName: "Professeur Martin",
  caseCount: 3,
  deliveryMode: "synchronous",
};
const draft = {
  state: "draft",
  revision: 0,
  mainDiagnosticId: null,
  alternativeDiagnosticId: null,
  mainChoices: [],
  alternativeChoices: [],
};
const teacher = {
  id: "teacher",
  username: "Professeur Martin",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/participant/resume", (r) =>
    r.fulfill({ json: { available: false } }),
  );
  await page.route("**/api/participant/teaching-session", (r) =>
    r.fulfill({ json: { session: null } }),
  );
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 401, json: { error: "Connexion requise." } }),
  );
});
async function copyRoutes(page: Page, info: any) {
  await page.route("**/api/participant/response", (r) =>
    r.fulfill({ json: { response: draft, joinInfo: info } }),
  );
  await page.route("**/api/participant/state", (r) =>
    r.fulfill({
      json: {
        status: info.status,
        role: info.role,
        responseState: "draft",
        revision: 0,
        liveSession: info.liveSession,
        joinInfo: info,
        participantCount: 18,
        reveals: {},
        published: false,
      },
    }),
  );
}

test("typed and QR access confirm the same session and never require a participant account", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/join/S-ABCD2345", (r) => r.fulfill({ json: entry }));
  let joins = 0;
  await page.route("**/api/teaching-sessions/lesson/join", (r) => {
    joins++;
    expect(r.request().postDataJSON().code).toBe("S-ABCD2345");
    return r.fulfill({ json: { csrfToken: "csrf" } });
  });
  await copyRoutes(page, {
    ...caseData,
    role: "students",
    status: "open",
    pseudonym: "Julien",
    liveSession: { phase: "lobby" },
  });
  await page.goto("/rejoindre");
  await page
    .getByLabel("Code de la séance", { exact: true })
    .fill(" s - abcd 2345 ");
  await page
    .getByRole("button", { name: "Trouver ma séance", exact: true })
    .click();
  await expect(page).toHaveURL("/join/S-ABCD2345");
  const confirmation = page.getByRole("region", {
    name: "Confirmer votre séance",
  });
  await expect(confirmation).toContainText("Vous participez comme étudiant.");
  await expect(confirmation).toContainText("Professeur Martin");
  await expect(confirmation).toContainText(
    "Synchrone · guidé par le professeur",
  );
  await expect(confirmation.locator("dd")).toContainText([
    "Atelier Toux",
    "Professeur Martin",
    "3",
    "Synchrone",
  ]);
  expect(joins).toBe(0);
  await page.goto("/join/S-ABCD2345");
  await expect(confirmation).toContainText("Professeur Martin");
  await expect(
    page.getByLabel("Code de la séance", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel(/mot de passe/i)).toHaveCount(0);
  await page
    .getByLabel(/^Votre nom (?:ou pseudonyme|et prénom)$/, { exact: true })
    .fill("Julien");
  await page.screenshot({
    path: testInfo.outputPath("check-in-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Rejoindre la séance", exact: true })
    .click();
  await expect(page).toHaveURL("/participant");
  await expect(
    page.getByRole("heading", {
      name: "Vous avez rejoint la séance, Julien",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Salle d’attente de la séance" }),
  ).toContainText("18 personne(s) ont rejoint");
  expect(joins).toBe(1);
});

test("an expert sees their role and opens the instructions without logging in", async ({
  page,
}) => {
  await page.route("**/api/join/ABCD2345", (r) =>
    r.fulfill({
      json: {
        ...entry,
        teachingSessionId: undefined,
        role: "panel",
        caseCount: 1,
        deliveryMode: "asynchronous",
      },
    }),
  );
  await page.goto("/join/abcd-2345");
  await expect(
    page.getByRole("region", { name: "Confirmer votre séance" }),
  ).toContainText("clinicien expert");
  await expect(
    page.getByRole("region", { name: "Confirmer votre séance" }),
  ).toContainText("Asynchrone · à votre rythme");
  await page
    .getByText("Comment se déroule la participation ?", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Votre contribution au panel" }),
  ).toContainText("importance de 1 à 3");
  await expect(
    page.getByRole("button", { name: "Rejoindre la séance", exact: true }),
  ).toBeVisible();
});

test("an unknown code can be corrected while a server outage is not mislabeled as an invalid code", async ({
  page,
}) => {
  await page.route("**/api/join/UNKNOWN", (r) =>
    r.fulfill({ status: 404, json: { error: "Code introuvable." } }),
  );
  await page.route("**/api/join/ABCD2345", (r) => r.fulfill({ json: entry }));
  await page.route("**/api/join/OUTAGE", (r) =>
    r.fulfill({ status: 503, json: { error: "Indisponible" } }),
  );
  await page.goto("/join/UNKNOWN");
  await expect(page.getByRole("alert")).toContainText(
    "Ce code ne correspond à aucune séance",
  );
  await page.getByLabel("Code de la séance", { exact: true }).fill("abcd 2345");
  await page
    .getByRole("button", { name: "Trouver ma séance", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Confirmer votre séance" }),
  ).toBeVisible();
  await page.goto("/join/OUTAGE");
  await expect(page.getByRole("alert")).toContainText(
    "La séance n’a pas pu être vérifiée",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "Ce code ne correspond",
  );
});

test("closed sessions explain their status and recognized participants resume without another join", async ({
  page,
}) => {
  let recognized = false,
    writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST") writes++;
  });
  await page.route("**/api/join/S-ABCD2345", (r) =>
    r.fulfill({
      json: {
        ...entry,
        status: "closed",
        canResume: recognized,
        ...(recognized ? { pseudonym: "Julien" } : {}),
      },
    }),
  );
  await page.goto("/join/S-ABCD2345");
  await expect(
    page.getByText("La collecte est fermée.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rejoindre la séance", exact: true }),
  ).toHaveCount(0);
  recognized = true;
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Votre participation reconnue" }),
  ).toContainText("Bon retour, Julien.");
  await expect(
    page.getByLabel(/^Votre nom (?:ou pseudonyme|et prénom)$/, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Reprendre mon parcours", exact: true }),
  ).toHaveAttribute("href", "/participant");
  expect(writes).toBe(0);
});

test("a valid browser participation is offered on the short entry page and is clearly identified as a trial", async ({
  page,
}) => {
  await page.route("**/api/participant/resume", (r) =>
    r.fulfill({
      json: {
        available: true,
        name: "Toux",
        pseudonym: "Professeur en essai",
        isTrial: true,
      },
    }),
  );
  await page.goto("/rejoindre");
  const resume = page.getByRole("region", {
    name: "Votre participation dans ce navigateur",
  });
  await expect(resume).toContainText("Bon retour, Professeur en essai.");
  await expect(resume).toContainText("Toux · Essai");
  await expect(
    resume.getByRole("link", { name: "Reprendre mon essai", exact: true }),
  ).toHaveAttribute("href", "/participant");
});

test("the professor explicitly prepares one isolated trial and receives its QR, code and control link", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user: teacher } }),
  );
  await page.route("**/api/launches/live", (r) =>
    r.fulfill({
      json: {
        id: "live",
        prcId: "prc",
        name: "Toux",
        code: "ABCD2345",
        role: "panel",
        status: "open",
        createdAt: "2026-11-04",
        participantCount: 18,
        submissionCount: 4,
        case: caseData,
        reveals: {},
        liveSession: { phase: "lobby" },
      },
    }),
  );
  let trials = 0;
  const writes: string[] = [];
  await page.route("**/api/launches/live/trial", (r) => {
    trials++;
    return r.fulfill({
      status: 201,
      json: {
        launchId: "trial",
        code: "EFGH6789",
        url: "http://localhost/join/EFGH6789",
      },
    });
  });
  page.on("request", (r) => {
    if (r.method() === "POST") writes.push(new URL(r.url()).pathname);
  });
  await page.goto("/activity/live");
  expect(trials).toBe(0);
  await page
    .getByRole("button", { name: "Tester l’accès participant", exact: true })
    .click();
  const trial = page.getByRole("region", {
    name: "Tester l’accès participant",
  });
  await expect(
    trial.getByRole("img", { name: "Rejoindre l’essai", exact: true }),
  ).toBeVisible();
  await expect(trial).toContainText("ESSAI · EFGH6789");
  await expect(
    trial.getByRole("link", { name: "Ouvrir l’accès d’essai", exact: true }),
  ).toHaveAttribute("href", "http://localhost/join/EFGH6789");
  await expect(
    trial.getByRole("link", { name: "Suivre et piloter l’essai", exact: true }),
  ).toHaveAttribute("href", "/activity/trial");
  expect(trials).toBe(1);
  expect(writes).toEqual(["/api/launches/live/trial"]);
});

test("the projection retains the QR, readable code and short entry address after closing", async ({
  page,
}, testInfo) => {
  await page.route("**/api/launches/live/projection", (r) =>
    r.fulfill({
      json: {
        name: "Toux",
        code: "ABCD2345",
        status: "closed",
        launch: {
          code: "ABCD2345",
          status: "closed",
          participantCount: 18,
          submissionCount: 16,
        },
        class: {},
        panel: {},
        reveals: {},
      },
    }),
  );
  await page.goto("/projection/live");
  const access = page.getByRole("region", {
    name: "Rejoindre la séance",
    exact: true,
  });
  await expect(
    access.getByRole("img", { name: "Rejoindre la séance", exact: true }),
  ).toBeVisible();
  await expect(access).toContainText("ABCD2345");
  await expect(access.getByRole("link")).toHaveAttribute("href", "/rejoindre");
  await expect(access).toContainText("18 personne(s) ont rejoint");
  await expect(access).toContainText("16 réponse(s) soumise(s)");
  await page.screenshot({
    path: testInfo.outputPath("projection-access-closed.png"),
    animations: "disabled",
  });
});

test("asynchronous participants see their case position, personal correction and autonomous next step", async ({
  page,
}, testInfo) => {
  const submitted = {
    ...draft,
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
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/participant/teaching-session", (r) =>
    r.fulfill({
      json: {
        session: {
          id: "lesson",
          name: "Atelier Toux",
          status: "open",
          role: "students",
          position: 1,
          total: 3,
          currentLaunchId: "live",
          deliveryMode: "asynchronous",
          currentSubmitted: true,
        },
      },
    }),
  );
  await page.route("**/api/participant/state", (r) =>
    r.fulfill({
      json: {
        status: "open",
        role: "students",
        responseState: "submitted",
        revision: 1,
        published: true,
        reveals: {},
        deliveryMode: "asynchronous",
      },
    }),
  );
  await page.route("**/api/participant/results", (r) =>
    r.fulfill({
      json: {
        case: {
          ...caseData,
          role: "students",
          deliveryMode: "asynchronous",
          teachingSession: {
            id: "lesson",
            name: "Atelier Toux",
            position: 1,
            total: 3,
          },
          grading: {
            maximum: 15,
            attainableMaximum: 15,
            mainDiagnosisMaximum: 3,
            alternativeDiagnosisMaximum: 2,
            clinicalMaximum: 5,
          },
        },
        response: submitted,
        role: "students",
        status: "open",
        guidedReview: true,
        deliveryMode: "asynchronous",
        published: true,
        score: 15,
        components: {},
        panel: {},
        class: {},
        studentReview: {
          deliveryMode: "asynchronous",
          comparisonVisible: false,
          comparison: [],
          corrections: [],
        },
      },
    }),
  );
  await page.goto("/participant/results");
  await expect(
    page.locator(".teaching-participant-progress").first(),
  ).toContainText("Cas 2 sur 3");
  await expect(
    page.locator(".teaching-participant-progress").first(),
  ).toContainText("À votre rythme");
  const progress = page.getByRole("region", {
    name: "Votre progression dans le cas",
    exact: true,
  });
  await expect(progress.locator('[aria-current="step"]')).toHaveText(
    "Mon corrigé",
  );
  await expect(progress).toContainText("continuez vers le cas suivant");
  await expect(progress).not.toContainText("Le professeur guidera");
  await expect(
    page.getByRole("button", { name: "Passer au cas suivant", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("asynchronous-progress-mobile.png"),
    animations: "disabled",
  });
});

test("the professor can test a future case without advancing or enrolling in the real session", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user: teacher } }),
  );
  await page.route("**/api/teaching-sessions/lesson", (r) =>
    r.fulfill({
      json: {
        id: "lesson",
        name: "Atelier",
        code: "S-ABCD2345",
        role: "panel",
        status: "open",
        currentPosition: 0,
        cases: [
          {
            id: "live",
            name: "Toux",
            status: "open",
            position: 0,
            maximum: 15,
          },
          {
            id: "future",
            name: "Dyspnée",
            status: "open",
            position: 1,
            maximum: 15,
          },
        ],
        report: { maximum: 30, caseCount: 2, memberCount: 0, members: [] },
      },
    }),
  );
  await page.route("**/api/launches/live", (r) =>
    r.fulfill({
      json: {
        id: "live",
        prcId: "prc",
        name: "Toux",
        code: "ABCD2345",
        role: "panel",
        status: "open",
        createdAt: "2026-11-04",
        participantCount: 0,
        submissionCount: 0,
        case: caseData,
        reveals: {},
        liveSession: { phase: "lobby" },
      },
    }),
  );
  const writes: string[] = [];
  await page.route("**/api/launches/future/trial", (r) =>
    r.fulfill({
      status: 201,
      json: {
        launchId: "trial",
        code: "EFGH6789",
        url: "http://localhost/join/EFGH6789",
      },
    }),
  );
  page.on("request", (r) => {
    if (r.method() === "POST") writes.push(new URL(r.url()).pathname);
  });
  await page.goto("/seances/lesson");
  await page
    .getByRole("combobox", { name: "Cas à tester", exact: true })
    .selectOption("future");
  const trial = page.getByRole("region", {
    name: "Tester l’accès participant",
    exact: true,
  });
  await expect(trial).toContainText("Cas 2 · Dyspnée");
  await trial
    .getByRole("button", { name: "Tester l’accès participant", exact: true })
    .click();
  await expect(trial).toContainText("ESSAI · EFGH6789");
  expect(writes).toEqual(["/api/launches/future/trial"]);
  await page
    .getByRole("combobox", { name: "Cas à tester", exact: true })
    .selectOption("live");
  await expect(
    trial.getByRole("link", { name: "Ouvrir l’accès d’essai", exact: true }),
  ).toHaveCount(0);
  expect(writes).toEqual(["/api/launches/future/trial"]);
});
