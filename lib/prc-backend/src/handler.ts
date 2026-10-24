import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import {
  clearLoginLimit,
  createParticipantSession,
  createTeacherSession,
  enforceLoginLimit,
  expiredCookieHeader,
  getPrincipal,
  hashToken,
  newId,
  passwordHash,
  readSessionCookie,
  recordFailedLogin,
  sameOriginMutationAllowed,
  verifyPassword,
  type ParticipantPrincipal,
  type Principal,
  type TeacherPrincipal,
} from "./security.js";
import { computeCeiling, scoreSubmission, type Choice, type PanelDistribution } from "./scoring.js";

type JsonRecord = Record<string, unknown>;
type CaseData = {
  name: string;
  scenario: string;
  instructions: string;
  diagnostics: Array<{ id: string; label: string }>;
  observations: Array<{ id: string; text: string; category: string; position: number }>;
};
type LaunchRow = {
  id: string;
  prc_id: string;
  owner_id: string;
  role: "panel" | "students";
  name: string;
  code: string;
  status: "open" | "closed" | "revealed" | "published";
  case_version: number;
  case_snapshot: CaseData;
  reference_id: string | null;
  reveals: RevealState;
  created_at: Date;
  closed_at: Date | null;
  published_at: Date | null;
};
type RevealState = {
  mainDiagnostic: boolean;
  mainArguments: boolean;
  alternativeDiagnostic: boolean;
  alternativeArguments: boolean;
  reference: boolean;
};
type ParticipantResponseData = {
  state: "draft" | "submitted";
  mainDiagnosticId: string | null;
  alternativeDiagnosticId: string | null;
  mainChoices: Choice[];
  alternativeChoices: Choice[];
  updatedAt: string | null;
};
type PanelSnapshot = {
  totalSubmissions: number;
  minimumPanelSize: number;
  diagnostics: Array<JsonRecord>;
  distributions: PanelDistribution[];
};

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(data: unknown, status = 200, headers?: Record<string, string>): Response {
  const outputHeaders = new Headers(headers);
  outputHeaders.set("content-type", "application/json; charset=utf-8");
  outputHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: outputHeaders });
}

function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}

async function body(request: Request): Promise<JsonRecord> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(400, "Le contenu envoyé est invalide.");
    }
    return value as JsonRecord;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    fail(400, "Le contenu envoyé doit être un objet JSON.");
  }
}

function stringValue(value: unknown, name: string, max = 10000): string {
  if (typeof value !== "string" || value.length > max) {
    fail(400, `${name} est invalide.`);
  }
  return value.trim();
}

function passwordValue(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200) {
    fail(400, `${name} est invalide.`);
  }
  return value;
}

function optionalString(value: unknown, max = 10000): string {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > max) {
    fail(400, "Un champ texte est invalide.");
  }
  return value.trim();
}

function arrayValue(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(400, `${field} doit être une liste.`);
  return value;
}

function segment(value: string | undefined): string {
  if (!value || value.length > 200) fail(400, "Identifiant invalide.");
  return decodeURIComponent(value);
}

function validRole(value: unknown): "panel" | "students" {
  if (value === "panel" || value === "students") return value;
  return fail(400, "Le rôle d’activité est invalide.");
}

function safePrcInput(value: JsonRecord): CaseData {
  const name = optionalString(value.name, 160);
  const scenario = optionalString(value.scenario, 20000);
  const instructions = optionalString(value.instructions, 5000);
  const diagnosticLabels = arrayValue(value.diagnostics, "Les diagnostics")
    .map((item) => stringValue(item, "Un diagnostic", 240))
    .filter(Boolean);
  const uniqueLabels = [...new Set(diagnosticLabels)];
  const observations = arrayValue(value.observations, "Les observations").map(
    (item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fail(400, "Une observation est invalide.");
      }
      const row = item as JsonRecord;
      const text = optionalString(row.text, 10000);
      const category = optionalString(row.category, 80) || "Autre";
      const position = Number.isInteger(row.position) ? Number(row.position) : index;
      return {
        id:
          typeof row.id === "string" && /^[0-9a-f-]{36}$/i.test(row.id)
            ? row.id
            : newId(),
        text,
        category,
        position,
      };
    },
  );
  if (observations.length > 200) fail(400, "Un PRC ne peut pas dépasser 200 observations.");
  return {
    name,
    scenario,
    instructions,
    diagnostics: uniqueLabels.map((label) => ({ id: newId(), label })),
    observations,
  };
}

function preserveDiagnosticIds(value: CaseData, existing: unknown): CaseData {
  if (!Array.isArray(existing)) return value;
  const priorByLabel = new Map<string, string>();
  for (const item of existing) {
    if (
      item &&
      typeof item === "object" &&
      "id" in item &&
      "label" in item &&
      typeof item.id === "string" &&
      typeof item.label === "string"
    ) {
      priorByLabel.set(item.label, item.id);
    }
  }
  return {
    ...value,
    diagnostics: value.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      id: priorByLabel.get(diagnostic.label) ?? diagnostic.id,
    })),
  };
}

function isComplete(value: CaseData): boolean {
  return (
    value.name.length > 0 &&
    value.scenario.length > 0 &&
    value.diagnostics.length >= 2 &&
    value.observations.some((item) => item.text.length > 0)
  );
}

function mapPrc(row: JsonRecord) {
  return {
    id: row.prc_id ?? row.id,
    name: row.name ?? "",
    scenario: row.scenario ?? "",
    status: row.status ?? "draft",
    version: Number(row.version ?? row.current_version ?? 1),
    updatedAt: row.updated_at,
    launchCount: Number(row.launch_count ?? 0),
  };
}

function mapLaunch(row: LaunchRow, counts?: { participants: number; submissions: number }) {
  return {
    id: row.id,
    prcId: row.prc_id,
    role: row.role,
    name: row.name,
    code: row.code,
    status: row.status,
    createdAt: row.created_at,
    participantCount: counts?.participants ?? 0,
    submissionCount: counts?.submissions ?? 0,
  };
}

function defaultResponse(): ParticipantResponseData {
  return {
    state: "draft",
    mainDiagnosticId: null,
    alternativeDiagnosticId: null,
    mainChoices: [],
    alternativeChoices: [],
    updatedAt: null,
  };
}

