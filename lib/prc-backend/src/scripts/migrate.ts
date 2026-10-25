import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "@workspace/db";

const migrationsDir = fileURLToPath(new URL("../../migrations/", import.meta.url));

async function main() {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS prc_private;
    CREATE TABLE IF NOT EXISTS prc_private.schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file))
    .sort();
  for (const filename of files) {
    const found = await pool.query(
      "SELECT 1 FROM prc_private.schema_migrations WHERE filename = $1",
      [filename],
    );
    if (found.rowCount) continue;
    const sql = await readFile(path.join(migrationsDir, filename), "utf8");
    await pool.query(sql);
    await pool.query(
      "INSERT INTO prc_private.schema_migrations(filename) VALUES ($1)",
      [filename],
    );
    process.stdout.write(`Applied ${filename}\n`);
  }
  await pool.end();
}

main().catch(async (error: unknown) => {
  process.stderr.write(
    `Migration failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  await pool.end();
  process.exitCode = 1;
});
