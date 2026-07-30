import { getPayload } from "payload";
import config from "../../payload.config.js";
import { readRealtyCasePayloadManifest } from "../lib/realty-case-payload-reconciliation.mjs";
import { applyRealtyCasePayloadManifest, validateRealtyCasePayloadManifest } from "../lib/realty-case-payload-projector.mjs";

try {
  const workspaceId = String(process.env.MS_REALTY_WORKSPACE_ID || "").trim();
  const filePath = process.env.MS_REALTY_CASE_LEDGER_PATH || undefined;
  const manifest = readRealtyCasePayloadManifest({ filePath, workspaceId });
  const plan = validateRealtyCasePayloadManifest(manifest);

  if (process.env.MS_REALTY_CASE_PROJECTOR_APPLY !== "1") {
    process.stdout.write(`${JSON.stringify({ dry_run: true, ...plan }, null, 2)}\n`);
  } else {
    const payload = await getPayload({ config });
    try {
      const result = await applyRealtyCasePayloadManifest(manifest, { payload });
      process.stdout.write(`${JSON.stringify({ dry_run: false, ...result }, null, 2)}\n`);
    } finally {
      await payload.destroy();
    }
  }
} catch (error) {
  console.error(`REALTY CASE PAYLOAD PROJECTOR FAILED: ${error.message}`);
  process.exitCode = 1;
}
