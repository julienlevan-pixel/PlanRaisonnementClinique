import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

// These HTTP checks do not query PostgreSQL. Allow them to run without secrets.
process.env.DATABASE_URL ??= "postgresql:///prc_netlify_test";
const { default: handler } = await import(
  "../../../artifacts/prc-pharmacie/netlify/functions/api.ts"
);

test("Netlify returns a standard Response for the public health route", async () => {
  const response = await handler(new Request("https://prc.example/api/healthz"));
  assert.ok(response instanceof Response);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("Netlify resolves the API path supplied by the redirect", async () => {
  const response = await handler(
    new Request("https://prc.example/.netlify/functions/api?path=healthz"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("Netlify accepts a redirected path with a leading slash", async () => {
  const response = await handler(
    new Request("https://prc.example/.netlify/functions/api?path=%2Fhealthz"),
  );
  assert.equal(response.status, 200);
});

test("Netlify preserves the POST method, JSON body and same-origin header", async () => {
  const response = await handler(
    new Request("https://prc.example/.netlify/functions/api?path=auth/login", {
      method: "POST",
      headers: {
        origin: "https://prc.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: "teacher", password: null }),
    }),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Mot de passe est invalide." });
});

test("Netlify preserves the rejection of a cross-origin login", async () => {
  const response = await handler(
    new Request("https://prc.example/.netlify/functions/api?path=auth/login", {
      method: "POST",
      headers: { origin: "https://other.example" },
      body: "{}",
    }),
  );
  assert.equal(response.status, 403);
});

test("Netlify returns an authentication error without a session", async () => {
  const response = await handler(
    new Request("https://prc.example/.netlify/functions/api?path=auth/me"),
  );
  assert.equal(response.status, 401);
});

test("Netlify's compiled function runs without the workspace source tree", async (t) => {
  const buildScript = fileURLToPath(
    new URL("../../../artifacts/api-server/build-netlify.mjs", import.meta.url),
  );
  await promisify(execFile)(process.execPath, [buildScript]);
  const directory = await mkdtemp(path.join(tmpdir(), "prc-netlify-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const isolatedFunction = path.join(directory, "api.mjs");
  await copyFile(
    new URL("../../../artifacts/prc-pharmacie/dist/functions/api.mjs", import.meta.url),
    isolatedFunction,
  );
  const { default: compiledHandler } = await import(pathToFileURL(isolatedFunction).href);
  const health = await compiledHandler(
    new Request("https://prc.example/.netlify/functions/api?path=healthz"),
  );
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  const login = await compiledHandler(
    new Request("https://prc.example/.netlify/functions/api?path=auth/login", {
      method: "POST",
      headers: {
        origin: "https://prc.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ username: "teacher", password: null }),
    }),
  );
  assert.equal(login.status, 400);
});
