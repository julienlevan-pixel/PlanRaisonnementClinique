import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { demoCase, DEMO_FIXTURE_VERSION } from "./demo-case.js";
import { demoExperts, demoStudents, type DemoAnswer } from "./demo-responses.js";
import { createParticipantSession, getPrincipal } from "./security.js";
import type { Choice } from "./scoring.js";

type Invoke = (request: Request) => Promise<Response>;
type Installation = {
  owner_id: string;
  prc_id: string;
  panel_launch_id: string | null;
  student_launch_id: string | null;
  fixture_version: string;
  status: "building" | "pending" | "complete" | "failed";
  lease_token: string | null;
  updated_at: Date;
};

export class DemoSetupError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface DemoResult {
  prcId: string;
  panelLaunchId: string | null;
  studentLaunchId: string | null;
  demonstrationLabel: string;
  pending: boolean;
  progress: {
    expertsSubmitted: number;
    totalExperts: number;
    studentsSubmitted: number;
    totalStudents: number;
  };
}

async function result(row: Installation): Promise<DemoResult> {
  if (row.status === "complete" && (!row.panel_launch_id || !row.student_launch_id)) {
    throw new DemoSetupError(409, "La démonstration est encore en préparation.");
  }
  const counts = await pool.query<{ role: string; submitted: number }>(
    `SELECT p.role, count(*) FILTER (WHERE r.state = 'submitted')::int AS submitted
       FROM prc_private.participants p JOIN prc_private.responses r ON r.participant_id = p.id
      WHERE p.launch_id = ANY($1::uuid[]) GROUP BY p.role`,
    [[row.panel_launch_id, row.student_launch_id].filter(Boolean)],
  );
  return {
    prcId: row.prc_id,
    panelLaunchId: row.panel_launch_id,
    studentLaunchId: row.student_launch_id,
    demonstrationLabel: demoCase.demonstrationLabel,
    pending: row.status !== "complete",
    progress: {
      expertsSubmitted: counts.rows.find(count => count.role === "panel")?.submitted ?? 0,
      totalExperts: demoExperts.length,
      studentsSubmitted: counts.rows.find(count => count.role === "students")?.submitted ?? 0,
      totalStudents: demoStudents.filter(student => student.submitted).length,
    },
  };
}

/**
 * Create one isolated, fictitious demonstration for this teacher. Clinical case
 * insertion is atomic; expert submissions, reference generation and grading use
 * the same HTTP handlers as ordinary activities. No grade is seeded directly.
 */
