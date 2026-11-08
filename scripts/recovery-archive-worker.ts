// R08 offline plan/validation only. No DB connection, network, signer, spool or runtime loader.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { admissionDigest, offlineAdmission } from "../gateway/recovery-coordinator-contract";

export { replicateOnce } from "../src/server/recovery/archive/replicator";
export async function validateArchivePlan(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--validate-offline")
    throw new Error(
      "Only --validate-offline <input.json> is supported. Production activation is disabled.",
    );
  const admission = offlineAdmission.parse(JSON.parse(await readFile(argv[1] as string, "utf8")));
  return {
    kind: "recovery_archive_offline_plan_v1",
    admissionDigest: admissionDigest(admission),
    activationAuthorized: false,
    evidenceClass: "offline_fixture",
    currentness: "unknown",
    archiveBarrier: null,
    r08: "blocked",
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateArchivePlan(process.argv.slice(2))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(() => {
      process.stderr.write("Offline recovery archive input invalid or command unsupported.\n");
      process.exitCode = 1;
    });
}
