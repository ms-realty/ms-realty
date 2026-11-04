// Read-only CLI for the same pure protected-parity validator used by execution admission.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { installedExecution } from "../src/release/execution-node.mjs";
import { promotionGate } from "../src/release/execution-parity.mjs";

export { gates, promotionGate, signedPayload } from "../src/release/execution-parity.mjs";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (installedExecution())
      throw new Error(
        "Installed execution mode requires the full candidate and remote watchdog admission",
      );
    const [reportPath, ownerPath, controllerPath, expectedPath] = process.argv.slice(2);
    const [report, owner, controller, expected] = await Promise.all(
      [reportPath, ownerPath, controllerPath, expectedPath].map(async (path) =>
        JSON.parse(await readFile(path, "utf8")),
      ),
    );
    const result = promotionGate(
      report,
      { owner, controller },
      {
        owner: process.env.LAUNCH_OWNER_PUBLIC_KEY,
        controller: process.env.LAUNCH_CONTROLLER_PUBLIC_KEY,
      },
      expected,
    );
    console.log(
      `Promotion evidence accepted for ${result.digest}; this validator does not deploy or alter routes.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Independent promotion evidence unavailable",
    );
    process.exitCode = 1;
  }
}
