import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { readAuditLog } from "../lib/audit-log.mjs";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { readLeadLedger } from "../lib/lead-ledger.mjs";
import { ADMIN_APP_JS } from "../lib/ui/client.mjs";
import {
  DEFAULT_WORKSPACE_SETTINGS_PATH,
  WORKSPACE_SETTINGS_DEFAULTS,
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
    receivedAt: "2026-07-19T09:00:00.000Z",
    reviewedAt: "2026-07-19T10:00:00.000Z",
    ...overrides,
  };
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

test("settings screen renders every section, its states and the pending backlog", async () => {
  await withAdmin(async () => {
    const app = createHttpApp(paths());
    const page = await dispatchHttp(app, { url: "/admin/settings", headers: HEADERS });
    assert.equal(page.status, 200);
    assert.match(page.body, /data-react-admin-ui="settings"/);
    assert.match(page.body, /data-settings-layout="sections-rail"/);
    for (const section of ["agency", "leads", "notifications", "workspace", "public_site"]) {
      assert.match(page.body, new RegExp(`data-settings-section="${section}"`), `${section} panel`);
      assert.match(page.body, new RegExp(`data-workspace-settings-form="${section}"`), `${section} form`);
      assert.match(page.body, new RegExp(`data-admin-mutation-form="workspace-settings-${section}"`), `${section} mutation contract`);
      assert.match(page.body, new RegExp(`id="settings-${section}"`), `${section} anchor`);
    }
    // Pristine: every section still shows the committed defaults.
    assert.equal(page.body.match(/data-settings-state="defaults"/g).length, 5);
    assert.doesNotMatch(page.body, /data-settings-state="updated"/);
    assert.equal(page.body.match(/data-admin-mutation-status="true"/g).length, 5);
    assert.match(page.body, /data-settings-dirty-message="Unsaved changes\."/);
    assert.match(page.body, /data-settings-updated-label="Updated"/);
    // Every form posts to the same endpoint and works without JavaScript.
    assert.equal(page.body.match(/action="\/api\/admin\/settings"/g).length, 5);
    assert.equal(page.body.match(/method="post"/g).length, 5);
    // Designed but unconnected settings sit in one closed strip, in the same
    // planned-control vocabulary the CRM screens use, and every control is inert.
    assert.match(page.body, /data-settings-pending-panel="true"/);
    assert.match(page.body, /<details class="adm-list-tools adm-settings-pending-tools"/);
    assert.match(page.body, /data-planned-control="workspace_settings_pending"/);
    assert.doesNotMatch(page.body, /<details class="adm-list-tools adm-settings-pending-tools"[^>]*\sopen/);
    for (const pending of ["messaging_credentials", "working_hours", "routing_rules"]) {
      assert.match(page.body, new RegExp(`data-settings-pending="${pending}"`), `${pending} row`);
      assert.match(page.body, new RegExp(`id="settings-pending-${pending}-note"`), `${pending} note`);
    }
    assert.match(page.body, /Needs a provider credential vault/);

    // Security and Data are designed sections with no backend: same shape as a
    // live section, every control inert, one line each on what is missing.
    for (const planned of ["security", "data"]) {
      assert.match(page.body, new RegExp(`data-settings-section="${planned}" data-settings-planned="true"`), `${planned} section`);
      assert.match(page.body, new RegExp(`data-planned-control="workspace_settings_${planned}"`), `${planned} planned marker`);
    }
    assert.match(page.body, /id="settings-security-two_factor-note"/);
    assert.match(page.body, /id="settings-security-sessions-note"/);
    assert.match(page.body, /id="settings-data-export-note"/);
    assert.match(page.body, /id="settings-data-audit_retention-note"/);
    assert.match(page.body, /Needs Payload to list and revoke operator sessions\./);
    assert.match(page.body, /Needs an export job that writes an audit entry/);
    assert.match(page.body, /Revoke other sessions/);
    assert.match(page.body, /id="settings-notification-centre-note"/);
    assert.match(page.body, /Needs an in-app notification store/);
    // Nothing in a planned section can be submitted: controls are disabled
    // themselves, or grouped in a disabled fieldset the way the CRM screens do.
    const plannedMarkup = page.body.slice(page.body.indexOf('data-settings-section="security"'), page.body.indexOf('data-settings-pending-panel'));
    assert.match(plannedMarkup, /<fieldset class="adm-planned__group" disabled/);
    const outsideGroups = plannedMarkup.replace(/<fieldset class="adm-planned__group" disabled[\s\S]*?<\/fieldset>/g, "");
    assert.equal(/<input(?![^>]*\bdisabled\b)/.test(outsideGroups), false, "planned inputs stay disabled");
    assert.equal(/<button(?![^>]*\bdisabled\b)/.test(outsideGroups), false, "planned buttons stay disabled");
    assert.equal(/<select(?![^>]*\bdisabled\b)/.test(outsideGroups), false, "planned selects stay disabled");
    assert.equal((page.body.match(/adm-planned-note/g) || []).length >= 6, true);

    const json = await dispatchHttp(app, { url: "/api/admin/settings", headers: HEADERS });
    assert.equal(json.status, 200);
    assert.equal(json.body.kind, "admin_workspace_settings");
    assert.equal(json.body.settings_writable, true);
    assert.equal(json.body.workspace_settings.sections.leads.first_reply_target_minutes, 15);
    assert.equal(json.headers["cache-control"], "no-store");
  });
});

