import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist-runtime", { recursive: true });
await build({
  entryPoints: {
    worker: "scripts/worker.ts",
    migrate: "src/db/migrate.ts",
    bootstrap: "scripts/bootstrap-staff.ts",
    transport: "src/db/transport.ts",
  },
  outdir: "dist-runtime",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  conditions: ["react-server"],
  sourcemap: false,
  metafile: true,
  banner: {
    js: 'import { createRequire as __runtimeCreateRequire } from "node:module"; const require = __runtimeCreateRequire(import.meta.url);',
  },
});
console.log(
  "Built worker, migration, bootstrap and transport entry points (production dependencies external).",
);
