import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { read, utils } from "@e965/xlsx";
test.use({ timezoneId: "America/Toronto" });
const teacher = {
  id: "teacher",
  username: "Professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const clinicalCase = {
  launchId: "live",
  name: "Toux",
  scenario: "Une toux persistante.",
  instructions: "Deux impressions cliniques distinctes.",
  diagnostics: [
    { id: "a", label: "Asthme" },
    { id: "b", label: "Reflux" },
  ],
  observations: Array.from({ length: 20 }, (_, i) => ({
    id: `o${i}`,
    text: `Donnée ${i + 1}`,
    category: "Examen physique",
  })),
  requiredChoices: 5,
};
const entries = [
  { id: "one", fullName: "Marie Tremblay", joinedAt: "2026-11-04T12:00:01Z" },
  { id: "two", fullName: "Émilie Gagnon", joinedAt: "2026-11-04T12:01:02Z" },
  { id: "three", fullName: "=2+3", joinedAt: "2026-11-04T12:02:03Z" },
];
const base = { available: true, finished: false, endedAt: null };
async function teacherPage(
  page: Page,
  role = "students",
  deliveryMode = "synchronous",
) {
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
        role,
        status: "open",
        createdAt: "2026-11-04",
        participantCount: 3,
        submissionCount: 0,
        guidedReview: true,
        deliveryMode,
        case: clinicalCase,
        liveSession: { phase: "lobby" },
        reveals: {},
      },
    }),
  );
  await page.goto("/activity/live");
}
async function participantPage(
  page: Page,
  role = "students",
  deliveryMode = "synchronous",
) {
  const info = {
    ...clinicalCase,
    role,
    status: "open",
    deliveryMode,
    pseudonym: "Marie Tremblay",
    liveSession:
      deliveryMode === "synchronous" ? { phase: "lobby" } : undefined,
  };
  await page.route("**/api/participant/teaching-session", (r) =>
    r.fulfill({ json: { session: null } }),
  );
  await page.route("**/api/participant/response", (r) =>
    r.fulfill({
      json: {
        joinInfo: info,
        response: {
          state: "draft",
          revision: 0,
          mainDiagnosticId: null,
          alternativeDiagnosticId: null,
          mainChoices: [],
          alternativeChoices: [],
        },
      },
    }),
  );
  await page.route("**/api/participant/state", (r) =>
    r.fulfill({
      json: {
        status: "open",
        role,
        liveSession: info.liveSession,
        participantCount: 3,
        joinInfo: info,
        responseState: "draft",
        revision: 0,
        published: false,
        reveals: {},
      },
    }),
  );
  await page.goto("/participant");
}

test("professor sees automatic attendance and exports a genuine XLS with complete names, timestamps and safe text", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let reads = 0;
  await page.route("**/api/attendance/launches/live", (r) => {
    expect(r.request().method()).toBe("GET");
    reads++;
    return r.fulfill({ json: { ...base, entries, count: 3 } });
  });
  await teacherPage(page);
  await page
    .getByRole("button", { name: "Voir les présences", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Présences étudiantes",
    exact: true,
  });
  await expect(dialog).toContainText("3 étudiant(s) présent(s)");
  await expect(dialog.getByRole("listitem")).toHaveCount(3);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByText(/retard|justifiée|À confirmer/)).toHaveCount(0);
  await dialog
    .getByLabel("Rechercher un étudiant", { exact: true })
    .fill("emilie");
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Exporter en Excel (.xls)", exact: true })
    .click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("presences-toux.xls");
  const data = await readFile((await file.path())!);
  expect([...data.subarray(0, 8)]).toEqual([
    208, 207, 17, 224, 161, 177, 26, 225,
  ]);
  const book = read(data, { type: "buffer" }),
    sheet = book.Sheets["Présences"];
  const rows = utils.sheet_to_json<string[]>(sheet, { header: 1 });
  expect(rows).toHaveLength(4);
  expect(rows[0]).toEqual([
    "Séance",
    "Nom et prénom",
    "Date d’inscription",
    "Heure d’inscription",
    "Fuseau horaire",
  ]);
  expect(rows[1][2]).toBe("2026-11-04");
  expect(rows[1][3]).toBe("07:00:01");
  expect(rows[1][4]).toBe("America/Toronto");
  expect(rows[1][1]).toBe("Marie Tremblay");
  expect(rows[2][1]).toBe("Émilie Gagnon");
  expect(sheet.B4.t).toBe("s");
  expect(sheet.B4.v).toBe("=2+3");
  expect(sheet.B4.f).toBeUndefined();
  expect(reads).toBeGreaterThanOrEqual(2);
  await dialog.getByLabel("Rechercher un étudiant", { exact: true }).fill("");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.screenshot({
    path: testInfo.outputPath("presences-professeur-mobile.png"),
  });
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Voir les présences", exact: true }),
  ).toBeFocused();
});

test("student presence is recorded immediately, needs no second form and survives reload", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [];
  await page.route("**/api/participant/attendance", (r) => {
    if (r.request().method() !== "GET") writes.push(r.request().method());
    return r.fulfill({ json: { ...base, own: entries[0] } });
  });
  await participantPage(page);
  const own = page.getByRole("region", {
    name: "Votre présence à la séance",
    exact: true,
  });
  await expect(own).toContainText("Présence enregistrée");
  await expect(own).toContainText("Marie Tremblay");
  await expect(own.locator("time")).toHaveAttribute(
    "datetime",
    entries[0].joinedAt,
  );
  await expect(own.getByRole("button")).toHaveCount(0);
  await expect(own.getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Salle d’attente de la séance",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(own).toContainText("Présence enregistrée");
  expect(writes).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("presences-etudiant-mobile.png"),
    fullPage: true,
  });
});

test("closed session retains its list without controls for adding or marking people", async ({
  page,
}) => {
  await page.route("**/api/attendance/launches/live", (r) =>
    r.fulfill({
      json: {
        ...base,
        finished: true,
        endedAt: "2026-11-04T13:00:00Z",
        entries,
        count: 3,
      },
    }),
  );
  await teacherPage(page);
  await page
    .getByRole("button", { name: "Voir les présences", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Présences étudiantes",
    exact: true,
  });
  await expect(dialog).toContainText("liste conservée");
  await expect(dialog).toContainText("ne crée pas une nouvelle présence");
  await expect(dialog.getByRole("button")).toHaveCount(2);
});

for (const [role, mode] of [
  ["panel", "synchronous"],
  ["students", "asynchronous"],
])
  test(`no attendance workflow for ${role} ${mode}`, async ({ page }) => {
    await page.route("**/api/participant/attendance", (r) =>
      r.fulfill({
        json: { available: false, finished: false, endedAt: null, own: null },
      }),
    );
    await participantPage(page, role, mode);
    await expect(
      page.getByRole("region", {
        name: "Votre présence à la séance",
        exact: true,
      }),
    ).toHaveCount(0);
    await teacherPage(page, role, mode);
    await expect(
      page.getByRole("button", { name: "Voir les présences", exact: true }),
    ).toHaveCount(0);
  });
