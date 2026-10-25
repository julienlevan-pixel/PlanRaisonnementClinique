import { expect, test } from "@playwright/test";

test("administrator creates, resets, disables and reactivates a teacher", async ({
  page,
}) => {
  const admin = {
    id: "admin-test",
    username: "admin-test",
    role: "admin",
    active: true,
    mustChangePassword: false,
    createdAt: "2026-01-01T00:00:00Z",
  };
  const teachers: any[] = [admin];
  const updates: any[] = [];
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user: admin } }),
  );
  await page.route("**/api/teachers", async (r) => {
    if (r.request().method() === "POST") {
      const { username } = r.request().postDataJSON();
      const teacher = {
        ...admin,
        id: "teacher-test",
        username,
        role: "teacher",
        mustChangePassword: true,
      };
      teachers.push(teacher);
      await r.fulfill({ status: 201, json: teacher });
    } else await r.fulfill({ json: teachers });
  });
  await page.route("**/api/teachers/teacher-test", async (r) => {
    const change = r.request().postDataJSON();
    updates.push(change);
    const teacher = teachers.find((t) => t.id === "teacher-test");
    if (change.active !== undefined) teacher.active = change.active;
    await r.fulfill({ json: teacher });
  });
  await page.goto("/admin");
  await page.getByLabel("Identifiant", { exact: true }).fill("teacher-test");
  await page
    .getByLabel("Mot de passe provisoire (12 caractères minimum)", {
      exact: true,
    })
    .fill("initial-test-only-password");
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Compte enseignant créé",
  );
  const row = page.locator(".teacher-row").filter({ hasText: "teacher-test" });
  await row.getByRole("button", { name: "Réinitialiser" }).click();
  await page
    .getByLabel("Nouveau mot de passe provisoire", { exact: true })
    .fill("reset-test-only-password");
  await page
    .getByRole("button", { name: "Confirmer la réinitialisation" })
    .click();
  await expect(page.getByRole("status")).toContainText("anciennes sessions");
  expect(updates[0].password).toBe("reset-test-only-password");
  await row.getByRole("button", { name: "Désactiver" }).click();
  await expect(row.getByRole("button", { name: "Réactiver" })).toBeVisible();
  await row.getByRole("button", { name: "Réactiver" }).click();
  await expect(row.getByRole("button", { name: "Désactiver" })).toBeVisible();
  expect(updates.slice(1)).toEqual([{ active: false }, { active: true }]);
  await expect(
    page
      .locator(".teacher-row")
      .filter({ hasText: "admin-test" })
      .getByText("Votre compte"),
  ).toBeVisible();
});
