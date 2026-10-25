import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let connectionString =
  process.env.SUPABASE_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

// Keep PostgreSQL TLS certificate and hostname verification enabled on Supabase.
// Local Unix sockets remain available for disposable development/test databases.
if (connectionString)
  try {
    const url = new URL(connectionString);
    if (/\.supabase\.(com|co)$/i.test(url.hostname)) {
      url.searchParams.delete("ssl");
      url.searchParams.delete("uselibpqcompat");
      url.searchParams.set("sslmode", "verify-full");
      if (process.env.DATABASE_SSL_ROOT_CERT) {
        url.searchParams.set("sslrootcert", process.env.DATABASE_SSL_ROOT_CERT);
      }
      connectionString = url.toString();
    }
  } catch {
    throw new Error("The configured PostgreSQL connection URL is invalid.");
  }

export const pool = new Pool({
  connectionString,
  max: 2,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: true,
});
if (!connectionString) {
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
