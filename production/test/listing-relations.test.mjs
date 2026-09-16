// A listing's record page shows what it is connected to - the enquiries that
// name it and the viewings booked for it - reads them through the same
// authority as the enquiry and viewing screens, returns to the list it was
// opened from, and can open a follow-up already pointed at it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listingRelations,
  loadListingRelations,
  safeListingManagerReturn,
} from "../lib/admin-listing-relations.mjs";
import { listingIdFromTaskSubject, splitTaskFormReturn } from "../lib/admin-payloads.mjs";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadCmsSeed } from "../lib/runtime.mjs";
import { readTaskEvents } from "../lib/tasks.mjs";

const seed = loadCmsSeed();

function scratch(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "msr-relations-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("relations are the enquiries and viewings that name the listing, newest first", () => {
  const relations = listingRelations({
    listingId: "MS-00815",
    leads: [
      { lead_id: "old", contact: { name: "Old" }, listing_reference: "MS-00815", received_at: "2026-09-01T10:00:00Z" },
      { lead_id: "new", contact_name: "New", listing_id: "MS-00815", received_at: "2026-09-15T10:00:00Z" },
      { lead_id: "other", listing_reference: "MS-00001", received_at: "2026-09-16T10:00:00Z" },
    ],
    viewings: [
      { id: "v1", listing_reference: "MS-00815", contact_name: "Old", starts_at: "2026-09-20T10:00:00Z", status: "scheduled" },
      { id: "v2", listing_reference: "MS-00001", starts_at: "2026-09-21T10:00:00Z" },
    ],
  });
  assert.deepEqual(relations.enquiries.map((row) => row.id), ["new", "old"]);
  assert.equal(relations.enquiry_count, 2);
  assert.deepEqual(relations.viewings.map((row) => row.id), ["v1"]);
  assert.equal(relations.sources.enquiries.status, "read");
  // An empty list and an unreadable source are different facts.
  const unread = listingRelations({ listingId: "MS-00815" });
  assert.equal(unread.sources.enquiries.status, "unavailable");
  assert.equal(unread.enquiry_count, null);
  const empty = listingRelations({ listingId: "MS-00815", leads: [], viewings: [] });
  assert.equal(empty.sources.enquiries.status, "read");
  assert.equal(empty.enquiry_count, 0);
});

test("an operator without enquiry access never has enquiries or viewings read", async () => {
  const forbidden = () => assert.fail("a source the operator may not read was loaded");
  for (const roles of [["editor"], ["translator"], ["agent"]]) {
    const relations = await loadListingRelations({ listingId: "MS-00815", principal: { id: "x", roles }, loadLeads: forbidden, loadViewings: forbidden });
    assert.equal(relations.sources.enquiries.status, "unavailable", roles[0]);
    assert.equal(relations.sources.viewings.status, "unavailable", roles[0]);
  }
  // A failing store is unavailable too, never an empty success.
  const broken = await loadListingRelations({
    listingId: "MS-00815",
    principal: { id: "b", roles: ["broker"] },
    loadLeads: async () => { throw new Error("store offline"); },
    loadViewings: forbidden,
  });
  assert.equal(broken.sources.enquiries.status, "unavailable");
});

test("both runtimes show a broker only their own enquiries and viewings for the listing", async () => {
  const principal = { id: "broker-relations", roles: ["broker"], workspace_ids: ["sandanski"], source: "payload_session", can_mutate: true };
  const store = {
    payloadSecret: "payload-secret-for-test",
    databaseUrl: "postgres://test.invalid/ms_realty",
    contactSecret: "lead-contact-secret-longer-than-thirty-two-characters",
    workspaceId: "sandanski",
  };
  const config = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test" }),
    seed,
    payloadAdminAuth: { async resolve() { return { principal, user: { id: 7, roles: ["broker"] } }; } },
    leadDurableStore: { ...store, leadDurableStoreEnabled: true },
    viewingDurableStore: { ...store, viewingDurableStoreEnabled: true },
    readLeadIntakesDurably: async ({ admin, workspaceIds }) => {
      assert.equal(admin, false);
      assert.deepEqual(workspaceIds, ["sandanski"]);
      return [
        { lead_id: "lead-own", contact: { name: "Kalina Petrova", email: "k@example.test" }, listing_reference: "MS-00815", received_at: "2026-09-15T10:00:00Z" },
      ];
    },
    readViewingsDurably: async () => [
      { id: "viewing-own", lead_id: "lead-own", contact_name: "Kalina Petrova", listing_reference: "MS-00815", starts_at: "2026-09-20T10:00:00Z" },
      { id: "viewing-foreign", lead_id: "somebody-elses-lead", contact_name: "Hidden Person", listing_reference: "MS-00815", starts_at: "2026-09-21T10:00:00Z" },
    ],
  };
  const path = "/admin/listings/edit?listingId=MS-00815&locale=en&tab=related";
  const headers = { cookie: "ms_admin=relations-fixture", accept: "text/html" };
  const pages = [
    (await dispatchHttp(createHttpApp(config), { url: path, headers })).body,
    await (await renderAppAdminResponse(new Request(`https://example.test${path}`, { headers }), { config })).text(),
  ];
  for (const [index, html] of pages.entries()) {
    const runtime = index ? "next-adapter" : "standalone";
    assert.match(html, /data-editor-panel-tab="related"(?![^>]*\shidden)/, runtime);
    assert.match(html, /data-listing-enquiry="lead-own"/, runtime);
    assert.match(html, /href="\/admin\/leads#lead-lead-own"/, runtime);
    assert.match(html, /data-listing-viewing="viewing-own"/, runtime);
    assert.doesNotMatch(html, /viewing-foreign|Hidden Person/, `${runtime}: another broker's viewing stays out`);
    assert.doesNotMatch(html, /data-listing-relation-unavailable=/, runtime);
  }
});

