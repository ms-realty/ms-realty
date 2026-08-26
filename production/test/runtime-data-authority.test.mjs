import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { appApiConfigFromEnv, renderAppApiResponse } from "../lib/app-api-adapter.mjs";
import { appRouterConfigFromEnv, renderAppRoute, renderAppRouteResponse } from "../lib/app-router-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { productionRuntimeDataUnavailable } from "../lib/runtime-data-boundary.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { fromRoot } from "../lib/paths.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const LIVE_ENV = {
  NODE_ENV: "production",
  MS_REALTY_RUNTIME_DATA_AUTHORITY: "payload",
};
const principal = { id: "runtime_admin", roles: ["admin"], can_mutate: true, source: "test" };

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
