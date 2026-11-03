import { expect, test } from "@playwright/test";
const user = {
  id: "teacher",
  username: "Professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const observations = Array.from({ length: 5 }, (_, i) => ({
  id: `o${i}`,
  text: `Donnée clinique ${i + 1}`,
  category: "Examen physique",
  position: i,
}));
const diagnostics = [
  { id: "a", label: "Asthme" },
  { id: "b", label: "Reflux" },
];
const document = {
  id: "case",
  name: "Toux",
  scenario: "Une toux sèche persistante.",
  instructions: "Deux impressions cliniques et cinq données chacune.",
  diagnostics,
  observations,
  status: "ready",
  version: 1,
  archived: false,
  isDemo: false,
  updatedAt: "2026-01-01",
  launches: [],
  launchCount: 1,
  workflow: {
    step: "students",
    missing: [],
    referenceStatus: "validated",
    panelLaunchId: "panel",
  },
};
const own = {
  state: "submitted",
  revision: 1,
  mainDiagnosticId: "a",
  alternativeDiagnosticId: "b",
  mainChoices: observations.map((o) => ({ observationId: o.id, sign: "+" })),
  alternativeChoices: observations.map((o) => ({
    observationId: o.id,
    sign: "-",
  })),
};
const grading = {
  maximum: 15,
  attainableMaximum: 15,
  mainDiagnosisMaximum: 3,
  alternativeDiagnosisMaximum: 2,
  clinicalMaximum: 5,
};
const result = {
  role: "students",
  published: true,
  status: "open",
  guidedReview: true,
  deliveryMode: "asynchronous",
  case: {
    ...document,
    launchId: "old-case",
    role: "students",
    scoringVersion: "custom-rubric-v1",
    grading,
  },
  response: own,
  score: 15,
  percentage: 100,
  components: {
    mainDiagnosis: 3,
    mainJustification: 5,
    alternativeDiagnosis: 2,
    alternativeJustification: 5,
  },
  panel: {},
  class: {},
  studentReview: {
    deliveryMode: "asynchronous",
    comparisonVisible: false,
    comparison: [],
    corrections: diagnostics.map((d, i) => ({
      diagnosticId: d.id,
      label: d.label,
      panelCount: 10,
      represented: true,
      selectedRole: i === 0 ? "main" : "alternative",
      score: i === 0 ? 8 : 7,
      diagnosisScore: i === 0 ? 3 : 2,
      justificationScore: 5,
      maximum: i === 0 ? 8 : 7,
      ceiling: 5,
      observations: observations.map((o) => ({
        observationId: o.id,
        label: o.text,
        category: o.category,
        positive: i === 0 ? 10 : 0,
        negative: i === 0 ? 0 : 10,
        positivePoints: i === 0 ? 30 : 0,
        negativePoints: i === 0 ? 0 : 30,
        studentSign: i === 0 ? "+" : "-",
        earnedPoints: 1,
        earnedScorePoints: 1,
        referenceScorePoints: 1,
      })),
    })),
  },
};

test("the professor journey leads from a validated PRC to a session with that case already selected", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { user } }));
  await page.route("**/api/prcs/case", (r) => r.fulfill({ json: document }));
  await page.route("**/api/teaching-sessions", (r) => r.fulfill({ json: [] }));
  await page.route("**/api/teaching-sessions/options", (r) =>
    r.fulfill({
      json: [
        { id: "case", name: "Toux", version: 1, ready: true, corrected: true },
      ],
    }),
  );
  let posts = 0;
  page.on("request", (r) => {
    if (r.method() !== "GET") posts++;
  });
  await page.goto("/prc/case");
  const guide = page.getByRole("region", {
    name: "Parcours du professeur",
    exact: true,
  });
  await expect(guide.getByRole("listitem")).toHaveCount(4);
  await expect(guide.locator('[aria-current="step"]')).toContainText(
    "Organiser la séance",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await guide.screenshot({
    path: testInfo.outputPath("professor-journey-mobile.png"),
  });
  await guide
    .getByRole("link", { name: "Préparer une séance avec ce PRC", exact: true })
    .click();
  await expect(page).toHaveURL("/seances?new=1&prcId=case");
  await expect(page.getByRole("checkbox", { name: /Toux/ })).toBeChecked();
  await expect(page.locator(".session-order")).toContainText("Toux");
  expect(posts).toBe(0);
});