test("settings screen speaks Bulgarian and Russian and links from the workspace nav group", async () => {
  await withAdmin(async () => {
    const app = createHttpApp(paths());
    const bulgarian = await dispatchHttp(app, { url: "/admin/settings?locale=bg", headers: HEADERS });
    assert.equal(bulgarian.status, 200);
    assert.match(bulgarian.body, /lang="bg"/);
    assert.match(bulgarian.body, /Профил на агенцията/);
    assert.match(bulgarian.body, /Работно пространство/);
    const russian = await dispatchHttp(app, { url: "/admin/settings?locale=ru", headers: HEADERS });
    assert.match(russian.body, /Профиль агентства/);
    assert.match(russian.body, /Сроки ответа|Заявки и сроки/);

    const today = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    assert.match(today.body, /href="\/admin\/settings"/);
    assert.match(today.body, />Administration</);
    for (const route of ["hermes", "connect", "settings", "team", "activity"]) {
      assert.match(today.body, new RegExp(`href="/admin/${route}"`), `${route} is present in the owner navigation`);
    }
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

test("settings stay read-only without a configured ledger and for operators without the capability", async () => {
  await withAdmin(async () => {
    const app = createHttpApp({ ...paths(), workspaceSettingsPath: null });
    const page = await dispatchHttp(app, { url: "/admin/settings", headers: HEADERS });
    assert.equal(page.status, 200);
    // The unconfigured store is one page-level banner now, not a note under
    // every section; the per-section note is reserved for the role case.
    assert.match(page.body, /data-settings-store-missing="true"/);
    assert.equal([...page.body.matchAll(/Settings storage is not configured on this runtime\./g)].length, 1);
    assert.match(page.body, /data-settings-disabled="true"/);
    const blocked = await dispatchHttp(app, { method: "POST", url: "/api/admin/settings", headers: HEADERS, body: { section: "agency", name: "X" } });
    assert.equal(blocked.status, 503);
    assert.equal(blocked.body.kind, "workspace_settings_read_only");
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

test("Today leads with next actions, keeps its queue previews and shows the onboarding checklist", async () => {
  await withAdmin(async () => {
    const config = paths();
    const app = createHttpApp(config);
    const empty = await dispatchHttp(app, { url: "/admin/today", headers: HEADERS });
    assert.equal(empty.status, 200);
    assert.match(empty.body, /data-next-actions="true"/);
    assert.match(empty.body, /data-next-actions-empty="true"/);
    assert.match(empty.body, /Nothing is waiting\./);
    assert.doesNotMatch(empty.body, /data-today-toolbar="true"/);
    // Next actions come before the queue previews the existing contracts pin.
    assert.ok(empty.body.indexOf('data-next-actions="true"') < empty.body.indexOf('data-priority-leads="true"'));
    for (const contract of ["data-today-layout=\"action-rail\"", "data-priority-leads=\"true\"", "data-lead-pipeline-preview=\"true\"", "data-public-request-preview=\"true\"", "data-readiness-rail=\"true\""]) {
      assert.match(empty.body, new RegExp(contract), contract);
    }
    // Checklist: nothing done yet on a fresh workspace.
    assert.match(empty.body, /data-workspace-onboarding="open"/);
    assert.match(empty.body, /data-workspace-onboarding-progress="0\/5"/);
    assert.equal(empty.body.match(/data-onboarding-done="false"/g).length, 5);
    assert.match(empty.body, /data-workspace-onboarding-dismiss="true"/);
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
    assert.match(populated.body, /data-next-action="lead"/);
    assert.match(populated.body, /data-next-action="pipeline"/);
    assert.match(populated.body, /data-next-action-count="2"/);
    // The shared shell: page header, then a toolbar row of counted filters, then content.
    assert.match(populated.body, /data-today-toolbar="true"/);
    assert.match(populated.body, /data-list-filter="next-actions"/);
    assert.match(populated.body, /data-filter-value="enquiries"[^>]*/);
    assert.match(populated.body, /data-list-item="next-actions"/);
    // Both fixture rows are past their deadline, so each carries its kind plus "overdue".
    assert.match(populated.body, /data-filter-tags="enquiries overdue"/);
    assert.match(populated.body, /data-filter-tags="opportunities overdue"/);
    assert.match(populated.body, /data-list-empty="next-actions"/);
    assert.ok(populated.body.indexOf('data-today-toolbar="true"') < populated.body.indexOf('data-next-actions="true"'));
    assert.match(populated.body, /data-next-action-priority="(critical|urgent|normal)"/);
    assert.match(populated.body, /data-priority-lead="today-next-action-lead"/);
    assert.doesNotMatch(populated.body, /data-next-actions-empty="true"/);
    // The welcome banner only appears on the post-login hop and can be dismissed.
    assert.match(populated.body, /data-workspace-welcome="true"/);
    assert.match(populated.body, /data-workspace-welcome-dismiss="true"/);
    assert.match(populated.body, /Welcome, operations lead\./);

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
