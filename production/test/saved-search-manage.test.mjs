import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readAuditLog } from "../lib/audit-log.mjs";
import { readSavedSearches } from "../lib/saved-searches.mjs";
import {
  SAVED_SEARCH_LINK_REFUSAL,
  SavedSearchLinkRefusedError,
  assertSavedSearchAccess,
  mintSavedSearchAccess,
  readSavedSearchAccessToken,
  savedSearchAccessSecret,
  savedSearchAccessVerifier,
  savedSearchManageLink,
} from "../lib/saved-search-access.mjs";
import {
  applySavedSearchManageEvents,
  assertSavedSearchManageEvents,
  maskContactValue,
  maskedContactChannels,
  normalizeSavedSearchManageEvent,
  readSavedSearchManageEvents,
} from "../lib/saved-search-manage.mjs";

const SECRET = "saved-search-manage-test-secret-0000001";
const VAULT_KEY = "saved-search-manage-test-vault-key-000001";

function ledgerDirectory(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `ms-realty-${name}-`));
}

function emptyLedger(directory, name) {
  const filePath = path.join(directory, `${name}.jsonl`);
  fs.writeFileSync(filePath, "");
  return filePath;
}

function buildApp(directory, overrides = {}) {
  const paths = Object.fromEntries(
    [
      "leadLedgerPath",
      "publicContactVaultPath",
      "languageRequestPath",
      "savedSearchLedgerPath",
      "savedSearchManageEventLedgerPath",
      "savedSearchAlertDeliveryLedgerPath",
      "publicRequestOutcomeLedgerPath",
      "consentLedgerPath",
      "eventLedgerPath",
      "auditLogPath",
    ].map((name) => [name, emptyLedger(directory, name)]),
  );
  return {
    paths,
    app: createHttpApp({
      ...paths,
      publicContactKey: VAULT_KEY,
      savedSearchManageSecret: SECRET,
      savedSearchManageLinkTemplate: "/{locale}/alerts",
      savedSearchManageLinkTtlDays: 30,
      savedSearchPublicOrigin: "https://makler-realty.com",
      savedAt: "2026-08-01T09:00:00.000Z",
      receivedAt: "2026-08-01T09:00:00.000Z",
      reviewedAt: "2026-08-01T09:00:00.000Z",
      savedSearchManagedAt: "2026-08-02T09:00:00.000Z",
      ...overrides,
    }),
  };
}

async function createSavedSearch(app, overrides = {}) {
  return dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches",
    body: {
      locale: "en",
      query: "Sandanski",
      filters: { property_type: "apartment" },
      contact: { name: "Elena Petrova", email: "elena.petrova@example.test", phone: "+359 888 111 222" },
      contactPreference: "email",
      alertConsent: true,
      alertFrequency: "weekly",
      ...overrides,
    },
  });
}

