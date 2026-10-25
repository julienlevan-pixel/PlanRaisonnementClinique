import assert from "node:assert/strict";
import test from "node:test";
import { deploymentDatabaseError } from "./deployment.js";

test("deployment guard requires explicit database config and isolated preview opt-in", () => {
  const names = [
    "DATABASE_URL",
    "SUPABASE_DATABASE_URL",
    "PRC_DEPLOY_CONTEXT",
    "PRC_DATABASE_ENV",
  ] as const;
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of names) delete process.env[name];
    assert.match(deploymentDatabaseError()!, /DATABASE_URL/);
    process.env.DATABASE_URL = "postgresql:///local_test";
    assert.equal(deploymentDatabaseError(), null);
    process.env.PRC_DEPLOY_CONTEXT = "deploy-preview";
    assert.match(deploymentDatabaseError()!, /base de test/);
    process.env.PRC_DATABASE_ENV = "test";
    assert.equal(deploymentDatabaseError(), null);
    process.env.PRC_DEPLOY_CONTEXT = "production";
    delete process.env.PRC_DATABASE_ENV;
    assert.equal(deploymentDatabaseError(), null);
  } finally {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  }
});
