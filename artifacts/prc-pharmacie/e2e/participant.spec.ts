import { test, expect, type Page, type Route } from "@playwright/test";

const caseData = {
  launchId: "launch-student",
  name: "Cas technique participant",
  role: "students",
  status: "open",
  scenario: "Données fictives pour vérifier le questionnaire.",
  instructions: "Une à cinq données par hypothèse.",
  diagnostics: [
    { id: "diag-a", label: "Diagnostic A" },
    { id: "diag-b", label: "Diagnostic B" },
    { id: "diag-c", label: "Diagnostic C" },
  ],
  observations: Array.from({ length: 6 }, (_, i) => ({
    id: `obs-${i + 1}`,
    text: `Observation ${i + 1}`,
    category: "Clinique",
  })),
};
function draft(overrides: Record<string, any> = {}) {
  return {
    state: "draft",
    revision: 0,
    updatedAt: null,
    mainDiagnosticId: "diag-a",
    alternativeDiagnosticId: "diag-b",
    mainChoices: [],
    alternativeChoices: [],
    ...overrides,
  };
}
async function questionnaire(
  page: Page,
  options: {
    response?: any;
    role?: string;
    put?: (route: Route, input: any) => Promise<void> | void;
  } = {},
) {
  let response = options.response ?? draft();
  const info = { ...caseData, role: options.role ?? caseData.role };
  await page.route("**/api/participant/response", async (route) => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON();
      if (options.put) return options.put(route, input);
      response = {
        ...response,
        ...input,
        revision: response.revision + 1,
        updatedAt: "2026-10-25T12:00:00Z",
      };
    }
    await route.fulfill({ json: { response, joinInfo: info } });
  });
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "open",
        role: info.role,
        reveals: {},
        published: false,
        responseState: response.state,
        revision: response.revision,
      },
    }),
  );
  await page.goto("/participant");
  await expect(
    page.getByRole("heading", { name: caseData.name, exact: true }),
  ).toBeVisible();
  return () => response;
}

test("saves signed choices, prevents a sixth choice and restores the acknowledged draft", async ({
  page,
}) => {
  const saved = await questionnaire(page);
  for (let i = 1; i <= 5; i++)
    await page.getByTestId(`choice-main-positive-obs-${i}`).click();
  await page.getByTestId("choice-alternative-negative-obs-1").click();
  await expect.poll(() => saved().mainChoices.length).toBe(5);
  await expect.poll(() => saved().alternativeChoices.length).toBe(1);
  await page.getByTestId("choice-main-positive-obs-6").click();
  await expect(
    page.getByText("Cinq observations au maximum", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("choice-main-positive-obs-6")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.reload();
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByTestId("choice-alternative-negative-obs-1"),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByLabel("Diagnostic principal", { exact: true }),
  ).toHaveValue("diag-a");
});

test("names missing expert choices without losing the selected signs", async ({
  page,
}) => {
  await questionnaire(page, { role: "panel" });
  await page.getByTestId("choice-main-positive-obs-1").click();
  await page.getByTestId("choice-alternative-negative-obs-1").click();
  await page.getByRole("button", { name: /Vérifier et transmettre/ }).click();
  await expect(page.getByRole("alert")).toContainText("exactement cinq");
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#participant-main-counter")).toBeFocused();
});

test("preserves local choices on an optimistic revision conflict", async ({
  page,
}) => {
  await questionnaire(page, {
    put: (route) =>
      route.fulfill({
        status: 409,
        json: { error: "Votre copie a changé dans une autre session." },
      }),
  });
  await page.getByTestId("choice-main-positive-obs-1").click();
  await expect(
    page.getByText("Une autre version de cette copie est enregistrée."),
  ).toBeVisible();
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: /Vérifier et transmettre/ }),
  ).toBeDisabled();
});

