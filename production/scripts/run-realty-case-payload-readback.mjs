import { readRealtyCaseConditionPayloadManifest } from "../lib/realty-case-condition-payload-reconciliation.mjs";
import { readRealtyCasePayloadManifest } from "../lib/realty-case-payload-reconciliation.mjs";
import { reconcileRealtyCasePayloadReadback } from "../lib/realty-case-payload-readback.mjs";

const KIND = "realty_case_payload_readback";

function safeEnvironment() {
  if (process.env.NODE_ENV !== "production") throw new Error("Payload read-back requires NODE_ENV=production");
  if (process.env.PAYLOAD_DROP_DATABASE === "true" || process.env.PAYLOAD_MIGRATING === "true") {
    throw new Error("Payload read-back refuses destructive or migration modes");
  }
  if (process.env.MS_REALTY_CASE_PROJECTOR_APPLY === "1") {
    throw new Error("Payload read-back refuses projector apply mode");
  }
  const databaseUrl = String(process.env.MS_REALTY_CASE_READBACK_DATABASE_URL || "").trim();
  const payloadSecret = String(process.env.PAYLOAD_SECRET || "").trim();
  if (!databaseUrl || !payloadSecret) throw new Error("Payload read-back requires explicit runtime configuration");
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Payload read-back requires a PostgreSQL URL");
  }
  if (!parsed.hostname || !["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Payload read-back requires a PostgreSQL URL");
  }
  process.env.DATABASE_URL = databaseUrl;
}

let exitCode = 2;
try {
  safeEnvironment();
  process.env.DISABLE_LOGGING = "true";
  const workspaceId = String(process.env.MS_REALTY_WORKSPACE_ID || "").trim();
  const caseManifest = readRealtyCasePayloadManifest({
    filePath: process.env.MS_REALTY_CASE_LEDGER_PATH || undefined,
    workspaceId,
  });
  const conditionManifest = readRealtyCaseConditionPayloadManifest({
    filePath: process.env.MS_REALTY_CASE_CONDITION_LEDGER_PATH || undefined,
    workspaceId,
  });
  const [{ getPayload }, { default: configPromise }] = await Promise.all([import("payload"), import("../../payload.config.js")]);
  const config = await configPromise;
  config.logger = { options: { enabled: false } };
  const payload = await getPayload({ config });
  try {
    const result = await reconcileRealtyCasePayloadReadback({ caseManifest, conditionManifest, payload, workspaceId });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    exitCode = result.clean ? 0 : 1;
  } finally {
    await payload.destroy();
  }
} catch {
  process.stdout.write(`${JSON.stringify({ kind: KIND, status: "failed" })}\n`);
}

process.exit(exitCode);
