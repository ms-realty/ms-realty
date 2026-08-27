import test from "node:test";
import assert from "node:assert/strict";

import {
  MISSING_R2_MEDIA,
  assertRecoveredObjects,
  createCloudflareR2Storage,
  listR2Objects,
  repairMissingR2Media,
} from "../scripts/repair-missing-r2-media.mjs";
import { createHash } from "node:crypto";

function jpeg(size, marker = 0) {
  const bytes = Buffer.alloc(size, marker);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes;
}

test("R2 repair retrieves and uploads the fixed missing-object allowlist", async () => {
  const stored = [];
  const bytes = jpeg(19_235);
  const entries = [{ key: MISSING_R2_MEDIA[0].key, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }];
  const repaired = await repairMissingR2Media({
    fetchImpl: async (url) => {
      assert.equal(url, `https://${entries[0].key}`);
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    },
    storage: {
      async put(input) {
        stored.push(input);
        return { key: input.key, bytes: input.bytes.length };
      },
    },
    entries,
  });
  assert.equal(MISSING_R2_MEDIA.length, 13);
  assert.equal(MISSING_R2_MEDIA.reduce((total, item) => total + item.size, 0), 594_095);
  assert.ok(MISSING_R2_MEDIA.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
  assert.equal(repaired.length, 1);
  assert.equal(stored.length, 1);
  assert.ok(repaired.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256)));
});

test("R2 repair refuses a source body whose exact byte contract changed", async () => {
  await assert.rejects(
    repairMissingR2Media({
      fetchImpl: async () => new Response(jpeg(4), { status: 200, headers: { "content-type": "image/jpeg" } }),
      storage: { put: async () => assert.fail("invalid bytes must not be stored") },
      entries: [MISSING_R2_MEDIA[0]],
    }),
    /expected 19235 bytes, received 4/,
  );
});

test("Cloudflare upload preserves a Cyrillic R2 key and verifies the echoed object", async () => {
  const key = MISSING_R2_MEDIA.find(({ key }) => key.includes("сандански-парк"))?.key;
  assert.ok(key);
  const bytes = jpeg(5);
  const storage = createCloudflareR2Storage({
    accountId: "account-id",
    apiToken: "api-token",
    fetchImpl: async (url, init) => {
      assert.equal(decodeURIComponent(new URL(url).pathname).endsWith(`/objects/${key}`), true);
      assert.equal(init.method, "PUT");
      assert.equal(init.headers.authorization, "Bearer api-token");
      assert.deepEqual(init.body, bytes);
      return Response.json({ success: true, result: { key, size: String(bytes.length) } });
    },
  });
  assert.deepEqual(await storage.put({ key, bytes, contentType: "image/jpeg" }), { key, bytes: 5 });
});

test("Cloudflare listing pagination is flattened and verifies every repaired key", async () => {
  const pages = [
    MISSING_R2_MEDIA.slice(0, 7).map(({ key, size }) => ({ key, size })),
    MISSING_R2_MEDIA.slice(7).map(({ key, size }) => ({ key, size })),
  ];
  let call = 0;
  const objects = await listR2Objects({
    accountId: "account-id",
    apiToken: "api-token",
    fetchImpl: async (url, init) => {
      assert.equal(init.headers.authorization, "Bearer api-token");
      assert.equal(url.searchParams.get("per_page"), "1000");
      if (call === 1) assert.equal(url.searchParams.get("cursor"), "next");
      const result = pages[call++];
      return Response.json({
        success: true,
        result,
        result_info: { is_truncated: call === 1, cursor: call === 1 ? "next" : "" },
      });
    },
  });
  assert.equal(call, 2);
  assertRecoveredObjects(objects);
});
