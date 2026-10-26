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
  text: `Observation ${i + 1}`,
  category: "Examen physique",
}));
const caseData = (id: string) => ({
  launchId: id,
  name: `Cas ${id}`,
  role: "students",
  status: "open",
  scenario: `Scénario clinique du cas ${id}`,
  instructions: "Deux impressions cliniques et cinq données pour chacune.",
  diagnostics: [
    { id: `${id}-a`, label: "Asthme" },
    { id: `${id}-b`, label: "Reflux" },
  ],
  observations,
  liveSession: { phase: "answering" },
});
const distribution = {
  maximum: 30,
  gradedCount: 2,
  excludedCount: 1,
  average: 24,
  median: 24,
  lowest: 18,
  highest: 30,
  bins: Array.from({ length: 10 }, (_, i) => ({
    lower: 3 * i,
    upper: 3 * (i + 1),
    upperInclusive: i === 9,
    count: i === 6 || i === 9 ? 1 : 0,
    percentage: i === 6 || i === 9 ? 50 : 0,
  })),
};
const report = () => ({
  maximum: 30,
  caseCount: 2,
  memberCount: 3,
  distribution,
  members: [
    {
      id: "m1",
      pseudonym: "Alice",
      currentSubmitted: false,
      submittedCount: 0,
    },
    { id: "m2", pseudonym: "Bob", currentSubmitted: true, submittedCount: 1 },
  ],
});
const session = () => ({
  id: "lesson",
  name: "Séance de pharmacie",
  code: "S-COMMUN",
  role: "students",
  status: "open",
  currentPosition: 0,
  cases: [
    { id: "one", name: "Toux", position: 0, status: "open", maximum: 15 },
    { id: "two", name: "Dyspnée", position: 1, status: "open", maximum: 15 },
  ],
  report: report(),
});

test("professor organizes corrected cases in order and creates one session", async ({
  page,
}, testInfo) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user } }),
  );
  await page.route("**/api/teaching-sessions/options", (route) =>
    route.fulfill({
      json: [
        { id: "a", name: "Toux", version: 2, ready: true, corrected: true },
        { id: "b", name: "Dyspnée", version: 1, ready: true, corrected: true },
        {
          id: "c",
          name: "Sans corrigé",
          version: 1,
          ready: true,
          corrected: false,
        },
      ],
    }),
  );
  let saved: any;
  await page.route("**/api/teaching-sessions", (route) => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        json: { id: "lesson", code: "S-COMMUN" },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/teaching-sessions/lesson", (route) =>
    route.fulfill({ json: { ...session(), status: "finished" } }),
  );
  await page.goto("/seances?new=1");
  const form = page.getByRole("form", {
    name: "Créer une séance",
    exact: true,
  });
  await form
    .getByLabel("Nom de la séance", { exact: true })
    .fill("Séance choisie");
  await form.getByRole("checkbox", { name: /Toux/ }).check();
  await form.getByRole("checkbox", { name: /Dyspnée/ }).check();
  await expect(
    form.getByRole("checkbox", { name: /Sans corrigé/ }),
  ).toBeDisabled();
  await form
    .getByRole("button", { name: "Monter le cas 2", exact: true })
    .click();
  await expect(form.locator(".session-order li").first()).toContainText(
    "Dyspnée",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("session-builder-mobile.png"),
    fullPage: true,
  });
  await form
    .getByRole("button", { name: "Créer la séance (2 cas)", exact: true })
    .click();
  await expect(page).toHaveURL("/seances/lesson");
  expect(saved).toEqual({
    name: "Séance choisie",
    role: "students",
    prcIds: ["b", "a"],
  });
});

test("teacher sees a private roster and advances cases with the shared code and embedded controls", async ({
  page,
}, testInfo) => {
  const s = session();
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user } }),
  );
  await page.route("**/api/teaching-sessions/lesson", (route) =>
    route.fulfill({ json: s }),
  );
  await page.route("**/api/launches/one", (route) =>
    route.fulfill({
      json: {
        ...caseData("one"),
        id: "one",
        prcId: "prc-one",
        code: "PRIVATE-CASE-CODE",
        status: s.cases[0].status,
        guidedReview: true,
        deliveryMode: "synchronous",
        createdAt: "2026-01-01",
        participantCount: 3,
        submissionCount: 1,
        referenceStatus: "validated",
        reveals: {},
      },
    }),
  );
  await page.route("**/api/launches/two", (route) =>
    route.fulfill({
      json: {
        ...caseData("two"),
        id: "two",
        prcId: "prc-two",
        code: "PRIVATE-SECOND-CODE",
        guidedReview: true,
        deliveryMode: "synchronous",
        createdAt: "2026-01-01",
        participantCount: 3,
        submissionCount: 0,
        referenceStatus: "validated",
        reveals: {},
        liveSession: { phase: "lobby" },
      },
    }),
  );
  await page.route("**/api/launches/one/results", (route) =>
    route.fulfill({
      json: {
        participants: [],
        discussion: { comparison: [], corrections: [] },
      },
    }),
  );
  await page.route("**/api/teaching-sessions/lesson/next", (route) => {
    expect(route.request().postDataJSON()).toEqual({ expectedPosition: 0 });
    s.currentPosition = 1;
    return route.fulfill({ json: { advanced: true, finished: false } });
  });
  await page.goto("/seances/lesson");
  await expect(
    page.getByText("PRIVATE-CASE-CODE", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Passer au cas suivant", exact: true }),
  ).toBeDisabled();
  await page
    .getByText("Qui a soumis ? · Suivi réservé au professeur", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Suivi des participants", exact: true }),
  ).toContainText("Alice");
  await expect(page.locator(".sidebar")).toHaveCount(1);
  s.cases[0].status = "published";
  await page.reload();
  await page.screenshot({
    path: testInfo.outputPath("session-teacher-desktop.png"),
    fullPage: true,
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Passer au cas suivant", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cas 2 sur 2 · Dyspnée", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Présenter le cas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("PRIVATE-SECOND-CODE", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".access-card")).toContainText("S-COMMUN");
});

