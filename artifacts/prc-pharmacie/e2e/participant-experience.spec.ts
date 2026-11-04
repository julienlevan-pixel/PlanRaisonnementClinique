import { test, expect, type Page } from "@playwright/test";
const observations = Array.from({ length: 20 }, (_, i) => ({
  id: `o${i}`,
  text: `Observation fictive ${i + 1}`,
  category: "Examen physique",
}));
const diagnostics = [
  { id: "a", label: "Asthme" },
  { id: "b", label: "Reflux" },
  { id: "c", label: "Autre impression" },
];
const caseData = {
  launchId: "launch",
  name: "Cas fictif de toux",
  scenario: "Une toux sèche persistante depuis trois semaines.",
  instructions: "Deux impressions cliniques distinctes.",
  observations,
  diagnostics,
  requiredChoices: 5,
  guidedReview: true,
  scoringVersion: "custom-rubric-v1",
  grading: {
    maximum: 15,
    attainableMaximum: 15,
    mainDiagnosisMaximum: 3,
    alternativeDiagnosisMaximum: 2,
    clinicalMaximum: 5,
  },
};
const fullCopy = () => ({
  state: "draft",
  revision: 4,
  updatedAt: null,
  mainDiagnosticId: "a",
  alternativeDiagnosticId: "b",
  mainChoices: observations
    .slice(0, 5)
    .map((o) => ({ observationId: o.id, sign: "+" })),
  alternativeChoices: observations
    .slice(5, 10)
    .map((o) => ({ observationId: o.id, sign: "-" })),
});
async function fixture(
  page: Page,
  options: {
    role?: "panel" | "students";
    initial?: any;
    canonical?: (input: any) => any;
    mode?: "synchronous" | "asynchronous";
    result?: () => any;
  } = {},
) {
  let copy: any = options.initial ?? {
      ...fullCopy(),
      mainChoices: [],
      alternativeChoices: [],
    },
    status = "open",
    responseReads = 0;
  const submissions: any[] = [];
  const info = () => ({
    ...caseData,
    role: options.role ?? "students",
    deliveryMode: options.mode ?? "asynchronous",
    status,
  });
  await page.route("**/api/participant/teaching-session", (r) =>
    r.fulfill({ json: { session: null } }),
  );
  await page.route("**/api/participant/response", (r) => {
    if (r.request().method() === "PUT") {
      const input = r.request().postDataJSON();
      copy = {
        ...copy,
        ...(options.canonical ? options.canonical(input) : input),
        revision: copy.revision + 1,
        updatedAt: "2026-11-03T12:00:00Z",
      };
    } else responseReads++;
    return r.fulfill({ json: { response: copy, joinInfo: info() } });
  });
  await page.route("**/api/participant/state", (r) =>
    r.fulfill({
      json: {
        status,
        role: info().role,
        deliveryMode: info().deliveryMode,
        responseState: copy.state,
        revision: copy.revision,
        published: false,
        reveals: {},
        joinInfo: info(),
      },
    }),
  );
  await page.route("**/api/participant/submit", (r) => {
    submissions.push(r.request().postDataJSON());
    copy = { ...copy, state: "submitted", revision: copy.revision + 1 };
    return r.fulfill({ json: copy });
  });
  await page.route("**/api/participant/results", (r) =>
    r.fulfill({
      json: options.result
        ? options.result()
        : {
            case: info(),
            response: copy,
            role: info().role,
            status,
            published:
              info().role === "students" &&
              info().deliveryMode === "asynchronous",
            guidedReview: true,
            deliveryMode: info().deliveryMode,
            score: info().role === "students" ? 15 : null,
            components: {
              mainDiagnosis: 3,
              alternativeDiagnosis: 2,
              mainJustification: 5,
              alternativeJustification: 5,
            },
            panel: {},
            class: {},
          },
    }),
  );
  return {
    copy: () => copy,
    setCopy: (value: any) => {
      copy = value;
    },
    setStatus: (value: string) => {
      status = value;
    },
    submissions,
    responseReads: () => responseReads,
  };
}
const review = (page: Page) =>
  page.getByRole("dialog", {
    name: "Vérifier ma réponse avant transmission",
    exact: true,
  });

