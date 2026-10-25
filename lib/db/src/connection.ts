import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import type { PoolConfig } from "pg";

/** Netlify can inject the official public CA as PEM without a mounted file. */
export function databaseConnectionOptions(
  env: NodeJS.ProcessEnv = process.env,
): PoolConfig {
  let connectionString =
    env.SUPABASE_DATABASE_URL?.trim() || env.DATABASE_URL?.trim();
  let ssl: PoolConfig["ssl"];
  if (connectionString) {
    let url: URL;
    try {
      url = new URL(connectionString);
    } catch {
      throw new Error("The configured PostgreSQL connection URL is invalid.");
    }
    if (/\.supabase\.(com|co)$/i.test(url.hostname)) {
      const source =
        env.DATABASE_SSL_ROOT_CERT?.trim() ||
        url.searchParams.get("sslrootcert");
      let ca: string | undefined;
      if (source) {
        try {
          ca = source.includes("-----BEGIN CERTIFICATE-----")
            ? source.replace(/\\n/g, "\n")
            : readFileSync(source, "utf8");
          const certificates = ca.match(
            /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
          );
          if (!certificates?.length || ca.includes("PRIVATE KEY"))
            throw new Error();
          for (const certificate of certificates)
            new X509Certificate(certificate);
        } catch {
          throw new Error(
            "DATABASE_SSL_ROOT_CERT must contain a valid public CA certificate in PEM format or its readable file path.",
          );
        }
      }
      ssl = { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
      // pg parses SSL query parameters after explicit options, replacing ca.
      // Move all supplied TLS material into one verified configuration.
      for (const [parameter, option] of [
        ["sslcert", "cert"],
        ["sslkey", "key"],
      ] as const) {
        const file = url.searchParams.get(parameter);
        if (file) ssl[option] = readFileSync(file, "utf8");
      }
      for (const key of [
        "ssl",
        "sslmode",
        "sslrootcert",
        "sslcert",
        "sslkey",
        "uselibpqcompat",
      ])
        url.searchParams.delete(key);
      connectionString = url.toString();
    }
  }
  return {
    connectionString,
    ...(ssl ? { ssl } : {}),
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  };
}