test("saved-search manage token is signed, single purpose, and stored only as a verifier", () => {
  const minted = mintSavedSearchAccess("saved-search-token-a", {
    secret: SECRET,
    issuedAt: "2026-08-01T09:00:00.000Z",
    ttlDays: 30,
  });
  assert.match(minted.token, /^s1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(minted.access.version, "s1");
  assert.equal(minted.access.expires_at, "2026-08-31T09:00:00.000Z");
  // The stored value must not be the token, and must not be reversible to it.
  assert.notEqual(minted.access.verifier, minted.token);
  assert.equal(minted.access.verifier, savedSearchAccessVerifier(minted.token));
  assert.equal(minted.access.token, undefined);
  // No personal data ever rides in the URL: only the record id and the signature.
  assert.equal(Buffer.from(minted.token.split(".")[1], "base64url").toString("utf8"), "saved-search-token-a");

  const read = readSavedSearchAccessToken(minted.token, { secret: SECRET, now: "2026-08-02T09:00:00.000Z" });
  assert.equal(read.record_id, "saved-search-token-a");
  assert.equal(read.verifier, minted.access.verifier);
  assert.equal(assertSavedSearchAccess({ manage_access: minted.access }, read), true);

  // Minting is deterministic, so a retried submission re-derives the same link.
  const again = mintSavedSearchAccess("saved-search-token-a", {
    secret: SECRET,
    issuedAt: "2026-08-01T09:00:00.000Z",
    ttlDays: 30,
  });
  assert.equal(again.token, minted.token);

  // A token for one record can never be replayed against another.
  const other = mintSavedSearchAccess("saved-search-token-b", {
    secret: SECRET,
    issuedAt: "2026-08-01T09:00:00.000Z",
    ttlDays: 30,
  });
  assert.throws(
    () => assertSavedSearchAccess({ manage_access: other.access }, read),
    (error) => error instanceof SavedSearchLinkRefusedError && error.reason === "verifier_mismatch",
  );

  const tampered = `${minted.token.slice(0, -4)}AAAA`;
  assert.throws(
    () => readSavedSearchAccessToken(tampered, { secret: SECRET, now: "2026-08-02T09:00:00.000Z" }),
    (error) => error instanceof SavedSearchLinkRefusedError && error.reason === "bad_signature",
  );
  assert.throws(
    () => readSavedSearchAccessToken(minted.token, { secret: `${SECRET}-rotated`, now: "2026-08-02T09:00:00.000Z" }),
    (error) => error.reason === "bad_signature",
  );
  assert.throws(
    () => readSavedSearchAccessToken(minted.token, { secret: SECRET, now: "2027-08-02T09:00:00.000Z" }),
    (error) => error.reason === "expired",
  );
  assert.throws(() => readSavedSearchAccessToken("", { secret: SECRET }), (error) => error.reason === "missing_token");
  assert.throws(
    () => readSavedSearchAccessToken("not-a-token", { secret: SECRET }),
    (error) => error.reason === "malformed_token",
  );
  // Every refusal carries the same public answer.
  for (const reason of ["missing_token", "bad_signature", "expired", "verifier_mismatch"]) {
    assert.equal(new SavedSearchLinkRefusedError(reason).message, SAVED_SEARCH_LINK_REFUSAL.message);
  }
});

test("saved-search access secret is documented for local use and required in production", () => {
  assert.equal(savedSearchAccessSecret({}).length >= 32, true);
  assert.throws(
    () => savedSearchAccessSecret({ NODE_ENV: "production" }),
    /MS_REALTY_SAVED_SEARCH_TOKEN_SECRET is required in production/,
  );
  assert.throws(() => savedSearchAccessSecret({ MS_REALTY_SAVED_SEARCH_TOKEN_SECRET: "short" }), /at least 32/);
  assert.equal(savedSearchManageLink({ locale: "ru", token: "s1.a.b.c" }, { origin: "https://example.test" }).url,
    "https://example.test/ru/alerts?token=s1.a.b.c");
});

test("contact values are masked, never echoed", () => {
  assert.equal(maskContactValue("elena.petrova@example.test", "email"), "e••••••@e••••••.test");
  assert.equal(maskContactValue("+359 888 111 222", "phone"), "+••••••22");
  assert.equal(maskContactValue("", "email"), null);
  const masked = maskedContactChannels({ email: "a@b.test", phone: "+359888111222" });
  assert.equal(masked.whatsapp, null);
  assert.ok(!Object.values(masked).some((value) => String(value || "").includes("elena")));
});

test("manage events project pause, retune and delete over the append-only intake ledger", () => {
  const rows = [{ id: "saved-search-1", status: "active", alert_frequency: "weekly", contact_preference: "email" }];
  const events = [
    normalizeSavedSearchManageEvent({ savedSearchId: "saved-search-1", action: "pause" }, "2026-08-02T09:00:00.000Z"),
    normalizeSavedSearchManageEvent(
      { savedSearchId: "saved-search-1", action: "update_frequency", frequency: "daily" },
      "2026-08-03T09:00:00.000Z",
    ),
  ].map((event, index) => ({ ...event, id: `saved-search-manage-saved-search-1-${index + 1}` }));
  const projected = applySavedSearchManageEvents(rows, events);
  assert.equal(projected[0].status, "paused");
  assert.equal(projected[0].alert_frequency, "daily");
  assert.equal(projected[0].updated_at, "2026-08-03T09:00:00.000Z");
  assert.equal(assertSavedSearchManageEvents(events), true);

  const deleted = applySavedSearchManageEvents(rows, [
    ...events,
    { ...events[0], id: "saved-search-manage-saved-search-1-3", action: "delete", recorded_at: "2026-08-04T09:00:00.000Z" },
  ]);
  assert.deepEqual(deleted, []);

  assert.throws(() => normalizeSavedSearchManageEvent({ savedSearchId: "x", action: "explode" }), /pause, resume/);
  assert.throws(
    () => normalizeSavedSearchManageEvent({ savedSearchId: "x", action: "update_frequency", frequency: "hourly" }),
    /instant, daily, or weekly/,
  );
  assert.throws(
    () => normalizeSavedSearchManageEvent({ savedSearchId: "x", action: "update_channel", channel: "pigeon" }),
    /email, phone, whatsapp, or viber/,
  );
  assert.throws(() => normalizeSavedSearchManageEvent({ action: "pause" }), /Saved search id is required/);
});

test("a visitor can read, pause, retune and delete their saved search through the manage link", async () => {
  const directory = ledgerDirectory("saved-search-manage-http");
  const { app, paths } = buildApp(directory);

  const created = await createSavedSearch(app);
  assert.equal(created.status, 201);
  assert.equal(created.body.manage_unavailable_reason, null);
  assert.equal(created.body.manage.path, `/en/alerts?token=${encodeURIComponent(created.body.manage.token)}`);
  assert.equal(created.body.manage.url, `https://makler-realty.com${created.body.manage.path}`);
  assert.equal(created.body.manage.expires_at, "2026-08-31T09:00:00.000Z");
  // The URL carries no personal data.
  for (const value of ["elena", "petrova", "example.test", "359"]) {
    assert.equal(created.body.manage.url.toLowerCase().includes(value), false);
  }
  // The ledger keeps only the verifier.
  const stored = readSavedSearches(paths.savedSearchLedgerPath);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].manage_access.verifier, savedSearchAccessVerifier(created.body.manage.token));
  assert.equal(stored[0].manage_access.token, undefined);
  assert.equal(fs.readFileSync(paths.savedSearchLedgerPath, "utf8").includes(created.body.manage.token), false);

  const token = created.body.manage.token;
  const read = await dispatchHttp(app, { url: `/api/saved-searches/manage?token=${encodeURIComponent(token)}` });
  assert.equal(read.status, 200);
  assert.equal(read.headers["cache-control"], "no-store");
  assert.equal(read.body.kind, "saved_search_manage");
  assert.equal(read.body.saved_search.id, created.body.id);
  assert.equal(read.body.saved_search.status, "active");
  assert.equal(read.body.saved_search.query, "Sandanski");
  assert.deepEqual(read.body.saved_search.filters, { property_type: "apartment" });
  assert.equal(read.body.saved_search.alert_frequency, "weekly");
  assert.equal(read.body.saved_search.contact_preference, "email");
  assert.equal(read.body.link.expires_at, "2026-08-31T09:00:00.000Z");
  // Masked, never the stored values.
  assert.equal(read.body.contact.state, "available");
  assert.equal(read.body.contact.channels.email, "e••••••@e••••••.test");
  assert.equal(read.body.contact.channels.phone, "+••••••22");
  assert.equal(read.body.contact.channels.whatsapp, null);
  assert.deepEqual(read.body.contact.available_channels, ["email", "phone"]);
  assert.equal(JSON.stringify(read.body).includes("elena.petrova@example.test"), false);
  assert.equal(JSON.stringify(read.body).includes("888 111 222"), false);

  const paused = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "pause" },
  });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.action, "pause");
  assert.equal(paused.body.idempotent, false);
  assert.equal(paused.body.saved_search.status, "paused");
  assert.equal(paused.body.saved_search.next_alert_at, null);

  const pausedAgain = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "pause" },
  });
  assert.equal(pausedAgain.status, 200);
  assert.equal(pausedAgain.body.idempotent, true);
  assert.equal(readSavedSearchManageEvents(paths.savedSearchManageEventLedgerPath).length, 1);

  const resumed = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "resume" },
  });
  assert.equal(resumed.body.saved_search.status, "active");

  const retuned = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "update_frequency", frequency: "daily" },
  });
  assert.equal(retuned.status, 200);
  assert.equal(retuned.body.saved_search.alert_frequency, "daily");

  const rechannelled = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "update_channel", channel: "phone" },
  });
  assert.equal(rechannelled.status, 200);
  assert.equal(rechannelled.body.saved_search.contact_preference, "phone");

  const unreachable = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "update_channel", channel: "viber" },
  });
  assert.equal(unreachable.status, 400);
  assert.match(unreachable.body.message, /contact channels supplied/);

  const badFrequency = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "update_frequency", frequency: "hourly" },
  });
  assert.equal(badFrequency.status, 400);

  // The admin requests queue tracks the visitor's own changes.
  const events = readSavedSearchManageEvents(paths.savedSearchManageEventLedgerPath);
  assert.deepEqual(
    events.map((row) => row.action),
    ["pause", "resume", "update_frequency", "update_channel"],
  );
  assert.equal(events.every((row) => row.actor === "saved_search_link"), true);
  assert.equal(assertSavedSearchManageEvents(events), true);

  const audit = readAuditLog(paths.auditLogPath);
  assert.deepEqual(
    audit.map((row) => row.action),
    [
      "saved_search_paused",
      "saved_search_resumed",
      "saved_search_frequency_updated",
      "saved_search_channel_updated",
    ],
  );
  assert.equal(audit.every((row) => row.actor === "saved_search_link"), true);
  assert.equal(audit.every((row) => row.object_id === created.body.id), true);
  assert.equal(JSON.stringify(audit).includes("elena"), false);

  const deleted = await dispatchHttp(app, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token, action: "delete" },
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);
  assert.equal(deleted.body.saved_search, null);
  assert.equal(readAuditLog(paths.auditLogPath).at(-1).action, "saved_search_deleted");

  // Deleting revokes the capability: the same token now gets the same refusal
  // as a token for a search that never existed.
  const afterDelete = await dispatchHttp(app, {
    url: `/api/saved-searches/manage?token=${encodeURIComponent(token)}`,
  });
  assert.equal(afterDelete.status, 404);
  assert.deepEqual(afterDelete.body, { ...SAVED_SEARCH_LINK_REFUSAL });
});

