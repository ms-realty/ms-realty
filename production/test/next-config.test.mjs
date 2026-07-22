import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config.mjs";

test("Next preserves legacy trailing slashes for reviewed redirect handling", () => {
  assert.equal(nextConfig.skipTrailingSlashRedirect, true);
});
