import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";

const auth = { authorization: "Bearer local-admin-smoke" };

test("legacy listing editor routes hand off to the canonical Payload collection", async () => {
  const appRoute = await renderAppAdminResponse(
    new Request("https://example.test/admin/listings/edit?locale=bg&listingId=MS-CRAWL-0001", { headers: auth }),
  );
  assert.equal(appRoute.status, 307);
  assert.equal(appRoute.headers.get("location"), "/payload-admin/collections/listings/MS-CRAWL-0001");
  assert.equal(appRoute.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(await appRoute.text(), /data-editor-form="listing"/);

  const appApi = await renderAppAdminResponse(
    new Request("https://example.test/api/admin/listings/edit", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ listingId: "MS-CRAWL-0001", patch: { title: "not written here" } }),
    }),
  );
  assert.equal(appApi.status, 409);
  assert.deepEqual(await appApi.json(), {
    kind: "payload_canonical",
    message: "Listing edits are managed in Payload.",
    canonical_url: "/payload-admin/collections/listings/MS-CRAWL-0001",
  });

  const app = createHttpApp();
  const httpRoute = await dispatchHttp(app, {
    url: "/admin/listings/edit?listingId=MS-CRAWL-0001",
    headers: auth,
  });
  assert.equal(httpRoute.status, 307);
  assert.equal(httpRoute.headers.location, "/payload-admin/collections/listings/MS-CRAWL-0001");

  const httpApi = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listings/edit",
    headers: { ...auth, "content-type": "application/json" },
    body: { listingId: "MS-CRAWL-0001", patch: { title: "not written here" } },
  });
  assert.equal(httpApi.status, 409);
  assert.equal(httpApi.body.canonical_url, "/payload-admin/collections/listings/MS-CRAWL-0001");
});

test("bare admin validates authentication before its operations-shell redirect", async () => {
  const adminRoot = await import("../../app/admin/route.js");
  const unauthorized = await adminRoot.GET(new Request("https://example.test/admin?locale=bg"));
  assert.equal(unauthorized.status, 401);
  const response = await adminRoot.GET(new Request("https://example.test/admin?locale=bg", { headers: auth }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/admin/today?locale=bg");
});
