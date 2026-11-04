import { randomUUID } from "node:crypto";
import { pool, type PoolClient } from "@workspace/db";

export class AttendanceError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
type Scope = { kind: "teaching-sessions" | "launches"; id: string };
export type AttendanceActor = {
  scope: Scope;
  teacherId?: string;
  memberId?: string;
  participantId?: string;
  deliveryMode: "synchronous" | "asynchronous";
  role: "panel" | "students";
  finished: boolean;
};
type Dependencies = {
  teacher: (scope: Scope, client: PoolClient) => Promise<AttendanceActor>;
  participant: (client: PoolClient) => Promise<AttendanceActor>;
};
type Register = {
  id: string;
  collect_student_number: boolean;
  opened_at: string;
  closed_at: string | null;
};
type Entry = {
  revision: number;
  id: string;
  full_name: string;
  student_number: string | null;
  status: string;
  source: string;
  teaching_member_id: string | null;
  participant_id: string | null;
  confirmed_at: string | null;
  teacher_marked_at: string | null;
  updated_at: string;
};
const statuses = new Set([
  "unconfirmed",
  "present",
  "late",
  "absent",
  "excused",
]);
const error = (status: number, message: string): never => {
  throw new AttendanceError(status, message);
};
const text = (value: unknown, label: string, max: number, required = true) => {
  if (value == null && !required) return "";
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    error(400, `${label} invalide.`);
  return (value as string).trim().replace(/\s+/g, " ");
};
const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : error(400, "Identifiant de présence invalide.");
const normalName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-CA")
    .replace(/[’‘]/g, "'")
    .trim()
    .replace(/\s+/g, " ");
