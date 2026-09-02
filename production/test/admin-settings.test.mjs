import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readLeadLedger } from "../lib/lead-ledger.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
import { OWNER_CONSOLE_NAV_DESTINATIONS } from "../lib/owner-operator-catalog.mjs";
import {
  DEFAULT_WORKSPACE_SETTINGS_PATH,
  WORKSPACE_SETTINGS_DEFAULTS,
  WORKSPACE_SETTINGS_COLLECTION_SLUG,
  applyWorkspaceDefaultBroker,
  buildWorkspaceOnboarding,
  leadSlaOptions,
  normalizeWorkspaceSettingsSection,
  readWorkspaceSettings,
  updateWorkspaceSettings,
} from "../lib/workspace-settings.mjs";

const TOKEN = "workspace-settings-token-0123456789abcdef";
const CONTACT_KEY = "workspace-settings-contact-key-0123456789";
const HEADERS = { authorization: `Bearer ${TOKEN}` };
const FORM_HEADERS = { ...HEADERS, "content-type": "application/x-www-form-urlencoded" };
const TEST_BROKER_PROFILES = Object.freeze([
  { id: "broker_bg", languages: ["bg"] },
  { id: "broker_ru", languages: ["ru"] },
  { id: "broker_international", languages: ["en"] },
]);

function tempFile(name, extension = "jsonl") {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-${name}-`)}/${name}.${extension}`;
  fs.writeFileSync(file, extension === "json" ? "" : "");
  return file;
}

