import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { pool } from "@workspace/db";

const scryptAsync = promisify(scrypt);
const SESSION_COOKIE = "prc_session";
const TEACHER_SESSION_SECONDS = 60 * 60 * 12;
const PARTICIPANT_SESSION_SECONDS = 60 * 60 * 12;

export interface TeacherPrincipal {
  kind: "teacher";
  id: string;
  username: string;
  role: "admin" | "teacher";
  active: boolean;
  mustChangePassword: boolean;
  sessionHash: string;
  csrfToken: string;
}

export interface ParticipantPrincipal {
  teachingSessionId?: string;
  teachingMemberId?: string;
  kind: "participant";
  id: string;
  launchId: string;
  role: "panel" | "students";
  pseudonym: string;
  sessionHash: string;
  csrfToken: string;
}

export type Principal = TeacherPrincipal | ParticipantPrincipal;

export function newId(): string {
  return randomUUID();
}

export function token(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rateKey(request: Request, username: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required.");
  const proxyIp =
    request.headers.get("x-nf-client-connection-ip") ??
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const ip = proxyIp || "unknown";
  return createHmac("sha256", secret)
    .update(`${ip}|${username.toLowerCase()}`)
    .digest("hex");
}

export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) {
    await scryptAsync(password, "prc-invalid-account-salt", 64);
    return false;
  }
  const [algorithm, salt, hex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function cookieHeader(
  rawToken: string,
  maxAge: number,
  name = SESSION_COOKIE,
): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function expiredCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionCookie(
  request: Request,
  name = SESSION_COOKIE,
): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

export async function createTeacherSession(
  userId: string,
  executor: {
    query: (text: string, values?: unknown[]) => Promise<unknown>;
  } = pool,
): Promise<{
  rawToken: string;
  csrfToken: string;
  cookie: string;
}> {
  const rawToken = token();
  const csrfToken = token();
  await executor.query(
    `INSERT INTO prc_private.sessions(token_hash, user_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + interval '12 hours')`,
    [hashToken(rawToken), userId, csrfToken],
  );
  return {
    rawToken,
    csrfToken,
    cookie: cookieHeader(rawToken, TEACHER_SESSION_SECONDS),
  };
}

export async function createParticipantSession(
  participantId: string,
  executor: {
    query: (text: string, values?: unknown[]) => Promise<unknown>;
  } = pool,
): Promise<{
  rawToken: string;
  csrfToken: string;
  cookie: string;
}> {
  const rawToken = token();
  const csrfToken = token();
  await executor.query(
    `INSERT INTO prc_private.sessions(token_hash, participant_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + interval '12 hours')`,
    [hashToken(rawToken), participantId, csrfToken],
  );
  return {
    rawToken,
    csrfToken,
    cookie: cookieHeader(
      rawToken,
      PARTICIPANT_SESSION_SECONDS,
      "prc_participant_session",
    ),
  };
}

export async function getPrincipal(
  request: Request,
): Promise<Principal | null> {
  const participantPath = new URL(request.url).pathname.startsWith(
    "/api/participant",
  );
  const rawToken = participantPath
    ? (readSessionCookie(request, "prc_participant_session") ??
      readSessionCookie(request))
    : (readSessionCookie(request) ??
      readSessionCookie(request, "prc_participant_session"));
  if (!rawToken) return null;
  const result = await pool.query(
    `SELECT s.token_hash, s.csrf_token, s.user_id, s.participant_id,
            to_jsonb(s)->>'teaching_member_id' AS teaching_member_id,
            u.username, u.role AS user_role, u.active, u.must_change_password,
            p.launch_id, p.role AS participant_role, p.pseudonym
       FROM prc_private.sessions s
       LEFT JOIN prc_private.users u ON u.id = s.user_id
       LEFT JOIN prc_private.participants p ON p.id = s.participant_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(rawToken)],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.user_id) {
    if (!row.active) return null;
    return {
      kind: "teacher",
      id: row.user_id,
      username: row.username,
      role: row.user_role,
      active: row.active,
      mustChangePassword: row.must_change_password,
      sessionHash: row.token_hash,
      csrfToken: row.csrf_token,
    };
  }
  if (row.teaching_member_id) {
    const current = await pool.query(
      `SELECT m.id AS member_id,m.session_id,m.pseudonym,p.id,p.launch_id,p.role
       FROM prc_private.teaching_members m JOIN prc_private.teaching_sessions ts ON ts.id=m.session_id
       JOIN prc_private.teaching_session_cases c ON c.session_id=ts.id AND c.position=ts.current_position
       JOIN prc_private.participants p ON p.teaching_member_id=m.id AND p.launch_id=c.launch_id
       WHERE m.id=$1`,
      [row.teaching_member_id],
    );
    const member = current.rows[0];
    if (!member) return null;
    return {
      kind: "participant",
      id: member.id,
      launchId: member.launch_id,
      role: member.role,
      pseudonym: member.pseudonym,
      teachingSessionId: member.session_id,
      teachingMemberId: member.member_id,
      sessionHash: row.token_hash,
      csrfToken: row.csrf_token,
    };
  }
  if (!row.participant_id || !row.launch_id) return null;
  return {
    kind: "participant",
    id: row.participant_id,
    launchId: row.launch_id,
    role: row.participant_role,
    pseudonym: row.pseudonym,
    sessionHash: row.token_hash,
    csrfToken: row.csrf_token,
  };
}

export async function enforceLoginLimit(
  request: Request,
  username: string,
): Promise<{ allowed: boolean; key: string }> {
  const key = rateKey(request, username);
  const result = await pool.query(
    `SELECT blocked_until FROM prc_private.login_attempts WHERE id = $1`,
    [key],
  );
  return {
    allowed:
      !result.rows[0]?.blocked_until ||
      new Date(result.rows[0].blocked_until).getTime() <= Date.now(),
    key,
  };
}

export async function recordFailedLogin(key: string): Promise<void> {
  await pool.query(
    `INSERT INTO prc_private.login_attempts(id, count, window_started_at, blocked_until)
     VALUES ($1, 1, now(), NULL)
     ON CONFLICT (id) DO UPDATE SET
       count = CASE
         WHEN prc_private.login_attempts.window_started_at < now() - interval '15 minutes' THEN 1
         ELSE prc_private.login_attempts.count + 1
       END,
       window_started_at = CASE
         WHEN prc_private.login_attempts.window_started_at < now() - interval '15 minutes' THEN now()
         ELSE prc_private.login_attempts.window_started_at
       END,
       blocked_until = CASE
         WHEN prc_private.login_attempts.window_started_at < now() - interval '15 minutes' THEN NULL
         WHEN prc_private.login_attempts.count + 1 >= 10 THEN now() + interval '15 minutes'
         ELSE prc_private.login_attempts.blocked_until
       END`,
    [key],
  );
}

export async function clearLoginLimit(
  key: string,
  executor: {
    query: (text: string, values?: unknown[]) => Promise<unknown>;
  } = pool,
): Promise<void> {
  await executor.query(`DELETE FROM prc_private.login_attempts WHERE id = $1`, [
    key,
  ]);
}

export function sameOriginMutationAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const fetchSite = request.headers.get("sec-fetch-site");
    return (
      originUrl.host === requestUrl.host &&
      (fetchSite == null || fetchSite === "same-origin" || fetchSite === "none")
    );
  } catch {
    return false;
  }
}
