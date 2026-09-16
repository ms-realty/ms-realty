// A listing's history, told on the listing: read back from Payload's own
// versions where Payload is the authority, from the file audit log elsewhere,
// and reported as unavailable when neither can be read.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { appendAuditLog, createAuditLogEntry } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { saveListingDraft } from "../lib/listing-draft-service.mjs";
import {
  listingHistoryFromAudit,
  listingHistoryFromVersions,
  loadListingHistory,
} from "../lib/listing-edit-history.mjs";
import { payloadAdminPrincipal } from "../lib/payload-admin-auth.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { createPayloadDraftRuntime } from "./payload-draft-runtime.fixture.mjs";

const SESSION = "payload.history.session";
const EDITOR = { id: 3, collection: "admins", email: "owner@example.com", role: "admin", workspace_ids: [] };
const OPERATOR = payloadAdminPrincipal(EDITOR);
const ORIGIN = "https://ms-realty.example";
// Earlier than the fixture's version clock, so an edit made through the app is
// older than any gallery change the fixture records afterwards.
const EDITED_AT = "2026-09-16T08:00:00.000Z";

const version = (at, doc) => ({ updatedAt: at, createdAt: at, version: doc });
const edit = (at, actor, fields, channel = "admin") => ({
  last_edit_event: { edited_at: at, actor_id: actor, changed_fields: fields, channel, stale_locales: ["en"] },
});

test("versions become what happened, once each, newest first", () => {
  const events = listingHistoryFromVersions([
    version("2026-09-01T10:00:00Z", { cms_status: "draft", media: [1, 2, 3] }),
    version("2026-09-02T10:00:00Z", { cms_status: "draft", media: [1, 2, 3], workflow: edit("2026-09-02T10:00:00Z", "payload-3", ["title", "price_eur"]) }),
    // A later version still carries the same edit; it is not a second edit.
    version("2026-09-03T10:00:00Z", { cms_status: "draft", media: [3, 1, 2], workflow: edit("2026-09-02T10:00:00Z", "payload-3", ["title", "price_eur"]) }),
    version("2026-09-04T10:00:00Z", { cms_status: "published", media: [3, 1, 2], workflow: edit("2026-09-02T10:00:00Z", "payload-3", ["title", "price_eur"]) }),
    version("2026-09-05T10:00:00Z", { cms_status: "published", media: [3, 1], workflow: edit("2026-09-05T10:00:00Z", "mcp-agent", ["description"], "mcp") }),
    { version: { cms_status: "draft" } },
  ]);
  assert.deepEqual(events.map((event) => event.kind), ["edited", "gallery_changed", "status", "gallery_reordered", "edited"]);
  assert.equal(events[0].channel, "mcp");
  assert.equal(events[0].actor, "mcp-agent");
  assert.deepEqual(events[4].fields, ["title", "price_eur"]);
  assert.deepEqual([events[2].from, events[2].to], ["draft", "published"]);
  // Gallery changes do not invent an actor the record does not hold.
  assert.equal(events[1].actor, null);
  assert.equal(events[1].count, 2);
  assert.equal(listingHistoryFromVersions([], {}).length, 0);
  assert.equal(listingHistoryFromVersions(Array.from({ length: 40 }, (_, index) =>
    version(`2026-09-01T10:${String(index).padStart(2, "0")}:00Z`, { workflow: edit(`2026-09-01T10:${String(index).padStart(2, "0")}:00Z`, "a", ["title"]) })), { limit: 5 }).length, 5);
});

test("the file audit log gives the same history for this listing only", () => {
  const entries = [
    createAuditLogEntry({ action: "listing_edited", actor: "editor-1", objectType: "listing", objectId: "MS-00815", metadata: { changed_fields: ["title"], source: "admin_payload_draft" } }, "2026-09-10T10:00:00Z"),
    createAuditLogEntry({ action: "media_reviewed", actor: "editor-2", objectType: "media_asset", objectId: "media-1", metadata: { listing_id: "MS-00815" } }, "2026-09-11T10:00:00Z"),
    createAuditLogEntry({ action: "listing_edited", actor: "agent", objectType: "listing", objectId: "MS-00815", metadata: { changed_fields: ["description"], source: "mcp_payload_draft" } }, "2026-09-12T10:00:00Z"),
    createAuditLogEntry({ action: "listing_edited", actor: "someone", objectType: "listing", objectId: "MS-00001", metadata: {} }, "2026-09-13T10:00:00Z"),
    createAuditLogEntry({ action: "task_opened", actor: "someone", objectType: "task", objectId: "t", metadata: { listing_id: "MS-00815" } }, "2026-09-14T10:00:00Z"),
  ];
  const events = listingHistoryFromAudit(entries, "MS-00815");
  assert.deepEqual(events.map((event) => [event.kind, event.actor, event.channel]), [
    ["edited", "agent", "mcp"],
    ["media_reviewed", "editor-2", "admin"],
    ["edited", "editor-1", "admin"],
  ]);
});

