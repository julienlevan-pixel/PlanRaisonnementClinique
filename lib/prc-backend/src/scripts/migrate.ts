import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// This override is process-local: migration credentials are never bundled.
if (process.env.MIGRATION_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL;
  delete process.env.SUPABASE_DATABASE_URL;
}
const { pool } = await import("@workspace/db");
const migrationsDir = fileURLToPath(
  new URL("../../migrations/", import.meta.url),
);

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(742619034)");
    await client.query(`CREATE SCHEMA IF NOT EXISTS prc_private;
      CREATE TABLE IF NOT EXISTS prc_private.schema_migrations (
        filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
      );`);
    const files = (await readdir(migrationsDir))
      .filter((f) => /^\d+_[a-z0-9_-]+\.sql$/.test(f))
      .sort();
    for (const filename of files) {
      if (
        (
          await client.query(
            "SELECT 1 FROM prc_private.schema_migrations WHERE filename=$1",
            [filename],
          )
        ).rowCount
      )
        continue;
      // Older migrations carry wrappers; the schema and history must commit together.
      const sql = (await readFile(path.join(migrationsDir, filename), "utf8"))
        .replace(/^\s*BEGIN\s*;/i, "")
        .replace(/COMMIT\s*;\s*$/i, "");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO prc_private.schema_migrations(filename) VALUES($1)",
          [filename],
        );
        await client.query("COMMIT");
        process.stdout.write(`Applied ${filename}\n`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(742619034)").catch(() => {});
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  process.stderr.write(
    "Migration failed. Check database connectivity, migration permissions and SQL compatibility. No credential values were logged.\n",
  );
  process.exitCode = 1;
});
