import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGIN = path.join(ROOT, "plugins", "ms-realty-operator");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

test("owner plugin packages production MCP, Hermes, skill, and marketplace install", () => {
  const manifest = readJson("plugins/ms-realty-operator/.codex-plugin/plugin.json");
  const mcp = readJson("plugins/ms-realty-operator/.mcp.json");
  const marketplace = readJson(".agents/plugins/marketplace.json");
  const skill = fs.readFileSync(path.join(PLUGIN, "skills", "ms-realty-operator", "SKILL.md"), "utf8");

  assert.equal(manifest.name, "ms-realty-operator");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(mcp.mcpServers["ms-realty"].url, "https://ms-realty.ms-realty-bg.workers.dev/mcp");
  assert.equal(mcp.mcpServers["ms-realty"].bearer_token_env_var, "MS_REALTY_OPERATOR_TOKEN");
  assert.equal("headers" in mcp.mcpServers["ms-realty"], false);
  assert.equal(mcp.mcpServers["ms-realty-hermes"].command, "./scripts/run-ms-realty-hermes.sh");
  assert.equal(marketplace.plugins[0].source.path, "./plugins/ms-realty-operator");
  assert.match(skill, /ms_realty_admin_context/);
  assert.match(skill, /Hermes never approves,\npublishes, marks content indexable, or sends customer messages/);
  assert.equal(fs.statSync(path.join(PLUGIN, "scripts", "run-ms-realty-hermes.sh")).mode & 0o111, 0o111);
});