test("an operator who may not read enquiries is told so rather than shown an empty list", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN, MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON };
  try {
    process.env.NODE_ENV = "production";
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([{ id: "content-editor", token: "content-editor-token-0123456789", roles: ["editor"] }]);
    const response = await dispatchHttp(createHttpApp({ reviewedAt: "2026-09-16T09:00:00.000Z" }), {
      url: "/admin/listings/edit?listingId=MS-00815&locale=en&tab=related",
      headers: { authorization: "Bearer content-editor-token-0123456789", accept: "text/html" },
    });
    assert.equal(response.status, 200);
    assert.match(response.body, /data-listing-relation-unavailable="enquiries"/);
    assert.match(response.body, /data-listing-relation-unavailable="viewings"/);
    assert.doesNotMatch(response.body, /data-listing-relation-empty=/);
    // No enquiry access means no follow-up form either.
    assert.doesNotMatch(response.body, /data-task-form="listing-follow-up"/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("back returns to the list the listing was opened from, and nowhere else", async () => {
  const app = createHttpApp({ reviewedAt: "2026-09-16T09:00:00.000Z" });
  const headers = { authorization: "Bearer local-admin-smoke", accept: "text/html" };
  const list = await dispatchHttp(app, { url: "/admin/listings?status=published&locale=en", headers });
  const open = list.body.match(/href="([^"]*)"[^>]*data-open-listing="([^"]+)"/);
  assert.ok(open, "the list offers a way into a listing");
  const target = open[1].replace(/&amp;/g, "&");
  assert.match(target, /&back=%2Fadmin%2Flistings%3Fstatus%3Dpublished$/);
  const editor = await dispatchHttp(app, { url: `${target}&locale=en`, headers });
  assert.match(editor.body, /href="\/admin\/listings\?status=published"[^>]*data-editor-back="filtered"/);
  // Every section link keeps the way back, so switching tab does not lose it.
  for (const tab of ["facts", "media", "related"]) {
    assert.match(editor.body, new RegExp(`href="[^"]*tab=${tab}[^"]*back=%2Fadmin%2Flistings%3Fstatus%3Dpublished"`), tab);
  }
  // Anything that is not the listing manager is ignored.
  for (const hostile of ["https://evil.example/admin/listings", "//evil.example/admin/listings", "/admin/leads", "/admin/listings/../settings", "javascript:alert(1)"]) {
    const page = await dispatchHttp(app, { url: `/admin/listings/edit?listingId=MS-00815&locale=en&back=${encodeURIComponent(hostile)}`, headers });
    assert.match(page.body, /data-editor-back="all"/, hostile);
  }
  assert.equal(safeListingManagerReturn("/admin/listings?status=published&page=2"), "/admin/listings?status=published&page=2");
  assert.equal(safeListingManagerReturn("/admin/listings?q=a%0D%0ALocation:x"), "/admin/listings");
  assert.equal(safeListingManagerReturn("/admin/listingsX"), "");
});

test("a follow-up opened from the listing is linked to it, with or without scripting", async (t) => {
  const directory = scratch(t);
  const ledgers = { a: path.join(directory, "a.jsonl"), b: path.join(directory, "b.jsonl") };
  const app = createHttpApp({ reviewedAt: "2026-09-16T09:00:00.000Z", taskLedgerPath: ledgers.a, auditLogPath: path.join(directory, "audit-a.jsonl") });
  const adapterConfig = {
    ...appAdminConfigFromEnv({ NODE_ENV: "test", MS_REALTY_ADMIN_TOKEN: "local-admin-smoke" }),
    reviewedAt: "2026-09-16T09:00:00.000Z",
    taskLedgerPath: ledgers.b,
    auditLogPath: path.join(directory, "audit-b.jsonl"),
  };
  const auth = { authorization: "Bearer local-admin-smoke" };
  const page = await dispatchHttp(app, { url: "/admin/listings/edit?listingId=MS-00815&locale=bg&tab=related", headers: { ...auth, accept: "text/html" } });
  const followUp = page.body.match(/<form[^>]*data-task-form="listing-follow-up"[\s\S]*?<\/form>/)?.[0];
  assert.ok(followUp, "the local runtime can keep tasks, so the form is offered");
  // The form carries what links the task and nothing it may not send.
  assert.match(followUp, /name="subjectRef" value="listing:MS-00815"/);
  assert.match(followUp, /name="taskType" value="listing_follow_up"/);
  assert.match(followUp, /name="returnLocale" value="bg"/);
  assert.match(followUp, /data-daily-task-status/);
  const fields = Object.fromEntries([...followUp.matchAll(/name="(\w+)"(?:[^>]*value="([^"]*)")?/g)].map(([, name, value = ""]) => [name, value]));
  // A bearer session has no operator id, so, as on the task queue, the form
  // asks who is acting and the person types it.
  assert.equal(fields.actor, "");
  const submission = { ...fields, actor: "Local operator", owner: "Ivan", note: "Call the owner back", humanConfirmed: "true" };

  const sends = [
    ["standalone", ledgers.a, (body, accept, type) => dispatchHttp(app, { method: "POST", url: "/api/admin/tasks", body, headers: { ...auth, accept, "content-type": type } }).then((r) => ({ status: r.status, location: r.headers?.location || "", body: r.body }))],
    ["next-adapter", ledgers.b, async (body, accept, type) => {
      const r = await renderAppAdminResponse(new Request("https://ms-realty.example/api/admin/tasks", { method: "POST", body, headers: { ...auth, accept, "content-type": type } }), { config: adapterConfig });
      const text = await r.text();
      return { status: r.status, location: r.headers.get("location") || "", body: text ? JSON.parse(text) : null };
    }],
  ];
  for (const [runtime, ledger, send] of sends) {
    const native = await send(new URLSearchParams(submission).toString(), "text/html,application/xhtml+xml", "application/x-www-form-urlencoded");
    assert.equal(native.status, 303, runtime);
    assert.equal(native.location, "/admin/listings/edit?listingId=MS-00815&tab=related&locale=bg&editor=task_opened#listing-related", runtime);
    const events = readTaskEvents(ledger);
    assert.equal(events.length, 1, runtime);
    assert.equal(events[0].subject_ref, "listing:MS-00815", runtime);
    assert.equal(events[0].task_type, "listing_follow_up", runtime);
    assert.equal(JSON.stringify(events).includes("returnLocale"), false, `${runtime}: the return hint is not stored`);

    const refused = await send(new URLSearchParams({ ...submission, taskId: "another-follow-up", humanConfirmed: "" }).toString(), "text/html", "application/x-www-form-urlencoded");
    assert.equal(refused.status, 303, runtime);
    assert.match(refused.location, /editor=task_failed#listing-related$/, runtime);
    assert.equal(readTaskEvents(ledger).length, 1, `${runtime}: a refused task writes nothing`);

    // The enhanced form keeps its JSON contract.
    const enhanced = await send(JSON.stringify({ ...submission, taskId: "follow-up-enhanced" }), "application/json", "application/json");
    assert.equal(enhanced.status, 201, runtime);
    assert.equal(enhanced.body.kind, "task", runtime);
    assert.equal(enhanced.body.task.task_id, "follow-up-enhanced", runtime);
  }

  const landed = await dispatchHttp(app, { url: "/admin/listings/edit?listingId=MS-00815&tab=related&locale=bg&editor=task_opened", headers: { ...auth, accept: "text/html" } });
  assert.match(landed.body, /data-listing-follow-up-outcome="task_opened"[^>]*data-state="success"/);
  // A follow-up can only steer back to a listing it names.
  assert.equal(listingIdFromTaskSubject("listing:MS-00815"), "MS-00815");
  assert.equal(listingIdFromTaskSubject("lead:abc"), "");
  assert.equal(listingIdFromTaskSubject("listing:../../admin"), "");
  assert.deepEqual(Object.keys(splitTaskFormReturn({ taskId: "x", returnLocale: "bg" }).task), ["taskId"]);
});

test("the follow-up form is not offered where the task store cannot keep it", async () => {
  const { renderAdminListingEditorPayload } = await import("../lib/admin-payloads.mjs");
  const { renderReactAdminBody } = await import("../lib/react-admin-site.mjs");
  const { loadLocaleRegistry } = await import("../lib/locales.mjs");
  const page = renderAdminListingEditorPayload(loadLocaleRegistry(), "en", seed, "MS-00815", [], [], [], { id: "payload-1", roles: ["admin"] }, { tab: "related" });
  page.runtime_data_mode = "durable_only";
  page.relations = listingRelations({ listingId: "MS-00815", leads: [], viewings: [] });
  const html = renderReactAdminBody(page);
  assert.match(html, /data-listing-relations="true"/);
  assert.doesNotMatch(html, /data-task-form="listing-follow-up"/);
  assert.match(html, /data-listing-relation-empty="enquiries"/);
});
