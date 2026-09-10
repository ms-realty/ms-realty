import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { invalidateListingProjection } from "../lib/listing-draft-service.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

for (const runtimeDataDurableOnly of [true, false]) test(`admin projection reuse with durable-only=${runtimeDataDurableOnly}`, async (t) => {
  const seed = loadCmsSeed();
  const { payload } = createPayloadDraftRuntime(seed);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "admin-projection-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const listingEditLedgerPath = path.join(root, "edits.jsonl");
  const mediaUploadLedgerPath = path.join(root, "uploads.jsonl");
  const mediaReviewLedgerPath = path.join(root, "reviews.jsonl");
  fs.writeFileSync(listingEditLedgerPath, JSON.stringify({ listing_id: seed.records.find(row => row.collection === "listings").id, patch: { price_eur: 123456 } }) + "\n");
  const env = { NODE_ENV: "production", MS_REALTY_LISTING_PROJECTION_TTL_MS: "60000" };
  const config = {
    ...appAdminConfigFromEnv(env),
    authEnv: env,
    runtimeDataDurableOnly,
    listingEditLedgerPath, mediaUploadLedgerPath, mediaReviewLedgerPath,
    payloadListingRuntime: payload,
    adminPrincipal: { id: "owner_admin", roles: ["admin"], source: "payload", workspace_ids: [] },
    hermesAgentFetch: async () => { throw new Error("No network in this check"); },
  };
  const get = async path => {
    const response = await renderAppAdminResponse(new Request("http://admin.test" + path, { headers: { accept: "text/html" } }), { config: { ...config, authEnv: { ...env } } });
    assert.equal(response.status, 200);
    return response.text();
  };
  const reads = () => payload.calls.find.filter(call => call.collection === "listings").length;
  await get("/admin/listings");
  const first = reads();
  assert.ok(first > 0);
  await get("/admin/hermes");
  await get("/admin/listings");
  assert.equal(reads(), first, "navigation must not repeat the listing snapshot");
  invalidateListingProjection();
  await get("/admin/listings");
  assert.ok(reads() > first, "a committed change still refreshes the projection");
  if (!runtimeDataDurableOnly) {
    for (const file of [listingEditLedgerPath, mediaUploadLedgerPath, mediaReviewLedgerPath]) {
      const before = reads();
      fs.appendFileSync(file, "\n");
      await get("/admin/listings");
      assert.ok(reads() > before, "file changes and newly created ledgers refresh the projection");
      await get("/admin/hermes");
      const after = reads();
      await get("/admin/listings");
      assert.equal(reads(), after, "unchanged ledgers keep the new projection");
    }
  }
});