function paths(overrides = {}) {
  return {
    workspaceSettingsPath: tempFile("workspace-settings", "json"),
    auditLogPath: tempFile("workspace-settings-audit"),
    leadLedgerPath: tempFile("workspace-settings-leads"),
    leadContactVaultPath: tempFile("workspace-settings-contacts"),
    leadAssignmentLedgerPath: tempFile("workspace-settings-assignments"),
    consentLedgerPath: tempFile("workspace-settings-consent"),
    sellerPipelinePath: tempFile("workspace-settings-seller"),
    sellerPipelineOutcomeLedgerPath: tempFile("workspace-settings-seller-outcomes"),
    leadPipelineOutcomeLedgerPath: tempFile("workspace-settings-pipeline-outcomes"),
    publicRequestOutcomeLedgerPath: tempFile("workspace-settings-request-outcomes"),
    savedSearchLedgerPath: tempFile("workspace-settings-saved-searches"),
    languageRequestPath: tempFile("workspace-settings-language-requests"),
    viewingLedgerPath: tempFile("workspace-settings-viewings"),
    viewingFollowUpLedgerPath: tempFile("workspace-settings-viewing-follow-ups"),
    replyOutboxPath: tempFile("workspace-settings-replies"),
    replyDeliveryOutcomeLedgerPath: tempFile("workspace-settings-reply-deliveries"),
    dealLedgerPath: tempFile("workspace-settings-deals"),
    leadContactKey: CONTACT_KEY,
    brokerProfiles: TEST_BROKER_PROFILES,
    receivedAt: "2026-07-19T09:00:00.000Z",
    reviewedAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
}

function createWorkspaceSettingsPayloadStore(initial = null, { workspaceId = "workspace-sandanski" } = {}) {
  let row = initial
    ? {
        id: 1,
        workspace_id: workspaceId,
        version: initial.version,
        revision: initial.revision,
        updated_by: initial.updated_by,
        sections: structuredClone(initial.sections),
        section_updates: structuredClone(initial.section_updates),
        revisions: structuredClone(initial.revisions),
        updatedAt: initial.updated_at,
        createdAt: initial.updated_at || "2026-07-19T09:00:00.000Z",
      }
    : null;
  const calls = [];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const current = () => (row ? clone(row) : null);
  return {
    calls,
    payload: {
      async find(input) {
        calls.push({ method: "find", input: clone(input) });
        assert.equal(input.collection, WORKSPACE_SETTINGS_COLLECTION_SLUG);
        const scope =
          input.where?.workspace_id?.equals || input.where?.and?.find((clause) => clause.workspace_id)?.workspace_id?.equals;
        return { docs: row && scope === row.workspace_id ? [current()] : [] };
      },
      async create(input) {
        calls.push({ method: "create", input: clone(input) });
        assert.equal(input.collection, WORKSPACE_SETTINGS_COLLECTION_SLUG);
        const updatedAt =
          Object.values(input.data.section_updates || {})
            .map((entry) => entry?.updated_at)
            .filter(Boolean)
            .at(-1) || "2026-07-19T10:00:00.000Z";
        row = {
          id: 1,
          ...clone(input.data),
          updatedAt,
          createdAt: updatedAt,
        };
        return current();
      },
      async update(input) {
        calls.push({ method: "update", input: clone(input) });
        assert.equal(input.collection, WORKSPACE_SETTINGS_COLLECTION_SLUG);
        assert.equal(input.id, row?.id);
        const updatedAt =
          Object.values(input.data.section_updates || {})
            .map((entry) => entry?.updated_at)
            .filter(Boolean)
            .at(-1) || row?.updatedAt || "2026-07-19T10:00:00.000Z";
        row = {
          id: row?.id || 1,
          ...clone(input.data),
          updatedAt,
          createdAt: row?.createdAt || updatedAt,
        };
        return current();
      },
    },
  };
}

function headingCount(html) {
  return (html.match(/<h1(?:\s|>)/g) || []).length;
}

async function withAdmin(fn, { roles = "admin", actor = "operations_lead" } = {}) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_ROLES: process.env.MS_REALTY_ADMIN_ROLES,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    process.env.NODE_ENV = "production";
    process.env.MS_REALTY_ADMIN_TOKEN = TOKEN;
    process.env.MS_REALTY_ADMIN_ACTOR = actor;
    process.env.MS_REALTY_ADMIN_ROLES = roles;
    delete process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON;
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const agencyForm = new URLSearchParams({
  section: "agency",
  locale: "en",
  name: "MS Realty Sandanski",
  phone: "+359 888 123 456",
  email: "office@ms-realty.test",
  whatsapp: "+359 888 123 456",
  viber: "",
  // Two lines so the textarea parser is exercised. The second name is a
  // placeholder: the agency runs one office, in Sandanski.
  offices: "Sandanski\nSecond office",
}).toString();

test("workspace settings module keeps committed defaults and validates every section", () => {
  const committed = JSON.parse(fs.readFileSync(DEFAULT_WORKSPACE_SETTINGS_PATH, "utf8"));
  assert.equal(committed.kind, "workspace_settings");
  assert.deepEqual(committed.sections.leads, WORKSPACE_SETTINGS_DEFAULTS.leads);
  // The committed document is the defaults, never a workspace's saved state:
  // a dev server pointed at the repo file would otherwise ship someone's edits.
  assert.equal(committed.revision, 0);
  assert.deepEqual(committed.section_updates, {});
  assert.deepEqual(committed.revisions, []);
  assert.equal(committed.updated_at, null);
  assert.deepEqual(leadSlaOptions(committed), { slaMinutes: 15, escalationMinutes: 60 });

  assert.throws(
    () => normalizeWorkspaceSettingsSection("leads", { first_reply_target_minutes: 60, manager_escalation_minutes: 30 }),
    (error) => error.field === "manager_escalation_minutes" && error.status === 400,
  );
  assert.throws(
    () => normalizeWorkspaceSettingsSection("agency", { name: "" }),
    (error) => error.field === "name",
  );
  assert.throws(
    () => normalizeWorkspaceSettingsSection("notifications", { daily_digest_enabled: "on", daily_digest_recipients: "not-an-email" }),
    (error) => error.field === "daily_digest_recipients",
  );
  assert.throws(
    () => normalizeWorkspaceSettingsSection("workspace", { default_locale: "fr", timezone: "Europe/Sofia", date_format: "locale" }),
    (error) => error.field === "default_locale",
  );
  assert.equal(
    normalizeWorkspaceSettingsSection("public_site", { featured_listings_count: "8", show_price_on_request: "on" }).featured_listings_count,
    8,
  );
});

test("workspace settings ledger records revisions and stays idempotent", () => {
  const filePath = tempFile("workspace-settings-ledger", "json");
  const first = updateWorkspaceSettings({
    filePath,
    section: "leads",
    values: { first_reply_target_minutes: "30", manager_escalation_minutes: "90", default_brokers: { buyer: "broker_bg" } },
    actor: "operations_lead",
    recordedAt: "2026-07-19T10:00:00.000Z",
    brokerIds: ["broker_bg", "broker_ru", "broker_international"],
  });
  assert.equal(first.revision, 1);
  assert.deepEqual(first.changed_fields.sort(), ["default_brokers", "first_reply_target_minutes", "manager_escalation_minutes"]);

  const repeat = updateWorkspaceSettings({
    filePath,
    section: "leads",
    values: { first_reply_target_minutes: "30", manager_escalation_minutes: "90", default_brokers: { buyer: "broker_bg" } },
    actor: "operations_lead",
    recordedAt: "2026-07-19T11:00:00.000Z",
    brokerIds: ["broker_bg", "broker_ru", "broker_international"],
  });
  assert.equal(repeat.idempotent, true);
  assert.equal(repeat.revision, 1);

  const stored = readWorkspaceSettings(filePath);
  assert.equal(stored.sections.leads.first_reply_target_minutes, 30);
  assert.equal(stored.section_updates.leads.updated_by, "operations_lead");
  assert.equal(stored.revisions.length, 1);
  assert.deepEqual(leadSlaOptions(stored), { slaMinutes: 30, escalationMinutes: 90 });
});

test("workspace onboarding is computed from real workspace state", () => {
  const filePath = tempFile("workspace-settings-onboarding", "json");
  const empty = buildWorkspaceOnboarding({ settings: readWorkspaceSettings(filePath) });
  assert.equal(empty.total, 5);
  assert.equal(empty.done, 0);
  assert.equal(empty.complete, false);
  assert.deepEqual(
    empty.items.map((item) => item.id),
    ["agency_profile", "lead_sla", "teammate", "provider", "first_reply"],
  );

  updateWorkspaceSettings({
    filePath,
    section: "agency",
    values: { name: "MS Realty", phone: "+359888123456" },
    actor: "operations_lead",
    recordedAt: "2026-07-19T10:00:00.000Z",
  });
  updateWorkspaceSettings({
    filePath,
    section: "leads",
    values: { first_reply_target_minutes: "20", manager_escalation_minutes: "80" },
    actor: "operations_lead",
    recordedAt: "2026-07-19T10:05:00.000Z",
  });
  const complete = buildWorkspaceOnboarding({
    settings: readWorkspaceSettings(filePath),
    teamSize: 3,
    teamSizeKnown: true,
    providerConnections: [{ provider: "google", status: "connected" }],
    replyDeliveryStates: [{ lead_id: "lead-1", status: "sent" }],
  });
  assert.equal(complete.done, 5);
  assert.equal(complete.complete, true);
  assert.ok(complete.items.every((item) => item.done));
});

test("settings screen renders working sections and an in-flow owner overview", async () => {
  await withAdmin(async () => {
    const app = createHttpApp(paths());
    const page = await dispatchHttp(app, { url: "/admin/settings", headers: HEADERS });
    assert.equal(page.status, 200);
    assert.match(page.body, /data-react-admin-ui="settings"/);
    assert.match(page.body, /data-settings-layout="sections-flow"/);
    assert.match(page.body, /class="crm-ph"/);
    assert.match(page.body, /<h1>Settings<\/h1>/);
    assert.match(page.body, /Agency profile, lead reply targets, notifications,/);
    assert.doesNotMatch(page.body, /data-summary-kind="settings"|data-summary-card="settings-state"/);
    assert.match(page.body, /data-settings-overview="true"[\s\S]*?data-settings-index="true"/);
    assert.match(page.body, /Set up your workspace[\s\S]*?0 of 5 done/);
    for (const section of ["agency", "leads", "notifications", "workspace", "public_site"]) {
      assert.match(page.body, new RegExp(`data-settings-section="${section}"`), `${section} panel`);
      assert.match(page.body, new RegExp(`data-workspace-settings-form="${section}"`), `${section} form`);
      assert.match(page.body, new RegExp(`data-admin-mutation-form="workspace-settings-${section}"`), `${section} mutation contract`);
      assert.match(page.body, new RegExp(`id="settings-${section}"`), `${section} anchor`);
    }
    assert.match(page.body, /<details class="crm-panel adm-settings-panel adm-settings-disclosure" id="settings-agency" open/);
    assert.doesNotMatch(page.body, /id="settings-leads" open/);
    // Pristine: every section still shows the committed defaults.
    assert.equal(page.body.match(/data-settings-state="defaults"/g).length, 5);
    assert.doesNotMatch(page.body, /data-settings-state="updated"/);
    assert.equal(page.body.match(/data-admin-mutation-status="true"/g).length, 5);
    assert.match(page.body, /data-settings-dirty-message="Unsaved changes\."/);
    assert.match(page.body, /data-settings-updated-label="Updated"/);
    // Every form posts to the same endpoint and works without JavaScript.
    assert.equal(page.body.match(/action="\/api\/admin\/settings"/g).length, 5);
    assert.equal(page.body.match(/method="post"/g).length, 5);
    // Each overview fact has one owner: section index, onboarding checklist,
    // and history. A second action card must not repeat all three.
    assert.doesNotMatch(page.body, /data-settings-actions=/);
    assert.equal((page.body.match(/data-settings-index="true"/g) || []).length, 1);
    assert.match(page.body, /data-workspace-onboarding="open" data-workspace-onboarding-progress="0\/5"/);
    assert.equal((page.body.match(/data-settings-history="true"/g) || []).length, 1);
    assert.doesNotMatch(page.body, /data-planned-control=/);
    assert.doesNotMatch(page.body, /data-export-form=/);
    assert.doesNotMatch(page.body, /Coming soon/);
    assert.doesNotMatch(page.body, /data-settings-capability-gaps=/);
    assert.doesNotMatch(page.body, /data-settings-gap=/);
    assert.doesNotMatch(page.body, /data-settings-section="(?:security|data)"/);
    assert.match(page.body, /href="\/admin\/connect"/);

    const json = await dispatchHttp(app, { url: "/api/admin/settings", headers: HEADERS });
    assert.equal(json.status, 200);
    assert.equal(json.body.kind, "admin_workspace_settings");
    assert.equal(json.body.settings_writable, true);
    assert.deepEqual(json.body.brokerProfiles.map(({ label }) => label), ["Bulgarian desk", "Russian desk", "International desk"]);
    assert.equal(json.body.workspace_settings.sections.leads.first_reply_target_minutes, 15);
    assert.equal(json.headers["cache-control"], "no-store");
  });
});

test("settings screen speaks Bulgarian and Russian and uses the five owner navigation groups", async () => {
  await withAdmin(async () => {
    const app = createHttpApp(paths());
    const bulgarian = await dispatchHttp(app, { url: "/admin/settings?locale=bg", headers: HEADERS });
    assert.equal(bulgarian.status, 200);
    assert.match(bulgarian.body, /lang="bg"/);
    assert.match(bulgarian.body, /Профил на агенцията/);
    assert.match(bulgarian.body, /Работно пространство/);
    for (const group of ["Работа", "Имоти и съдържание", "Система"]) assert.match(bulgarian.body, new RegExp(`>${group}<`));
    const russian = await dispatchHttp(app, { url: "/admin/settings?locale=ru", headers: HEADERS });
    assert.match(russian.body, /Профиль агентства/);
    assert.match(russian.body, /Сроки ответа|Заявки и сроки/);
    for (const group of ["Работа", "Объекты и контент", "Система"]) assert.match(russian.body, new RegExp(`>${group}<`));

    const today = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    assert.match(today.body, /href="\/admin\/settings"/);
    for (const group of ["Today", "Work", "Properties &amp; Content", "Hermes", "System"]) assert.match(today.body, new RegExp(`>${group}<`));
    for (const route of ["hermes", "connect", "settings", "team", "activity"]) {
      assert.match(today.body, new RegExp(`href="/admin/${route}"`), `${route} is present in the owner navigation`);
    }
  });
});

test("owner screens keep one page heading after moving titles into PageHeader", async () => {
  await withAdmin(async () => {
    const app = createHttpApp(paths());
    const today = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    const hermes = await dispatchHttp(app, { url: "/admin/hermes", headers: HEADERS });
    const connections = await dispatchHttp(app, { url: "/admin/connect", headers: HEADERS });
    const settings = await dispatchHttp(app, { url: "/admin/settings", headers: HEADERS });
    assert.equal(headingCount(today.body), 1, "Today has exactly one h1");
    assert.equal(headingCount(hermes.body), 1, "Hermes has exactly one h1");
    assert.equal(headingCount(connections.body), 1, "Connections has exactly one h1");
    assert.equal(headingCount(settings.body), 1, "Settings has exactly one h1");
    assert.equal((connections.body.match(/class="mk-btn mk-btn--primary(?:\s|\")/g) || []).length, 1, "the connection journey owns the page-primary action");
  });
});

test("settings save persists, audits, redirects without JavaScript and stays idempotent", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const saved = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: FORM_HEADERS,
      body: agencyForm,
    });
    assert.equal(saved.status, 303);
    assert.equal(saved.headers.location, "/admin/settings?locale=en&saved=agency#settings-agency");

    const stored = readWorkspaceSettings(config.workspaceSettingsPath);
    assert.equal(stored.sections.agency.name, "MS Realty Sandanski");
    assert.deepEqual(stored.sections.agency.offices, ["Sandanski", "Second office"]);
    assert.equal(stored.section_updates.agency.updated_by, "operations_lead");

    const audit = readAuditLog(config.auditLogPath);
    assert.deepEqual(audit.map((row) => row.action), ["workspace_settings_updated"]);
    assert.equal(audit[0].actor, "operations_lead");
    assert.equal(audit[0].object_id, "agency");
    assert.ok(audit[0].metadata.changed_fields.includes("name"));

    // The saved state is visible on the next render, with no JavaScript involved.
    const page = await dispatchHttp(app, { url: "/admin/settings?saved=agency", headers: HEADERS });
    assert.match(page.body, /data-settings-section="agency" data-settings-state="updated"/);
    assert.match(page.body, /data-state="success"/);

    const repeat = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: HEADERS,
      body: {
        section: "agency",
        name: "MS Realty Sandanski",
        phone: "+359 888 123 456",
        email: "office@ms-realty.test",
        whatsapp: "+359 888 123 456",
        offices: ["Sandanski", "Second office"],
      },
    });
    assert.equal(repeat.status, 200);
    assert.equal(repeat.body.idempotent, true);
    assert.equal(readAuditLog(config.auditLogPath).length, 1);
  });
});

