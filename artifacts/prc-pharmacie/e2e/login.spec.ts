import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "test-teacher-id",
  username: "test-teacher",
  role: "admin",
  active: true,
  mustChangePassword: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/healthz", route => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: { error: "Connexion requise." } }));
  await page.goto("/login");
  await page.getByLabel("Identifiant", { exact: true }).fill(user.username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("test-password-only");
});

test("keeps the form while login is pending and displays rejected credentials", async ({ page }) => {
  const loginRequest = page.waitForRequest("**/api/auth/login");
  let respond: (() => Promise<void>) | undefined;
  await page.route("**/api/auth/login", route => {
    respond = () => route.fulfill({ status: 401, json: { error: "Nom d’utilisateur ou mot de passe invalide." } });
  });
  await page.getByRole("button", { name: "Se connecter" }).click();
  await loginRequest;
  await expect(page.getByRole("button", { name: "Connexion…" })).toBeDisabled();
  await expect(page.getByLabel("Identifiant", { exact: true })).toHaveValue(user.username);
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("test-password-only");
  await respond!();
  await expect(page.locator(".form-error")).toContainText("Nom d’utilisateur ou mot de passe invalide.");
  await expect(page.getByLabel("Identifiant", { exact: true })).toHaveValue(user.username);
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeEnabled();
});

async function acceptLogin(page: Page) {
  await page.route("**/api/auth/login", async route => {
    await page.route("**/api/auth/me", me => me.fulfill({ json: { user } }));
    await route.fulfill({ json: { user, csrfToken: "test-csrf" } });
  });
  await page.route("**/api/prcs", route => route.fulfill({ json: [] }));
  await page.route("**/api/workspace/summary", route => route.fulfill({ json: { recentLaunches: [] } }));
}

test("opens the dashboard after login and clears it after logout", async ({ page }) => {
  await acceptLogin(page);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: `Bonjour, ${user.username}` })).toBeVisible();
  await expect(page.getByText("Modification du mot de passe requise")).toBeVisible();
  await page.route("**/api/auth/logout", async route => {
    await page.route("**/api/auth/me", me => me.fulfill({ status: 401, json: { error: "Connexion requise." } }));
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByTestId("button-logout").click();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: `Bonjour, ${user.username}` })).not.toBeVisible();
});

test("refreshes the account after changing the initial password", async ({ page }) => {
  await acceptLogin(page);
  await page.route("**/api/auth/change-password", async route => {
    await page.route("**/api/auth/me", me => me.fulfill({ json: { user: { ...user, mustChangePassword: false } } }));
    await route.fulfill({ json: { ok: true } });
  });
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.getByLabel("Mot de passe actuel", { exact: true }).fill("test-password-only");
  await page.getByLabel("Nouveau mot de passe (12 caractères minimum)", { exact: true }).fill("new-test-password-only");
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.getByText("Modification du mot de passe requise")).not.toBeVisible();
});

test("shows a server error and lets the user retry", async ({ page }) => {
  await page.route("**/api/auth/login", route => route.fulfill({ status: 500, json: { error: "Une erreur est survenue. Réessayez." } }));
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.locator(".form-error")).toContainText("Une erreur est survenue. Réessayez.");
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeEnabled();
});