test("a mobile student switches impressions without losing choices and consults the case without leaving the matrix", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page);
  await page.goto("/participant");
  await page.getByTestId("choice-main-positive-o0").click();
  await page
    .getByRole("button", { name: "Alternative · 0/5", exact: true })
    .click();
  await expect(
    page.getByLabel("Impression clinique", { exact: true }),
  ).not.toBeVisible();
  await page.getByTestId("choice-alternative-negative-o5").click();
  await page
    .getByRole("button", { name: "Principale · 1/5", exact: true })
    .click();
  await expect(page.getByTestId("choice-main-positive-o0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(() => state.copy().alternativeChoices.length).toBe(1);
  await page.locator("#participant-observation-matrix").evaluate((n) => {
    n.scrollTop = 250;
  });
  const scroll = await page
    .locator("#participant-observation-matrix")
    .evaluate((n) => n.scrollTop);
  await page
    .getByRole("button", { name: "Revoir le cas", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Revoir le cas clinique",
    exact: true,
  });
  await expect(dialog).toContainText(caseData.scenario);
  await expect(dialog).toContainText("Observation fictive 20");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Revoir le cas", exact: true }),
  ).toBeFocused();
  expect(
    await page
      .locator("#participant-observation-matrix")
      .evaluate((n) => n.scrollTop),
  ).toBe(scroll);
  await page
    .getByRole("button", { name: "Alternative · 1/5", exact: true })
    .click();
  await expect(
    page.getByTestId("choice-alternative-negative-o5"),
  ).toHaveAttribute("aria-pressed", "true");
  expect(state.submissions).toHaveLength(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("student-mobile-choice.png"),
    fullPage: true,
    animations: "disabled",
  });
});

