import test from "node:test";
import assert from "node:assert/strict";
import { renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const auth = { authorization: "Bearer local-admin-smoke" };

test("custom listing editor renders locally and draft writes fail closed without a Payload runtime", async () => {
  const previousAdminActor = process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_ACTOR = "editor_bg";
  const appRoute = await renderAppAdminResponse(
    new Request("https://example.test/admin/listings/edit?locale=bg&listingId=MS-00815", { headers: auth }),
  );
  assert.equal(appRoute.status, 200);
  assert.equal(appRoute.headers.get("cache-control"), "no-store");
  assert.match(await appRoute.text(), /data-admin-mutation-form="listing"/);

  const appApi = await renderAppAdminResponse(
    new Request("https://example.test/api/admin/listings/edit", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ listingId: "MS-00815", patch: { title: "not written here" } }),
    }),
  );
  assert.equal(appApi.status, 503);
  assert.deepEqual(await appApi.json(), {
    kind: "payload_draft_unavailable",
    message: "Payload draft store is not configured",
  });

  const app = createHttpApp();
  const httpRoute = await dispatchHttp(app, {
    url: "/admin/listings/edit?listingId=MS-00815",
    headers: auth,
  });
  assert.equal(httpRoute.status, 200);
  assert.match(httpRoute.body, /data-admin-mutation-form="listing"/);

  const httpApi = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listings/edit",
    headers: { ...auth, "content-type": "application/json" },
    body: { listingId: "MS-00815", patch: { title: "not written here" } },
  });
  assert.equal(httpApi.status, 503);
  assert.equal(httpApi.body.kind, "payload_draft_unavailable");
  if (previousAdminActor === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
  else process.env.MS_REALTY_ADMIN_ACTOR = previousAdminActor;
});

test("bare admin validates authentication before its operations-shell redirect", async () => {
  const adminRoot = await import("../../app/admin/route.js");
  const unauthorized = await adminRoot.GET(new Request("https://example.test/admin?locale=bg"));
  assert.equal(unauthorized.status, 401);
  const response = await adminRoot.GET(new Request("https://example.test/admin?locale=bg", { headers: auth }));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "/admin/today?locale=bg");
});

test("custom listing editor writes durable draft changes through the shared service", async () => {
  const runtime = createPayloadDraftRuntime(loadCmsSeed());
  const appApi = await renderAppAdminResponse(
    new Request("https://example.test/api/admin/listings/edit", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ listingId: "MS-00815", patch: { title: "Payload-backed title" } }),
    }),
    { config: { payloadListingRuntime: runtime.payload, adminPrincipal: { id: "editor_bg", roles: ["editor"], can_mutate: true } } },
  );
  const body = await appApi.json();
  assert.equal(appApi.status, 201);
  assert.equal(body.kind, "listing_draft_saved");
  assert.equal(body.editor_url, "/admin/listings/edit?listingId=MS-00815");
  assert.equal(body.publication_approval_changed, false);
  assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-00815").facts.title, "Payload-backed title");
});

test("custom listing editor preserves explicit empty-string form clears for durable drafts", async () => {
  const seed = loadCmsSeed();
  const listing = seed.records.find((record) => record.id === "MS-00815");
  listing.seo.canonical_override = "/bg/custom-canonical";
  const runtime = createPayloadDraftRuntime(seed);
  const previousAdminActor = process.env.MS_REALTY_ADMIN_ACTOR;
  process.env.MS_REALTY_ADMIN_ACTOR = "editor_bg";
  const app = createHttpApp({ payloadListingRuntime: runtime.payload });
  const response = await dispatchHttp(app, {
    method: "POST",
    url: "/api/admin/listings/edit",
    headers: { ...auth, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      listingId: "MS-00815",
      seo_canonical: "",
    }).toString(),
  });
  if (previousAdminActor === undefined) delete process.env.MS_REALTY_ADMIN_ACTOR;
  else process.env.MS_REALTY_ADMIN_ACTOR = previousAdminActor;
  assert.equal(response.status, 201);
  assert.equal(response.body.kind, "listing_draft_saved");
  assert.equal(runtime.currentRows().listings.find((row) => row.id === "MS-00815").seo.canonical_override, "");
});

test("durable listing edits surface stale translations in both dedicated queue runtimes", async () => {
  const runtime = createPayloadDraftRuntime(loadCmsSeed());
  const targetLocales = ["de", "el", "en", "he", "nl", "ru"];
  const config = {
    payloadListingRuntime: runtime.payload,
    runtimeDataDurableOnly: true,
    adminPrincipal: { id: "editor_bg", roles: ["editor"], can_mutate: true },
  };

  const appEdit = await renderAppAdminResponse(
    new Request("https://example.test/api/admin/listings/edit", {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ listingId: "MS-00815", patch: { title: "Queue-visible draft title" } }),
    }),
    { config },
  );
  assert.equal(appEdit.status, 201);

  const localeById = new Map(runtime.currentRows().locales.map((locale) => [String(locale.id), locale.code]));
  const durableTranslations = runtime.currentRows().listing_translations.filter(
    (row) => String(row.listing) === "MS-00815" && localeById.get(String(row.locale)) !== "bg",
  );
  assert.deepEqual(durableTranslations.map((row) => localeById.get(String(row.locale))).sort(), targetLocales);
  assert.equal(
    durableTranslations.every(
      (row) => row.status === "draft" && row.translation_state === "stale" && row.public_indexable === false,
    ),
    true,
  );

  const app = createHttpApp({ payloadListingRuntime: runtime.payload, runtimeDataDurableOnly: true });
  for (const targetLocale of targetLocales) {
    const appQueue = await renderAppAdminResponse(
      new Request(
        `https://example.test/api/admin/translations?locale=bg&targetLocale=${targetLocale}&q=MS-00815`,
        { headers: auth },
      ),
      { config },
    );
    const appQueueBody = await appQueue.json();
    assert.equal(appQueue.status, 200);
    assert.equal(appQueueBody.translationTasks.length, 1);
    assert.equal(appQueueBody.translationTasks[0].listing_id, "MS-00815");
    assert.equal(appQueueBody.translationTasks[0].target_locale, targetLocale);
    assert.equal(appQueueBody.translationTasks[0].current_status, "stale");
    assert.equal(appQueueBody.translationTasks[0].task_type, "stale_review_required");

    const httpQueue = await dispatchHttp(app, {
      url: `/api/admin/translations?locale=bg&targetLocale=${targetLocale}&q=MS-00815`,
      headers: auth,
    });
    assert.equal(httpQueue.status, 200);
    assert.equal(httpQueue.body.translationTasks.length, 1);
    assert.equal(httpQueue.body.translationTasks[0].listing_id, "MS-00815");
    assert.equal(httpQueue.body.translationTasks[0].target_locale, targetLocale);
    assert.equal(httpQueue.body.translationTasks[0].current_status, "stale");
    assert.equal(httpQueue.body.translationTasks[0].task_type, "stale_review_required");
  }
});
