import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOGO_URL, LOGO_URL_REVERSED } from "../lib/ui/design-assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLUGIN = path.join(ROOT, "plugins", "ms-realty-operator");
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));

test("owner plugin packages one production MCP with admin and Hermes tools", () => {
  const manifest = readJson("plugins/ms-realty-operator/.codex-plugin/plugin.json");
  const mcp = readJson("plugins/ms-realty-operator/.mcp.json");
  const marketplace = readJson(".agents/plugins/marketplace.json");
  const skill = fs.readFileSync(path.join(PLUGIN, "skills", "ms-realty-operator", "SKILL.md"), "utf8");

  assert.equal(manifest.name, "ms-realty-operator");
  assert.equal(manifest.mcpServers, "./.mcp.json");
  assert.equal(manifest.interface.logo, "./assets/ms-realty-logo.png");
  assert.equal(manifest.interface.logoDark, "./assets/ms-realty-logo-reversed.png");
  // The vendor file name carries the design-bundle hash, so read the path the
  // bundle exports instead of pinning a hash that every design:build rewrites.
  assert.match(LOGO_URL, /^\/vendor\/ms-realty-logo-[0-9a-f]{12}\.png$/);
  assert.match(LOGO_URL_REVERSED, /^\/vendor\/ms-realty-logo-reversed-[0-9a-f]{12}\.png$/);
  assert.deepEqual(
    fs.readFileSync(path.join(PLUGIN, manifest.interface.logo)),
    fs.readFileSync(path.join(ROOT, "public", LOGO_URL)),
  );
  assert.deepEqual(
    fs.readFileSync(path.join(PLUGIN, manifest.interface.logoDark)),
    fs.readFileSync(path.join(ROOT, "public", LOGO_URL_REVERSED)),
  );
  assert.equal(mcp.mcpServers["ms-realty"].url, "https://ms-realty.ms-realty-bg.workers.dev/mcp");
  assert.equal(mcp.mcpServers["ms-realty"].bearer_token_env_var, "MS_REALTY_OPERATOR_TOKEN");
  assert.equal("headers" in mcp.mcpServers["ms-realty"], false);
  assert.deepEqual(Object.keys(mcp.mcpServers), ["ms-realty"]);
  assert.equal(marketplace.plugins[0].source.path, "./plugins/ms-realty-operator");
  assert.match(skill, /ms_realty_admin_context/);
  assert.match(skill, /Hermes never approves,\npublishes, marks content indexable, or sends customer messages/);
  assert.doesNotMatch(skill, /ms-realty-hermes/);
});