function mapResponse(row?: JsonRecord): ParticipantResponseData {
  if (!row) return defaultResponse();
  return {
    state: row.state as "draft" | "submitted",
    mainDiagnosticId: (row.main_diagnostic_id as string | null) ?? null,
    alternativeDiagnosticId: (row.alternative_diagnostic_id as string | null) ?? null,
    mainChoices: (row.main_choices as Choice[]) ?? [],
    alternativeChoices: (row.alternative_choices as Choice[]) ?? [],
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

function cookieHeaders(cookie?: string): Record<string, string> | undefined {
  return cookie ? { "set-cookie": cookie } : undefined;
}

async function requireTeacher(request: Request, admin = false): Promise<TeacherPrincipal> {
  const principal = await getPrincipal(request);
  if (!principal || principal.kind !== "teacher") fail(401, "Connexion enseignante requise.");
  if (principal.mustChangePassword) fail(403, "Le mot de passe initial doit être changé.");
  if (admin && principal.role !== "admin") fail(403, "Accès réservé à l’administratrice.");
  return principal;
}

async function requireParticipant(request: Request): Promise<ParticipantPrincipal> {
  const principal = await getPrincipal(request);
  if (!principal || principal.kind !== "participant") {
    fail(401, "Rejoignez d’abord cette activité.");
  }
  return principal;
}

async function requireOwner(
  request: Request,
  launchId: string,
): Promise<{ teacher: TeacherPrincipal; launch: LaunchRow }> {
  const teacher = await requireTeacher(request);
  const result = await pool.query<LaunchRow>(
    "SELECT * FROM prc_private.launches WHERE id = $1 AND owner_id = $2",
    [launchId, teacher.id],
  );
  if (!result.rows[0]) fail(404, "Activité introuvable.");
  return { teacher, launch: result.rows[0] };
}

async function launchCounts(launchId: string) {
  const result = await pool.query(
    `SELECT count(*)::int AS participants,
            count(*) FILTER (WHERE r.state = 'submitted')::int AS submissions
       FROM prc_private.participants p
       LEFT JOIN prc_private.responses r ON r.participant_id = p.id
      WHERE p.launch_id = $1`,
    [launchId],
  );
  return {
    participants: result.rows[0].participants as number,
    submissions: result.rows[0].submissions as number,
  };
}

function validateParticipantResponse(
  input: JsonRecord,
  participant: ParticipantPrincipal,
  launch: LaunchRow,
  current?: JsonRecord,
): Omit<ParticipantResponseData, "state" | "updatedAt"> {
  const mainDiagnosticId =
    input.mainDiagnosticId == null ? null : stringValue(input.mainDiagnosticId, "Diagnostic principal", 100);
  const alternativeDiagnosticId =
    input.alternativeDiagnosticId == null
      ? null
      : stringValue(input.alternativeDiagnosticId, "Diagnostic alternatif", 100);
  const validIds = new Set(launch.case_snapshot.diagnostics.map((row) => row.id));
  for (const diagnosticId of [mainDiagnosticId, alternativeDiagnosticId]) {
    if (diagnosticId && !validIds.has(diagnosticId)) {
      fail(400, "Choisissez un diagnostic parmi les possibilités du PRC.");
    }
  }
  if (mainDiagnosticId && alternativeDiagnosticId && mainDiagnosticId === alternativeDiagnosticId) {
    fail(400, "Les deux hypothèses doivent être différentes.");
  }
  const parseChoices = (value: unknown, field: string): Choice[] =>
    arrayValue(value, field).map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fail(400, "Une justification est invalide.");
      }
      const choice = item as JsonRecord;
      const observationId = stringValue(choice.observationId, "Observation", 100);
      if (!launch.case_snapshot.observations.some((observation) => observation.id === observationId)) {
        fail(400, "Une observation ne correspond pas à ce cas.");
      }
      if (choice.sign !== "+" && choice.sign !== "-") {
        fail(400, "Chaque observation retenue doit avoir un signe + ou −.");
      }
      return { observationId, sign: choice.sign };
    });
  const mainChoices = parseChoices(input.mainChoices, "La justification principale");
  const alternativeChoices = parseChoices(input.alternativeChoices, "La justification alternative");
  for (const choices of [mainChoices, alternativeChoices]) {
    if (choices.length > 5 || new Set(choices.map((choice) => choice.observationId)).size !== choices.length) {
      fail(400, "Chaque hypothèse accepte au maximum cinq observations distinctes.");
    }
  }
  const maxRole = participant.role === "panel" ? 5 : 5;
  if (mainChoices.length > maxRole || alternativeChoices.length > maxRole) {
    fail(400, "Le maximum est de cinq observations par hypothèse.");
  }

  const oldMain = (current?.main_diagnostic_id as string | null) ?? null;
  const oldAlternative = (current?.alternative_diagnostic_id as string | null) ?? null;
  return {
    mainDiagnosticId:
      oldMain && mainDiagnosticId !== oldMain ? mainDiagnosticId : mainDiagnosticId,
    alternativeDiagnosticId:
      oldAlternative && alternativeDiagnosticId !== oldAlternative
        ? alternativeDiagnosticId
        : alternativeDiagnosticId,
    mainChoices: oldMain && mainDiagnosticId !== oldMain ? [] : mainChoices,
    alternativeChoices:
      oldAlternative && alternativeDiagnosticId !== oldAlternative ? [] : alternativeChoices,
  };
}

async function participantContext(request: Request) {
  const participant = await requireParticipant(request);
  const result = await pool.query<LaunchRow>(
    "SELECT * FROM prc_private.launches WHERE id = $1",
    [participant.launchId],
  );
  const launch = result.rows[0];
  if (!launch) fail(404, "Activité introuvable.");
  if (launch.role !== participant.role) fail(403, "Le rôle de cette participation est invalide.");
  return { participant, launch };
}

