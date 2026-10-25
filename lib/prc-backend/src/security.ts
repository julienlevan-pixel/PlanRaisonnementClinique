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

export function cookieHeader(rawToken: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${rawToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function expiredCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return entry ? decodeURIComponent(entry.slice(SESSION_COOKIE.length + 1)) : null;
}

export async function createTeacherSession(userId: string): Promise<{
  rawToken: string;
  csrfToken: string;
  cookie: string;
}> {
  const rawToken = token();
  const csrfToken = token();
  await pool.query(
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

export async function createParticipantSession(participantId: string): Promise<{
  rawToken: string;
  csrfToken: string;
  cookie: string;
}> {
  const rawToken = token();
  const csrfToken = token();
  await pool.query(
    `INSERT INTO prc_private.sessions(token_hash, participant_id, csrf_token, expires_at)
     VALUES ($1, $2, $3, now() + interval '12 hours')`,
    [hashToken(rawToken), participantId, csrfToken],
  );
  return {
    rawToken,
    csrfToken,
    cookie: cookieHeader(rawToken, PARTICIPANT_SESSION_SECONDS),
  };
}

export async function getPrincipal(
  request: Request,
): Promise<Principal | null> {
  const rawToken = readSessionCookie(request);
  if (!rawToken) return null;
  const result = await pool.query(
    `SELECT s.token_hash, s.csrf_token, s.user_id, s.participant_id,
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
    allowed: !result.rows[0]?.blocked_until ||
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

export async function clearLoginLimit(key: string): Promise<void> {
  await pool.query(`DELETE FROM prc_private.login_attempts WHERE id = $1`, [key]);
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
