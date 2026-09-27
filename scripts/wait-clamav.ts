// Readiness means a successful version/freshness/byte-scan through the actual adapter.
import { setTimeout } from "node:timers/promises";
import { ClamAvScanner } from "../src/server/files/scan";

const scanner = new ClamAvScanner({
  host: process.env.CLAMAV_HOST || "127.0.0.1",
  port: Number(process.env.CLAMAV_PORT || 3310),
  maxSignatureAgeHours: 48,
  timeoutMs: 4000,
});
const deadline = Date.now() + 300_000;
let ready = false;
do {
  const result = await scanner.scan(Buffer.from("MS Realty CI scanner readiness probe"));
  if (result.state === "clean") {
    console.log(`Scanner ready: ${result.scannerVersion}`);
    ready = true;
    break;
  }
  await setTimeout(2000);
} while (Date.now() < deadline);
if (!ready)
  throw new Error(
    "ClamAV did not prove fresh signature and byte-scan readiness within five minutes",
  );