test("a history that cannot be read is unavailable, never empty", async () => {
  const failed = await loadListingHistory({ listingId: "MS-00815", readVersions: async () => { throw new Error("offline"); } });
  assert.equal(failed.status, "unavailable");
  const nothing = await loadListingHistory({ listingId: "MS-00815" });
  assert.equal(nothing.status, "unavailable");
  const audit = await loadListingHistory({ listingId: "MS-00815", readAudit: async () => [] });
  assert.equal(audit.status, "read");
  assert.equal(audit.source, "audit_log");
});

function runtimes(store, extra = {}) {
  const auth = { async resolve(token) { return token === SESSION ? { user: EDITOR, principal: OPERATOR } : null; } };
  const app = createHttpApp({ reviewedAt: "2026-09-16T09:00:00.000Z", editedAt: EDITED_AT, payloadListingRuntime: store.payload, runtimeDataDurableOnly: true, payloadAdminAuth: auth, ...extra });
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_PUBLIC_ORIGIN: ORIGIN }),
    reviewedAt: "2026-09-16T09:00:00.000Z",
    editedAt: EDITED_AT,
    payloadListingRuntime: store.payload,
    runtimeDataDurableOnly: true,
    payloadAdminAuth: auth,
    ...extra,
  };
  const headers = { cookie: `ms_admin=${SESSION}` };
  return {
    standalone: {
      html: async (url) => (await dispatchHttp(app, { url, headers: { ...headers, host: "ms-realty.example", accept: "text/html" } })).body,
      post: async (url, body) => dispatchHttp(app, { method: "POST", url, body: JSON.stringify(body), headers: { ...headers, host: "ms-realty.example", accept: "application/json", "content-type": "application/json", "sec-fetch-site": "same-origin" } }),
    },
    adapter: {
      html: async (url) => (await renderAppAdminResponse(new Request(`${ORIGIN}${url}`, { headers: { ...headers, accept: "text/html" } }), { config })).text(),
    },
  };
}

const historyRows = (html) =>
  [...html.matchAll(/data-listing-history-event="(\w+)"[\s\S]*?<span class="adm-history__what">([^<]*)<\/span><span class="adm-history__who">([^<]*)(?:<span[^>]*data-listing-history-channel="(\w+)")?/g)]
    .map(([, kind, what, who, channel]) => ({ kind, what, who, channel: channel || null }));

test("both runtimes show a durable listing's edits and gallery changes, newest first", async () => {
  const store = createPayloadDraftRuntime(loadCmsSeed());
  const { standalone, adapter } = runtimes(store);
  const editor = "/admin/listings/edit?listingId=MS-00815&locale=en";
  let page = await standalone.html(`${editor}&tab=related`);
  assert.match(page, /data-listing-history="read"/);
  assert.match(page, /data-listing-history-empty="true"/);

  const revision = page.match(/name="draftRevision"[^>]*value="([^"]*)"/)[1];
  const saved = await standalone.post("/api/admin/listings/edit", { listingId: "MS-00815", draftRevision: revision, title: "A value the history must not show", price_eur: "99000" });
  assert.equal(saved.status, 201);
  page = await standalone.html(`${editor}&tab=media`);
  const order = JSON.parse(page.match(/data-media-order="([^"]*)"/)[1].replace(/&quot;/g, '"'));
  const moved = [order.at(-1), ...order.slice(0, -1)];
  const reordered = await standalone.post("/api/admin/media/order", {
    listingId: "MS-00815",
    assetIds: moved.map((row) => row.asset_id),
    relationIds: moved.map((row) => row.relation_id),
    galleryRevision: page.match(/data-media-order-revision="([^"]*)"/)[1],
  });
  assert.equal(reordered.status, 201);

  for (const [runtime, html] of [["standalone", await standalone.html(`${editor}&tab=related`)], ["next-adapter", await adapter.html(`${editor}&tab=related`)]]) {
    const rows = historyRows(html);
    assert.deepEqual(rows.map((row) => row.kind), ["gallery_reordered", "edited"], runtime);
    assert.equal(rows[0].who, "author not recorded", runtime);
    assert.equal(rows[1].what, "Changed: Price in EUR, Title", runtime);
    // The reader is named as themselves, not by their operator reference.
    assert.equal(rows[1].who, "You", runtime);
    const section = html.slice(html.indexOf('class="adm-history"'));
    assert.equal(section.slice(0, section.indexOf("</section>")).includes("A value the history must not show"), false, `${runtime}: field values stay out of the history`);
  }
});