test("settings validation reports the field for JSON and re-renders the form without JavaScript", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const json = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: HEADERS,
      body: { section: "leads", first_reply_target_minutes: 60, manager_escalation_minutes: 30 },
    });
    assert.equal(json.status, 400);
    assert.equal(json.body.kind, "invalid_workspace_settings");
    assert.equal(json.body.field, "manager_escalation_minutes");

    const form = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: FORM_HEADERS,
      body: new URLSearchParams({
        section: "leads",
        locale: "en",
        first_reply_target_minutes: "60",
        manager_escalation_minutes: "30",
      }).toString(),
    });
    assert.equal(form.status, 400);
    assert.match(form.body, /data-react-admin-ui="settings"/);
    assert.match(form.body, /data-field-error="true"/);
    assert.match(form.body, /aria-invalid="true"/);
    assert.match(form.body, /Manager escalation must come after the first reply target/);
    // The submitted values are echoed so nothing typed is lost.
    assert.match(form.body, /name="manager_escalation_minutes"[^>]*value="30"/);
    assert.equal(readAuditLog(config.auditLogPath).length, 0);
  });
});

test("settings reject missing durable authority explicitly in durable-only runtimes and stay read-only for operators without the capability", async () => {
  await withAdmin(async () => {
    const app = createHttpApp({ ...paths(), runtimeDataDurableOnly: true, workspaceSettingsPath: null });
    const page = await dispatchHttp(app, { url: "/admin/settings", headers: HEADERS });
    assert.equal(page.status, 503);
    assert.match(page.body, /data-react-admin-ui="runtime-unavailable"/);
    assert.match(page.body, /Data connection required/);
    const blocked = await dispatchHttp(app, { method: "POST", url: "/api/admin/settings", headers: HEADERS, body: { section: "agency", name: "X" } });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.kind, "workspace_settings_unavailable");

  });

  await withAdmin(
    async () => {
      const config = paths();
      const app = createHttpApp(config);
      const page = await dispatchHttp(app, { url: "/admin/settings", headers: HEADERS });
      assert.equal(page.status, 200);
      assert.match(page.body, /data-settings-disabled="true"/);
      assert.match(page.body, /This role has read-only access\./);
      assert.match(page.body, /<button type="submit"[^>]*disabled/);
      const forbidden = await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/settings",
        headers: HEADERS,
        body: { section: "agency", name: "Broker edit" },
      });
      assert.equal(forbidden.status, 403);
      assert.equal(forbidden.body.required_capability, "settings:manage");
      assert.equal(readAuditLog(config.auditLogPath).length, 0);
    },
    { roles: "broker", actor: "broker_ivan" },
  );
});

