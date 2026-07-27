import os from "node:os";
import {
  HERMES_BACKENDS,
  hermesBackendStatus,
  setHermesBackend,
} from "../lib/hermes-backend.mjs";

// Operator entry point, mirroring the Tempora convention:
//   npm run hermes:backend                 -> show current backend
//   npm run hermes:backend set claude-cli  -> switch (openrouter | claude-cli | codex-cli)

function printStatus() {
  const status = hermesBackendStatus();
  console.log(`backend:  ${status.backend} (${status.source})`);
  console.log(`model:    ${status.model || "(from env at run time)"}`);
  if (status.cli) console.log(`cli:      ${status.cli.binary} ${status.cli.available ? "found on PATH" : "NOT FOUND on PATH"}`);
  console.log(`prod ok:  ${status.production_allowed ? "yes" : "no - dev-machine only, fails closed in production"}`);
  if (status.updated_at) console.log(`switched: ${status.updated_at} by ${status.updated_by}`);
  console.log(`replies:  lead-reply drafts stay self_hosted-only regardless of this switch`);
}

const [command, value] = process.argv.slice(2);

try {
  if (!command) {
    printStatus();
  } else if (command === "set") {
    const record = setHermesBackend(value, { actor: `cli:${os.userInfo().username}` });
    console.log(`Hermes backend set to ${record.backend}`);
    console.log("Restart the dev server / rerun npm run hermes:worker to pick it up.");
    printStatus();
  } else {
    console.error(`Usage: npm run hermes:backend [-- set <${HERMES_BACKENDS.join("|")}>]`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`HERMES BACKEND: ${error.message}`);
  process.exitCode = 1;
}
