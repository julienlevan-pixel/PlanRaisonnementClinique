import assert from "node:assert/strict";
import test from "node:test";

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
