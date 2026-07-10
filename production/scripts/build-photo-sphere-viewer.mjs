#!/usr/bin/env node
// Bundle the reviewed 360 viewer locally so public listing pages never depend
// on a third-party CDN at runtime.

import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const vendorDir = path.join(ROOT, "public", "vendor");
const scriptPath = path.join(vendorDir, "photo-sphere-viewer.js");
const cssPath = path.join(vendorDir, "photo-sphere-viewer.css");

fs.mkdirSync(vendorDir, { recursive: true });

await build({
  stdin: {
    contents: 'export { Viewer } from "@photo-sphere-viewer/core";',
    resolveDir: ROOT,
    sourcefile: "photo-sphere-viewer-entry.mjs",
  },
  bundle: true,
  format: "iife",
  globalName: "MSRealtyPhotoSphereViewer",
  legalComments: "linked",
  minify: true,
  outfile: scriptPath,
  platform: "browser",
  target: ["es2020"],
});

fs.copyFileSync(path.join(ROOT, "node_modules", "@photo-sphere-viewer", "core", "index.css"), cssPath);

process.stdout.write(
  `${JSON.stringify({ kind: "photo_sphere_viewer", script: path.relative(ROOT, scriptPath), css: path.relative(ROOT, cssPath) })}\n`,
);
