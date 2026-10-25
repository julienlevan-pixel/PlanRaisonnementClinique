import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entry = new URL("../prc-pharmacie/netlify/functions/api.ts", import.meta.url);
const output = new URL("../prc-pharmacie/dist/functions/", import.meta.url);

// Netlify's v2 function tracing treats workspace packages as external modules.
// Bundle their TypeScript sources before Netlify creates the deployment archive.
await rm(output, { recursive: true, force: true });
await build({
  entryPoints: [fileURLToPath(entry)],
  outfile: fileURLToPath(new URL("api.mjs", output)),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: ["pg-native"],
  banner: {
    js: 'import { createRequire as createNodeRequire } from "node:module"; const require = createNodeRequire(import.meta.url);',
  },
  sourcemap: "linked",
  logLevel: "info",
});
