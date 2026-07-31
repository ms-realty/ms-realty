import { readRealtyCasePayloadManifest } from "../lib/realty-case-payload-reconciliation.mjs";

const workspaceId = process.env.MS_REALTY_WORKSPACE_ID;
const filePath = process.env.MS_REALTY_CASE_LEDGER_PATH || undefined;

try {
  const manifest = readRealtyCasePayloadManifest({ filePath, workspaceId });
  console.log(JSON.stringify(manifest));
} catch (error) {
  console.error(`REALTY CASE PAYLOAD MANIFEST FAILED: ${error.message}`);
  process.exitCode = 1;
}
