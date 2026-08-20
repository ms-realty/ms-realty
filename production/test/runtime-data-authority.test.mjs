import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { appRouterConfigFromEnv, renderAppRoute, renderAppRouteResponse } from "../lib/app-router-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { productionRuntimeDataUnavailable } from "../lib/runtime-data-boundary.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const LIVE_ENV = {
  NODE_ENV: "production",
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
};
const principal = { id: "runtime_admin", roles: ["admin"], can_mutate: true, source: "test" };

test("only the explicit live runtime marker activates durable-only behavior", () => {
  assert.equal(appRouterConfigFromEnv({ NODE_ENV: "production" }).runtimeDataDurableOnly, false);
  assert.equal(appApiConfigFromEnv({ NODE_ENV: "production" }).runtimeDataDurableOnly, false);
  assert.equal(appAdminConfigFromEnv({ NODE_ENV: "production" }).runtimeDataDurableOnly, false);
  assert.equal(appRouterConfigFromEnv(LIVE_ENV).runtimeDataDurableOnly, true);
  assert.equal(appApiConfigFromEnv(LIVE_ENV).runtimeDataDurableOnly, true);
  assert.equal(appAdminConfigFromEnv(LIVE_ENV).runtimeDataDurableOnly, true);
  assert.equal(
    productionRuntimeDataUnavailable({ durableOnly: true, durableEvent: true, method: "POST", pathname: "/api/events" }),
    false,
  );
  assert.equal(
    productionRuntimeDataUnavailable({
      durableOnly: true,
      durableProviderDelivery: true,
      method: "POST",
      pathname: "/api/admin/replies/delivery",
    }),
    false,
  );
  assert.equal(
    productionRuntimeDataUnavailable({
      durableOnly: true,
      durableViewing: true,
      method: "GET",
      pathname: "/api/admin/viewings",
    }),
    false,
  );

  const build = renderAppRoute({
    pathname: "/bg",
    url: "https://build.test/bg",
    config: appRouterConfigFromEnv({ NODE_ENV: "production" }),
  });
  assert.equal(build.status, 200);
});

test("Next public entry paths fail closed without Payload instead of serving the baked fixture", async () => {
  const config = appRouterConfigFromEnv(LIVE_ENV);
  const page = await renderAppRouteResponse({ pathname: "/bg", url: "https://live.test/bg", config });
  assert.equal(page.status, 503);
  assert.equal((await page.json()).kind, "payload_draft_unavailable");

  const api = await renderAppApiResponse(new Request("https://live.test/api/search?locale=bg"), {
    config: appApiConfigFromEnv(LIVE_ENV),
  });
  assert.equal(api.status, 503);
  assert.equal((await api.json()).kind, "payload_draft_unavailable");
});

test("Next and standalone public paths render the complete Payload snapshot", async () => {
  const runtime = createPayloadDraftRuntime(loadCmsSeed());
  const nextConfig = { ...appRouterConfigFromEnv(LIVE_ENV), payloadListingRuntime: runtime.payload };
  const next = await renderAppRouteResponse({ pathname: "/bg", url: "https://live.test/bg", config: nextConfig });
  assert.equal(next.status, 200);
  assert.match(await next.text(), /data-react-public-ui="home"/);

  const standalone = createHttpApp({ runtimeDataDurableOnly: true, payloadListingRuntime: runtime.payload });
  const live = await dispatchHttp(standalone, { url: "/bg", headers: { accept: "text/html" } });
  assert.equal(live.status, 200);
  assert.match(live.body, /data-react-public-ui="home"/);

  const blockedMutation = await dispatchHttp(standalone, { method: "POST", url: "/api/saved-searches", body: {} });
  assert.equal(blockedMutation.status, 503);
  assert.equal(blockedMutation.body.kind, "runtime_data_unavailable");

  const unavailable = await dispatchHttp(createHttpApp({ runtimeDataDurableOnly: true }), { url: "/bg" });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.body.kind, "payload_draft_unavailable");
});

test("durable admin reads use Payload while every remaining file mutation fails closed", async () => {
  const runtime = createPayloadDraftRuntime(loadCmsSeed());
  const config = {
    ...appAdminConfigFromEnv(LIVE_ENV),
    adminPrincipal: principal,
    payloadListingRuntime: runtime.payload,
  };
  const listing = await renderAppAdminResponse(new Request("https://live.test/admin/listings?locale=bg"), { config });
  assert.equal(listing.status, 200);
  const html = await listing.text();
  assert.match(html, /data-react-admin-ui="listing-manager"/);
  assert.doesNotMatch(html, /data-publication-schedule-panel="true"/);

  const translations = await renderAppAdminResponse(
    new Request("https://live.test/api/admin/translations?locale=bg"),
    { config },
  );
  assert.equal(translations.status, 200);
  assert.equal((await translations.json()).runtime_data_mode, "durable_only");

  for (const pathname of [
    "/api/admin/media/reviews",
    "/api/admin/tours/approve",
    "/api/admin/translations/publish",
    "/api/admin/listings/publication-schedules",
  ]) {
    assert.equal(productionRuntimeDataUnavailable({ durableOnly: true, method: "POST", pathname }), true);
    const response = await renderAppAdminResponse(new Request(`https://live.test${pathname}`, { method: "POST" }), { config });
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "runtime_data_unavailable", pathname);
  }

  for (const pathname of ["/api/admin/locales", "/admin/migration/review", "/api/admin/redirect-approval-workbook"]) {
    const response = await renderAppAdminResponse(new Request(`https://live.test${pathname}`), { config });
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "runtime_data_unavailable", pathname);
  }
});