async function input(request: Request) {
  try {
    const result = await request.json();
    if (result && typeof result === "object" && !Array.isArray(result))
      return result as Record<string, unknown>;
  } catch {}
  return error(400, "Le contenu envoyé doit être un objet JSON.");
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
function own(entry: Entry, actor: AttendanceActor) {
  return actor.memberId
    ? entry.teaching_member_id === actor.memberId
    : entry.participant_id === actor.participantId;
}
function map(entry: Entry) {
  return {
    id: entry.id,
    revision: entry.revision,
    fullName: entry.full_name,
    studentNumber: entry.student_number,
    status: entry.status,
    source: entry.source,
    confirmedAt: entry.confirmed_at,
    teacherMarkedAt: entry.teacher_marked_at,
    updatedAt: entry.updated_at,
    canDelete:
      entry.source === "roster" &&
      !entry.teaching_member_id &&
      !entry.participant_id,
  };
}
async function findRegister(client: PoolClient, scope: Scope) {
  return (
    await client.query<Register>(
      `SELECT * FROM prc_private.attendance_registers WHERE ${scope.kind === "teaching-sessions" ? "teaching_session_id" : "launch_id"}=$1 FOR UPDATE`,
      [scope.id],
    )
  ).rows[0];
}
async function view(
  client: PoolClient,
  actor: AttendanceActor,
  register?: Register,
) {
  const base = {
    installed: true,
    enabled: !!register,
    deliveryMode: actor.deliveryMode,
    role: actor.role,
    sourceFinished: actor.finished,
  };
  if (!register) return base;
  const rows = (
    await client.query<Entry>(
      `SELECT * FROM prc_private.attendance_entries WHERE register_id=$1${actor.teacherId ? "" : actor.memberId ? " AND teaching_member_id=$2" : " AND participant_id=$2"} ORDER BY full_name,id`,
      actor.teacherId
        ? [register.id]
        : [register.id, actor.memberId ?? actor.participantId],
    )
  ).rows;
  return {
    ...base,
    register: {
      id: register.id,
      collectStudentNumber: register.collect_student_number,
      openedAt: register.opened_at,
      closedAt: register.closed_at,
      open: !register.closed_at && !actor.finished,
    },
    ...(actor.teacherId
      ? {
          entries: rows.map(map),
          summary: Object.fromEntries(
            [...statuses].map((status) => [
              status,
              rows.filter((r) => r.status === status).length,
            ]),
          ),
        }
      : { own: rows[0] ? map(rows[0]) : null }),
  };
}

export async function handleAttendance(
  request: Request,
  dependencies: Dependencies,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const participant = path === "/api/participant/attendance";
  const match = path.match(
    /^\/api\/attendance\/(teaching-sessions|launches)\/([^/]+)(?:\/(roster|close|entries\/([^/]+)(\/delete)?))?$/,
  );
  if (!participant && !match) return;
  const method = request.method.toUpperCase();
  if (!["GET", "POST"].includes(method))
    return error(405, "Cette action de présence n’est pas disponible.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actor = participant
      ? await dependencies.participant(client)
      : await dependencies.teacher(
          {
            kind: match![1] as Scope["kind"],
            id: uuid(decodeURIComponent(match![2])),
          },
          client,
        );
    const ready = (
      await client.query(
        "SELECT to_regclass('prc_private.attendance_registers') IS NOT NULL AS ready",
      )
    ).rows[0].ready;
    if (!ready) {
      if (method !== "GET")
        error(
          503,
          "La prise de présences nécessite la mise à jour de l’application et de sa base de données.",
        );
      await client.query("COMMIT");
      return json({ installed: false, enabled: false });
    }
    let register = await findRegister(client, actor.scope);
    if (method === "POST") {
      const data = request.body ? await input(request) : {};
      if (participant) {
        if (!register)
          error(
            409,
            "La prise de présences n’est pas activée pour cette séance.",
          );
        const existing = (
          await client.query<Entry>(
            `SELECT * FROM prc_private.attendance_entries WHERE register_id=$1 AND ${actor.memberId ? "teaching_member_id" : "participant_id"}=$2`,
            [register.id, actor.memberId ?? actor.participantId],
          )
        ).rows[0];
        if (!existing || existing.status === "unconfirmed") {
          if (register.closed_at || actor.finished)
            error(
              409,
              "Les confirmations de présence sont terminées. Le professeur peut corriger votre statut.",
            );
          const fullName = text(data.fullName, "Nom et prénom", 160);
          const studentNumber = register.collect_student_number
            ? text(data.studentNumber, "Matricule", 80)
            : "";
          const rows = (
            await client.query<Entry>(
              "SELECT * FROM prc_private.attendance_entries WHERE register_id=$1 FOR UPDATE",
              [register.id],
            )
          ).rows;
          const numbered = studentNumber
            ? rows.filter(
                (r) =>
                  r.student_number?.toLocaleLowerCase("fr-CA") ===
                  studentNumber.toLocaleLowerCase("fr-CA"),
              )
            : [];
          const named = rows.filter(
            (r) =>
              normalName(r.full_name) === normalName(fullName) &&
              (!studentNumber || !r.student_number),
          );
          const candidates = numbered.length ? numbered : named;
          if (!existing && candidates.length > 1)
            error(
              409,
              "Plusieurs personnes portent ce nom. Le professeur peut confirmer votre présence dans la feuille.",
            );
          const candidate = existing ?? candidates[0];
          if (
            candidate &&
            (candidate.teaching_member_id || candidate.participant_id) &&
            !own(candidate, actor)
          )
            error(
              409,
              "Une confirmation existe déjà pour ces informations. Signalez-le au professeur.",
            );
          if (candidate) {
            const teacherDecision =
              !!candidate.teacher_marked_at &&
              candidate.status !== "unconfirmed";
            await client.query(
              `UPDATE prc_private.attendance_entries SET teaching_member_id=$2,participant_id=$3,student_number=COALESCE(student_number,$4),status=CASE WHEN $5 THEN status ELSE 'present' END,confirmed_at=CASE WHEN $5 THEN confirmed_at ELSE COALESCE(confirmed_at,now()) END,teacher_marked_at=CASE WHEN $5 THEN teacher_marked_at ELSE NULL END,recorded_by=CASE WHEN $5 THEN recorded_by ELSE NULL END,revision=revision+1,updated_at=now() WHERE id=$1`,
              [
                candidate.id,
                actor.memberId ?? null,
                actor.memberId ? null : actor.participantId,
                studentNumber || null,
                teacherDecision,
              ],
            );
          } else {
            await client.query(
              "INSERT INTO prc_private.attendance_entries(id,register_id,teaching_member_id,participant_id,full_name,student_number,status,source,confirmed_at) VALUES($1,$2,$3,$4,$5,$6,'present','participant',now())",
              [
                randomUUID(),
                register.id,
                actor.memberId ?? null,
                actor.memberId ? null : actor.participantId,
                fullName,
                studentNumber || null,
              ],
            );
          }
        }
      } else if (!match![3]) {
        if (
          data.collectStudentNumber !== undefined &&
          typeof data.collectStudentNumber !== "boolean"
        )
          error(400, "Le choix du matricule est invalide.");
        if (!register) {
          register = (
            await client.query<Register>(
              "INSERT INTO prc_private.attendance_registers(id,teaching_session_id,launch_id,collect_student_number,closed_at) VALUES($1,$2,$3,$4,CASE WHEN $5 THEN now() ELSE NULL END) RETURNING *",
              [
                randomUUID(),
                actor.scope.kind === "teaching-sessions"
                  ? actor.scope.id
                  : null,
                actor.scope.kind === "launches" ? actor.scope.id : null,
                data.collectStudentNumber === true,
                actor.finished,
              ],
            )
          ).rows[0];
        } else {
          if (actor.finished)
            error(
              409,
              "La séance est terminée. Vous pouvez encore corriger la feuille de présence.",
            );
          if (
            data.collectStudentNumber !== undefined &&
            data.collectStudentNumber !== register.collect_student_number
          ) {
            const hasEntries = (
              await client.query(
                "SELECT 1 FROM prc_private.attendance_entries WHERE register_id=$1 LIMIT 1",
                [register.id],
              )
            ).rowCount;
            if (hasEntries)
              error(
                409,
                "Le choix du matricule est conservé dès qu’une personne figure dans la feuille.",
              );
          }
          register = (
            await client.query<Register>(
              "UPDATE prc_private.attendance_registers SET closed_at=CASE WHEN $2::boolean IS NULL THEN NULL ELSE closed_at END,collect_student_number=COALESCE($2,collect_student_number) WHERE id=$1 RETURNING *",
              [register.id, data.collectStudentNumber ?? null],
            )
          ).rows[0];
        }
      } else {
        if (!register) error(409, "Activez d’abord la feuille de présence.");
        if (match![3] === "close") {
          register = (
            await client.query<Register>(
              "UPDATE prc_private.attendance_registers SET closed_at=COALESCE(closed_at,now()) WHERE id=$1 RETURNING *",
              [register.id],
            )
          ).rows[0];
        } else if (match![3] === "roster") {
          if (
            !Array.isArray(data.rows) ||
            !data.rows.length ||
            data.rows.length > 500
          )
            error(400, "Ajoutez de 1 à 500 personnes à la fois.");
          const previous = (
            await client.query<Entry>(
              "SELECT * FROM prc_private.attendance_entries WHERE register_id=$1",
              [register.id],
            )
          ).rows;
          const key = (name: string, number: string | null) =>
            number
              ? `number:${number.toLocaleLowerCase("fr-CA")}`
              : `name:${normalName(name)}`;
          const seen = new Set(
            previous.map((row) => key(row.full_name, row.student_number)),
          );
          const added: {
            id: string;
            full_name: string;
            student_number: string | null;
          }[] = [];
          for (const row of data.rows as Record<string, unknown>[]) {
            if (!row || typeof row !== "object")
              error(400, "Une ligne de la liste est invalide.");
            const fullName = text(row.fullName, "Nom et prénom", 160),
              studentNumber = text(row.studentNumber, "Matricule", 80, false);
            if (studentNumber && !register.collect_student_number)
              error(
                400,
                "Cette feuille ne recueille pas de matricule. Importez seulement les noms et prénoms.",
              );
            const identity = key(fullName, studentNumber);
            if (seen.has(identity)) continue;
            seen.add(identity);
            added.push({
              id: randomUUID(),
              full_name: fullName,
              student_number: studentNumber || null,
            });
          }
          if (added.length)
            await client.query(
              "INSERT INTO prc_private.attendance_entries(id,register_id,full_name,student_number,source) SELECT x.id::uuid,$1,x.full_name,x.student_number,'roster' FROM jsonb_to_recordset($2::jsonb) AS x(id text,full_name text,student_number text)",
              [register.id, JSON.stringify(added)],
            );
        } else {
          const entry = (
            await client.query<Entry>(
              "SELECT * FROM prc_private.attendance_entries WHERE id=$1 AND register_id=$2 FOR UPDATE",
              [uuid(match![4]), register.id],
            )
          ).rows[0];
          if (!entry) error(404, "Cette ligne de présence est introuvable.");
          if (data.expectedRevision !== entry.revision)
            error(
              409,
              "La présence a été actualisée. Consultez le statut récent avant de le corriger.",
            );
          if (match![5]) {
            if (
              entry.source !== "roster" ||
              entry.teaching_member_id ||
              entry.participant_id
            )
              error(
                409,
                "Une confirmation participante se corrige avec son statut.",
              );
            await client.query(
              "DELETE FROM prc_private.attendance_entries WHERE id=$1",
              [entry.id],
            );
          } else {
            if (!statuses.has(String(data.status)))
              error(400, "Statut de présence invalide.");
            await client.query(
              "UPDATE prc_private.attendance_entries SET status=$2,teacher_marked_at=now(),recorded_by=$3,confirmed_at=CASE WHEN $2='unconfirmed' THEN NULL ELSE confirmed_at END,revision=revision+1,updated_at=now() WHERE id=$1",
              [entry.id, data.status, actor.teacherId],
            );
          }
        }
      }
    }
    const result = await view(client, actor, register);
    await client.query("COMMIT");
    return json(result);
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  } finally {
    client.release();
  }
}
