// Ship the pinned standalone MapLibre worker on our own origin. No CDN/CSP exception.
import { copyFile, mkdir, readFile } from "node:fs/promises";

const pkg = JSON.parse(
  await readFile(new URL("../node_modules/maplibre-gl/package.json", import.meta.url), "utf8"),
);
if (pkg.version !== "6.15.0") throw new Error("Update the map worker URL and version together");
const root = new URL(`../public/map-runtime/v${pkg.version}/`, import.meta.url);
await mkdir(root, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs"])
  await copyFile(
    new URL(`../node_modules/maplibre-gl/dist/${file}`, import.meta.url),
    new URL(file, root),
  );
await copyFile(
  new URL("../node_modules/maplibre-gl/LICENSE.txt", import.meta.url),
  new URL("LICENSE.txt", root),
);
