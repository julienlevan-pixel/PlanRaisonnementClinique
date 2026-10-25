import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { availableParallelism } from "node:os";
import { testServices } from "../test-support.js";

if (process.env.PRC_LOAD_TEST_CONFIRM !== "LOCAL_DISPOSABLE_DATABASE") {
  throw new Error("Run scripts/run-local-checks.mjs load. This load must never target production.");
}
const users = Number(process.env.PRC_LOAD_USERS ?? 300);
const concurrency = Number(process.env.PRC_LOAD_CONCURRENCY ?? 50);
if (!Number.isInteger(users) || users < 1 || users > 1000 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 300) {
  throw new Error("Invalid load parameters: 1–1000 users, 1–300 concurrent participants.");
}
const services = await testServices();
const watchdog = setTimeout(() => {
  console.error("Load exceeded two minutes; possible pool starvation or deadlock. No success is claimed.");
  process.exit(1);
}, 120_000);
watchdog.unref();
const { pool, Session, newUser, completeCase, answer, save, createReference } = services;
let sqlQueries = 0;
let maxConnections = 0;
let maxBusyConnections = 0;
const seen = new WeakSet<object>();
pool.on("acquire", (client: any) => {
  if (!seen.has(client)) {
    seen.add(client);
    const original = client.query;
    client.query = function (this: any, ...args: any[]) { sqlQueries++; return original.apply(this, args); };
  }
  maxConnections = Math.max(maxConnections, pool.totalCount);
  maxBusyConnections = Math.max(maxBusyConnections, pool.totalCount - pool.idleCount);
});
const latency: Record<string, number[]> = {};
const errors: Array<{ stage: string; error: string }> = [];
async function timed<T>(stage: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try { return await work(); }
  catch (error) { errors.push({ stage, error: error instanceof Error ? error.name : "UnknownError" }); throw error; }
  finally { (latency[stage] ??= []).push(performance.now() - start); }
}
const quantiles = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => Number((sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? 0).toFixed(2));
  return { requests: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), p99Ms: at(0.99), maxMs: Number((sorted.at(-1) ?? 0).toFixed(2)) };
};
try {
  const owner = await newUser();
  const prc = await owner.session.call("/prcs", "POST", completeCase(), 201);
  await createReference(owner.session, prc, 2);
  const launch = await owner.session.call(`/prcs/${prc.id}/launches`, "POST", { role: "students" }, 201);
  const input = answer(prc);
  sqlQueries = 0;
  const started = performance.now();
  let next = 0;
  let completed = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, users) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= users) break;
      const participant = new Session();
      try {
        const joinInput = { pseudonym: `Load student ${index + 1}`, joinKey: randomUUID() };
        const joined = await timed("join", () => participant.call(`/launches/${launch.id}/join`, "POST", joinInput));
        const resumed = await timed("retryJoinLostAck", () => new Session().call(`/launches/${launch.id}/join`, "POST", joinInput));
        assert.equal(resumed.participantId, joined.participantId);
        const first = await timed("save", () => participant.call("/participant/response", "PUT", { ...input, revision: 0 }));
        await timed("state", () => participant.call("/participant/state"));
        await timed("retryLostAck", () => participant.call("/participant/response", "PUT", { ...input, revision: 0 }));
        await timed("save", () => participant.call("/participant/response", "PUT", { ...input, mainChoices: input.mainChoices.slice(0, 4), revision: first.response.revision }));
        await timed("submit", () => participant.call("/participant/submit", "POST", {}));
        await timed("retrySubmit", () => participant.call("/participant/submit", "POST", {}));
        completed++;
      } catch { /* Count and report failures; never conceal them with retries. */ }
    }
  }));
  const durationMs = performance.now() - started;
  const counts = await pool.query(`SELECT count(*)::int AS responses, count(DISTINCT participant_id)::int AS distinct_participants,
      count(*) FILTER (WHERE state='submitted')::int AS submitted, count(*) FILTER (WHERE state='submitted' AND score IS NULL)::int AS missing_scores
    FROM prc_private.responses WHERE launch_id=$1`, [launch.id]);
  const result = counts.rows[0];
  const version = (await pool.query("SHOW server_version")).rows[0].server_version;
  const report = {
    timestamp: new Date().toISOString(),
    target: "disposable local PostgreSQL; in-process HTTP Request/Response handler; one serverless-style pool",
    production: false,
    runtime: { node: process.version, platform: process.platform, arch: process.arch, availableCpuThreads: availableParallelism(), postgres: version },
    users, concurrency, completed, durationMs: Number(durationMs.toFixed(2)),
    requests: Object.values(latency).reduce((sum, values) => sum + values.length, 0),
    sqlQueries, maxConnections, maxBusyConnections,
    lostResponses: users - result.responses,
    duplicateResponses: result.responses - result.distinct_participants,
    submitted: result.submitted, missingScores: result.missing_scores,
    errors: errors.length,
    stages: Object.fromEntries(Object.entries(latency).map(([stage, values]) => [stage, quantiles(values)])),
    limitations: ["No Internet/TLS/Netlify cold-start overhead", "One application instance with pool.max=2", "This is not a proof of production capacity on Netlify/Supabase"],
  };
  const directory = fileURLToPath(new URL("../../../../.local/validation/", import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}load-results.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  assert.equal(errors.length, 0, "Load requests failed; inspect report stages.");
  assert.equal(completed, users);
  assert.equal(result.responses, users);
  assert.equal(result.submitted, users);
  assert.equal(result.missing_scores, 0);
  assert.equal(result.responses, result.distinct_participants);
} finally { clearTimeout(watchdog); await pool.end(); }