async function getPanelSnapshot(
  launch: LaunchRow,
  minimumPanelSize: number,
): Promise<PanelSnapshot> {
  const result = await pool.query(
    `SELECT r.participant_id, r.main_diagnostic_id, r.alternative_diagnostic_id,
            r.main_choices, r.alternative_choices
       FROM prc_private.responses r
       JOIN prc_private.participants p ON p.id = r.participant_id
      WHERE r.launch_id = $1 AND r.state = 'submitted' AND p.role = 'panel'
      ORDER BY r.submitted_at`,
    [launch.id],
  );
  const rows = result.rows;
  const totalSubmissions = rows.length;
  const diagnosticCounts = launch.case_snapshot.diagnostics.map((diagnostic) => {
    const mainCount = rows.filter((row) => row.main_diagnostic_id === diagnostic.id).length;
    const alternativeCount = rows.filter(
      (row) => row.alternative_diagnostic_id === diagnostic.id,
    ).length;
    return {
      diagnosticId: diagnostic.id,
      label: diagnostic.label,
      mainCount,
      mainPercent: totalSubmissions ? (mainCount / totalSubmissions) * 100 : 0,
      alternativeCount,
      alternativePercent: totalSubmissions
        ? (alternativeCount / totalSubmissions) * 100
        : 0,
    };
  });
  const distributions: PanelDistribution[] = [];
  for (const role of ["main", "alternative"] as const) {
    for (const diagnostic of launch.case_snapshot.diagnostics) {
      const matching = rows.filter(
        (row) =>
          (role === "main" ? row.main_diagnostic_id : row.alternative_diagnostic_id) ===
          diagnostic.id,
      );
      const observations = launch.case_snapshot.observations.map((observation) => {
        let positive = 0;
        let negative = 0;
        for (const response of matching) {
          const choices = (role === "main"
            ? response.main_choices
            : response.alternative_choices) as Choice[];
          const choice = choices.find((item) => item.observationId === observation.id);
          if (choice?.sign === "+") positive++;
          if (choice?.sign === "-") negative++;
        }
        return {
          observationId: observation.id,
          positive,
          negative,
          notSelected: matching.length - positive - negative,
        };
      });
      distributions.push({
        diagnosticId: diagnostic.id,
        role,
        expertCount: matching.length,
        observations,
        ceiling: computeCeiling(observations),
      });
    }
  }
  return {
    totalSubmissions,
    minimumPanelSize,
    diagnostics: diagnosticCounts,
    distributions,
  };
}

