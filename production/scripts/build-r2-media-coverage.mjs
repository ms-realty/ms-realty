import fs from "node:fs";
import path from "node:path";
import {
  buildR2MediaCoverageReport,
  DEFAULT_R2_MEDIA_COVERAGE_REPORT,
} from "../lib/r2-media-coverage.mjs";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1] || fallback;
}

const listingPath = option(
  "input",
  process.env.MS_REALTY_R2_MEDIA_LISTING_INPUT_PATH || process.env.MS_REALTY_R2_MEDIA_OBJECTS_PATH || "",
);
const outputPath = option("output", process.env.MS_REALTY_R2_MEDIA_COVERAGE_REPORT_PATH || DEFAULT_R2_MEDIA_COVERAGE_REPORT);
const inventoryPath = option("inventory", process.env.MS_REALTY_R2_MEDIA_INVENTORY_PATH || "") || undefined;
const releaseSha = option("release-sha", process.env.MS_REALTY_RELEASE_SHA || process.env.GITHUB_SHA || "");
const generatedAt = option("generated-at", process.env.MS_REALTY_GENERATED_AT || new Date().toISOString());

try {
  if (!listingPath) throw new Error("Set MS_REALTY_R2_MEDIA_LISTING_INPUT_PATH or pass --input");
  if (!releaseSha) throw new Error("Set MS_REALTY_RELEASE_SHA or GITHUB_SHA (the workers.dev release SHA)");
  const report = buildR2MediaCoverageReport({ listingPath, inventoryPath, releaseSha, generatedAt });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote R2 media coverage report to ${outputPath}`);
  console.log(
    `R2 media coverage ${report.status}: expected ${report.expected_count}, listed ${report.listed_count}, present ${report.present_count}, missing ${report.missing_count}, unexpected ${report.unexpected_count}`,
  );
  if (report.missing_count) console.log(`Missing public keys: ${report.missing_keys.join(", ")}`);
} catch (error) {
  console.error(`R2 MEDIA COVERAGE FAILED: ${error.message}`);
  process.exitCode = 1;
}
