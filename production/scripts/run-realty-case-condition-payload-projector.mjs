import { getPayload } from "payload";
import config from "../../payload.config.js";
import { readRealtyCaseConditionPayloadManifest } from "../lib/realty-case-condition-payload-reconciliation.mjs";
import {
  applyRealtyCaseConditionPayloadManifest,
  validateRealtyCaseConditionPayloadManifest,
} from "../lib/realty-case-condition-payload-projector.mjs";

let exitCode = 0;
try {
  const workspaceId = String(process.env.MS_REALTY_WORKSPACE_ID || "").trim();
  const filePath = process.env.MS_REALTY_CASE_CONDITION_LEDGER_PATH || undefined;
  const manifest = readRealtyCaseConditionPayloadManifest({ filePath, workspaceId });
  const plan = validateRealtyCaseConditionPayloadManifest(manifest);

  if (process.env.MS_REALTY_CASE_PROJECTOR_APPLY !== "1") {
    process.stdout.write(`${JSON.stringify({ dry_run: true, ...plan }, null, 2)}\n`);
  } else {
    const payload = await getPayload({ config });
    try {
      const result = await applyRealtyCaseConditionPayloadManifest(manifest, { payload });
      process.stdout.write(`${JSON.stringify({ dry_run: false, ...result }, null, 2)}\n`);
    } finally {
      await payload.destroy();
    }
  }
} catch (error) {
  console.error(`REALTY CASE CONDITION PAYLOAD PROJECTOR FAILED: ${error.message}`);
  exitCode = 1;
}

process.exit(exitCode);