test("an edit made through the assistant is marked as such", async () => {
  const store = createPayloadDraftRuntime(loadCmsSeed());
  await saveListingDraft(loadCmsSeed(), {
    payload: store.payload,
    principal: { id: "operator-agent", roles: ["admin"], source: "operator_agent", can_mutate: true },
    input: { listingId: "MS-00815", patch: { description: "Drafted through MCP" } },
    editedAt: EDITED_AT,
    requestChannel: "mcp",
  });
  const { standalone } = runtimes(store);
  const rows = historyRows(await standalone.html("/admin/listings/edit?listingId=MS-00815&locale=en&tab=related"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].who.startsWith("operator-agent"), true);
  assert.equal(rows[0].channel, "mcp");
});

test("teammates the team directory shows the reader are named; anyone else keeps their reference", async () => {
  const store = createPayloadDraftRuntime(loadCmsSeed());
  const saveAs = (id, editedAt, patch) =>
    saveListingDraft(loadCmsSeed(), {
      payload: store.payload,
      principal: payloadAdminPrincipal({ id, collection: "admins", email: `operator-${id}@example.test`, role: "editor", workspace_ids: [] }),
      input: { listingId: "MS-00815", patch },
      editedAt,
    });
  await saveAs(9, "2026-09-16T06:00:00.000Z", { title: "First" });
  await saveAs(12, "2026-09-16T07:00:00.000Z", { description: "Second" });
  await saveAs(EDITOR.id, "2026-09-16T07:30:00.000Z", { price_eur: "98000" });
  const directory = [
    { id: EDITOR.id, email: EDITOR.email, name: "Owner", role: "admin" },
    { id: 9, email: "maria@example.test", name: "Maria Ivanova", role: "editor" },
  ];
  const withDirectory = (listOperators) => ({
    async resolve(token) { return token === SESSION ? { user: EDITOR, principal: OPERATOR } : null; },
    listOperators,
  });
  const url = "/admin/listings/edit?listingId=MS-00815&locale=en&tab=related";

  const listed = [];
  const { standalone, adapter } = runtimes(store, {
    payloadAdminAuth: withDirectory(async (session) => {
      listed.push(session.user.id);
      return directory;
    }),
  });
  for (const [runtime, html] of [["standalone", await standalone.html(url)], ["next-adapter", await adapter.html(url)]]) {
    // Operator 12 is not in the directory this session may read.
    assert.deepEqual(historyRows(html).map((row) => row.who), ["You", "payload-12", "Maria Ivanova"], runtime);
  }
  assert.ok(listed.length >= 2 && listed.every((id) => id === EDITOR.id), "the directory is read as the signed-in operator");

  // A directory that cannot be read leaves references, and the page still renders.
  const offline = runtimes(store, {
    payloadAdminAuth: withDirectory(async () => { throw new Error("directory offline"); }),
  });
  for (const [runtime, html] of [["standalone", await offline.standalone.html(url)], ["next-adapter", await offline.adapter.html(url)]]) {
    assert.deepEqual(historyRows(html).map((row) => row.who), ["You", "payload-12", "payload-9"], runtime);
  }
});

test("a Payload runtime that cannot list versions reports the history as unavailable", async () => {
  const store = createPayloadDraftRuntime(loadCmsSeed());
  const { findVersions, ...withoutVersions } = store.payload;
  assert.equal(typeof findVersions, "function");
  const { standalone, adapter } = runtimes(store, { payloadListingRuntime: withoutVersions });
  for (const html of [
    await standalone.html("/admin/listings/edit?listingId=MS-00815&locale=en&tab=related"),
    await adapter.html("/admin/listings/edit?listingId=MS-00815&locale=en&tab=related"),
  ]) {
    assert.match(html, /data-listing-history="unavailable"/);
    assert.match(html, /data-listing-history-unavailable="true"/);
    assert.doesNotMatch(html, /data-listing-history-empty/);
  }
});

test("a local runtime without Payload reads its own audit log", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-history-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const auditLogPath = path.join(directory, "audit.jsonl");
  fs.writeFileSync(auditLogPath, "");
  appendAuditLog(createAuditLogEntry({ action: "media_reviewed", actor: "local-reviewer", objectType: "media_asset", objectId: "media-1", metadata: { listing_id: "MS-00815" } }, "2026-09-11T10:00:00Z"), { filePath: auditLogPath });
  appendAuditLog(createAuditLogEntry({ action: "media_reviewed", actor: "elsewhere", objectType: "media_asset", objectId: "media-2", metadata: { listing_id: "MS-00001" } }, "2026-09-12T10:00:00Z"), { filePath: auditLogPath });
  const app = createHttpApp({ reviewedAt: "2026-09-16T09:00:00.000Z", auditLogPath });
  const response = await dispatchHttp(app, {
    url: "/admin/listings/edit?listingId=MS-00815&locale=en&tab=related",
    headers: { authorization: "Bearer local-admin-smoke", accept: "text/html" },
  });
  const rows = historyRows(response.body);
  assert.deepEqual(rows.map((row) => [row.kind, row.what, row.who]), [["media_reviewed", "A photo was reviewed", "local-reviewer"]]);
});