test("does not acknowledge newer edits when an older save finishes", async ({
  page,
}) => {
  const payloads: any[] = [];
  let releaseFirst: (() => Promise<void>) | undefined;
  await questionnaire(page, {
    put: async (route, input) => {
      payloads.push(input);
      const response = {
        ...draft(),
        ...input,
        revision: payloads.length,
        updatedAt: "2026-10-25T12:00:00Z",
      };
      if (payloads.length === 1) {
        releaseFirst = () =>
          route.fulfill({ json: { response, joinInfo: caseData } });
        return;
      }
      await route.fulfill({ json: { response, joinInfo: caseData } });
    },
  });
  await page.getByTestId("choice-main-positive-obs-1").click();
  await expect.poll(() => payloads.length).toBe(1);
  await page.getByTestId("choice-main-positive-obs-2").click();
  await releaseFirst!();
  await expect.poll(() => payloads.length).toBe(2);
  expect(payloads[1].revision).toBe(1);
  expect(payloads[1].mainChoices).toHaveLength(2);
  await expect(page.getByTestId("choice-main-positive-obs-2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("preserves reviewed signs after changing a previously saved diagnosis", async ({
  page,
}) => {
  const saved = await questionnaire(page, {
    response: draft({
      revision: 3,
      mainChoices: [{ observationId: "obs-1", sign: "+" }],
    }),
  });
  await page
    .getByLabel("Diagnostic principal", { exact: true })
    .selectOption("diag-c");
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByTestId("choice-main-negative-obs-2").click();
  await expect.poll(() => saved().mainDiagnosticId).toBe("diag-c");
  expect(saved().mainChoices).toEqual([{ observationId: "obs-2", sign: "-" }]);
  await page.reload();
  await expect(
    page.getByLabel("Diagnostic principal", { exact: true }),
  ).toHaveValue("diag-c");
  await expect(page.getByTestId("choice-main-negative-obs-2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("uses the canonical acknowledgment when no newer edits exist", async ({
  page,
}) => {
  await questionnaire(page, {
    put: (route, input) =>
      route.fulfill({
        json: {
          response: {
            ...draft(),
            ...input,
            mainChoices: [],
            revision: 1,
            updatedAt: "2026-10-25T12:00:00Z",
          },
          joinInfo: caseData,
        },
      }),
  });
  await page.getByTestId("choice-main-positive-obs-1").click();
  await expect(
    page.getByText("Enregistré par le serveur", { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

async function results(
  page: Page,
  response: any,
  score: number | null,
  role = "students",
) {
  await page.route("**/api/participant/results", (route) =>
    route.fulfill({
      json: {
        published: true,
        case: { ...caseData, role, status: "published" },
        role,
        status: "published",
        reveals: {},
        response,
        score,
        percentage: score === null ? null : score * 5,
        components: {
          mainDiagnosis: 2,
          mainJustification: 4.8,
          alternativeDiagnosis: 2,
          alternativeJustification: 4,
          main: { represented: true },
          alternative: { represented: true },
        },
        panel: { diagnostics: [], distributions: [] },
      },
    }),
  );
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "published",
        role,
        reveals: {},
        published: true,
        responseState: response.state,
        revision: response.revision,
      },
    }),
  );
  await page.goto("/participant/results");
}

test("displays score on twenty and percentage as distinct values", async ({
  page,
}) => {
  await results(page, draft({ state: "submitted" }), 12.8);
  await expect(page.locator(".participant-score")).toContainText("12,8");
  await expect(page.locator(".participant-score")).toContainText("/ 20");
  await expect(page.locator(".participant-score")).toContainText("64 %");
  await expect(page.locator(".score-components>div")).toHaveCount(4);
});

test("never turns a non-submitted draft into a zero score", async ({
  page,
}) => {
  await results(page, draft(), 0);
  await expect(page.getByRole("heading", { name: "Non soumis" })).toBeVisible();
  await expect(page.locator(".participant-score")).toHaveCount(0);
  await expect(
    page.getByText("il est exclu des statistiques", { exact: false }),
  ).toBeVisible();
});

test("never grades experts on their own panel reference", async ({ page }) => {
  await results(page, draft({ state: "submitted" }), 20, "panel");
  await expect(page.locator(".participant-score")).toHaveCount(0);
  await expect(
    page.getByText("Les experts ne reçoivent pas de note", { exact: false }),
  ).toBeVisible();
});

test("reuses the private join retry key after a lost response and reload", async ({
  page,
}) => {
  const attempts: any[] = [];
  await page.route("**/api/join/RETRY", (route) =>
    route.fulfill({ json: caseData }),
  );
  await page.route(
    `**/api/launches/${caseData.launchId}/join`,
    async (route) => {
      attempts.push(route.request().postDataJSON());
      if (attempts.length === 1)
        return route.fulfill({
          status: 503,
          json: { error: "Réponse interrompue, réessayez." },
        });
      await route.fulfill({
        json: {
          participantId: "same-participant",
          response: draft(),
          joinInfo: caseData,
        },
      });
    },
  );
  await page.route("**/api/participant/response", (route) =>
    route.fulfill({ json: { response: draft(), joinInfo: caseData } }),
  );
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "open",
        role: "students",
        reveals: {},
        published: false,
        responseState: "draft",
        revision: 0,
      },
    }),
  );
  await page.goto("/join/RETRY");
  await page
    .getByLabel("Votre nom ou pseudonyme", { exact: true })
    .fill("Étudiant test");
  await page.getByRole("button", { name: "Rejoindre l’activité" }).click();
  await expect(page.getByRole("alert")).toContainText("Réponse interrompue");
  await page.reload();
  await page
    .getByLabel("Votre nom ou pseudonyme", { exact: true })
    .fill("Étudiant test");
  await page.getByRole("button", { name: "Rejoindre l’activité" }).click();
  await expect(page).toHaveURL("/participant");
  expect(attempts).toHaveLength(2);
  expect(attempts[0].joinKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(attempts[1].joinKey).toBe(attempts[0].joinKey);
});