test("Payload-backed workspace settings round-trip and drive lead routing without a file ledger", async () => {
  await withAdmin(async () => {
    const store = createWorkspaceSettingsPayloadStore();
    const config = {
      ...paths({ workspaceSettingsPath: null }),
      workspaceSettingsPayload: store.payload,
      workspaceSettingsPayloadRuntimeConfigured: true,
      workspaceSettingsWorkspaceId: "workspace-sandanski",
    };
    const app = createHttpApp(config);

    const initial = await dispatchHttp(app, { url: "/api/admin/settings", headers: HEADERS });
    assert.equal(initial.status, 200);
    assert.equal(initial.body.kind, "admin_workspace_settings");
    assert.equal(initial.body.settings_writable, true);
    assert.equal(initial.body.workspace_settings.revision, 0);

    const saved = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: HEADERS,
      body: {
        section: "leads",
        first_reply_target_minutes: 25,
        manager_escalation_minutes: 95,
        default_brokers: { buyer: "broker_ru" },
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.equal(saved.body.settings.sections.leads.first_reply_target_minutes, 25);
    assert.equal(store.calls.filter((call) => call.method === "create").length, 1);

    const lead = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/leads",
      headers: HEADERS,
      body: {
        id: "payload-workspace-settings-lead",
        source: "broker_whatsapp",
        leadType: "buyer",
        language: "en",
        contact_preference: "whatsapp",
        contact: { name: "Payload Routed Buyer", phone: "+359880000222" },
        requirements: { locations: ["Sandanski"], property_types: ["apartment"], budget_max_eur: 150000, timeline: "This year" },
        message: "Please route me with payload settings.",
        humanConfirmed: true,
      },
    });
    assert.equal(lead.status, 201);

    const rows = readLeadLedger(config.leadLedgerPath);
    assert.equal(rows[0].assigned_broker, "broker_ru");
    assert.equal(rows[0].sla_due_at, "2026-07-19T09:25:00.000Z");
    assert.equal(rows[0].manager_escalation_due_at, "2026-07-19T10:35:00.000Z");
  });
});

