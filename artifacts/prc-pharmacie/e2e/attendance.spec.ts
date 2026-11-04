import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const teacher = {
  id: "teacher",
  username: "Professeur",
  role: "teacher",
  active: true,
  mustChangePassword: false,
};
const observations = Array.from({ length: 20 }, (_, i) => ({
  id: `o${i}`,
  text: `Donnée clinique ${i + 1}`,
  category: "Examen physique",
}));
const clinicalCase = {
  launchId: "live",
  name: "Toux",
  scenario: "Une toux persistante.",
  instructions: "Deux impressions cliniques distinctes.",
  diagnostics: [
    { id: "a", label: "Asthme" },
    { id: "b", label: "Reflux" },
  ],
  observations,
  requiredChoices: 5,
};
const base = (enabled = true) => ({
  installed: true,
  enabled,
  role: "students",
  deliveryMode: "synchronous",
  sourceFinished: false,
  register: enabled
    ? {
        id: "register",
        open: true,
        collectStudentNumber: false,
        openedAt: "2026-11-04T12:00:00Z",
        closedAt: null,
      }
    : undefined,
});
const entry = (id: string, fullName: string) => ({
  id,
  revision: 0,
  fullName,
  studentNumber: null as string | null,
  status: "unconfirmed",
  source: "roster",
  confirmedAt: null as string | null,
  teacherMarkedAt: null as string | null,
  updatedAt: "2026-11-04T12:00:00Z",
  canDelete: true,
});
const summary = (entries: any[]) =>
  Object.fromEntries(
    ["present", "late", "unconfirmed", "absent", "excused"].map((status) => [
      status,
      entries.filter((e) => e.status === status).length,
    ]),
  );