for (const mode of ["synchronous", "asynchronous"] as const) {
  test(`a mobile expert keeps signs and importance when switching impressions in ${mode} mode`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = await fixture(page, { role: "panel", mode });
    await page.goto("/participant");
    await page.getByTestId("choice-main-positive-o0").click();
    const mainPoints = page.getByRole("radiogroup", {
      name: "Points impression clinique — Observation fictive 1",
      exact: true,
    });
    await expect(mainPoints.getByRole("radio", { checked: true })).toHaveCount(
      0,
    );
    await mainPoints.getByRole("radio", { name: /^3/ }).click();
    await page
      .getByRole("button", { name: "Alternative · 0/5", exact: true })
      .click();
    await expect(mainPoints).not.toBeVisible();
    await page.getByTestId("choice-alternative-negative-o0").click();
    const alternativePoints = page.getByRole("radiogroup", {
      name: "Points impression clinique alternative — Observation fictive 1",
      exact: true,
    });
    await alternativePoints.getByRole("radio", { name: /^2/ }).click();
    await page
      .getByRole("button", { name: "Principale · 1/5", exact: true })
      .click();
    await expect(mainPoints.getByRole("radio", { name: /^3/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByTestId("choice-main-negative-o0").click();
    await expect(mainPoints.getByRole("radio", { name: /^3/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect
      .poll(() => state.copy().mainChoices[0])
      .toEqual({ observationId: "o0", sign: "-", points: 3 });
    await expect
      .poll(() => state.copy().alternativeChoices[0])
      .toEqual({ observationId: "o0", sign: "-", points: 2 });
    await page
      .getByRole("button", { name: "Revoir le cas", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(caseData.scenario);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Revoir le cas", exact: true }),
    ).toBeFocused();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(
        await page
          .locator("#participant-observation-matrix")
          .evaluate((n) => n.scrollWidth <= n.clientWidth),
      ).toBe(true);
      const button = await mainPoints
        .getByRole("radio", { name: /^3/ })
        .boundingBox();
      expect(button!.width).toBeGreaterThanOrEqual(44);
      expect(button!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: testInfo.outputPath(`expert-mobile-${mode}.png`),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(mainPoints).toBeVisible();
    await expect(alternativePoints).toBeVisible();
    await expect(
      page.getByRole("group", {
        name: "Choisir l’impression clinique à afficher",
      }),
    ).not.toBeVisible();
    expect(state.submissions).toHaveLength(0);
  });
}

test("expert importance has no default and supports direct choices, keyboard navigation and sign changes", async ({
  page,
}) => {
  const state = await fixture(page, { role: "panel" });
  await page.goto("/participant");
  await page.getByTestId("choice-main-positive-o0").click();
  const group = page.getByRole("radiogroup", {
    name: "Points impression clinique — Observation fictive 1",
    exact: true,
  });
  await expect(group.getByRole("radio", { checked: true })).toHaveCount(0);
  await group.getByRole("radio", { name: /^3/ }).click();
  await page.getByTestId("choice-main-negative-o0").click();
  await expect(group.getByRole("radio", { name: /^3/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await group.getByRole("radio", { name: /^3/ }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(group.getByRole("radio", { name: /^2/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect.poll(() => state.copy().mainChoices[0]?.points).toBe(2);
  expect(state.copy().mainChoices[0].sign).toBe("-");
});

test("final verification shows the acknowledged copy and submits only after explicit confirmation", async ({
  page,
}, testInfo) => {
  const state = await fixture(page, {
    initial: fullCopy(),
    canonical: (input) => ({
      ...input,
      mainChoices: input.mainChoices.map((c: any, i: number) =>
        i === 0 ? { ...c, sign: "+" } : c,
      ),
    }),
  });
  await page.goto("/participant");
  await page.getByTestId("choice-main-negative-o0").click();
  await page
    .getByRole("button", { name: "Vérifier et transmettre", exact: true })
    .click();
  await expect(review(page)).toBeVisible();
  const main = review(page).getByRole("region", {
    name: "Vérification de l’impression principale",
    exact: true,
  });
  await expect(main.getByRole("listitem").first()).toContainText("+ En faveur");
  await expect(main.getByRole("listitem")).toHaveCount(5);
  await expect(review(page)).not.toContainText("Importance :");
  expect(state.submissions).toHaveLength(0);
  const revision = state.copy().revision;
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await review(page).screenshot({
    path: testInfo.outputPath("student-verification-mobile.png"),
    animations: "disabled",
  });
  await review(page)
    .getByRole("button", { name: "Transmettre définitivement", exact: true })
    .click();
  await expect(page).toHaveURL("/participant/results");
  expect(state.submissions).toEqual([
    { expectedRevision: revision, launchId: "launch" },
  ]);
  await expect(
    page.getByRole("heading", { name: "Votre résultat", exact: true }),
  ).toBeVisible();
});

test("editing the alternative from verification restores its mobile view and keeps the main choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await fixture(page, { initial: fullCopy() });
  await page.goto("/participant");
  await page
    .getByRole("button", { name: "Vérifier et transmettre", exact: true })
    .click();
  await review(page)
    .getByRole("button", {
      name: "Modifier l’impression alternative",
      exact: true,
    })
    .click();
  await expect(review(page)).toHaveCount(0);
  await expect(
    page.getByLabel("Impression clinique alternative", { exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Alternative · 5/5", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Principale · 5/5", exact: true })
    .click();
  await expect(page.getByTestId("choice-main-positive-o0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(state.submissions).toHaveLength(0);
});

test("another-window revision invalidates the displayed verification instead of submitting an unseen copy", async ({
  page,
}) => {
  await page.clock.install();
  const state = await fixture(page, { initial: fullCopy() });
  await page.goto("/participant");
  await page
    .getByRole("button", { name: "Vérifier et transmettre", exact: true })
    .click();
  await expect(review(page)).toBeVisible();
  const reads = state.responseReads();
  state.setCopy({
    ...fullCopy(),
    revision: 5,
    mainChoices: fullCopy().mainChoices.map((c, i) =>
      i === 0 ? { ...c, sign: "-" } : c,
    ),
  });
  await page.clock.fastForward(16_000);
  await expect.poll(() => state.responseReads()).toBeGreaterThan(reads);
  await expect(page.getByTestId("choice-main-negative-o0")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await review(page)
    .getByRole("button", { name: "Transmettre définitivement", exact: true })
    .click();
  await expect(review(page)).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText(
    "Votre copie a changé pendant la vérification",
  );
  expect(state.submissions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Vérifier et transmettre", exact: true })
    .click();
  await review(page)
    .getByRole("button", { name: "Transmettre définitivement", exact: true })
    .click();
  await expect(page).toHaveURL("/participant/results");
  expect(state.submissions[0].expectedRevision).toBe(5);
});

test("teacher closing while verification is open disables submission and keeps an unsubmitted draft", async ({
  page,
}) => {
  await page.clock.install();
  const state = await fixture(page, {
    initial: fullCopy(),
    mode: "synchronous",
  });
  await page.goto("/participant");
  await page
    .getByRole("button", { name: "Vérifier et transmettre", exact: true })
    .click();
  await expect(review(page)).toBeVisible();
  state.setStatus("closed");
  await page.clock.fastForward(16_000);
  await expect(
    review(page).getByRole("button", {
      name: "Transmettre définitivement",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(review(page).getByRole("alert")).toContainText(
    "brouillon non soumis",
  );
  await review(page)
    .getByRole("button", { name: "Fermer", exact: true })
    .click();
  expect(state.submissions).toHaveLength(0);
  expect(state.copy().state).toBe("draft");
});

test("feedback uses only revealed corrections and the actual customized sign values", async ({
  page,
}, testInfo) => {
  let revealed = false;
  const correction = {
    diagnosticId: "a",
    label: "Asthme",
    selectedRole: "main",
    represented: true,
    score: 3,
    maximum: 8,
    diagnosisScore: 3,
    justificationScore: 0,
    ceiling: 5,
    observations: [
      {
        observationId: "o0",
        label: "Observation fictive 1",
        category: "Examen physique",
        positive: 20,
        negative: 0,
        positivePoints: 60,
        negativePoints: 0,
        positiveScorePoints: 0.5,
        negativeScorePoints: 0,
        studentSign: "-",
        earnedScorePoints: 0,
        referenceScorePoints: 0.5,
      },
    ],
  };
  await fixture(page, {
    initial: { ...fullCopy(), state: "submitted" },
    mode: "synchronous",
    result: () => ({
      case: { ...caseData, role: "students" },
      response: { ...fullCopy(), state: "submitted" },
      role: "students",
      status: "closed",
      deliveryMode: "synchronous",
      guidedReview: true,
      published: false,
      score: null,
      components: {},
      panel: {},
      class: {},
      studentReview: {
        deliveryMode: "synchronous",
        comparisonVisible: false,
        comparison: [],
        corrections: revealed ? [correction] : [],
      },
    }),
  });
  await page.goto("/participant/results");
  await expect(
    page.getByRole("region", { name: "Votre retour personnel", exact: true }),
  ).toHaveCount(0);
  revealed = true;
  await page.reload();
  const feedback = page.getByRole("region", {
    name: "Votre retour personnel",
    exact: true,
  });
  await expect(feedback).toContainText("Point fort");
  await expect(feedback).toContainText("À revoir");
  await expect(feedback).toContainText("0,5 point(s) au signe +");
  await expect(
    page.getByRole("heading", { name: "Votre résultat", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await feedback.screenshot({
    path: testInfo.outputPath("personal-feedback-mobile.png"),
    animations: "disabled",
  });
});

test("a submitted expert sees their own impressions first and can expand every other panel table", async ({
  page,
}) => {
  const copy = {
    ...fullCopy(),
    state: "submitted",
    alternativeDiagnosticId: "c",
    mainChoices: fullCopy().mainChoices.map((c) => ({ ...c, points: 3 })),
    alternativeChoices: fullCopy().alternativeChoices.map((c) => ({
      ...c,
      points: 2,
    })),
  };
  await fixture(page, {
    role: "panel",
    initial: copy,
    result: () => ({
      case: { ...caseData, role: "panel" },
      response: copy,
      role: "panel",
      status: "open",
      published: false,
      score: null,
      components: {},
      panel: {},
      expertPanel: { totalSubmissions: 1, distributions: [] },
    }),
  });
  await page.goto("/participant/results");
  const headings = page.locator(".expert-diagnostic>h3");
  await expect(headings).toHaveText([
    "Impression clinique 1 · Asthme",
    "Impression clinique 3 · Autre impression",
    "Impression clinique 2 · Reflux",
  ]);
  await expect(
    page.getByRole("region", { name: "Tableau Reflux", exact: true }),
  ).toHaveCount(0);
  await page
    .getByText("Autres impressions du panel (1)", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Tableau Reflux", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".expert-comparison-table")).toHaveCount(3);
  await expect(page.locator(".participant-score")).toHaveCount(0);
});

test("a submission completed in another window is recognized without a duplicate or an incorrect draft message", async ({
  page,
}) => {
  await page.clock.install();
  const state = await fixture(page, {
    initial: fullCopy(),
    mode: "synchronous",
  });
  await page.goto("/participant");
  await page
    .getByRole("button", { name: "Vérifier et transmettre", exact: true })
    .click();
  await expect(review(page)).toBeVisible();
  state.setCopy({ ...fullCopy(), state: "submitted", revision: 5 });
  state.setStatus("closed");
  await page.clock.fastForward(16_000);
  await expect(
    review(page).getByRole("button", {
      name: "Transmettre définitivement",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(review(page).getByRole("alert")).toContainText(
    "Cette copie a déjà été transmise",
  );
  await expect(review(page)).not.toContainText("brouillon non soumis");
  expect(state.submissions).toHaveLength(0);
});