test("workspace settings drive the reply clock, the default broker and the workbench defaults", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const savedLeads = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: HEADERS,
      body: {
        section: "leads",
        first_reply_target_minutes: 45,
        manager_escalation_minutes: 120,
        default_broker_buyer: "broker_ru",
      },
    });
    assert.equal(savedLeads.status, 200);
    assert.equal(savedLeads.body.values.default_brokers.buyer, "broker_ru");

    const lead = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/leads",
      headers: HEADERS,
      body: {
        id: "settings-sla-lead",
        source: "broker_whatsapp",
        leadType: "buyer",
        language: "en",
        contact_preference: "whatsapp",
        contact: { name: "SLA Buyer", phone: "+359880000042" },
        requirements: { locations: ["Sandanski"], property_types: ["apartment"], budget_max_eur: 120000, timeline: "This year" },
        message: "Looking for an apartment.",
        humanConfirmed: true,
      },
    });
    assert.equal(lead.status, 201);
    const rows = readLeadLedger(config.leadLedgerPath);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].sla_due_at, "2026-07-19T09:45:00.000Z");
    assert.equal(rows[0].manager_escalation_due_at, "2026-07-19T11:00:00.000Z");
    assert.equal(rows[0].assigned_broker, "broker_ru");
    assert.equal(rows[0].assignment_method, "workspace_default");

    const workspaceSaved = await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/settings",
      headers: HEADERS,
      body: { section: "workspace", default_locale: "bg", timezone: "Europe/Sofia", date_format: "dd.mm.yyyy" },
    });
    assert.equal(workspaceSaved.status, 200);
    // No ?locale means the workspace default now decides the rendered language.
    const today = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    assert.match(today.body, /lang="bg"/);
    assert.match(today.body, /19\.07\.2026, \d{2}:\d{2}/);
  });
});