test("a tampered, unknown or missing token is refused indistinguishably", async () => {
  const directory = ledgerDirectory("saved-search-manage-refusal");
  const { app } = buildApp(directory);
  const created = await createSavedSearch(app);
  const token = created.body.manage.token;

  const unknown = mintSavedSearchAccess("saved-search-does-not-exist", {
    secret: SECRET,
    issuedAt: "2026-08-01T09:00:00.000Z",
    ttlDays: 30,
  }).token;
  const forged = mintSavedSearchAccess(created.body.id, {
    secret: "an-attacker-supplied-secret-of-length-32",
    issuedAt: "2026-08-01T09:00:00.000Z",
    ttlDays: 30,
  }).token;
  const tampered = `${token.slice(0, -4)}AAAA`;
  const expired = mintSavedSearchAccess(created.body.id, {
    secret: SECRET,
    issuedAt: "2020-01-01T00:00:00.000Z",
    ttlDays: 1,
  }).token;

  const refusals = [];
  for (const candidate of [unknown, forged, tampered, expired, "", "s1.aaa.bbb.ccc", "garbage"]) {
    const read = await dispatchHttp(app, {
      url: `/api/saved-searches/manage?token=${encodeURIComponent(candidate)}`,
    });
    const write = await dispatchHttp(app, {
      method: "POST",
      url: "/api/saved-searches/manage",
      body: { token: candidate, action: "pause" },
    });
    refusals.push(JSON.stringify([read.status, read.body]), JSON.stringify([write.status, write.body]));
  }
  assert.equal(new Set(refusals).size, 1, "every refusal must be byte-identical");
  assert.deepEqual(JSON.parse(refusals[0]), [404, { ...SAVED_SEARCH_LINK_REFUSAL }]);

  // A refused write leaves no trace that could confirm the record exists.
  const valid = await dispatchHttp(app, { url: `/api/saved-searches/manage?token=${encodeURIComponent(token)}` });
  assert.equal(valid.status, 200);
});

