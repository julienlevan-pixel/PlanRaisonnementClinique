import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { databaseConnectionOptions } from "./connection.js";
import type { PoolConfig } from "pg";

const { Pool } = pg;

let options: PoolConfig = {};
export let databaseConfigurationError: string | null = null;
try {
  options = databaseConnectionOptions();
} catch (error) {
  databaseConfigurationError =
    error instanceof Error && error.message.startsWith("DATABASE_SSL_ROOT_CERT")
      ? "Le certificat Supabase enregistré dans DATABASE_SSL_ROOT_CERT est invalide ou illisible. Collez son contenu PEM complet, avec les lignes BEGIN CERTIFICATE et END CERTIFICATE."
      : "La configuration de connexion PostgreSQL est invalide. Vérifiez les variables serveur Netlify.";
}
export const pool = new Pool(options);
if (databaseConfigurationError || !options.connectionString) {
  // Loading the HTTP function must remain possible so its configuration guard
  // can return JSON 503. Refuse every database operation instead of allowing pg
  // to connect with ambient PG* defaults when an explicit URL is missing.
  const unavailable = () =>
    Promise.reject(
      new Error(
        databaseConfigurationError ||
          "SUPABASE_DATABASE_URL or DATABASE_URL must be set for PostgreSQL access.",
      ),
    );
  Object.defineProperty(pool, "query", { value: unavailable });
  Object.defineProperty(pool, "connect", { value: unavailable });
}
export const db = drizzle(pool, { schema });

export * from "./schema";
