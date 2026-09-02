import path from "node:path";
import { parseHermesImageReference } from "./hermes-upstream-update.mjs";

export const HERMES_COMPATIBILITY_ENTRYPOINT = "/opt/hermes/.venv/bin/hermes";
export const HERMES_COMPATIBILITY_PYTHON = "/opt/hermes/.venv/bin/python";
export const HERMES_COMPATIBILITY_CONFIG_MOUNT = "/tmp/ms-realty-hermes-config.yaml";
export const HERMES_COMPATIBILITY_API_KEY = "ms-realty-compatibility-smoke-only";
export const HERMES_COMPATIBILITY_REQUIRED_CONFIG_MARKERS = Object.freeze([
  "provider: custom",
  "memory_enabled: false",
  "user_profile_enabled: false",
  "mode: manual",
  "- browser",
  "- code_execution",
  "- computer_use",
  "- context_engine",
  "- file",
  "- memory",
  "- messaging",
  "- skills",
  "- terminal",
  "- web",
  "- x_search",
]);

const READ_ONLY_RUNTIME_ARGS = Object.freeze([
  "--network",
  "none",
  "--read-only",
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,size=64m",
]);

function mountConfig(configPath, destination = HERMES_COMPATIBILITY_CONFIG_MOUNT) {
  const source = path.resolve(configPath);
  return `type=bind,src=${source},dst=${destination},readonly`;
}

export function buildHermesCompatibilityPlan(image, { configPath = "production/hermes-agent/config.yaml" } = {}) {
  const parsed = parseHermesImageReference(image, { requireDigest: true });
  const configCheck = [
    "-c",
    `from pathlib import Path; import sys; text=Path(${JSON.stringify(HERMES_COMPATIBILITY_CONFIG_MOUNT)}).read_text(encoding="utf-8"); required=${JSON.stringify(HERMES_COMPATIBILITY_REQUIRED_CONFIG_MARKERS)}; missing=[marker for marker in required if marker not in text]; sys.exit("missing Hermes safety config: " + ", ".join(missing)) if missing else print("config: pass")`,
  ];
  return {
    image: parsed.image,
    pull: ["pull", parsed.image],
    version: ["run", "--rm", ...READ_ONLY_RUNTIME_ARGS, "--entrypoint", HERMES_COMPATIBILITY_ENTRYPOINT, parsed.image, "--version"],
    help: ["run", "--rm", ...READ_ONLY_RUNTIME_ARGS, "--entrypoint", HERMES_COMPATIBILITY_ENTRYPOINT, parsed.image, "--help"],
    config: [
      "run",
      "--rm",
      ...READ_ONLY_RUNTIME_ARGS,
      "--mount",
      mountConfig(configPath),
      "--entrypoint",
      HERMES_COMPATIBILITY_PYTHON,
      parsed.image,
      ...configCheck,
    ],
    start: [
      "run",
      "--detach",
      ...READ_ONLY_RUNTIME_ARGS,
      "--tmpfs",
      "/run:rw,noexec,nosuid,size=16m",
      "--tmpfs",
      "/opt/data:rw,noexec,nosuid,size=64m",
      "--mount",
      mountConfig(configPath, "/tmp/config.yaml"),
      "--env",
      "HERMES_HOME=/tmp",
      "--env",
      "API_SERVER_ENABLED=true",
      "--env",
      "API_SERVER_HOST=127.0.0.1",
      "--env",
      "API_SERVER_PORT=8642",
      "--env",
      `API_SERVER_KEY=${HERMES_COMPATIBILITY_API_KEY}`,
      "--env",
      "HERMES_AGENT_MODEL=",
      "--env",
      "HERMES_AGENT_LLM_BASE_URL=",
      "--env",
      "HERMES_AGENT_LLM_API_KEY=",
      parsed.image,
      "gateway",
      "run",
      "--no-supervise",
    ],
    health: [
      "exec",
      "__CONTAINER_ID__",
      HERMES_COMPATIBILITY_PYTHON,
      "-c",
      'import urllib.request; response=urllib.request.urlopen("http://127.0.0.1:8642/health", timeout=2); raise SystemExit(0 if response.status == 200 else 1)',
    ],
    stop: ["rm", "--force", "__CONTAINER_ID__"],
  };
}