test("participant automatically follows the next case and sees only their cumulative result at the end", async ({
  page,
}, testInfo) => {
  let position = 0,
    finished = false;
  await page.route("**/api/participant/teaching-session", (route) =>
    route.fulfill({
      json: {
        session: {
          id: "lesson",
          name: "Séance de pharmacie",
          status: finished ? "finished" : "open",
          role: "students",
          position,
          total: 2,
          currentLaunchId: position === 0 ? "one" : "two",
        },
        ...(finished
          ? {
              report: {
                ...report(),
                members: undefined,
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
                      maximum: 15,
                      score: 15,
                    },
                    {
                      position: 1,
                      name: "Dyspnée",
                      submitted: true,
                      maximum: 15,
                      score: 15,
                    },
                  ],
                },
              },
            }
          : {}),
      },
    }),
  );
  const draft = () => ({
    state: "draft",
    revision: 0,
    mainDiagnosticId: null,
    alternativeDiagnosticId: null,
    mainChoices: [],
    alternativeChoices: [],
  });
  await page.route("**/api/participant/response", (route) =>
    route.fulfill({
      json: {
        response: draft(),
        joinInfo: caseData(position === 0 ? "one" : "two"),
      },
    }),
  );
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "open",
        role: "students",
        reveals: {},
        responseState: "draft",
        revision: 0,
      },
    }),
  );
  await page.goto("/participant");
  await expect(page.locator(".teaching-participant-progress")).toContainText(
    "Cas 1 sur 2",
  );
  await expect(
    page.getByRole("heading", { name: "Cas one", exact: true }),
  ).toBeVisible();
  position = 1;
  await expect(page.locator(".teaching-participant-progress")).toContainText(
    "Cas 2 sur 2",
    { timeout: 12000 },
  );
  await expect(
    page.getByRole("heading", { name: "Cas two", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await page
    .getByLabel("Impression clinique", { exact: true })
    .selectOption("two-a");
  finished = true;
  await expect(
    page.getByRole("region", { name: "Bilan de la séance", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  await expect(page.locator(".session-total")).toHaveText("30 / 30");
  await expect(page.getByText("Alice", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const lastBar = await page.locator('.distribution-column').last().boundingBox();
  expect(lastBar!.x + lastBar!.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("session-student-summary-mobile.png"),
    fullPage: true,
  });
});

test("session projection ends on an anonymous cumulative distribution", async ({
  page,
}, testInfo) => {
  await page.route("**/api/teaching-sessions/lesson/projection", (route) =>
    route.fulfill({
      json: {
        ...session(),
        status: "finished",
        report: { ...report(), members: undefined },
      },
    }),
  );
  await page.goto("/seances/lesson/projection");
  await expect(
    page.getByRole("region", { name: "Bilan de la séance", exact: true }),
  ).toContainText("30 points");
  await expect(
    page.getByRole("region", {
      name: "Distribution des notes du groupe",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Alice", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("session-summary-projection.png"),
    fullPage: true,
  });
});


test('a professor can explicitly skip an unanswered closed case',async({page})=>{
  const s=session();s.cases[0].status='closed';s.report.members=[];
  await page.route('**/api/auth/me',route=>route.fulfill({json:{user}}));
  await page.route('**/api/teaching-sessions/lesson',route=>route.fulfill({json:s}));
  await page.route('**/api/launches/one',route=>route.fulfill({json:{...caseData('one'),id:'one',prcId:'prc',code:'PRIVATE',status:'closed',guidedReview:true,deliveryMode:'synchronous',createdAt:'2026-01-01',participantCount:0,submissionCount:0,referenceStatus:'validated',reveals:{}}}));
  await page.route('**/api/launches/one/results',route=>route.fulfill({json:{participants:[],discussion:{comparison:[],corrections:[]}}}));
  let advanced=false;
  await page.route('**/api/teaching-sessions/lesson/next',route=>{expect(route.request().postDataJSON()).toEqual({expectedPosition:0,skipUnanswered:true});advanced=true;return route.fulfill({json:{advanced:true,finished:false}});});
  await page.goto('/seances/lesson');
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Passer sans noter ce cas',exact:true}).click();
  await expect.poll(()=>advanced).toBe(true);
});
