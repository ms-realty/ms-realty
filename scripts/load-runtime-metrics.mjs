// Opt-in preload for the owned local load server, never part of deployed instrumentation.
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";

assert(process.env.MSR_LOAD_PROFILE === "1");
const id = process.env.E2E_RUN_ID;
assert(id && /^[a-f0-9]{32}$/.test(id));
const output = join(process.cwd(), "test-results", id, "runtime-metrics.jsonl");
const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();
let cpu = process.cpuUsage();
let elapsed = performance.now();
let utilization = performance.eventLoopUtilization();
function sample() {
  const now = performance.now();
  const nextCpu = process.cpuUsage();
  const nextUtilization = performance.eventLoopUtilization();
  const delta = performance.eventLoopUtilization(nextUtilization, utilization);
  appendFileSync(
    output,
    `${JSON.stringify({
      at: new Date().toISOString(),
      pid: process.pid,
      intervalMs: now - elapsed,
      cpuMs: (nextCpu.user + nextCpu.system - cpu.user - cpu.system) / 1000,
      eventLoopUtilization: delta.utilization,
      eventLoopDelayP95Ms: delay.percentile(95) / 1e6,
      rssBytes: process.memoryUsage().rss,
    })}\n`,
  );
  cpu = nextCpu;
  elapsed = now;
  utilization = nextUtilization;
  delay.reset();
}
setInterval(sample, 1000).unref();
process.once("exit", sample);
