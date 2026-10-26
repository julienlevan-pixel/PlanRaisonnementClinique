import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

export function useDisposableDatabase() {
  const value = process.env.PRC_TEST_DATABASE_URL;
  if (!value) throw new Error("Use scripts/run-local-checks.mjs; no production database fallback is allowed.");
  const url = new URL(value);
  const host = url.searchParams.get("host") ?? url.hostname;
  if (!(host.startsWith("/") || ["127.0.0.1", "localhost", "::1"].includes(host)) || !/^\/prc_(integration|load|browser)_[a-f0-9]+_test$/.test(url.pathname)) {
    throw new Error("This check requires a disposable local test database.");
  }
  process.env.DATABASE_URL = value;
  delete process.env.SUPABASE_DATABASE_URL;
  process.env.SESSION_SECRET = randomBytes(48).toString("base64url");
  process.env.APP_BASE_URL = "https://prc.test";
  process.env.NODE_ENV = "production";
}

export async function testServices() {
  useDisposableDatabase();
  const { pool } = await import("@workspace/db");
  const { handleApiRequest } = await import("./handler.js");
  const { passwordHash } = await import("./security.js");
  class Session {
    cookie = "";
    csrfToken = "";
    async call(path: string, method = "GET", data?: unknown, expected: number | number[] = 200): Promise<any> {
      const response = await handleApiRequest(new Request(`https://prc.test/api${path}`, {
        method,
        headers: { origin: "https://prc.test", cookie: this.cookie, "content-type": "application/json", "x-csrf-token": this.csrfToken },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      }));
      const result: any = await response.json();
      assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${method} ${path}: HTTP ${response.status} (${String(result.error ?? "unexpected response")})`);
      const cookie = response.headers.get("set-cookie");
      if (cookie) {
        const entry = cookie.split(";")[0];
        const name = entry.slice(0, entry.indexOf("="));
        this.cookie = [...this.cookie.split("; ").filter(value => value && !value.startsWith(`${name}=`)), entry].join("; ");
      }
      if (result.csrfToken) this.csrfToken = result.csrfToken;
      return result;
    }
  }
  const newUser = async (role = "teacher") => {
    const id = randomUUID();
    const username = `test-${id}`;
    const password = randomBytes(24).toString("base64url");
    await pool.query("INSERT INTO prc_private.users(id,username,role,password_hash,active,must_change_password) VALUES($1,$2,$3,$4,true,false)", [id, username, role, await passwordHash(password)]);
    const session = new Session();
    await session.call("/auth/login", "POST", { username, password });
    return { id, username, password, session };
  };
  const completeCase = () => ({
    name: "Cas technique fictif",
    scenario: "Scénario technique de validation, sans données de patient.",
    instructions: "Deux diagnostics distincts, cinq observations signées pour le panel.",
    diagnostics: ["Hypothèse A", "Hypothèse B", "Hypothèse minoritaire"],
    observations: Array.from({ length: 20 }, (_, i) => ({ id: randomUUID(), text: `Observation fictive ${i + 1}`, category: "Test", position: i })),
  });
  const answer = (prc: any, minority = false, count = 5) => ({
    mainDiagnosticId: prc.diagnostics[minority ? 2 : 0].id,
    alternativeDiagnosticId: prc.diagnostics[1].id,
    mainChoices: prc.observations.slice(0, count).map((o: any, i: number) => ({ observationId: o.id, sign: minority && i === 0 ? "-" : "+" })),
    alternativeChoices: prc.observations.slice(5, 5 + count).map((o: any) => ({ observationId: o.id, sign: "-" })),
  });
  const save = async (session: Session, data: any) => {
    const current = await session.call("/participant/response");
    if (current.joinInfo.role === "panel") data = { ...data,
      mainChoices: data.mainChoices.map((choice: any) => ({ points: 1, ...choice })),
      alternativeChoices: data.alternativeChoices.map((choice: any) => ({ points: 1, ...choice })),
    };
    return session.call("/participant/response", "PUT", { ...data, revision: current.response.revision });
  };
  const createReference = async (teacher: Session, prc: any, experts = 2) => {
    const panel = await teacher.call(`/prcs/${prc.id}/launches`, "POST", { role: "panel" }, 201);
    for (let i = 0; i < experts; i++) {
      const invitation = await teacher.call(`/launches/${panel.id}/invitations`, "POST", { name: `Expert fictif ${i + 1}` }, 201);
      const expert = new Session();
      await expert.call(`/launches/${panel.id}/join`, "POST", { pseudonym: `Expert fictif ${i + 1}`, invitationToken: new URL(invitation.url).searchParams.get("invite") });
      await save(expert, answer(prc, i === 1));
      await expert.call("/participant/submit", "POST", {});
    }
    await teacher.call(`/launches/${panel.id}/close`, "POST", {});
    await teacher.call(`/launches/${panel.id}/reference/generate`, "POST", { minimumPanelSize: experts });
    await teacher.call(`/launches/${panel.id}/reference/validate`, "POST", { explanation: "Explication technique fictive." });
    return panel;
  };
  return { pool, handleApiRequest, passwordHash, Session, newUser, completeCase, answer, save, createReference };
}