test("a manual broker override still beats the workspace default broker", () => {
  const settings = readWorkspaceSettings(tempFile("workspace-settings-override", "json"));
  settings.sections.leads.default_brokers.buyer = "broker_ru";
  const manual = {
    lead: { leadType: "buyer" },
    broker_assignment: { method: "manual_override", broker_id: "broker_bg", criteria: {} },
  };
  assert.equal(applyWorkspaceDefaultBroker(manual, settings, [{ id: "broker_ru" }]).broker_assignment.broker_id, "broker_bg");
  const automatic = {
    lead: { leadType: "buyer" },
    broker_assignment: { method: "rules", broker_id: "broker_bg", criteria: {} },
  };
  const routed = applyWorkspaceDefaultBroker(automatic, settings, [{ id: "broker_ru" }]);
  assert.equal(routed.broker_assignment.broker_id, "broker_ru");
  assert.equal(routed.broker_assignment.method, "workspace_default");
});

test("Today leads with a source-backed briefing, Hermes entry, and one ranked priority list", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const empty = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    assert.equal(empty.status, 200);
    assert.match(empty.body, /data-next-actions="true"/);
    assert.match(empty.body, /data-next-actions-empty="true"/);
    assert.match(empty.body, /data-next-action-count="0" data-next-action-total="0" data-next-action-visible="0"/);
    assert.match(empty.body, /Nothing is waiting\./);
    assert.match(empty.body, /data-today-briefing="true" data-today-primary-action="none" data-today-priority-count="0"/);
    assert.match(empty.body, /data-hermes-entry="today"/);
    assert.match(empty.body, /data-hermes-open="today"/);
    assert.match(empty.body, /name="prompt"/);
    assert.match(empty.body, /<form class="adm-today-briefing__hermes" method="get" action="\/admin\/hermes" data-hermes-entry="today">/);
    assert.match(empty.body, /class="mk-btn mk-btn--secondary mk-btn--sm" href="\/admin\/leads"/);
    assert.equal((empty.body.match(/data-hermes-open="today"/g) || []).length, 1);
    assert.doesNotMatch(empty.body, /name="q"/);
    assert.equal((empty.body.match(/data-admin-nav-group=/g) || []).length, 10, "five groups in desktop and mobile navigation");
    assert.equal((empty.body.match(/data-admin-nav-primary="true"/g) || []).length, 7);
    assert.equal((empty.body.match(/data-admin-nav-primary-mobile="true"/g) || []).length, 7);
    for (const destination of ["Today", "Leads", "Listings", "Translations", "Hermes", "Integrations", "Settings"]) {
      assert.match(empty.body, new RegExp(`>${destination}<`), destination);
    }
    // The rail is flat: no disclosure hides a destination behind a second click.
    assert.doesNotMatch(empty.body, /data-admin-nav-drilldown=/, "no grouped disclosures remain");
    const rail = empty.body.slice(empty.body.indexOf('class="crm-sb__nav"'), empty.body.indexOf('class="crm-sb__me"'));
    assert.equal((rail.match(/<details/g) || []).length, 0, "the desktop rail carries no disclosure");
    // Not a count: the rail must carry exactly the destinations the operator
    // catalog says this operator can reach, each once, each at one depth. A
    // number would have to be bumped whenever one is added, and would pass
    // just as happily if one were swapped for another.
    const reachable = OWNER_CONSOLE_NAV_DESTINATIONS.flatMap((destination) => [destination.primary, ...destination.children]);
    assert.deepEqual(
      [...rail.matchAll(/data-admin-nav-route="([^"]+)"/g)].map((match) => match[1]).sort(),
      [...reachable].sort(),
      "every catalogued destination is a link at one depth, and nothing else is",
    );
    // Every destination is reachable directly, including the ten that used to
    // sit behind "More in ...".
    for (const route of ["contacts", "consents", "documents", "cases", "pipeline", "requests", "viewings", "reports", "approved-content", "migration/review", "team", "activity"]) {
      assert.match(empty.body, new RegExp(`href="/admin/${route}"`), route);
    }
    assert.doesNotMatch(empty.body, /data-today-toolbar="true"/);
    assert.match(empty.body, /class="crm-ph"/);
    for (const contract of ["data-priority-leads=\"true\"", "data-lead-pipeline-preview=\"true\"", "data-public-request-preview=\"true\""]) {
      assert.doesNotMatch(empty.body, new RegExp(contract), contract);
    }
    assert.match(empty.body, /data-today-layout="operating-flow"/);
    assert.match(empty.body, /data-readiness-support="true"/);
    assert.match(empty.body, /data-workspace-onboarding="open"/);
    assert.doesNotMatch(empty.body, /data-workspace-welcome="true"/);

    await dispatchHttp(app, {
      method: "POST",
      url: "/api/admin/leads",
      headers: HEADERS,
      body: {
        id: "today-next-action-lead",
        source: "broker_whatsapp",
        leadType: "buyer",
        language: "en",
        contact_preference: "whatsapp",
        contact: { name: "Next Action Buyer", phone: "+359880000043" },
        requirements: { locations: ["Sandanski"], property_types: ["apartment"], budget_max_eur: 90000, timeline: "This year" },
        message: "Please call me back.",
        humanConfirmed: true,
      },
    });

    const populated = await dispatchHttp(app, { url: "/admin/today?welcome=1", headers: HEADERS });
    // One enquiry produces two next actions: send the first reply, and work the opportunity.
    assert.match(populated.body, /data-today-primary-action="lead"/);
    assert.match(populated.body, /data-today-primary-open="lead"/);
    assert.equal((populated.body.match(/class="mk-btn mk-btn--primary(?:\s|\")/g) || []).length, 1, "the ranked task is the only page-primary action");
    assert.match(populated.body, /name="prompt"[\s\S]*?Prepare a safe plan for today's priority task:/);
    assert.doesNotMatch(populated.body, /data-next-action="lead"/);
    assert.match(populated.body, /data-next-action="pipeline"/);
    assert.match(populated.body, /data-next-action-count="1" data-next-action-total="2" data-next-action-visible="1"/);
    assert.match(populated.body, /data-today-briefing="true" data-today-primary-action="lead" data-today-priority-count="2" data-today-priority-total="2"/);
    assert.doesNotMatch(populated.body, /data-today-toolbar="true"/);
    assert.doesNotMatch(populated.body, /data-list-filter="next-actions"/);
    assert.doesNotMatch(populated.body, /data-list-item="next-actions"/);
    assert.doesNotMatch(populated.body, /data-filter-tags="/);
    assert.match(populated.body, /data-next-action-priority="(critical|urgent|normal)"/);
    assert.doesNotMatch(populated.body, /data-next-actions-empty="true"/);
    assert.doesNotMatch(populated.body, /data-priority-lead=/);
    assert.doesNotMatch(populated.body, /data-lead-pipeline-preview=/);
    assert.doesNotMatch(populated.body, /data-public-request-preview=/);
    assert.match(populated.body, /data-readiness-support="true"/);
    assert.match(populated.body, /data-workspace-welcome="true"/);
    assert.match(populated.body, /data-workspace-onboarding="open"/);
    assert.match(populated.body, /class="crm-ph"/);

    for (let index = 0; index < 3; index += 1) {
      await dispatchHttp(app, {
        method: "POST",
        url: "/api/admin/leads",
        headers: HEADERS,
        body: {
          id: `today-capped-action-${index}`,
          source: "broker_whatsapp",
          leadType: "buyer",
          language: "en",
          contact_preference: "whatsapp",
          contact: { name: `Capped Action Buyer ${index}`, phone: `+35988000005${index}` },
          requirements: { locations: ["Sandanski"], property_types: ["apartment"], budget_max_eur: 90000, timeline: "This year" },
          message: "Please call me back.",
          humanConfirmed: true,
        },
      });
    }
    const capped = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    assert.match(capped.body, /data-today-priority-count="7" data-today-priority-total="8"/);
    assert.match(capped.body, /data-next-action-count="6" data-next-action-total="8" data-next-action-visible="6"/);
    assert.equal((capped.body.match(/data-next-action="/g) || []).length, 6, "one briefing action plus six ranked rows");

    const json = await dispatchHttp(app, { url: "/api/admin/today", headers: HEADERS });
    assert.equal(json.status, 200);
    assert.equal(json.body.kind, "admin_today");
    assert.equal(json.body.onboarding.total, 5);
    assert.equal(json.body.onboarding.complete, false);
  });
});

test("admin client enhances settings forms and remembers dismissals per operator", () => {
  assert.match(ADMIN_APP_JS, /function initWorkspaceSettingsForms\(\)/);
  assert.match(ADMIN_APP_JS, /data-workspace-settings-form/);
  assert.match(ADMIN_APP_JS, /data-settings-dirty-message/);
  assert.match(ADMIN_APP_JS, /submit\.disabled = !dirty/);
  assert.match(ADMIN_APP_JS, /status\.setAttribute\("data-state", "dirty"\)/);
  assert.match(ADMIN_APP_JS, /function initWorkspaceOnboarding\(\)/);
  assert.match(ADMIN_APP_JS, /ms-realty:admin-onboarding-dismissed:v1/);
  assert.match(ADMIN_APP_JS, /ms-realty:admin-welcome-seen:v1/);
  assert.match(ADMIN_APP_JS, /initWorkspaceOnboarding\(\);/);
  assert.match(ADMIN_APP_JS, /initWorkspaceSettingsForms\(\);/);
  // A save returns the form to pristine and stops the section claiming defaults.
  assert.match(ADMIN_APP_JS, /function markWorkspaceSettingsSaved\(form\)/);
  assert.match(ADMIN_APP_JS, /data-settings-updated-label/);
  assert.match(ADMIN_APP_JS, /data-settings-index-row/);
  assert.match(ADMIN_APP_JS, /function syncWorkspaceSettingsConstraints\(form\)/);
  assert.match(ADMIN_APP_JS, /escalation\.min =/);
});
