// Exit 0 when the restored release's readiness is an acceptable rollback
// state; see production/lib/rollback-readiness.mjs.
import fs from "node:fs";
import { rollbackReadinessAccepts } from "../lib/rollback-readiness.mjs";

const [readyPath, httpStatus, expectedReady, expectedBlockers = "", recovery = "none"] = process.argv.slice(2);
let ready = null;
try {
  ready = JSON.parse(fs.readFileSync(readyPath, "utf8"));
} catch {
  ready = null;
}
const result = rollbackReadinessAccepts({
  ready,
  httpStatus,
  expectedReady: expectedReady === "true",
  expectedBlockers: expectedBlockers ? expectedBlockers.split(",").filter(Boolean) : [],
  recovery,
});
console.error(`rollback readiness: ${result.state}`);
process.exit(result.accepted ? 0 : 1);