async function teacherPage(page: Page) {
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
        role: "students",
        status: "open",
        createdAt: "2026-11-04",
        participantCount: 18,
        submissionCount: 3,
        guidedReview: true,
        deliveryMode: "synchronous",
        case: clinicalCase,
        liveSession: { phase: "lobby" },
        reveals: {},
      },
    }),
  );
  await page.goto("/activity/live");
  await page
    .getByRole("button", { name: "Prendre les présences", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Feuille de présence", exact: true });
}
async function participantPage(page: Page, mode = "synchronous") {
  const info = {
    ...clinicalCase,
    role: "students",
    status: "open",
    deliveryMode: mode,
    pseudonym: "Pseudo conservé",
    liveSession: mode === "synchronous" ? { phase: "lobby" } : undefined,
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
        role: "students",
        liveSession: info.liveSession,
        participantCount: 18,
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

test("professor activates attendance, imports an expected roster and exports safe CSV without closing answers", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let state: any = base(false),
    entries: any[] = [],
    collect = false;
  const writes: string[] = [];
  const view = () => ({ ...state, entries, summary: summary(entries) });
  await page.route("**/api/attendance/launches/live**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (r.request().method() === "POST") {
      writes.push(path);
      const data = r.request().postDataJSON();
      if (path.endsWith("/roster")) {
        entries = data.rows.map((row: any, i: number) => ({
          ...entry(`r${i}`, row.fullName),
          studentNumber: row.studentNumber ?? null,
        }));
      } else if (path.includes("/entries/")) {
        const row = entries.find((e) => path.endsWith(e.id));
        expect(data.expectedRevision).toBe(row.revision);
        row.status = data.status;
        row.teacherMarkedAt = "2026-11-04T12:10:00Z";
        row.revision++;
      } else if (path.endsWith("/close")) {
        state.register.open = false;
        state.register.closedAt = "2026-11-04T12:15:00Z";
      } else {
        collect = data.collectStudentNumber === true;
        state = base();
        state.register.collectStudentNumber = collect;
      }
    }
    return r.fulfill({ json: view() });
  });
  const dialog = await teacherPage(page);
  await dialog
    .getByRole("checkbox", {
      name: "Recueillir aussi le matricule",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Activer la prise de présences", exact: true })
    .click();
  await expect(dialog).toContainText("Confirmations ouvertes");
  await dialog
    .getByText("Ajouter une liste de personnes attendues", { exact: true })
    .click();
  await dialog
    .getByLabel("Liste des participants attendus", { exact: true })
    .fill("Marie Tremblay ; 001234\nAlex Gagnon ; 001235\n=2+3 ; 001236");
  await dialog
    .getByRole("button", { name: "Ajouter à la feuille", exact: true })
    .click();
  await expect(
    dialog
      .getByRole("list", { name: "Présences des participants" })
      .locator("li"),
  ).toHaveCount(3);
  expect(collect).toBe(true);
  expect(entries[0].studentNumber).toBe("001234");
  await dialog
    .getByRole("combobox", { name: "Statut de Marie Tremblay", exact: true })
    .selectOption("present");
  await expect(
    dialog.getByRole("combobox", {
      name: "Statut de Marie Tremblay",
      exact: true,
    }),
  ).toHaveValue("present");
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", { name: "Exporter la feuille CSV", exact: true })
    .click();
  const file = await downloaded;
  const csv = await readFile((await file.path())!, "utf8");
  expect(csv).toContain('"001234"');
  expect(csv).toContain('"Présent·e"');
  expect(csv).toContain('"\'=2+3"');
  page.once("dialog", (d) => d.accept());
  await dialog
    .getByRole("button", { name: "Terminer les confirmations", exact: true })
    .click();
  await expect(dialog).toContainText("Confirmations terminées");
  expect(entries.filter((e) => e.status === "unconfirmed")).toHaveLength(2);
  expect(
    writes.every((path) => path.startsWith("/api/attendance/launches/live")),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.screenshot({
    path: testInfo.outputPath("teacher-attendance-mobile.png"),
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "Fermer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Prendre les présences", exact: true }),
  ).toBeFocused();
});

test("a participant confirms once in the lobby and retains their quiz pseudonym after reloading", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let own: any = null,
    posts = 0;
  await page.route("**/api/participant/attendance", (r) => {
    if (r.request().method() === "POST") {
      posts++;
      const data = r.request().postDataJSON();
      expect(data.fullName).toBe("Marie Tremblay");
      own = {
        ...entry("self", data.fullName),
        status: "present",
        source: "participant",
        canDelete: false,
        confirmedAt: "2026-11-04T12:00:00Z",
      };
    }
    return r.fulfill({ json: { ...base(), own } });
  });
  await participantPage(page);
  const presence = page.getByRole("region", {
    name: "Votre présence à la séance",
    exact: true,
  });
  await presence
    .getByLabel("Nom et prénom pour la feuille de présence", { exact: true })
    .fill("Marie Tremblay");
  await presence
    .getByRole("button", { name: "Confirmer ma présence", exact: true })
    .click();
  await expect(presence).toContainText("Marie Tremblay · Présent·e");
  await expect(
    page.getByRole("heading", {
      name: "Vous avez rejoint la séance, Pseudo conservé",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(presence).toContainText("Confirmation enregistrée");
  await expect(
    presence.getByRole("button", {
      name: "Confirmer ma présence",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(posts).toBe(1);
  await page.screenshot({
    path: testInfo.outputPath("participant-attendance-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("asynchronous attendance is clearly participation and preserves a student number's leading zeroes", async ({
  page,
}) => {
  let own: any = null;
  const view = {
    ...base(),
    deliveryMode: "asynchronous",
    register: { ...base().register!, collectStudentNumber: true },
  };
  await page.route("**/api/participant/attendance", (r) => {
    if (r.request().method() === "POST") {
      const data = r.request().postDataJSON();
      expect(data.studentNumber).toBe("001234");
      own = {
        ...entry("self", data.fullName),
        studentNumber: data.studentNumber,
        status: "present",
        source: "participant",
        confirmedAt: "2026-11-04T12:00:00Z",
      };
    }
    return r.fulfill({ json: { ...view, own } });
  });
  await participantPage(page, "asynchronous");
  const participation = page.getByRole("region", {
    name: "Votre participation à la séance",
    exact: true,
  });
  await participation
    .getByLabel("Nom et prénom pour la feuille de présence", { exact: true })
    .fill("Marie Tremblay");
  await participation.getByLabel("Matricule", { exact: true }).fill("001234");
  await participation
    .getByRole("button", { name: "Confirmer ma participation", exact: true })
    .click();
  await expect(participation).toContainText("Participation confirmée");
  await expect(
    page.getByLabel("Impression clinique", { exact: true }),
  ).toBeVisible();
});

test("closed attendance and a professor correction never force a new declaration", async ({
  page,
}) => {
  const own = {
    ...entry("self", "Marie Tremblay"),
    status: "excused",
    teacherMarkedAt: "2026-11-04T12:00:00Z",
  };
  await page.route("**/api/participant/attendance", (r) =>
    r.fulfill({
      json: { ...base(), register: { ...base().register!, open: false }, own },
    }),
  );
  await participantPage(page);
  const presence = page.getByRole("region", {
    name: "Votre présence à la séance",
    exact: true,
  });
  await expect(presence).toContainText("Absence justifiée");
  await expect(presence).toContainText("Statut renseigné par le professeur");
  await expect(presence.getByRole("button")).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Salle d’attente de la séance",
      exact: true,
    }),
  ).toBeVisible();
});

test("a stale professor edit refreshes the status before a new correction", async ({
  page,
}) => {
  let row = { ...entry("r1", "Marie Tremblay"), status: "present" },
    posts = 0;
  await page.route("**/api/attendance/launches/live**", (r) => {
    if (r.request().method() === "POST") {
      posts++;
      const data = r.request().postDataJSON();
      if (posts === 1) {
        row = { ...row, status: "late", revision: 1 };
        return r.fulfill({
          status: 409,
          json: {
            error:
              "La présence a été actualisée. Consultez le statut récent avant de le corriger.",
          },
        });
      }
      expect(data.expectedRevision).toBe(1);
      row = { ...row, status: data.status, revision: 2 };
    }
    return r.fulfill({
      json: { ...base(), entries: [row], summary: summary([row]) },
    });
  });
  const dialog = await teacherPage(page);
  const status = dialog.getByRole("combobox", {
    name: "Statut de Marie Tremblay",
    exact: true,
  });
  await status.selectOption("absent");
  await expect(dialog.getByRole("alert")).toContainText(
    "La présence a été actualisée",
  );
  await expect(status).toHaveValue("late");
  await status.selectOption("excused");
  await expect(status).toHaveValue("excused");
  expect(posts).toBe(2);
});

test("an uninstalled attendance feature remains optional and leaves the participant flow usable", async ({
  page,
}) => {
  await page.route("**/api/participant/attendance", (r) =>
    r.fulfill({ json: { installed: false, enabled: false } }),
  );
  await participantPage(page);
  await expect(
    page.getByRole("region", {
      name: "Votre présence à la séance",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", {
      name: "Salle d’attente de la séance",
      exact: true,
    }),
  ).toBeVisible();
});
