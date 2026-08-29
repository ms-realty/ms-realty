import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { appRouterConfigFromEnv, renderAppRoute, renderAppRouteResponse } from "../lib/app-router-adapter.mjs";
import { appendBrokerContact, createBrokerContact } from "../lib/broker-contacts.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { productionRuntimeDataUnavailable } from "../lib/runtime-data-boundary.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { appendSlugChange } from "../lib/slug-history.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { appendTourApproval, createTourApproval, galleryFallback } from "../lib/tours.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const LIVE_ENV = {
  NODE_ENV: "production",
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
};
const principal = { id: "runtime_admin", roles: ["admin"], can_mutate: true, source: "test" };
const APPROVED_TOUR_PANORAMA_URL = "https://ms-realty.ms-realty-bg.workers.dev/tours/MS-CRAWL-0001.jpg";
const APPROVED_TOUR_THUMBNAIL_URL = "https://ms-realty.ms-realty-bg.workers.dev/tours/MS-CRAWL-0001-thumb.jpg";

function tempAuthorityLedgerPaths(prefix) {
  const dir = fs.mkdtempSync(`${os.tmpdir()}/${prefix}-`);
  return {
    brokerContactLedgerPath: `${dir}/broker-contacts.jsonl`,
    tourApprovalLedgerPath: `${dir}/tour-approvals.jsonl`,
    slugHistoryPath: `${dir}/slug-history.jsonl`,
    cmsSeedPath: `${dir}/cms-seed.json`,
  };
}

function withListingTour(seed, patch) {
  return {
    ...seed,
    records: seed.records.map((record) =>
      record.collection === "listings" && record.id === "MS-CRAWL-0001"
        ? { ...record, tour: patch(record) }
        : record,
    ),
  };
}

function pendingTourSeed(seed = loadCmsSeed()) {
  return withListingTour(seed, (record) => ({
    ...(record.tour || {}),
    provider: "photo-sphere-viewer",
    listing_id: record.id,
    panorama_url: APPROVED_TOUR_PANORAMA_URL,
    thumbnail_url: APPROVED_TOUR_THUMBNAIL_URL,
    accessibility_caption: "Pending 360 panorama for MS-CRAWL-0001.",
    fallback_gallery: galleryFallback(record.media || []),
    is_public: false,
    review_status: "review_required",
  }));
}

function approvedTourSeed(seed = loadCmsSeed()) {
  return withListingTour(seed, (record) => ({
    ...(record.tour || {}),
    provider: "photo-sphere-viewer",
    listing_id: record.id,
    panorama_url: APPROVED_TOUR_PANORAMA_URL,
    thumbnail_url: APPROVED_TOUR_THUMBNAIL_URL,
    accessibility_caption: "Reviewed 360 panorama for MS-CRAWL-0001.",
    fallback_gallery: galleryFallback(record.media || []),
    is_public: true,
    review_status: "approved",
  }));
}

const REFUSED_ORIGIN_SCRIPT = `
  import { productionServerConfig, createProductionServer } from "./production/server.mjs";
  import { close, listen } from "./production/lib/node-server.mjs";

  let server;
  process.on("unhandledRejection", (reason) => {
    process.stderr.write("TEST_UNHANDLED_REJECTION:" + (reason?.stack || String(reason)) + "\\n");
    process.exitCode = 1;
  });
  try {
    const config = productionServerConfig();
    server = createProductionServer(config);
    const address = await listen(server, config.port, config.host);
    process.stdout.write("MS_REALTY_TEST_READY:" + address.port + "\\n");
    const shutdown = async () => {
      await close(server);
    };
    process.once("SIGTERM", () => void shutdown());
    process.once("SIGINT", () => void shutdown());
  } catch (error) {
    process.stderr.write("TEST_SERVER_START_FAILURE:" + (error?.stack || String(error)) + "\\n");
    process.exitCode = 1;
  }
`;