function caseForJoin(launch: LaunchRow) {
  return {
    launchId: launch.id,
    role: launch.role,
    name: launch.name,
    status: launch.status,
    scenario: launch.case_snapshot.scenario,
    instructions: launch.case_snapshot.instructions,
    diagnostics: launch.case_snapshot.diagnostics,
    observations: launch.case_snapshot.observations,
  };
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  const match = (pattern: RegExp) => path.match(pattern);

  if (method === "GET" && path.endsWith("/healthz")) return send({ status: "ok" });

  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !sameOriginMutationAllowed(request)) {
    fail(403, "La requête doit provenir de cette application.");
  }

  if (method === "POST" && path === "/api/auth/login") {
    const input = await body(request);
    const username = stringValue(input.username, "Nom d’utilisateur", 80);
    const password = passwordValue(input.password, "Mot de passe");
    const limit = await enforceLoginLimit(request, username);
    if (!limit.allowed) fail(429, "Trop de tentatives. Réessayez dans quelques minutes.");
    const result = await pool.query(
      `SELECT id, username, role, active, must_change_password, password_hash
         FROM prc_private.users WHERE lower(username) = lower($1)`,
      [username],
    );
    const user = result.rows[0];
    const verified = await verifyPassword(password, user?.password_hash);
    if (!user || !user.active || !verified) {
      await recordFailedLogin(limit.key);
      fail(401, "Nom d’utilisateur ou mot de passe invalide.");
    }
    await clearLoginLimit(limit.key);
    const session = await createTeacherSession(user.id);
    return send(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          active: user.active,
          mustChangePassword: user.must_change_password,
          createdAt: new Date().toISOString(),
        },
        csrfToken: session.csrfToken,
      },
      200,
      cookieHeaders(session.cookie),
    );
  }

  if (method === "POST" && path === "/api/auth/logout") {
    const rawToken = readSessionCookie(request);
    if (rawToken) await pool.query("DELETE FROM prc_private.sessions WHERE token_hash = $1", [hashToken(rawToken)]);
    return send({ ok: true }, 200, cookieHeaders(expiredCookieHeader()));
  }

  if (method === "GET" && path === "/api/auth/me") {
    const principal = await getPrincipal(request);
    if (!principal || principal.kind !== "teacher") fail(401, "Connexion requise.");
    const result = await pool.query(
      "SELECT created_at FROM prc_private.users WHERE id = $1",
      [principal.id],
    );
    return send({
      user: {
        id: principal.id,
        username: principal.username,
        role: principal.role,
        active: principal.active,
        mustChangePassword: principal.mustChangePassword,
        createdAt: result.rows[0]?.created_at ?? new Date().toISOString(),
      },
      csrfToken: principal.csrfToken,
    });
  }

  if (method === "POST" && path === "/api/auth/change-password") {
    const principal = await getPrincipal(request);
    if (!principal || principal.kind !== "teacher") fail(401, "Connexion requise.");
    const input = await body(request);
    const currentPassword = passwordValue(input.currentPassword, "Mot de passe actuel");
    const newPassword = passwordValue(input.newPassword, "Nouveau mot de passe");
    if (newPassword.length < 12) fail(400, "Le nouveau mot de passe doit contenir au moins 12 caractères.");
    const result = await pool.query(
      "SELECT password_hash FROM prc_private.users WHERE id = $1 AND active = true",
      [principal.id],
    );
    if (!(await verifyPassword(currentPassword, result.rows[0]?.password_hash))) {
      fail(401, "Mot de passe actuel invalide.");
    }
    await pool.query(
      "UPDATE prc_private.users SET password_hash = $1, must_change_password = false WHERE id = $2",
      [await passwordHash(newPassword), principal.id],
    );
    await pool.query(
      "DELETE FROM prc_private.sessions WHERE user_id = $1 AND token_hash <> $2",
      [principal.id, principal.sessionHash],
    );
    return send({ ok: true });
  }

  if (path === "/api/teachers" && method === "GET") {
    await requireTeacher(request, true);
    const result = await pool.query(
      `SELECT id, username, role, active, must_change_password, created_at
       FROM prc_private.users ORDER BY created_at`,
    );
    return send(
      result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        role: row.role,
        active: row.active,
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
      })),
    );
  }

  if (path === "/api/teachers" && method === "POST") {
    await requireTeacher(request, true);
    const input = await body(request);
    const username = stringValue(input.username, "Nom d’utilisateur", 80);
    const password = passwordValue(input.password, "Mot de passe");
    if (username.length < 3 || password.length < 12) {
      fail(400, "Le nom d’utilisateur doit contenir trois caractères et le mot de passe douze.");
    }
    const result = await pool.query(
      `INSERT INTO prc_private.users(id, username, role, password_hash, active, must_change_password)
       VALUES ($1, $2, 'teacher', $3, true, true)
       RETURNING id, username, role, active, must_change_password, created_at`,
      [newId(), username, await passwordHash(password)],
    );
    const row = result.rows[0];
    return send(
      {
        id: row.id,
        username: row.username,
        role: row.role,
        active: row.active,
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
      },
      201,
    );
  }

  const teacherMatch = match(/^\/api\/teachers\/([^/]+)$/);
  if (teacherMatch && method === "PATCH") {
    const actor = await requireTeacher(request, true);
    const teacherId = segment(teacherMatch[1]);
    const input = await body(request);
    if (teacherId === actor.id && input.active === false) {
      fail(400, "L’administratrice ne peut pas désactiver son propre compte.");
    }
    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof input.active === "boolean") {
      values.push(input.active);
      updates.push(`active = $${values.length}`);
    }
    if (input.password !== undefined) {
      const password = passwordValue(input.password, "Mot de passe");
      if (password.length < 12) fail(400, "Le mot de passe doit contenir au moins 12 caractères.");
      values.push(await passwordHash(password));
      updates.push(`password_hash = $${values.length}`);
      updates.push("must_change_password = true");
    }
    if (!updates.length) fail(400, "Aucune modification à enregistrer.");
    values.push(teacherId);
    const result = await pool.query(
      `UPDATE prc_private.users SET ${updates.join(", ")} WHERE id = $${values.length}
       RETURNING id, username, role, active, must_change_password, created_at`,
      values,
    );
    const row = result.rows[0];
    if (!row) fail(404, "Compte enseignant introuvable.");
    if (!row.active || input.password !== undefined) {
      await pool.query("DELETE FROM prc_private.sessions WHERE user_id = $1", [teacherId]);
    }
    return send({
      id: row.id,
      username: row.username,
      role: row.role,
      active: row.active,
      mustChangePassword: row.must_change_password,
      createdAt: row.created_at,
    });
  }

  if (method === "GET" && path === "/api/workspace/summary") {
    const teacher = await requireTeacher(request);
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM prc_private.prcs WHERE owner_id = $1) AS prc_count,
         (SELECT count(*)::int FROM prc_private.launches WHERE owner_id = $1 AND status = 'open') AS active_count,
         (SELECT count(*)::int FROM prc_private.participants WHERE launch_id IN
            (SELECT id FROM prc_private.launches WHERE owner_id = $1)) AS participant_count,
         (SELECT count(*)::int FROM prc_private.responses WHERE launch_id IN
            (SELECT id FROM prc_private.launches WHERE owner_id = $1) AND state = 'submitted') AS submission_count`,
      [teacher.id],
    );
    const recent = await pool.query<LaunchRow>(
      `SELECT * FROM prc_private.launches WHERE owner_id = $1
       ORDER BY created_at DESC LIMIT 5`,
      [teacher.id],
    );
    const recentLaunches = await Promise.all(
      recent.rows.map(async (row) => mapLaunch(row, await launchCounts(row.id))),
    );
    return send({
      prcCount: result.rows[0].prc_count,
      activeLaunchCount: result.rows[0].active_count,
      participantCount: result.rows[0].participant_count,
      submissionCount: result.rows[0].submission_count,
      recentLaunches,
    });
  }

  if (method === "GET" && path === "/api/prcs") {
    const teacher = await requireTeacher(request);
    const result = await pool.query(
      `SELECT p.id, p.current_version, p.updated_at, v.name, v.scenario,
              (SELECT count(*)::int FROM prc_private.launches l WHERE l.prc_id = p.id) AS launch_count
         FROM prc_private.prcs p
         JOIN prc_private.prc_versions v ON v.prc_id = p.id AND v.version = p.current_version
        WHERE p.owner_id = $1 ORDER BY p.updated_at DESC`,
      [teacher.id],
    );
    return send(
      result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        scenario: row.scenario,
        status: row.name && row.scenario ? "ready" : "draft",
        version: row.current_version,
        updatedAt: row.updated_at,
        launchCount: row.launch_count,
      })),
    );
  }

  if (method === "POST" && path === "/api/prcs") {
    const teacher = await requireTeacher(request);
    const value = safePrcInput(await body(request));
    const prcId = newId();
    await pool.query(
      `WITH new_prc AS (
        INSERT INTO prc_private.prcs(id, owner_id) VALUES ($1, $2)
      )
      INSERT INTO prc_private.prc_versions
        (prc_id, version, name, scenario, instructions, diagnostics, observations)
      VALUES ($1, 1, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        prcId,
        teacher.id,
        value.name,
        value.scenario,
        value.instructions,
        JSON.stringify(value.diagnostics),
        JSON.stringify(value.observations),
      ],
    );
    return send({
      id: prcId,
      name: value.name,
      scenario: value.scenario,
      status: isComplete(value) ? "ready" : "draft",
      version: 1,
      updatedAt: new Date().toISOString(),
      launchCount: 0,
      instructions: value.instructions,
      diagnostics: value.diagnostics,
      observations: value.observations,
    }, 201);
  }

  const prcMatch = match(/^\/api\/prcs\/([^/]+)$/);
  if (prcMatch && method === "GET") {
    const teacher = await requireTeacher(request);
    const prcId = segment(prcMatch[1]);
    const result = await pool.query(
      `SELECT p.id, p.current_version, p.updated_at, v.*
         FROM prc_private.prcs p
         JOIN prc_private.prc_versions v ON v.prc_id = p.id AND v.version = p.current_version
        WHERE p.id = $1 AND p.owner_id = $2`,
      [prcId, teacher.id],
    );
    const row = result.rows[0];
    if (!row) fail(404, "PRC introuvable.");
    const value: CaseData = {
      name: row.name,
      scenario: row.scenario,
      instructions: row.instructions,
      diagnostics: row.diagnostics,
      observations: row.observations,
    };
    return send({
      ...mapPrc({ ...row, status: isComplete(value) ? "ready" : "draft" }),
      instructions: value.instructions,
      diagnostics: value.diagnostics,
      observations: value.observations,
    });
  }

  if (prcMatch && method === "PUT") {
    const teacher = await requireTeacher(request);
    const prcId = segment(prcMatch[1]);
    let value = safePrcInput(await body(request));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT p.current_version, v.name, v.scenario, v.instructions, v.diagnostics, v.observations
           FROM prc_private.prcs p
           JOIN prc_private.prc_versions v ON v.prc_id = p.id AND v.version = p.current_version
          WHERE p.id = $1 AND p.owner_id = $2 FOR UPDATE OF p`,
        [prcId, teacher.id],
      );
      if (!existing.rows[0]) fail(404, "PRC introuvable.");
      const prior = existing.rows[0];
      value = preserveDiagnosticIds(value, prior.diagnostics);
      const clinicalChanged =
        prior.name !== value.name ||
        prior.scenario !== value.scenario ||
        prior.instructions !== value.instructions ||
        JSON.stringify(prior.diagnostics) !== JSON.stringify(value.diagnostics) ||
        JSON.stringify(prior.observations) !== JSON.stringify(value.observations);
      let version = Number(prior.current_version);
      if (clinicalChanged) {
        version++;
        await client.query(
          `INSERT INTO prc_private.prc_versions
            (prc_id, version, name, scenario, instructions, diagnostics, observations)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
          [
            prcId,
            version,
            value.name,
            value.scenario,
            value.instructions,
            JSON.stringify(value.diagnostics),
            JSON.stringify(value.observations),
          ],
        );
        await client.query(
          "UPDATE prc_private.prcs SET current_version = $1, updated_at = now() WHERE id = $2",
          [version, prcId],
        );
      }
      await client.query("COMMIT");
      return send({
        id: prcId,
        name: value.name,
        scenario: value.scenario,
        status: isComplete(value) ? "ready" : "draft",
        version,
        updatedAt: new Date().toISOString(),
        launchCount: 0,
        instructions: value.instructions,
        diagnostics: value.diagnostics,
        observations: value.observations,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const launchesForPrc = match(/^\/api\/prcs\/([^/]+)\/launches$/);
  if (launchesForPrc && method === "POST") {
    const teacher = await requireTeacher(request);
    const prcId = segment(launchesForPrc[1]);
    const input = await body(request);
    const role = validRole(input.role);
    const prcResult = await pool.query(
      `SELECT p.current_version, v.name, v.scenario, v.instructions, v.diagnostics, v.observations
         FROM prc_private.prcs p
         JOIN prc_private.prc_versions v ON v.prc_id = p.id AND v.version = p.current_version
        WHERE p.id = $1 AND p.owner_id = $2`,
      [prcId, teacher.id],
    );
    const prc = prcResult.rows[0];
    if (!prc) fail(404, "PRC introuvable.");
    const caseSnapshot: CaseData = {
      name: prc.name,
      scenario: prc.scenario,
      instructions: prc.instructions,
      diagnostics: prc.diagnostics,
      observations: prc.observations,
    };
    if (!isComplete(caseSnapshot) || caseSnapshot.diagnostics.length < 2) {
      fail(409, "Complétez le scénario, ajoutez deux diagnostics et au moins une observation avant de lancer le PRC.");
    }
    let referenceId: string | null = null;
    if (role === "students") {
      const reference = await pool.query(
        `SELECT r.id
           FROM prc_private.references r
           JOIN prc_private.launches panel ON panel.id = r.launch_id
          WHERE panel.prc_id = $1 AND panel.case_version = $2
            AND panel.role = 'panel' AND r.status = 'validated'
          ORDER BY r.validated_at DESC LIMIT 1`,
        [prcId, prc.current_version],
      );
      if (!reference.rows[0]) {
        fail(409, "Fermez un panel, générez puis validez un corrigé pour cette version du PRC avant de lancer les étudiants.");
      }
      referenceId = reference.rows[0].id;
    }
    const launchId = newId();
    const roleLabel = role === "panel" ? "Panel" : "Groupe";
    const name =
      optionalString(input.name, 160) ||
      `${roleLabel} · ${new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium" }).format(new Date())}`;
    const code = randomCode();
    const result = await pool.query<LaunchRow>(
      `INSERT INTO prc_private.launches
        (id, prc_id, owner_id, role, name, code, status, case_version, case_snapshot, reference_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8::jsonb, $9)
       RETURNING *`,
      [
        launchId,
        prcId,
        teacher.id,
        role,
        name,
        code,
        prc.current_version,
        JSON.stringify(caseSnapshot),
        referenceId,
      ],
    );
    return send(mapLaunch(result.rows[0]), 201);
  }

  const launchMatch = match(/^\/api\/launches\/([^/]+)$/);
  if (launchMatch && method === "GET") {
    const launchId = segment(launchMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    const counts = await launchCounts(launchId);
    let referenceStatus: string | null = null;
    if (launch.reference_id) {
      const reference = await pool.query(
        "SELECT status FROM prc_private.references WHERE id = $1",
        [launch.reference_id],
      );
      referenceStatus = reference.rows[0]?.status ?? null;
    } else if (launch.role === "panel") {
      const reference = await pool.query(
        "SELECT status FROM prc_private.references WHERE launch_id = $1",
        [launch.id],
      );
      referenceStatus = reference.rows[0]?.status ?? null;
    }
    return send({
      ...mapLaunch(launch, counts),
      reveals: launch.reveals,
      referenceStatus,
    });
  }

  const inviteMatch = match(/^\/api\/launches\/([^/]+)\/invitations$/);
  if (inviteMatch && method === "POST") {
    const launchId = segment(inviteMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    if (launch.role !== "panel") fail(400, "Seul le panel d’experts utilise des invitations.");
    if (launch.status !== "open") fail(409, "Le panel est fermé.");
    const input = await body(request);
    const name = stringValue(input.name, "Nom de l’expert", 160);
    const rawToken = randomBytesBase64();
    const id = newId();
    await pool.query(
      `INSERT INTO prc_private.invitations(id, launch_id, name, token_hash)
       VALUES ($1, $2, $3, $4)`,
      [id, launchId, name, hashToken(rawToken)],
    );
    const base = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "";
    return send(
      {
        id,
        name,
        url: `${base}/join/${launch.code}?invite=${encodeURIComponent(rawToken)}`,
        code: launch.code,
      },
      201,
    );
  }

  const joinCodeMatch = match(/^\/api\/join\/([^/]+)$/);
  if (joinCodeMatch && method === "GET") {
    const code = segment(joinCodeMatch[1]).toUpperCase();
    const result = await pool.query<LaunchRow>(
      "SELECT * FROM prc_private.launches WHERE code = $1",
      [code],
    );
    if (!result.rows[0]) fail(404, "Code d’activité introuvable.");
    return send(caseForJoin(result.rows[0]));
  }

  const joinMatch = match(/^\/api\/launches\/([^/]+)\/join$/);
  if (joinMatch && method === "POST") {
    const launchId = segment(joinMatch[1]);
    const input = await body(request);
    const pseudonym = stringValue(input.pseudonym, "Pseudonyme", 100);
    if (!pseudonym) fail(400, "Saisissez un pseudonyme.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const launchResult = await client.query<LaunchRow>(
        "SELECT * FROM prc_private.launches WHERE id = $1 FOR UPDATE",
        [launchId],
      );
      const launch = launchResult.rows[0];
      if (!launch) fail(404, "Activité introuvable.");
      if (launch.status !== "open") fail(409, "Cette activité n’accepte plus de réponses.");
      let invitationId: string | null = null;
      if (launch.role === "panel") {
        const invitationToken = stringValue(input.invitationToken, "Invitation", 300);
        const invitation = await client.query(
          `SELECT id FROM prc_private.invitations
            WHERE launch_id = $1 AND token_hash = $2 AND used_by IS NULL FOR UPDATE`,
          [launchId, hashToken(invitationToken)],
        );
        if (!invitation.rows[0]) fail(403, "Une invitation individuelle valide est requise pour le panel.");
        invitationId = invitation.rows[0].id;
      } else if (input.invitationToken) {
        // An expert token cannot be converted into student or teacher privileges.
        fail(400, "L’activité étudiante n’utilise pas d’invitation d’expert.");
      }
      const participantId = newId();
      await client.query(
        `INSERT INTO prc_private.participants(id, launch_id, pseudonym, role, invitation_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [participantId, launchId, pseudonym, launch.role, invitationId],
      );
      await client.query(
        `INSERT INTO prc_private.responses(participant_id, launch_id, state)
         VALUES ($1, $2, 'draft')`,
        [participantId, launchId],
      );
      if (invitationId) {
        await client.query(
          "UPDATE prc_private.invitations SET used_by = $1 WHERE id = $2",
          [participantId, invitationId],
        );
      }
      await client.query("COMMIT");
      const session = await createParticipantSession(participantId);
      return send(
        {
          participantId,
          csrfToken: session.csrfToken,
          response: defaultResponse(),
          joinInfo: caseForJoin(launch),
        },
        200,
        cookieHeaders(session.cookie),
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  if (path === "/api/participant/response" && method === "GET") {
    const { participant } = await participantContext(request);
    const result = await pool.query(
      "SELECT * FROM prc_private.responses WHERE participant_id = $1",
      [participant.id],
    );
    return send(mapResponse(result.rows[0]));
  }

  if (path === "/api/participant/response" && method === "PUT") {
    const { participant, launch } = await participantContext(request);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockedLaunch = await client.query(
        "SELECT status FROM prc_private.launches WHERE id = $1 FOR UPDATE",
        [launch.id],
      );
      if (lockedLaunch.rows[0]?.status !== "open") fail(409, "Les réponses sont fermées.");
      const currentResult = await client.query(
        "SELECT * FROM prc_private.responses WHERE participant_id = $1 FOR UPDATE",
        [participant.id],
      );
      const current = currentResult.rows[0];
      if (!current || current.state !== "draft") fail(409, "Cette copie est déjà soumise.");
      const input = await body(request);
      const response = validateParticipantResponse(input, participant, launch, current);
      const result = await client.query(
        `UPDATE prc_private.responses
            SET main_diagnostic_id = $1, alternative_diagnostic_id = $2,
                main_choices = $3::jsonb, alternative_choices = $4::jsonb, updated_at = now()
          WHERE participant_id = $5 AND state = 'draft'
          RETURNING *`,
        [
          response.mainDiagnosticId,
          response.alternativeDiagnosticId,
          JSON.stringify(response.mainChoices),
          JSON.stringify(response.alternativeChoices),
          participant.id,
        ],
      );
      if (!result.rows[0]) fail(409, "Cette copie est déjà soumise.");
      await client.query("COMMIT");
      return send(mapResponse(result.rows[0]));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  if (path === "/api/participant/submit" && method === "POST") {
    const { participant, launch } = await participantContext(request);
    if (launch.status !== "open") fail(409, "Les réponses sont fermées.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const lockedLaunch = await client.query(
        "SELECT status FROM prc_private.launches WHERE id = $1 FOR UPDATE",
        [launch.id],
      );
      if (lockedLaunch.rows[0]?.status !== "open") fail(409, "Les réponses sont fermées.");
      const responseResult = await client.query(
        `SELECT * FROM prc_private.responses
          WHERE participant_id = $1 FOR UPDATE`,
        [participant.id],
      );
      const response = responseResult.rows[0];
      if (!response) fail(404, "Copie introuvable.");
      if (response.state === "submitted") fail(409, "Cette copie est déjà soumise.");
      if (!response.main_diagnostic_id || !response.alternative_diagnostic_id) {
        fail(400, "Choisissez une hypothèse principale et une hypothèse alternative.");
      }
      if (response.main_diagnostic_id === response.alternative_diagnostic_id) {
        fail(400, "Les deux hypothèses doivent être différentes.");
      }
      if (response.main_choices.length < 1 || response.alternative_choices.length < 1) {
        fail(400, "Sélectionnez au moins une observation pour chaque hypothèse.");
      }
      if (participant.role === "panel" && (response.main_choices.length !== 5 || response.alternative_choices.length !== 5)) {
        fail(400, "Le panel doit choisir exactement cinq observations par hypothèse.");
      }
      let score: number | null = null;
      let components: JsonRecord | null = null;
      if (participant.role === "students") {
        if (!launch.reference_id) fail(409, "Le corrigé validé de cette activité est introuvable.");
        const reference = await client.query(
          "SELECT snapshot FROM prc_private.references WHERE id = $1 AND status = 'validated'",
          [launch.reference_id],
        );
        if (!reference.rows[0]) fail(409, "Le corrigé de référence n’est pas validé.");
        const panelSnapshot = reference.rows[0].snapshot as PanelSnapshot;
        const graded = scoreSubmission({
          mainDiagnosticId: response.main_diagnostic_id,
          alternativeDiagnosticId: response.alternative_diagnostic_id,
          mainChoices: response.main_choices,
          alternativeChoices: response.alternative_choices,
          panel: panelSnapshot.distributions,
        });
        score = graded.total;
        components = graded as unknown as JsonRecord;
      }
      const updated = await client.query(
        `UPDATE prc_private.responses
            SET state = 'submitted', submitted_at = now(), updated_at = now(),
                score = $1, score_components = $2::jsonb
          WHERE participant_id = $3 AND state = 'draft'
          RETURNING *`,
        [score, components ? JSON.stringify(components) : null, participant.id],
      );
      if (!updated.rows[0]) fail(409, "Cette copie a déjà été soumise.");
      await client.query("COMMIT");
      return send({
        ...mapResponse(updated.rows[0]),
        submittedAt: new Date(updated.rows[0].submitted_at).toISOString(),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  const closeMatch = match(/^\/api\/launches\/([^/]+)\/close$/);
  if (closeMatch && method === "POST") {
    const launchId = segment(closeMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    if (launch.status !== "open") fail(409, "Cette collecte est déjà fermée.");
    const result = await pool.query<LaunchRow>(
      `UPDATE prc_private.launches SET status = 'closed', closed_at = now()
        WHERE id = $1 AND status = 'open' RETURNING *`,
      [launchId],
    );
    if (!result.rows[0]) fail(409, "Cette collecte vient d’être fermée.");
    return send(mapLaunch(result.rows[0], await launchCounts(launchId)));
  }

  const revealMatch = match(/^\/api\/launches\/([^/]+)\/reveal$/);
  if (revealMatch && method === "POST") {
    const launchId = segment(revealMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    if (launch.status === "open") fail(409, "Fermez la collecte avant de révéler les résultats.");
    const input = await body(request);
    const allowedKeys = [
      "mainDiagnostic",
      "mainArguments",
      "alternativeDiagnostic",
      "alternativeArguments",
      "reference",
    ] as const;
    const reveals = { ...launch.reveals };
    for (const key of allowedKeys) {
      if (typeof input[key] === "boolean") reveals[key] = input[key] as boolean;
    }
    const result = await pool.query<LaunchRow>(
      `UPDATE prc_private.launches SET reveals = $1::jsonb,
          status = CASE WHEN status = 'closed' THEN 'revealed' ELSE status END
        WHERE id = $2 RETURNING *`,
      [JSON.stringify(reveals), launchId],
    );
    return send(mapLaunch(result.rows[0], await launchCounts(launchId)));
  }

  const panelMatch = match(/^\/api\/launches\/([^/]+)\/panel-results$/);
  if (panelMatch && method === "GET") {
    const launchId = segment(panelMatch[1]);
    const launchResult = await pool.query<LaunchRow>(
      "SELECT * FROM prc_private.launches WHERE id = $1 AND role = 'panel'",
      [launchId],
    );
    const launch = launchResult.rows[0];
    if (!launch) fail(404, "Panel introuvable.");
    if (launch.status === "open") fail(409, "Les résultats du panel restent masqués pendant la collecte.");
    const principal = await getPrincipal(request);
    if (!principal) fail(401, "Connexion requise.");
    if (principal.kind === "teacher") {
      if (principal.id !== launch.owner_id) fail(404, "Panel introuvable.");
    } else if (
      principal.launchId !== launch.id ||
      principal.role !== "panel" ||
      !launch.reveals.reference
    ) {
      fail(403, "Le professeur n’a pas encore révélé les résultats du panel.");
    }
    const panel = await getPanelSnapshot(launch, 1);
    return send(panel);
  }

  const generateMatch = match(/^\/api\/launches\/([^/]+)\/reference\/generate$/);
  if (generateMatch && method === "POST") {
    const launchId = segment(generateMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    if (launch.role !== "panel") fail(400, "Le corrigé se génère à partir d’un lancement panel.");
    if (launch.status === "open") fail(409, "Fermez le panel avant de générer le corrigé.");
    const input = await body(request);
    const minimum = Number(input.minimumPanelSize);
    if (!Number.isInteger(minimum) || minimum < 1 || minimum > 100) {
      fail(400, "Le minimum de réponses expertes doit être entre 1 et 100.");
    }
    const current = await pool.query(
      "SELECT id, status FROM prc_private.references WHERE launch_id = $1",
      [launch.id],
    );
    if (current.rows[0]?.status === "validated") {
      fail(409, "Le corrigé est déjà validé et ne peut plus être modifié.");
    }
    const panel = await getPanelSnapshot(launch, minimum);
    if (panel.totalSubmissions < minimum) {
      fail(409, `Le panel compte ${panel.totalSubmissions} réponse(s) définitive(s), mais le minimum demandé est ${minimum}.`);
    }
    const snapshot = {
      ...panel,
      scoring: {
        version: "V1",
        mainDiagnosis: 2,
        mainJustification: 8,
        alternativeDiagnosis: 2,
        alternativeJustification: 8,
        total: 20,
        description:
          "Une hypothèse obtient ses points diagnostiques dès qu’au moins un expert l’a retenue dans le même rôle. Chaque justification vaut 8 × les effectifs concordants / C, où C est la somme des cinq meilleurs effectifs directionnels par observation.",
      },
    };
    let referenceId: string;
    if (current.rows[0]) {
      referenceId = current.rows[0].id;
      await pool.query(
        `UPDATE prc_private.references
            SET minimum_panel_size = $1, panel_size = $2, source_submission_ids = $3,
                snapshot = $4::jsonb, explanation = '', created_at = now()
          WHERE id = $5 AND status = 'draft'`,
        [
          minimum,
          panel.totalSubmissions,
          await submittedIds(launch.id),
          JSON.stringify(snapshot),
          referenceId,
        ],
      );
    } else {
      referenceId = newId();
      await pool.query(
        `INSERT INTO prc_private.references
          (id, launch_id, status, minimum_panel_size, panel_size, source_submission_ids, snapshot)
         VALUES ($1, $2, 'draft', $3, $4, $5, $6::jsonb)`,
        [
          referenceId,
          launch.id,
          minimum,
          panel.totalSubmissions,
          await submittedIds(launch.id),
          JSON.stringify(snapshot),
        ],
      );
    }
    return send({
      status: "draft",
      minimumPanelSize: minimum,
      panelSize: panel.totalSubmissions,
      explanation: "",
      scoring: snapshot.scoring,
      diagnostics: panel.diagnostics,
      distributions: panel.distributions,
    });
  }

  const validateMatch = match(/^\/api\/launches\/([^/]+)\/reference\/validate$/);
  if (validateMatch && method === "POST") {
    const launchId = segment(validateMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    const input = await body(request);
    const explanation = optionalString(input.explanation, 5000);
    const referenceResult = await pool.query(
      "SELECT * FROM prc_private.references WHERE launch_id = $1 FOR UPDATE",
      [launchId],
    );
    const reference = referenceResult.rows[0];
    if (!reference) fail(409, "Générez d’abord le corrigé du panel.");
    if (reference.status === "validated") fail(409, "Ce corrigé est déjà validé.");
    const snapshot = reference.snapshot as PanelSnapshot & { scoring: JsonRecord };
    const impossible = snapshot.distributions.find(
      (row) => row.expertCount > 0 && row.ceiling === 0,
    );
    if (impossible) {
      fail(409, "Validation bloquée : une hypothèse représentée n’a aucune donnée cotable (C = 0).");
    }
    const updated = await pool.query(
      `UPDATE prc_private.references
          SET status = 'validated', explanation = $1, validated_at = now()
        WHERE id = $2 AND status = 'draft'
        RETURNING *`,
      [explanation, reference.id],
    );
    await pool.query(
      "UPDATE prc_private.launches SET reference_id = $1 WHERE id = $2",
      [reference.id, launchId],
    );
    const updatedSnapshot = updated.rows[0].snapshot as PanelSnapshot & { scoring: JsonRecord };
    return send({
      status: "validated",
      minimumPanelSize: updated.rows[0].minimum_panel_size,
      panelSize: updated.rows[0].panel_size,
      explanation,
      scoring: updatedSnapshot.scoring,
      diagnostics: updatedSnapshot.diagnostics,
      distributions: updatedSnapshot.distributions,
    });
  }

  const publishMatch = match(/^\/api\/launches\/([^/]+)\/publish$/);
  if (publishMatch && method === "POST") {
    const launchId = segment(publishMatch[1]);
    const { launch } = await requireOwner(request, launchId);
    if (launch.role !== "students") fail(400, "Seuls les résultats étudiants peuvent être publiés.");
    if (launch.status === "open") fail(409, "Fermez l’activité avant de publier les résultats.");
    const reference = launch.reference_id
      ? await pool.query(
          "SELECT status FROM prc_private.references WHERE id = $1",
          [launch.reference_id],
        )
      : { rows: [] };
    if (reference.rows[0]?.status !== "validated") fail(409, "Un corrigé validé est requis.");
    const counts = await launchCounts(launchId);
    if (!counts.submissions) fail(409, "Aucune copie définitive à publier.");
    const result = await pool.query<LaunchRow>(
      `UPDATE prc_private.launches SET status = 'published', published_at = now()
        WHERE id = $1 RETURNING *`,
      [launchId],
    );
    return send(mapLaunch(result.rows[0], counts));
  }

  const resultsMatch = match(/^\/api\/launches\/([^/]+)\/results$/);
  if (resultsMatch && method === "GET") {
    const launchId = segment(resultsMatch[1]);
    await requireOwner(request, launchId);
    const launchResult = await pool.query<LaunchRow>(
      "SELECT * FROM prc_private.launches WHERE id = $1",
      [launchId],
    );
    const launch = launchResult.rows[0];
    const participants = await pool.query(
      `SELECT p.id, p.pseudonym, p.role, p.created_at, r.state, r.submitted_at,
              r.score, r.score_components
         FROM prc_private.participants p
         LEFT JOIN prc_private.responses r ON r.participant_id = p.id
        WHERE p.launch_id = $1 ORDER BY p.created_at`,
      [launchId],
    );
    const counts = await launchCounts(launchId);
    return send({
      launch: mapLaunch(launch, counts),
      participants: participants.rows.map((row) => ({
        id: row.id,
        pseudonym: row.pseudonym,
        role: row.role,
        state: row.state ?? "draft",
        submittedAt: row.submitted_at,
        score: row.score == null ? null : Number(row.score),
        components: row.score_components,
      })),
      submittedCount: counts.submissions,
      participantCount: counts.participants,
    });
  }

  if (path === "/api/participant/results" && method === "GET") {
    const { participant, launch } = await participantContext(request);
    const result = await pool.query(
      "SELECT * FROM prc_private.responses WHERE participant_id = $1",
      [participant.id],
    );
    const responseRow = result.rows[0];
    const published = launch.role === "students" && launch.status === "published";
    if (!published) {
      return send({
        published: false,
        response: mapResponse(responseRow),
        score: null,
        components: {},
        panel: {},
      });
    }
    let panel: JsonRecord = {};
    if (launch.reference_id) {
      const reference = await pool.query(
        "SELECT snapshot FROM prc_private.references WHERE id = $1",
        [launch.reference_id],
      );
      const snapshot = reference.rows[0]?.snapshot as PanelSnapshot | undefined;
      if (snapshot) {
        const visible: PanelDistribution[] = snapshot.distributions.filter((row) => {
          if (row.role === "main") return launch.reveals.mainDiagnostic || launch.reveals.mainArguments;
          return launch.reveals.alternativeDiagnostic || launch.reveals.alternativeArguments;
        });
        panel = {
          totalSubmissions: snapshot.totalSubmissions,
          diagnostics: launch.reveals.mainDiagnostic || launch.reveals.alternativeDiagnostic
            ? snapshot.diagnostics
            : [],
          distributions: visible,
          referenceVisible: launch.reveals.reference,
        };
      }
    }
    return send({
      published: true,
      response: mapResponse(responseRow),
      score: responseRow.score == null ? 0 : Number(responseRow.score),
      components: responseRow.score_components ?? {},
      panel,
    });
  }

  fail(404, "Cette route n’existe pas.");
}

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytesBase64().replace(/[-_]/g, "");
  return Array.from(bytes)
    .slice(0, 8)
    .map((character) => alphabet[character.charCodeAt(0) % alphabet.length])
    .join("");
}

function randomBytesBase64(): string {
  return randomBytes(24).toString("base64url");
}

async function submittedIds(launchId: string): Promise<string[]> {
  const result = await pool.query(
    `SELECT participant_id FROM prc_private.responses
      WHERE launch_id = $1 AND state = 'submitted'
      ORDER BY submitted_at`,
    [launchId],
  );
  return result.rows.map((row) => row.participant_id as string);
}

export async function handleApiRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname.startsWith("/api/")
      ? url.pathname
      : `/api${url.pathname === "/" ? "" : url.pathname}`;
    const normalized = new Request(new URL(`${path}${url.search}`, url.origin), request);
    return await handle(normalized);
  } catch (error) {
    if (error instanceof ApiError) return send({ error: error.message }, error.status);
    const message = error instanceof Error ? error.message : "Erreur interne.";
    if (message.includes("duplicate key")) return send({ error: "Cette valeur existe déjà." }, 409);
    return send({ error: "Une erreur est survenue. Réessayez." }, 500);
  }
}
