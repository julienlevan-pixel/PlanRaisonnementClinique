import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Deliberately never fall back to DATABASE_URL, SUPABASE_DATABASE_URL or PGHOST.
// This runner creates and removes only its own local, disposable database.
const mode = process.argv[2] ?? "integration";
if (!["integration", "load", "browser"].includes(mode)) throw new Error("Usage: node scripts/run-local-checks.mjs [integration|load|browser]");
const host = process.env.PRC_TEST_HOST ?? "127.0.0.1";
if (!(host.startsWith("/") || ["127.0.0.1", "localhost", "::1"].includes(host))) {
  throw new Error("Only a local PostgreSQL host or Unix socket is accepted. Production is never a fallback.");
}
const port = process.env.PRC_TEST_PORT ?? "5432";
const database = `prc_${mode}_${randomUUID().replaceAll("-", "")}_test`;
const root = fileURLToPath(new URL("../", import.meta.url));
const backend = path.join(root, "lib/prc-backend");
const pg = command => process.env.PRC_PG_BIN ? path.join(process.env.PRC_PG_BIN, command) : command;
const env = { ...process.env, PGHOST: host, PGPORT: port };
if (process.env.PRC_TEST_USER) env.PGUSER = process.env.PRC_TEST_USER;
else delete env.PGUSER;
delete env.PGSERVICE;
delete env.PGSERVICEFILE;
delete env.PGPASSWORD;
if (process.env.PRC_TEST_PASSWORD) env.PGPASSWORD = process.env.PRC_TEST_PASSWORD;
const uri = new URL(`postgresql:///${database}`);
uri.searchParams.set("host", host);
uri.searchParams.set("port", port);
if (process.env.PRC_TEST_USER) uri.username = process.env.PRC_TEST_USER;
if (process.env.PRC_TEST_PASSWORD) uri.password = process.env.PRC_TEST_PASSWORD;
env.DATABASE_URL = uri.toString();
env.MIGRATION_DATABASE_URL = uri.toString();
env.PRC_TEST_DATABASE_URL = uri.toString();
env.PRC_LOAD_TEST_CONFIRM = "LOCAL_DISPOSABLE_DATABASE";
delete env.SUPABASE_DATABASE_URL;
if (mode === "browser") {
  env.ADMIN_INITIAL_USERNAME = `e2e-admin-${randomUUID().slice(0, 8)}`;
  env.ADMIN_INITIAL_PASSWORD = randomBytes(24).toString("base64url");
  env.PRC_E2E_ADMIN_USERNAME = env.ADMIN_INITIAL_USERNAME;
  env.PRC_E2E_ADMIN_PASSWORD = env.ADMIN_INITIAL_PASSWORD;
  env.SESSION_SECRET = randomBytes(48).toString("base64url");
  env.PRC_E2E_REAL_DATABASE = "1";
  env.PRC_E2E_API_PORT = process.env.PRC_E2E_API_PORT ?? "4301";
  env.PRC_DEV_API_TARGET = `http://127.0.0.1:${env.PRC_E2E_API_PORT}`;
  env.PLAYWRIGHT_PORT = process.env.PLAYWRIGHT_PORT ?? "4300";
  env.APP_BASE_URL = `http://127.0.0.1:${env.PLAYWRIGHT_PORT}`;
  env.PRC_E2E_BASE_URL = env.APP_BASE_URL;
  env.NODE_ENV = "development";
  env.CONTEXT = "development";
  env.PRC_DATABASE_ENV = "test";
}
const run = (command, args, cwd = root) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, env, stdio: "inherit" });
  child.once("error", reject);
  child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${code}).`)));
});
let created = false;
let server;
try {
  await run(pg("createdb"), ["--host", host, "--port", port, database]);
  created = true;
  await run(pg("psql"), ["--host", host, "--port", port, "--dbname", database, "-v", "ON_ERROR_STOP=1", "-c", `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$;`]);
  await run(process.execPath, ["--import", "tsx", "./src/scripts/migrate.ts"], backend);
  if (mode === "integration") await run(process.execPath, ["--import", "tsx", "--test", "./src/workflow.integration.test.ts"], backend);
  else if (mode === "load") await run(process.execPath, ["--import", "tsx", "./src/tools/load.ts"], backend);
  else {
    await run(process.execPath, ["--import", "tsx", "./src/scripts/init-admin.ts"], backend);
    await run("pnpm", ["--filter", "@workspace/api-server", "run", "build:netlify"]);
    server = spawn(process.execPath, ["scripts/e2e-api-server.mjs"], { cwd: root, env, stdio: "inherit" });
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (server.exitCode !== null) throw new Error("The local API process exited during startup.");
      try {
        const response = await fetch(`${env.PRC_DEV_API_TARGET}/api/healthz`);
        if (response.ok && (await response.json()).status === "ok") { ready = true; break; }
      } catch { /* Wait only for this process's local startup. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error("The local test API did not become ready.");
    await run("pnpm", ["--filter", "@workspace/prc-pharmacie", "run", "test:e2e", "--grep", "real PostgreSQL workflow", "--workers=1"]);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) await new Promise(resolve => {
    server.once("exit", resolve);
    if (!server.kill("SIGTERM")) resolve();
  });
  if (created) await run(pg("dropdb"), ["--host", host, "--port", port, "--force", database]);
}
