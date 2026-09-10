import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../../next.config.mjs";
import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern.js";

test("Next preserves legacy trailing slashes for reviewed redirect handling", () => {
  assert.equal(nextConfig.skipTrailingSlashRedirect, true);
});

test("only the native Payload admin may restart a request for its server-rendered theme", async () => {
  const rules = await nextConfig.headers();
  const critical = rules.filter(rule => rule.headers.some(header => header.key.toLowerCase() === "critical-ch"));
  assert.deepEqual(critical.map(rule => rule.source), ["/payload-admin/:path*"]);
  assert.ok(rules.some(rule => rule.source === "/:path*" && rule.headers.some(header => header.key === "Accept-CH")));
});

test("Next only optimizes the canonical public media namespace without source queries", () => {
  const allowed = (url) => hasRemoteMatch([], nextConfig.images.remotePatterns, new URL(url));
  assert.equal(allowed("https://makler-realty.com/media/makler-realty.com/wp-content/uploads/2025/08/photo.jpg"), true);
  assert.equal(allowed("https://makler-realty.com/media/makler-realty.ru/wp-content/uploads/2025/08/photo.jpg"), true);
  for (const url of [
    "https://example.com/media/photo.jpg",
    "https://makler-realty.com.example.com/media/photo.jpg",
    "https://ms-realty.ms-realty-bg.workers.dev/media/photo.jpg",
    "http://makler-realty.com/media/photo.jpg",
    "https://makler-realty.com:8443/media/photo.jpg",
    "https://makler-realty.com/wp-content/private/photo.jpg",
    "https://makler-realty.com/api/admin/media/uploads/photo",
    "https://makler-realty.com/media/photo.jpg?token=private",
    "https://127.0.0.1/media/photo.jpg",
  ]) assert.equal(allowed(url), false, url);
  assert.notEqual(nextConfig.images.dangerouslyAllowLocalIP, true);
});