async function startRefusedOrigin() {
  const child = spawn(process.execPath, ["--input-type=module", "-e", REFUSED_ORIGIN_SCRIPT], {
    cwd: fromRoot(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      MS_REALTY_HOST: "127.0.0.1",
      MS_REALTY_PORT: "0",
      MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
      PAYLOAD_SECRET: "test-payload-secret-12345678901234567890",
      DATABASE_URL: "postgres://test:test@127.0.0.1:59999/ms_realty",
      PGCONNECT_TIMEOUT: "1",
      MS_REALTY_ACCESS_LOG: "0",
    },
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error(`Refused-origin server did not start: ${stdout}\n${stderr}`));
    }, 10_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      const match = stdout.match(/MS_REALTY_TEST_READY:(\d+)/);
      if (!settled && match) {
        settled = true;
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });
    child.once("exit", (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Refused-origin server exited before ready (${code ?? signal}): ${stdout}\n${stderr}`));
      }
    });
  });
  const baseUrl = await ready;
  return {
    baseUrl,
    child,
    logs: () => `${stdout}\n${stderr}`,
  };
}

async function stopRefusedOrigin(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

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

test("durable origin refusal is a localized no-store page for browsers and truthful JSON for APIs", async () => {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
    PAYLOAD_SECRET: "",
    DATABASE_URL: "",
  };
  for (const pathname of ["/bg", "/en", "/bg/tarsene"]) {
    const response = await renderAppRouteResponse({
      pathname,
      url: `https://live.test${pathname}`,
      accept: "text/html",
      config: appRouterConfigFromEnv(env),
    });
    const html = await response.text();
    assert.equal(response.status, 503, pathname);
    assert.equal(response.headers.get("cache-control"), "no-store", pathname);
    assert.match(response.headers.get("content-type"), /text\/html/, pathname);
    assert.match(html, /data-react-public-ui="(?:origin|search)-unavailable"/, pathname);
    assert.match(html, /временно|temporarily unavailable/, pathname);
    assert.match(html, /\+359/, pathname);
  }

  const api = await renderAppApiResponse(new Request("https://live.test/api/health", { headers: { accept: "application/json" } }), {
    config: appApiConfigFromEnv(env),
  });
  const health = await api.json();
  assert.equal(api.status, 503);
  assert.equal(api.headers.get("cache-control"), "no-store");
  assert.equal(health.status, "degraded");
  assert.equal(health.dependency_status, "unavailable");

  const standalone = await dispatchHttp(
    createHttpApp({ runtimeDataDurableOnly: true, payloadListingRuntime: {}, payloadListingEnv: env }),
    { url: "/bg/tarsene", headers: { accept: "text/html" } },
  );
  assert.equal(standalone.status, 503);
  assert.equal(standalone.headers["cache-control"], "no-store");
  assert.match(standalone.body, /data-react-public-ui="(?:origin|search)-unavailable"/);
});

test("durable health performs one lightweight Payload query", async () => {
  const nextRuntime = createPayloadDraftRuntime(loadCmsSeed());
  const next = await renderAppApiResponse(new Request("https://live.test/api/health"), {
    config: {
      ...appApiConfigFromEnv(LIVE_ENV),
      payloadListingRuntime: nextRuntime.payload,
    },
  });
  assert.equal(next.status, 200);
  assert.deepEqual(nextRuntime.payload.calls.find.map(({ collection }) => collection), ["listings"]);
  assert.equal(nextRuntime.payload.calls.begin, 0);

  const standaloneRuntime = createPayloadDraftRuntime(loadCmsSeed());
  const standalone = await dispatchHttp(
    createHttpApp({
      runtimeDataDurableOnly: true,
      payloadListingRuntime: standaloneRuntime.payload,
      payloadListingEnv: LIVE_ENV,
    }),
    { url: "/api/health" },
  );
  assert.equal(standalone.status, 200);
  assert.deepEqual(standaloneRuntime.payload.calls.find.map(({ collection }) => collection), ["listings"]);
  assert.equal(standaloneRuntime.payload.calls.begin, 0);
});

