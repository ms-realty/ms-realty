#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildApprovedSearchProjection, writeApprovedSearchProjection } from "../production/lib/search-engine-sync.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const inputPath = argument("--input");
const outputDir = argument("--out");
if (!inputPath || !outputDir) {
  console.error("Usage: node search/build_approved_search_projection.mjs --input joined-listings.json --out search-data-dir");
  process.exitCode = 1;
} else {
  const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const rows = Array.isArray(source) ? source : source.rows || source.listings;
  if (!Array.isArray(rows)) throw new Error("Projection input must be an array or contain rows/listings");
  const projection = buildApprovedSearchProjection(rows);
  const outputs = writeApprovedSearchProjection(projection, path.resolve(outputDir));
  console.log(JSON.stringify({ ...projection.summary, outputs }, null, 2));
}