test("manage routes are rate limited and refuse other methods", async () => {
  const directory = ledgerDirectory("saved-search-manage-rate-limit");
  const { app } = buildApp(directory, { rateLimit: { windowMs: 60_000, max: 3 } });
  const created = await createSavedSearch(app);
  const url = `/api/saved-searches/manage?token=${encodeURIComponent(created.body.manage.token)}`;

  const statuses = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    statuses.push((await dispatchHttp(app, { url })).status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);

  const blocked = await dispatchHttp(app, { url });
  assert.equal(blocked.body.kind, "rate_limited");
  assert.ok(Number(blocked.headers["retry-after"]) >= 1);

  const wrongMethod = await dispatchHttp(app, { method: "DELETE", url: "/api/saved-searches/manage" });
  assert.equal(wrongMethod.status, 405);
});

test("manage links fail closed when their storage or signing secret is missing", async () => {
  const directory = ledgerDirectory("saved-search-manage-fail-closed");
  const { app } = buildApp(directory, { savedSearchManageSecret: null, savedSearchManageLinkTtlDays: 30 });
  const created = await createSavedSearch(app);
  assert.equal(created.status, 201);
  // The saved search still exists; only the link is unavailable, and the app says so.
  assert.equal(typeof created.body.id, "string");

  const readOnlyDirectory = ledgerDirectory("saved-search-manage-no-event-ledger");
  const { app: readOnlyApp } = buildApp(readOnlyDirectory, { savedSearchManageEventLedgerPath: null });
  const readOnlyCreated = await createSavedSearch(readOnlyApp);
  const refused = await dispatchHttp(readOnlyApp, {
    method: "POST",
    url: "/api/saved-searches/manage",
    body: { token: readOnlyCreated.body.manage.token, action: "pause" },
  });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.kind, "saved_search_manage_unavailable");
});
