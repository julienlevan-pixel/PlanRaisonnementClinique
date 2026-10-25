import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { databaseConnectionOptions } from "./connection.js";

const { Pool } = pg;

const options = databaseConnectionOptions();
export const pool = new Pool(options);
if (!options.connectionString) {
  // Loading the HTTP function must remain possible so its configuration guard
  // can return JSON 503. Refuse every database operation instead of allowing pg
  // to connect with ambient PG* defaults when an explicit URL is missing.
  const unavailable = () =>
    Promise.reject(
      new Error(
        "SUPABASE_DATABASE_URL or DATABASE_URL must be set for PostgreSQL access.",
      ),
    );
  Object.defineProperty(pool, "query", { value: unavailable });
  Object.defineProperty(pool, "connect", { value: unavailable });
}
export const db = drizzle(pool, { schema });

export * from "./schema";
