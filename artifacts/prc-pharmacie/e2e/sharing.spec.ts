import { expect, test, type Page } from "@playwright/test";
const id = "10000000-0000-4000-8000-000000000001";
const teacher = {
  id: "teacher",
  username: "teacher",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const fixture = () => ({
  id,
  name: "Cas partagé",
  scenario: "Scénario initial",
  instructions: "Deux impressions cliniques",
  version: 1,
  archived: false,
  shared: false,
  isDemo: false,
  ownerUsername: "teacher",
  permissions: { edit: true, share: true, archive: true, manageSessions: true },
  diagnostics: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  observations: Array.from({ length: 5 }, (_, i) => ({
    id: `o${i}`,
    text: `Donnée ${i}`,
    category: "Autre",
    position: i,
  })),
  launches: [],
  workflow: {
    step: "panel",
    missing: [],
    panelLaunchId: null,
    referenceStatus: null,
  },
});
async function authenticated(page: Page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { user: teacher } }),
  );
  await page.route("**/api/workspace/summary", (route) =>
    route.fulfill({
      json: {
        prcCount: 1,
        activeLaunchCount: 1,
        participantCount: 3,
        submissionCount: 2,
        activeLaunches: [
          {
            id: "open",
            name: "Séance ouverte",
            role: "students",
            createdAt: "2026-01-01",
            participantCount: 3,
            submissionCount: 2,
          },
        ],
        recentLaunches: [
          {
            id: "recent",
            name: "Ancienne séance",
            role: "panel",
            createdAt: "2026-01-01",
            participantCount: 2,
            submissionCount: 2,
          },
        ],
      },
    }),
  );
}

test("overview follows sessions while Mes PRC opens a separate searchable library", async ({
  page,
}) => {
  await authenticated(page);
  await page.route("**/api/prcs?*", (route) =>
    route.fulfill({ json: [fixture()] }),
  );
  await page.goto("/");
  await expect(page.getByText("Séance ouverte", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Rechercher un PRC", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Mes PRC", exact: true }).click();
  await expect(page).toHaveURL("/prcs");
  await expect(
    page.getByRole("link", { name: "Mes PRC", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Mes PRC", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Rechercher un PRC", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Activités récentes", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Vue d’ensemble", exact: true }).click();
  await expect(page).toHaveURL("/");
});

test("owner shares the same PRC, optionally enables sessions and removes access", async ({
  page,
}) => {
  await authenticated(page);
  let data = fixture();
  let members: any[] = [];
  let lastGrant: any;
  await page.route(`**/api/prcs/${id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.route(`**/api/prcs/${id}/collaborators`, (route) => {
    if (route.request().method() === "POST") {
      lastGrant = route.request().postDataJSON();
      members = [
        {
          id: "colleague",
          username: lastGrant.username,
          manageSessions: lastGrant.manageSessions,
          active: true,
        },
      ];
      data = { ...data, shared: true };
      return route.fulfill({ json: members[0] });
    }
    return route.fulfill({
      json: {
        owner: { id: "teacher", username: "teacher" },
        canShare: true,
        collaborators: members,
      },
    });
  });
  await page.route(`**/api/prcs/${id}/collaborators/colleague`, (route) => {
    members = [];
    data = { ...data, shared: false };
    return route.fulfill({ json: { removed: true } });
  });
  await page.goto(`/prc/${id}`);
  await page.getByRole("button", { name: "Partager", exact: true }).click();
  await page
    .getByLabel("Identifiant PRC du professeur", { exact: true })
    .fill("colleague");
  await page
    .getByRole("button", { name: "Partager ce PRC", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Retirer l’accès de colleague",
      exact: true,
    }),
  ).toBeVisible();
  expect(lastGrant.manageSessions).toBe(false);
  await page
    .getByLabel("Autoriser la gestion des séances pour colleague", {
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Autoriser la gestion des séances pour colleague", {
      exact: true,
    }),
  ).toBeChecked();
  await expect.poll(() => lastGrant.manageSessions).toBe(true);
  await expect(page).toHaveURL(`/prc/${id}`);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Retirer l’accès de colleague", exact: true })
    .click();
  await expect(page.getByText("Accès retiré.", { exact: true })).toBeVisible();
});

test("editor retains local content on a concurrent update and submits only the captured version", async ({
  page,
}) => {
  await page.clock.install();
  await authenticated(page);
  let data = { ...fixture(), shared: true };
  const attempts: number[] = [];
  await page.route(`**/api/prcs/${id}`, (route) => {
    if (route.request().method() === "PUT") {
      const input = route.request().postDataJSON();
      attempts.push(input.version);
      if (input.version !== data.version)
        return route.fulfill({
          status: 409,
          json: {
            error:
              "Ce PRC a été modifié ailleurs. Rechargez sa version récente.",
          },
        });
      data = { ...data, scenario: input.scenario, version: data.version + 1 };
    }
    return route.fulfill({ json: data });
  });
  await page.goto(`/prc/${id}`);
  await page
    .getByRole("textbox", { name: "Scénario clinique", exact: true })
    .fill("Travail local conservé");
  data = { ...data, scenario: "Travail du collègue", version: 2 };
  await page.clock.fastForward(15_100);
  await expect(
    page.getByText("Une version plus récente de ce PRC est disponible.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Scénario clinique", exact: true }),
  ).toHaveValue("Travail local conservé");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Ce PRC a été modifié ailleurs.", { exact: false }),
  ).toBeVisible();
  expect(attempts).toEqual([1]);
  await expect(
    page.getByRole("textbox", { name: "Scénario clinique", exact: true }),
  ).toHaveValue("Travail local conservé");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Charger la version récente", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Scénario clinique", exact: true }),
  ).toHaveValue("Travail du collègue");
  await page
    .getByRole("textbox", { name: "Scénario clinique", exact: true })
    .fill("Nouvelle modification après relecture");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect.poll(() => attempts).toEqual([1, 2]);
  await expect(
    page.getByRole("status").filter({ hasText: "Enregistré en base" }),
  ).toBeVisible();
});

test("content collaborator can edit but cannot grant access or launch sessions", async ({
  page,
}) => {
  await authenticated(page);
  const data = {
    ...fixture(),
    shared: true,
    ownerUsername: "owner",
    permissions: {
      edit: true,
      share: false,
      archive: false,
      manageSessions: false,
    },
  };
  await page.route(`**/api/prcs/${id}`, (route) =>
    route.fulfill({ json: data }),
  );
  await page.route(`**/api/prcs/${id}/collaborators`, (route) =>
    route.fulfill({
      json: {
        owner: { id: "owner", username: "owner" },
        canShare: false,
        collaborators: [
          {
            id: "teacher",
            username: "teacher",
            active: true,
            manageSessions: false,
          },
        ],
      },
    }),
  );
  await page.goto(`/prc/${id}`);
  await expect(
    page.getByRole("button", { name: "Tester comme participant", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Collaborateurs", exact: true })
    .click();
  await expect(
    page.getByLabel("Identifiant PRC du professeur", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Partager ce PRC", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Scénario clinique", exact: true }),
  ).toBeEnabled();
});
