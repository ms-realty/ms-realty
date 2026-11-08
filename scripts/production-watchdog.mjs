import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { installedExecution, verifyInstalledExecution } from "../src/release/execution-node.mjs";
import { canonical } from "../src/release/execution-production.mjs";
import { rejectExecutionActivation } from "../src/release/execution-runtime.ts";

const origin = "https://ms-realty-route-watchdog.ms-realty-bg.workers.dev";
const demand = (ok) => {
  if (!ok) throw new Error("Independent route watchdog is unavailable or unverified");
};
export function routeWatchdog({
  secret,
  operationId,
  leaseId,
  transport = fetch,
  wait = delay,
  now = Date.now,
} = {}) {
  demand(typeof secret === "string" && secret.length >= 32 && !/[\r\n]/u.test(secret));
  const binding = { operationId, leaseId };
  async function call(path, body) {
    try {
      const response = await transport(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
        headers: {
          Authorization: `Bearer ${secret}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: canonical(body) }),
      });
      demand(response.ok && !response.redirected);
      let length = 0;
      const chunks = [];
      for await (const chunk of response.body) {
        length += chunk.length;
        demand(length <= 4 * 1024 * 1024);
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("Independent route watchdog is unavailable or unverified");
    }
  }
  const bound = async () => {
    const value = await call("/status");
    demand(
      value.scope?.operationId === operationId &&
        value.scope.leaseId === leaseId &&
        value.mode !== "rehearsal",
    );
    return value;
  };
  const restored = async () => {
    let state = await bound();
    if (state.status === "restored") return state;
    demand(!["accepted", "released"].includes(state.status));
    await call("/restore", binding);
    const deadline = now() + 120_000;
    do {
      state = await bound();
      if (state.status === "restored") return state;
      await wait(1_000);
    } while (now() < deadline);
    throw new Error("Independent watchdog restoration requires reconciliation");
  };
  return {
    status: bound,
    reserve: (scope) => {
      installedExecution(); // Malformed installation never silently selects legacy mode.
      return call("/reserve", scope);
    },
    async bind(bundle) {
      const installed = installedExecution();
      if (installed) {
        const packet = structuredClone(bundle.executionPacket);
        demand(packet);
        const state = await bound();
        // Exact replay is decided by the durable remote record, including after expiry.
        if (state.status === "reserved") await verifyInstalledExecution(packet, state, now());
        return call("/bind", { ...binding, packet });
      }
      rejectExecutionActivation(bundle);
      await bound();
      return call("/bind", {
        ...binding,
        plan: bundle.plan.toString(),
        baseline: bundle.baseline.toString(),
        report: bundle.report,
        approvals: bundle.approvals,
      });
    },
    persist: (journal) => call("/journal", { ...binding, journal }),
    accept: (report) => call("/accept", { ...binding, report }),
    restore: restored,
    // Reads use the independent provider read token. All mutations use the off-runner owner.
    provider(readOnly, workerName) {
      return {
        ...readOnly,
        async replace(zoneId, previous, script) {
          if (script === workerName)
            return call("/mutate", { ...binding, zoneId, pattern: previous.pattern });
          await restored();
          const value = (await readOnly.routes(zoneId)).find((r) => r.id === previous.id);
          demand(value && value.pattern === previous.pattern && value.script === script);
          return value;
        },
        create: (zoneId, pattern, script) => {
          demand(script === workerName);
          return call("/mutate", { ...binding, zoneId, pattern });
        },
        async remove(zoneId, route) {
          await restored();
          demand(!(await readOnly.routes(zoneId)).some((r) => r.id === route.id));
        },
      };
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [command, input, output] = process.argv.slice(2);
    demand(command === "reserve" && input && output && process.argv.length === 5);
    const scope = JSON.parse(await readFile(input, "utf8"));
    const client = routeWatchdog({ secret: process.env.PRODUCTION_WATCHDOG_CONTROL_SECRET });
    const { writeJournal } = await import("./production-cutover.mjs");
    await writeJournal(output, await client.reserve(scope), { exclusive: true });
    console.log(
      "Private off-runner route lease receipt retained. This is not production acceptance.",
    );
  } catch {
    console.error("Watchdog reservation unverified; no production route was changed.");
    process.exitCode = 1;
  }
}
