// Readiness means a successful version/freshness/byte-scan through the actual adapter.
import { setTimeout } from "node:timers/promises";
import { ClamAvScanner } from "../src/server/files/scan";

const scanner = new ClamAvScanner({
  host: process.env.CLAMAV_HOST || "127.0.0.1",
  port: Number(process.env.CLAMAV_PORT || 3310),
  maxSignatureAgeHours: 48,
  timeoutMs: 4000,
});
// Tests can shorten the wait, never extend the five-minute CI limit or change scan policy.
const budgetMs = Number(process.env.CI_CLAMAV_READY_TIMEOUT_MS ?? 300_000);
if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > 300_000)
  throw new Error("CI_CLAMAV_READY_TIMEOUT_MS must be between 1 and 300000");
const startedAt = Date.now();
const deadline = startedAt + budgetMs;
let lastResult = "No scan attempted";
let lastLogged = "";
let loggedAt = 0;
let attempts = 0;
let ready = false;
do {
  attempts += 1;
  const result = await scanner.scan(Buffer.from("MS Realty CI scanner readiness probe"));
  const version = result.scannerVersion?.replace(/[^\x20-\x7e]/g, "?").slice(0, 180) ?? null;
  lastResult = JSON.stringify({ state: result.state, reason: result.reason ?? null, version });
  if (result.state === "clean") {
    console.log(
      `Scanner ready after ${attempts} attempt(s): ${version}; byte-scan sha256=${result.sha256}`,
    );
    ready = true;
    break;
  }
  if (lastResult !== lastLogged || Date.now() - loggedAt >= 15_000) {
    console.error(
      `Scanner not ready after ${Date.now() - startedAt}ms (${attempts} attempts): ${lastResult}`,
    );
    lastLogged = lastResult;
    loggedAt = Date.now();
  }
  // The fixed clean probe must never be reported ready after an infected reply.
  if (result.state === "infected") break;
  const remaining = deadline - Date.now();
  if (remaining > 0) await setTimeout(Math.min(2000, remaining));
} while (Date.now() < deadline);
if (!ready)
  throw new Error(
    `ClamAV did not prove fresh signature and byte-scan readiness within ${budgetMs}ms; last result: ${lastResult}`,
  );