test("does not overwrite edits made while a newer server copy is loading", async ({
  page,
}) => {
  let reads = 0;
  let release: (() => Promise<void>) | undefined;
  await page.route("**/api/participant/response", async (route) => {
    if (route.request().method() !== "GET")
      return route.fulfill({
        status: 409,
        json: { error: "Votre copie a changé." },
      });
    reads++;
    if (reads === 1)
      return route.fulfill({ json: { response: draft(), joinInfo: caseData } });
    release = () =>
      route.fulfill({
        json: { response: draft({ revision: 1 }), joinInfo: caseData },
      });
  });
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "open",
        role: "students",
        reveals: {},
        published: false,
        responseState: "draft",
        revision: 1,
      },
    }),
  );
  await page.goto("/participant");
  await expect.poll(() => reads).toBe(2);
  await page.getByTestId("choice-main-positive-obs-1").click();
  await release!();
  await expect(
    page.getByText("Une autre version de cette copie est enregistrée."),
  ).toBeVisible();
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("can resume a closed activity with its existing private join key", async ({
  page,
}) => {
  const joinKey = "11111111-1111-4111-8111-111111111111";
  await page.addInitScript(
    (key) => sessionStorage.setItem("prc-join-CLOSED", key),
    joinKey,
  );
  await page.route("**/api/join/CLOSED", (route) =>
    route.fulfill({ json: { ...caseData, status: "closed" } }),
  );
  let receivedKey = "";
  await page.route(
    `**/api/launches/${caseData.launchId}/join`,
    async (route) => {
      receivedKey = route.request().postDataJSON().joinKey;
      await route.fulfill({ json: { participantId: "existing-copy" } });
    },
  );
  await page.route("**/api/participant/response", (route) =>
    route.fulfill({
      json: {
        response: draft({ state: "submitted" }),
        joinInfo: { ...caseData, status: "closed" },
      },
    }),
  );
  await page.route("**/api/participant/state", (route) =>
    route.fulfill({
      json: {
        status: "closed",
        role: "students",
        reveals: {},
        published: false,
        responseState: "submitted",
        revision: 0,
      },
    }),
  );
  await page.goto("/join/CLOSED");
  await page
    .getByLabel("Votre nom ou pseudonyme", { exact: true })
    .fill("Copie existante");
  await page
    .getByRole("button", { name: "Reprendre ma copie", exact: true })
    .click();
  await expect(page).toHaveURL("/participant");
  expect(receivedKey).toBe(joinKey);
});

test("preserves new edits made after confirming a server-copy reload", async ({
  page,
}) => {
  await questionnaire(page, {
    put: (route) =>
      route.fulfill({ status: 409, json: { error: "Votre copie a changé." } }),
  });
  await page.getByTestId("choice-main-positive-obs-1").click();
  await expect(
    page.getByText("Une autre version de cette copie est enregistrée."),
  ).toBeVisible();
  let release: (() => Promise<void>) | undefined;
  await page.route("**/api/participant/response", (route) => {
    release = () =>
      route.fulfill({
        json: { response: draft({ revision: 1 }), joinInfo: caseData },
      });
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Charger la copie enregistrée" })
    .click();
  await expect.poll(() => !!release).toBe(true);
  await page.getByTestId("choice-main-positive-obs-2").click();
  await release!();
  await expect(
    page.getByText("De nouveaux choix ont été saisis pendant le chargement.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("choice-main-positive-obs-2")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("keeps offline edits and saves them only after reconnecting", async ({
  page,
  context,
}) => {
  const saved = await questionnaire(page);
  await context.setOffline(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Hors connexion" }),
  ).toBeVisible();
  await page.getByTestId("choice-main-positive-obs-1").click();
  expect(saved().revision).toBe(0);
  await expect(
    page.getByRole("button", { name: "Enregistrer", exact: true }),
  ).toBeDisabled();
  await context.setOffline(false);
  await expect.poll(() => saved().mainChoices.length).toBe(1);
  await expect(
    page.getByText("Enregistré par le serveur", { exact: false }),
  ).toBeVisible();
});

test("submits only the revision reviewed by this participant", async ({
  page,
}) => {
  await questionnaire(page, {
    response: draft({
      revision: 5,
      mainChoices: [{ observationId: "obs-1", sign: "+" }],
      alternativeChoices: [{ observationId: "obs-2", sign: "-" }],
    }),
  });
  let reviewedRevision: number | undefined;
  await page.route("**/api/participant/submit", (route) => {
    reviewedRevision = route.request().postDataJSON().expectedRevision;
    return route.fulfill({
      status: 409,
      json: { error: "Votre copie a changé dans une autre session." },
    });
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Vérifier et transmettre/ }).click();
  await expect(
    page.getByText("Une autre version de cette copie est enregistrée."),
  ).toBeVisible();
  expect(reviewedRevision).toBe(5);
  await expect(page.getByTestId("choice-main-positive-obs-1")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: /Vérifier et transmettre/ }),
  ).toBeDisabled();
});