test("a real refused Postgres origin stays alive and does not leak rejected promises", async () => {
  const origin = await startRefusedOrigin();
  try {
    for (const pathname of ["/bg", "/bg/imoti/MS-CRAWL-0001", "/bg/tarsene"]) {
      const response = await fetch(`${origin.baseUrl}${pathname}`, { headers: { accept: "text/html" } });
      const html = await response.text();
      assert.equal(response.status, 503, pathname);
      assert.equal(response.headers.get("cache-control"), "no-store", pathname);
      assert.match(response.headers.get("content-type"), /text\/html/, pathname);
      assert.match(html, /data-react-public-ui="(?:origin|search)-unavailable"/, pathname);
      assert.match(html, /временно|temporarily unavailable/, pathname);
      assert.match(html, /\+359/, pathname);
    }

    for (const pathname of ["/api/search", "/api/health"]) {
      const response = await fetch(`${origin.baseUrl}${pathname}`, { headers: { accept: "application/json" } });
      const body = await response.json();
      assert.equal(response.status, 503, pathname);
      assert.equal(response.headers.get("cache-control"), "no-store", pathname);
      assert.match(response.headers.get("content-type"), /application\/json/, pathname);
      if (pathname === "/api/health") {
        assert.equal(body.status, "degraded");
        assert.equal(body.dependency_status, "unavailable");
        assert.ok(Object.hasOwn(body, "build_marker"));
      } else {
        assert.equal(body.kind, "payload_draft_unavailable");
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2_600));
    const afterDelay = await fetch(`${origin.baseUrl}/bg`, { headers: { accept: "text/html" } });
    assert.equal(afterDelay.status, 503);
    assert.equal(afterDelay.headers.get("cache-control"), "no-store");
    assert.match(await afterDelay.text(), /data-react-public-ui="origin-unavailable"/);
    assert.doesNotMatch(origin.logs(), /TEST_UNHANDLED_REJECTION|unhandled_rejection/i);
  } finally {
    await stopRefusedOrigin(origin.child);
  }
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

test("durable public listing routes keep mounted broker contacts, tour approvals, and slug redirects", async () => {
  const seed = loadCmsSeed();
  const runtime = createPayloadDraftRuntime(seed);
  const paths = tempAuthorityLedgerPaths("ms-realty-runtime-authority-public");
  appendBrokerContact(
    createBrokerContact({
      listingId: "MS-CRAWL-0001",
      broker: "Noa Levi",
      phone: "+359879696870",
      reviewer: "broker_editor",
      sourceReference: "test://broker-contact/MS-CRAWL-0001",
      validationStatus: "broker_verified",
      approved: true,
    }),
    { filePath: paths.brokerContactLedgerPath },
  );
  appendTourApproval(
    createTourApproval(seed, {
      listingId: "MS-CRAWL-0001",
      reviewer: "media_editor",
      reviewConfirmed: true,
      panoramaUrl: APPROVED_TOUR_PANORAMA_URL,
      thumbnailUrl: APPROVED_TOUR_THUMBNAIL_URL,
      accessibilityCaption: "Reviewed 360 panorama for MS-CRAWL-0001.",
    }),
    { filePath: paths.tourApprovalLedgerPath },
  );
  appendSlugChange(
    loadLocaleRegistry(),
    seed,
    {
      listingId: "MS-CRAWL-0001",
      locale: "he",
      oldPath: "/he/properties/ms-crawl-0001-legacy",
      newPath: "/he/properties/MS-CRAWL-0001",
      editor: "route_editor",
    },
    { filePath: paths.slugHistoryPath, changedAt: "2026-08-29T00:00:00.000Z" },
  );

  const next = await renderAppRouteResponse({
    pathname: "/he/properties/MS-CRAWL-0001",
    url: "https://live.test/he/properties/MS-CRAWL-0001",
    accept: "text/html",
    config: {
      ...appRouterConfigFromEnv(LIVE_ENV),
      payloadListingRuntime: runtime.payload,
      brokerContactLedgerPath: paths.brokerContactLedgerPath,
      tourApprovalLedgerPath: paths.tourApprovalLedgerPath,
    },
  });
  assert.equal(next.status, 200);
  const nextHtml = await next.text();
  assert.match(nextHtml, /data-review-status="approved_broker_contact"/);
  assert.match(nextHtml, /data-photo-sphere-viewer="psv-listing-tour"/);

  const standalone = createHttpApp({
    runtimeDataDurableOnly: true,
    payloadListingRuntime: runtime.payload,
    payloadListingEnv: LIVE_ENV,
    brokerContactLedgerPath: paths.brokerContactLedgerPath,
    tourApprovalLedgerPath: paths.tourApprovalLedgerPath,
    slugHistoryPath: paths.slugHistoryPath,
  });
  const listing = await dispatchHttp(standalone, { url: "/he/properties/MS-CRAWL-0001?format=html" });
  assert.equal(listing.status, 200);
  assert.match(listing.body, /data-review-status="approved_broker_contact"/);
  assert.match(listing.body, /data-photo-sphere-viewer="psv-listing-tour"/);

  const slugRedirect = await dispatchHttp(standalone, { url: "/he/properties/ms-crawl-0001-legacy" });
  assert.equal(slugRedirect.status, 301);
  assert.equal(slugRedirect.headers.location, "/he/properties/MS-CRAWL-0001");
});

test("durable launch readiness uses projected Payload tours instead of baked pending review rows", async () => {
  const pendingSeed = pendingTourSeed();
  const projectedRuntime = createPayloadDraftRuntime(approvedTourSeed());
  const paths = tempAuthorityLedgerPaths("ms-realty-runtime-authority-readiness");
  fs.writeFileSync(paths.cmsSeedPath, `${JSON.stringify(pendingSeed, null, 2)}\n`);

  const next = await renderAppAdminResponse(new Request("https://live.test/api/admin/launch-readiness"), {
    config: {
      ...appAdminConfigFromEnv(LIVE_ENV),
      adminPrincipal: principal,
      cmsSeedPath: paths.cmsSeedPath,
      payloadListingRuntime: projectedRuntime.payload,
      payloadListingEnv: LIVE_ENV,
    },
  });
  assert.equal(next.status, 200);
  const nextBody = await next.json();
  assert.deepEqual(
    nextBody.warnings.filter((warning) => warning.id === "listing_quality.tour_review_pending"),
    [],
  );

  const standalone = await dispatchHttp(
    createHttpApp({
      runtimeDataDurableOnly: true,
      payloadListingRuntime: projectedRuntime.payload,
      payloadListingEnv: LIVE_ENV,
      seed: pendingSeed,
    }),
    {
      url: "/api/admin/launch-readiness",
      headers: { authorization: "Bearer local-admin-smoke" },
    },
  );
  assert.equal(standalone.status, 200);
  assert.deepEqual(
    standalone.body.warnings.filter((warning) => warning.id === "listing_quality.tour_review_pending"),
    [],
  );
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
  assert.match(html, /data-unavailable-data="[^"]*translationTasks[^"]*"/);
  assert.match(html, /Нужна е връзка с данните/);
  assert.doesNotMatch(html, /data-publication-schedule-panel="true"/);

  const listingApi = await renderAppAdminResponse(new Request("https://live.test/api/admin/listings?locale=en"), { config });
  const listingBody = await listingApi.json();
  assert.equal(listingApi.status, 200);
  assert.deepEqual(
    Object.fromEntries(Object.entries(listingBody.dataAvailability).map(([key, value]) => [key, value.status])),
    {
      publicationSchedules: "unavailable",
      slugHistory: "unavailable",
      translationTasks: "unavailable",
    },
  );
  assert.equal(listingBody.summary.translationReviewRequired, null);
  assert.equal(listingBody.publicationSchedules, null);
  assert.equal(listingBody.listings.every((row) => row.translation_review_required === null), true);

  const editor = await renderAppAdminResponse(
    new Request("https://live.test/admin/listings/edit?listingId=MS-CRAWL-0001&locale=en"),
    { config },
  );
  const editorHtml = await editor.text();
  assert.equal(editor.status, 200);
  assert.match(editorHtml, /data-action-unavailable="runtime"/);
  assert.match(editorHtml, /data-unavailable-data="[^"]*listingEdits[^"]*"/);
  assert.match(editorHtml, /data-unavailable-data="[^"]*tourApprovals[^"]*"/);
  assert.match(editorHtml, /Data connection required/);
  assert.match(editorHtml, /Your owner permissions are active/);
  assert.doesNotMatch(editorHtml, /data-read-only-role="true"/);

  const translations = await renderAppAdminResponse(
    new Request("https://live.test/api/admin/translations?locale=bg"),
    { config },
  );
  assert.equal(translations.status, 200);
  const translationsBody = await translations.json();
  assert.equal(translationsBody.runtime_data_mode, "durable_only");
  assert.equal(translationsBody.dataAvailability.translationTasks.status, "unavailable");
  assert.equal(translationsBody.summary.approved_waiting_publish, null);
  assert.equal(translationsBody.summary.open_translation_tasks, null);
  assert.equal(translationsBody.summary.stale_translation_tasks, null);

  const translationPage = await renderAppAdminResponse(
    new Request("https://live.test/admin/translations?locale=ru"),
    { config },
  );
  assert.equal(translationPage.status, 200);
  const translationHtml = await translationPage.text();
  assert.match(translationHtml, /data-unavailable-data="translationTasks"/);
  assert.match(translationHtml, /Нужно подключение к данным/);

  for (const pathname of ["/api/admin/reports", "/api/admin/reports/export"]) {
    const response = await renderAppAdminResponse(new Request(`https://live.test${pathname}`), { config });
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "runtime_data_unavailable", pathname);
  }

  const blockedReportsPage = await renderAppAdminResponse(
    new Request("https://live.test/admin/reports?locale=en", { headers: { accept: "text/html" } }),
    { config },
  );
  assert.equal(blockedReportsPage.status, 503);
  const blockedReportsHtml = await blockedReportsPage.text();
  assert.match(blockedReportsHtml, /data-react-admin-ui="runtime-unavailable"/);
  assert.match(blockedReportsHtml, /<code>\/admin\/reports<\/code>/);

  const blockedAlertRun = await renderAppAdminResponse(
    new Request("https://live.test/api/admin/saved-search-alerts/run-due", { method: "POST" }),
    { config },
  );
  assert.equal(blockedAlertRun.status, 503);
  assert.equal((await blockedAlertRun.json()).kind, "runtime_data_unavailable");

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

  for (const pathname of ["/api/admin/locales", "/api/admin/redirect-approval-workbook"]) {
    const response = await renderAppAdminResponse(new Request(`https://live.test${pathname}`), { config });
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "runtime_data_unavailable", pathname);
  }

  const blockedPage = await renderAppAdminResponse(
    new Request("https://live.test/admin/migration/review?locale=en"),
    { config },
  );
  const blockedHtml = await blockedPage.text();
  assert.equal(blockedPage.status, 503);
  assert.match(blockedPage.headers.get("content-type"), /text\/html/);
  assert.match(blockedHtml, /data-react-admin-ui="runtime-unavailable"/);
  assert.match(blockedHtml, /Your owner permissions are active/);
  assert.match(blockedHtml, /href="\/admin\/connect"/);
  assert.match(blockedHtml, /<code>\/admin\/migration\/review<\/code>/);

  const standalone = createHttpApp({
    runtimeDataDurableOnly: true,
    payloadListingRuntime: runtime.payload,
    payloadListingEnv: LIVE_ENV,
  });
  const standaloneListings = await dispatchHttp(standalone, {
    url: "/api/admin/listings?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  assert.equal(standaloneListings.status, 200);
  assert.equal(standaloneListings.body.dataAvailability.publicationSchedules.status, "unavailable");
  assert.equal(standaloneListings.body.dataAvailability.slugHistory.status, "unavailable");
  assert.equal(standaloneListings.body.summary.translationReviewRequired, null);
  assert.equal(standaloneListings.body.publicationSchedules, null);

  const standaloneEditor = await dispatchHttp(standalone, {
    url: "/admin/listings/edit?listingId=MS-CRAWL-0001&locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  assert.equal(standaloneEditor.status, 200);
  assert.match(standaloneEditor.body, /data-unavailable-data="[^"]*listingEdits[^"]*"/);
  assert.match(standaloneEditor.body, /data-unavailable-data="[^"]*tourApprovals[^"]*"/);
  assert.match(standaloneEditor.body, /Data connection required/);

  const standaloneTranslations = await dispatchHttp(standalone, {
    url: "/api/admin/translations?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  assert.equal(standaloneTranslations.status, 200);
  assert.equal(standaloneTranslations.body.dataAvailability.translationTasks.status, "unavailable");
  assert.equal(standaloneTranslations.body.summary.approved_waiting_publish, null);
  assert.equal(standaloneTranslations.body.summary.open_translation_tasks, null);
  assert.equal(standaloneTranslations.body.summary.stale_translation_tasks, null);

  for (const request of [
    { method: "GET", url: "/api/admin/reports" },
    { method: "GET", url: "/api/admin/reports/export" },
    { method: "POST", url: "/api/admin/saved-search-alerts/run-due" },
  ]) {
    const response = await dispatchHttp(standalone, {
      ...request,
      headers: { authorization: "Bearer local-admin-smoke" },
    });
    assert.equal(response.status, 503, request.url);
    assert.equal(response.body.kind, "runtime_data_unavailable", request.url);
  }

  const standaloneReportsPage = await dispatchHttp(standalone, {
    url: "/admin/reports?locale=ru",
    headers: { accept: "text/html", authorization: "Bearer local-admin-smoke" },
  });
  assert.equal(standaloneReportsPage.status, 503);
  assert.match(standaloneReportsPage.body, /data-react-admin-ui="runtime-unavailable"/);
  assert.match(standaloneReportsPage.body, /<code>\/admin\/reports<\/code>/);

  const standalonePage = await dispatchHttp(standalone, {
    url: "/admin/migration/review?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  assert.equal(standalonePage.status, 503);
  assert.match(standalonePage.headers["content-type"], /text\/html/);
  assert.match(standalonePage.body, /data-react-admin-ui="runtime-unavailable"/);

  const standaloneApi = await dispatchHttp(standalone, {
    url: "/api/admin/migration/review?locale=en",
    headers: { authorization: "Bearer local-admin-smoke" },
  });
  assert.equal(standaloneApi.status, 503);
  assert.equal(standaloneApi.body.kind, "runtime_data_unavailable");
});
