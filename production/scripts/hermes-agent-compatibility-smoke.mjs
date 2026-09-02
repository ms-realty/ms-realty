#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { HERMES_AGENT_DOCKER_IMAGE } from "../lib/hermes-provider-provisioning.mjs";
import { buildHermesCompatibilityPlan } from "../lib/hermes-agent-compatibility.mjs";

const configPath = process.env.MS_REALTY_HERMES_CONFIG_PATH || "production/hermes-agent/config.yaml";
if (!fs.existsSync(configPath)) throw new Error(`Hermes compatibility config is missing: ${configPath}`);
const plan = buildHermesCompatibilityPlan(HERMES_AGENT_DOCKER_IMAGE, { configPath });
let containerId = "";

function run(args, { capture = false } = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Hermes compatibility command failed: docker ${args[0]}`);
  return result.stdout || "";
}

try {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      run(plan.pull);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  run(plan.version);
  run(plan.help);
  run(plan.config);
  containerId = run(plan.start, { capture: true }).trim();
  if (!/^[0-9a-f]{12,64}$/i.test(containerId)) throw new Error("Hermes compatibility container did not start");

  let healthy = false;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = spawnSync("docker", plan.health.map((value) => (value === "__CONTAINER_ID__" ? containerId : value)), {
      stdio: "ignore",
    });
    if (result.status === 0) {
      healthy = true;
      break;
    }
    if (attempt < 30) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!healthy) throw new Error("Hermes compatibility health endpoint did not become ready without model credentials");
  console.log(`Hermes compatibility passed for ${plan.image}`);
} finally {
  if (containerId) {
    const cleanup = plan.stop.map((value) => (value === "__CONTAINER_ID__" ? containerId : value));
    spawnSync("docker", cleanup, { stdio: "ignore" });
  }
}