export async function ensureTeacherDemo(request: Request, invoke: Invoke): Promise<DemoResult> {
  const startedAt = Date.now();
  const teacher = await getPrincipal(request);
  if (!teacher || teacher.kind !== "teacher") throw new DemoSetupError(401, "Connexion enseignante requise.");
  if (teacher.mustChangePassword) throw new DemoSetupError(403, "Changez d’abord votre mot de passe initial.");
  const lease = randomUUID();
  const client = await pool.connect();
  let installation: Installation;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`prc-demo:${teacher.id}`]);
    const current = await client.query<Installation>("SELECT * FROM prc_private.demo_installations WHERE owner_id = $1 FOR UPDATE", [teacher.id]);
    if (current.rows[0]?.status === "complete") {
      installation = current.rows[0];
    } else if (current.rows[0]) {
      const row = current.rows[0];
      if (row.status === "building" && Date.now() - new Date(row.updated_at).getTime() < 60_000) {
        throw new DemoSetupError(409, "Votre démonstration est déjà en préparation. Réessayez dans quelques instants.");
      }
      if (row.fixture_version !== DEMO_FIXTURE_VERSION) {
        throw new DemoSetupError(409, "Une ancienne démonstration incomplète nécessite une vérification avant reprise.");
      }
      const updated = await client.query<Installation>(
        "UPDATE prc_private.demo_installations SET status = 'building', lease_token = $1, updated_at = now() WHERE owner_id = $2 RETURNING *",
        [lease, teacher.id],
      );
      installation = updated.rows[0];
    } else {
      const prcId = randomUUID();
      await client.query("INSERT INTO prc_private.prcs(id, owner_id, is_demo) VALUES ($1, $2, true)", [prcId, teacher.id]);
      await client.query(
        `INSERT INTO prc_private.prc_versions(prc_id, version, name, scenario, instructions, diagnostics, observations)
         VALUES ($1, 1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [prcId, demoCase.name, demoCase.scenario, demoCase.instructions, JSON.stringify(demoCase.diagnostics), JSON.stringify(demoCase.observations)],
      );
      const created = await client.query<Installation>(
        `INSERT INTO prc_private.demo_installations(owner_id, prc_id, fixture_version, status, lease_token)
         VALUES ($1, $2, $3, 'building', $4) RETURNING *`,
        [teacher.id, prcId, DEMO_FIXTURE_VERSION, lease],
      );
      installation = created.rows[0];
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (installation.status === "complete") return result(installation);

  const origin = new URL(request.url).origin;
  const teacherCookie = request.headers.get("cookie") ?? "";
  const temporarySessions: string[] = [];
  let lastHeartbeat = Date.now();
  let completedParticipants = 0;
  const call = async (path: string, method = "GET", data?: unknown, cookie = teacherCookie, csrf = teacher.csrfToken) => {
    if (Date.now() - lastHeartbeat >= 4_000) {
      const heartbeat = await pool.query("UPDATE prc_private.demo_installations SET updated_at = now() WHERE owner_id = $1 AND lease_token = $2 AND status = 'building'", [teacher.id, lease]);
      if (!heartbeat.rowCount) throw new DemoSetupError(409, "Une autre préparation a repris cette démonstration.");
      lastHeartbeat = Date.now();
    }
    const response = await invoke(new Request(new URL(path, origin), {
      method,
      headers: { origin, "content-type": "application/json", cookie, "x-csrf-token": csrf },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }));
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok) {
      throw new DemoSetupError(response.status, typeof payload.error === "string" ? payload.error : "La préparation de l’exemple a été interrompue. Réessayez.");
    }
    return { data: payload, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? cookie };
  };

  const ensureLaunch = async (role: "panel" | "students", column: "panel_launch_id" | "student_launch_id") => {
    if (installation[column]) return installation[column]!;
    const prior = await pool.query<{ id: string }>(
      "SELECT id FROM prc_private.launches WHERE prc_id = $1 AND role = $2 AND is_trial = false ORDER BY created_at LIMIT 1",
      [installation.prc_id, role],
    );
    const id = prior.rows[0]?.id ?? (await call(`/api/prcs/${installation.prc_id}/launches`, "POST", { role, name: demoCase.name })).data.id as string;
    await pool.query(`UPDATE prc_private.demo_installations SET ${column} = $1, updated_at = now() WHERE owner_id = $2 AND lease_token = $3`, [id, teacher.id, lease]);
    installation[column] = id;
    return id;
  };

  const addAnswer = async (launchId: string, role: "panel" | "students", index: number, answer: DemoAnswer, submitted: boolean) => {
    const pseudonym = `${role === "panel" ? "Expert fictif" : "Étudiant fictif"} ${String(index + 1).padStart(2, "0")}`;
    const prior = await pool.query<{ id: string; state: string; main_diagnostic_id: string | null; alternative_diagnostic_id: string | null; main_choices: Choice[]; alternative_choices: Choice[] }>(
      `SELECT p.id, r.state, r.main_diagnostic_id, r.alternative_diagnostic_id, r.main_choices, r.alternative_choices FROM prc_private.participants p
       JOIN prc_private.responses r ON r.participant_id = p.id
       WHERE p.launch_id = $1 AND p.pseudonym = $2 ORDER BY p.created_at LIMIT 1`,
      [launchId, pseudonym],
    );
    if (prior.rows[0]?.state === "submitted") return false;
    const existing = prior.rows[0];
    const sameChoices = (stored: Choice[], expected: Choice[]) => stored.length === expected.length &&
      expected.every(choice => stored.some(row => row.observationId === choice.observationId && row.sign === choice.sign));
    if (!submitted && existing?.main_diagnostic_id === answer.mainDiagnosticId && existing.alternative_diagnostic_id === answer.alternativeDiagnosticId &&
        sameChoices(existing.main_choices, answer.mainChoices) && sameChoices(existing.alternative_choices, answer.alternativeChoices)) return false;
    let participantId: string;
    if (prior.rows[0]) {
      participantId = prior.rows[0].id;
    } else {
      let invitationToken: string | undefined;
      if (role === "panel") {
        const invitation = await call(`/api/launches/${launchId}/invitations`, "POST", { name: pseudonym });
        invitationToken = new URL(String(invitation.data.url), origin).searchParams.get("invite") ?? undefined;
      }
      const joined = await call(`/api/launches/${launchId}/join`, "POST", { pseudonym, ...(invitationToken ? { invitationToken } : {}) }, "");
      participantId = joined.data.participantId as string;
      // The join response created a session too. Remove it after seeding; the
      // fixture never exposes resume cookies or gives anyone teacher rights.
      const joinedToken = joined.cookie.split("=").slice(1).join("=");
      if (joinedToken) temporarySessions.push(joinedToken);
    }
    const session = await createParticipantSession(participantId);
    temporarySessions.push(session.rawToken);
    const current = await call("/api/participant/response", "GET", undefined, session.cookie.split(";")[0], session.csrfToken);
    const revision = Number(current.data.response?.revision ?? 0);
    await call("/api/participant/response", "PUT", { ...answer, revision, expectedRevision: revision }, session.cookie.split(";")[0], session.csrfToken);
    if (submitted) await call("/api/participant/submit", "POST", {}, session.cookie.split(";")[0], session.csrfToken);
    return true;
  };

  // Explicit checkpoints keep each invocation comfortably below the serverless
  // execution limit. A subsequent POST resumes these same persisted sources.
  const checkpoint = async () => {
    if (completedParticipants === 0 || (completedParticipants < 4 && Date.now() - startedAt < 10_000)) return null;
    const paused = await pool.query<Installation>(
      "UPDATE prc_private.demo_installations SET status = 'pending', lease_token = NULL, updated_at = now() WHERE owner_id = $1 AND lease_token = $2 AND status = 'building' RETURNING *",
      [teacher.id, lease],
    );
    if (!paused.rows[0]) throw new DemoSetupError(409, "Une autre préparation a repris cette démonstration.");
    return result(paused.rows[0]);
  };

  try {
    const panelId = await ensureLaunch("panel", "panel_launch_id");
    let panel = (await call(`/api/launches/${panelId}`)).data;
    if (panel.status === "open") {
      for (const [index, answer] of demoExperts.entries()) {
        if (await addAnswer(panelId, "panel", index, answer, true)) completedParticipants++;
        const paused = await checkpoint();
        if (paused) return paused;
      }
      await call(`/api/launches/${panelId}/close`, "POST", {});
      panel = (await call(`/api/launches/${panelId}`)).data;
    }
    if (panel.referenceStatus !== "validated") {
      await call(`/api/launches/${panelId}/reference/generate`, "POST", { minimumPanelSize: demoExperts.length });
      await call(`/api/launches/${panelId}/reference/validate`, "POST", {
        explanation: "Démonstration — données fictives. Cette référence a été calculée à partir des dix copies expertes simulées par le moteur habituel. Elle conserve les hypothèses et signes minoritaires. Le lien temporel avec le ramipril, les symptômes ORL et les symptômes de reflux soutiennent des discussions distinctes ; un choix non crédité n’est pas automatiquement une erreur clinique.",
      });
    }
    const reveals = { mainDiagnostic: true, mainArguments: true, alternativeDiagnostic: true, alternativeArguments: true, reference: true };
    await call(`/api/launches/${panelId}/reveal`, "POST", reveals);
    const studentsId = await ensureLaunch("students", "student_launch_id");
    const students = (await call(`/api/launches/${studentsId}`)).data;
    if (students.status === "open") {
      for (const [index, student] of demoStudents.entries()) {
        if (await addAnswer(studentsId, "students", index, student.answer, student.submitted)) completedParticipants++;
        const paused = await checkpoint();
        if (paused) return paused;
      }
      await call(`/api/launches/${studentsId}/close`, "POST", {});
    }
    await call(`/api/launches/${studentsId}/reveal`, "POST", reveals);
    if (students.status !== "published") await call(`/api/launches/${studentsId}/publish`, "POST", {});
    const completed = await pool.query<Installation>(
      "UPDATE prc_private.demo_installations SET status = 'complete', lease_token = NULL, updated_at = now() WHERE owner_id = $1 AND lease_token = $2 AND status = 'building' RETURNING *",
      [teacher.id, lease],
    );
    if (!completed.rows[0]) throw new DemoSetupError(409, "Une autre préparation a repris cette démonstration.");
    return result(completed.rows[0]);
  } catch (error) {
    await pool.query("UPDATE prc_private.demo_installations SET status = 'failed', lease_token = NULL, updated_at = now() WHERE owner_id = $1 AND lease_token = $2", [teacher.id, lease]);
    throw error;
  } finally {
    if (temporarySessions.length) {
      const { hashToken } = await import("./security.js");
      await pool.query("DELETE FROM prc_private.sessions WHERE token_hash = ANY($1::text[])", [temporarySessions.map(hashToken)]);
    }
  }
}
