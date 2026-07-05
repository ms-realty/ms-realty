import fs from "node:fs";
import { DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT } from "../lib/redirect-approvals.mjs";
import { DEFAULT_SEO_EVIDENCE_OUTPUT } from "../lib/seo-evidence.mjs";
import { DEFAULT_LAUNCH_READINESS_OUTPUT } from "../lib/launch-readiness.mjs";
import {
  DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT,
  renderLaunchInputChecklist,
  writeLaunchInputChecklist,
} from "../lib/launch-inputs.mjs";
import { fromRoot } from "../lib/paths.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const outPath = writeLaunchInputChecklist(
  renderLaunchInputChecklist({
    generatedAt: "2026-07-05T00:00:00Z",
    launchReadiness: readJson(DEFAULT_LAUNCH_READINESS_OUTPUT),
    seoEvidence: readJson(DEFAULT_SEO_EVIDENCE_OUTPUT),
    redirectWorkbookCsv: fs.readFileSync(fromRoot("production", "data", "redirect-approval-workbook.csv"), "utf8"),
    deployableRedirects: readJson(DEFAULT_DEPLOYABLE_REDIRECTS_OUTPUT),
    routeMap: readJson(fromRoot("production", "data", "legacy-route-map.json")),
  }),
  DEFAULT_LAUNCH_INPUT_CHECKLIST_OUTPUT,
);

console.log(`Wrote launch input checklist to ${outPath}`);
