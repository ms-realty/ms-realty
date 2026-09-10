import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { invalidateListingProjection } from "../lib/listing-draft-service.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

test("durable admin pages reuse the projection and refresh after invalidation", async () => {
  const { payload } = createPayloadDraftRuntime(loadCmsSeed());
  const env = { NODE_ENV: "production", MS_REALTY_LISTING_PROJECTION_TTL_MS: "60000" };
  const config = {
    ...appAdminConfigFromEnv(env),
    authEnv: env,
    runtimeDataDurableOnly: true,
    payloadListingRuntime: payload,
    adminPrincipal: { id: "owner_admin", roles: ["admin"], source: "payload", workspace_ids: [] },
    hermesAgentFetch: async () => { throw new Error("No network in this check"); },
  };
  const get = async path => {
    const response = await renderAppAdminResponse(new Request("http://admin.test" + path, { headers: { accept: "text/html" } }), { config });
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
});
