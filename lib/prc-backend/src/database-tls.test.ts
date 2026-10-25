import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";
import { databaseConnectionOptions } from "../../db/src/connection.js";

test("invalid certificate configuration returns JSON 503 instead of crashing the function", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    const {handleApiRequest} = await import(${JSON.stringify(new URL("./handler.ts", import.meta.url).href)});
    const response = await handleApiRequest(new Request('https://prc.test/api/healthz'));
    console.log(JSON.stringify({status:response.status,body:await response.json()}));
  `,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_DATABASE_URL: "",
        DATABASE_URL: "postgresql://aws-0-us-east-1.pooler.supabase.com/test",
        DATABASE_SSL_ROOT_CERT: "invalid-test-certificate",
        PRC_DEPLOY_CONTEXT: "production",
      },
    },
  );
  // Use a hostname URI so the Supabase certificate configuration is selected.
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.status, 503);
  assert.match(output.body.error, /DATABASE_SSL_ROOT_CERT/);
});

test("Supabase accepts PEM or a file without letting URL parameters bypass verification", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "prc-ca-"));
  try {
    for (const name of ["localhost", "other"])
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-days",
          "1",
          "-subj",
          `/CN=${name}`,
          "-addext",
          `subjectAltName=DNS:${name}`,
          "-keyout",
          path.join(directory, `${name}.key`),
          "-out",
          path.join(directory, `${name}.crt`),
        ],
        { stdio: "ignore" },
      );
    const cert = readFileSync(path.join(directory, "localhost.crt"), "utf8");
    const connection =
      "postgresql://test:test@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=disable&sslrootcert=/missing&application_name=prc-test";
    for (const source of [
      cert,
      cert.replaceAll("\n", "\\n"),
      path.join(directory, "localhost.crt"),
    ]) {
      const options = databaseConnectionOptions({
        DATABASE_URL: connection,
        DATABASE_SSL_ROOT_CERT: source,
      });
      assert.equal(
        (options.ssl as tls.ConnectionOptions).rejectUnauthorized,
        true,
      );
      assert.equal(
        String((options.ssl as tls.ConnectionOptions).ca).trim(),
        cert.trim(),
      );
      assert.ok(
        !new URL(options.connectionString!).searchParams.has("sslmode"),
      );
      assert.equal(
        new URL(options.connectionString!).searchParams.get("application_name"),
        "prc-test",
      );
    }
    assert.throws(
      () =>
        databaseConnectionOptions({
          DATABASE_URL: connection,
          DATABASE_SSL_ROOT_CERT:
            "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----",
        }),
      /valid public CA/,
    );
    const server = tls.createServer(
      { key: readFileSync(path.join(directory, "localhost.key")), cert },
      (socket) => socket.end(),
    );
    server.on("tlsClientError", () => {});
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const port = (server.address() as { port: number }).port;
      const connect = (ca: string, servername: string) =>
        new Promise<void>((resolve, reject) => {
          const config = databaseConnectionOptions({
            DATABASE_URL: connection,
            DATABASE_SSL_ROOT_CERT: ca,
          }).ssl as tls.ConnectionOptions;
          const socket = tls.connect({
            ...config,
            host: "127.0.0.1",
            port,
            servername,
          });
          socket.once("secureConnect", () => {
            socket.end();
            resolve();
          });
          socket.once("error", reject);
        });
      await connect(cert, "localhost");
      await assert.rejects(
        connect(
          readFileSync(path.join(directory, "other.crt"), "utf8"),
          "localhost",
        ),
      );
      await assert.rejects(connect(cert, "wrong.example"), {
        code: "ERR_TLS_CERT_ALTNAME_INVALID",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