test("the student opens an earlier case from the final report without touching the active copy", async ({
  page,
}, testInfo) => {
  const report = {
    maximum: 30,
    caseCount: 2,
    memberCount: 2,
    own: {
      complete: true,
      score: 30,
      subtotal: 30,
      gradedMaximum: 30,
      submittedCount: 2,
      cases: [
        {
          position: 0,
          name: "Toux",
          submitted: true,
          score: 15,
          maximum: 15,
          reviewAvailable: true,
        },
        {
          position: 1,
          name: "Dyspnée",
          submitted: true,
          score: 15,
          maximum: 15,
          reviewAvailable: true,
        },
      ],
    },
  };
  await page.route("**/api/participant/teaching-session", (r) =>
    r.fulfill({
      json: {
        session: {
          id: "session",
          name: "Atelier clinique",
          role: "students",
          status: "finished",
          deliveryMode: "asynchronous",
          groupFinished: false,
          position: 1,
          total: 2,
          currentLaunchId: "new-case",
        },
        report,
      },
    }),
  );
  let activeRequests = 0,
    writes = 0;
  page.on("request", (r) => {
    if (r.method() !== "GET") writes++;
    if (/\/api\/participant\/(state|response)$/.test(r.url())) activeRequests++;
  });
  await page.route("**/api/participant/teaching-session/cases/0/results", (r) =>
    r.fulfill({ json: result }),
  );
  await page.goto("/participant/results");
  await page
    .getByRole("link", { name: "Revoir le cas 1 : Toux", exact: true })
    .click();
  await expect(page).toHaveURL("/participant/review/0");
  await expect(
    page.getByRole("heading", { name: "Toux", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".participant-score")).toContainText("15");
  await expect(
    page.getByText("Révision du cas 1 · Lecture seule.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("article", { name: "Corrigé Asthme", exact: true }),
  ).toBeVisible();
  await page
    .getByText("Revoir le scénario et les données cliniques", { exact: true })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Présentation du cas clinique",
      exact: true,
    }),
  ).toContainText(document.scenario);
  await expect(
    page.getByRole("link", { name: "Revoir ma copie", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Vérifier et transmettre", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("student-review-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "← Retour au bilan de la séance", exact: true })
    .click();
  await expect(page.locator(".session-total")).toHaveText("30 / 30");
  expect(activeRequests).toBe(0);
  expect(writes).toBe(0);
});

test("the synchronous cockpit groups the current stage, submissions and closing command", async ({
  page,
}, testInfo) => {
  let status = "open";
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { user } }));
  await page.route("**/api/launches/live", (r) =>
    r.fulfill({
      json: {
        id: "live",
        prcId: "case",
        name: "Toux",
        case: document,
        role: "students",
        guidedReview: true,
        deliveryMode: "synchronous",
        status,
        code: "ABCD12",
        createdAt: "2026-01-01",
        participantCount: 12,
        submissionCount: 9,
        referenceStatus: "validated",
        grading,
        liveSession: { phase: "answering" },
        reveals: {},
        reference: null,
      },
    }),
  );
  await page.route("**/api/launches/live/results", (r) =>
    r.fulfill({
      json: {
        participants: [],
        discussion: { comparison: [], corrections: [] },
      },
    }),
  );
  await page.route("**/api/launches/live/close", (r) => {
    status = "closed";
    return r.fulfill({ json: { closed: true } });
  });
  await page.goto("/activity/live");
  const cockpit = page.getByRole("region", {
    name: "Suivi de la séance synchrone",
    exact: true,
  });
  await expect(cockpit.locator('[aria-current="step"]')).toContainText(
    "Réponses",
  );
  await expect(cockpit).toContainText("9 / 12");
  await expect(cockpit.getByRole("progressbar")).toHaveAttribute("value", "9");
  await expect(cockpit.getByRole("progressbar")).toHaveAttribute("max", "12");
  await expect(
    cockpit.getByRole("button", {
      name: "Terminer le temps de réponse",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Terminer le temps de réponse",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await cockpit.screenshot({
    path: testInfo.outputPath("synchronous-cockpit-mobile.png"),
  });
  page.once("dialog", (d) => d.accept());
  await cockpit
    .getByRole("button", { name: "Terminer le temps de réponse", exact: true })
    .click();
  await expect(cockpit.locator('[aria-current="step"]')).toContainText(
    "Comparaison",
  );
  await expect(
    cockpit.getByRole("link", {
      name: "Aller aux commandes de correction",
      exact: true,
    }),
  ).toHaveAttribute("href", "#activity-review-controls");
});
