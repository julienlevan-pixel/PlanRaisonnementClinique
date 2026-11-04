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
  available: boolean;
  finished: boolean;
  endedAt: string | null;
};
type Dependencies = {
  teacher: (scope: Scope, client: PoolClient) => Promise<AttendanceActor>;
  participant: (client: PoolClient) => Promise<AttendanceActor>;
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

/** First successful registration, serialized with closure by the existing join routes. */
export async function handleAttendance(
  request: Request,
  dependencies: Dependencies,
): Promise<Response | undefined> {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const participant = path === "/api/participant/attendance";
  const match = path.match(
    /^\/api\/attendance\/(teaching-sessions|launches)\/([^/]+)$/,
  );
  if (!participant && !match) return;
  if (request.method !== "GET")
    throw new AttendanceError(
      405,
      "La présence est enregistrée automatiquement à l’entrée dans la séance.",
    );
  if (
    match &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      match[2],
    )
  )
    throw new AttendanceError(400, "Identifiant de séance invalide.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const actor = participant
      ? await dependencies.participant(client)
      : await dependencies.teacher(
          { kind: match![1] as Scope["kind"], id: match![2] },
          client,
        );
    const base = {
      available: actor.available,
      finished: actor.finished,
      endedAt: actor.endedAt,
    };
    let entries: { id: string; fullName: string; joinedAt: string }[] = [];
    if (actor.available) {
      const lesson = actor.scope.kind === "teaching-sessions";
      const rows = await client.query<{
        id: string;
        full_name: string;
        joined_at: string;
      }>(
        `SELECT id,pseudonym AS full_name,created_at AS joined_at FROM prc_private.${lesson ? "teaching_members" : "participants"}
         WHERE ${lesson ? "session_id" : "launch_id"}=$1
         ${actor.teacherId ? "" : "AND id=$2"} ORDER BY lower(pseudonym),created_at,id`,
        actor.teacherId
          ? [actor.scope.id]
          : [actor.scope.id, actor.memberId ?? actor.participantId],
      );
      entries = rows.rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        joinedAt: row.joined_at,
      }));
    }
    await client.query("COMMIT");
    return json(
      actor.teacherId
        ? { ...base, entries, count: entries.length }
        : { ...base, own: entries[0] ?? null },
    );
  } catch (cause) {
    await client.query("ROLLBACK");
    throw cause;
  } finally {
    client.release();
  }
}
