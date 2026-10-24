import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { passwordHash } from "../security.js";

async function main() {
  const username = process.env.ADMIN_INITIAL_USERNAME?.trim();
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!username || !password) {
    throw new Error("ADMIN_INITIAL_USERNAME and ADMIN_INITIAL_PASSWORD are required.");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_INITIAL_PASSWORD must contain at least 12 characters.");
  }

  const existing = await pool.query(
    "SELECT id, role FROM prc_private.users WHERE lower(username) = lower($1)",
    [username],
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.role !== "admin") {
      throw new Error("The configured initial username already belongs to a non-admin account; no changes were made.");
    }
    process.stdout.write("The configured admin account already exists; it was left unchanged.\n");
    return;
  }

  const anyAdmin = await pool.query(
    "SELECT 1 FROM prc_private.users WHERE role = 'admin' LIMIT 1",
  );
  const hash = await passwordHash(password);
  await pool.query(
    `INSERT INTO prc_private.users(id, username, role, password_hash, active, must_change_password)
     VALUES ($1, $2, 'admin', $3, true, true)`,
    [randomUUID(), username, hash],
  );
  process.stdout.write(
    anyAdmin.rowCount
      ? "Admin account initialized without altering existing admins.\n"
      : "Initial admin account initialized; change its temporary password after first sign-in.\n",
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Admin initialization failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
