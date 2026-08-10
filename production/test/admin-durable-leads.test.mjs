import test from "node:test";
import assert from "node:assert/strict";
import { appAdminConfigFromEnv, renderAppAdminResponse } from "../lib/app-admin-adapter.mjs";

const TOKEN = "durable-admin-read-token-0123456789abcdef";
const CONTACT_SECRET = "durable-admin-contact-key-32-characters-minimum";
const AUTH_ENV = {
  NODE_ENV: "production",
  MS_REALTY_ADMIN_CREDENTIALS_JSON: JSON.stringify([
    { id: "durable_admin", token: TOKEN, roles: ["admin"] },
  ]),
};
const DURABLE_ENV = {
  ...AUTH_ENV,
  MS_REALTY_LEAD_DURABLE_STORE_ENABLED: "true",
  PAYLOAD_SECRET: "p".repeat(40),
  DATABASE_URL: "postgres://payload:secret@db.example.test/ms_realty",
  MS_REALTY_LEAD_CONTACT_KEY: CONTACT_SECRET,
};
const HEADERS = { authorization: `Bearer ${TOKEN}` };

const durableLead = {
  received_at: "2026-08-10T09:00:00.000Z",
  id: "inbox-durable-admin-lead",
  lead_id: "durable-admin-lead",
  source: "website_contact_callback",
  intent: "callback",
  lead_type: "buyer",
  listing_reference: "MS-CRAWL-0003",
  property: { location: "Sandanski", type: "apartment" },
  request_details: { callback_time: "Tomorrow" },
  requirements: {
    budget_min_eur: null,
    budget_max_eur: null,
    locations: ["Sandanski"],
    property_types: ["apartment"],
    bedrooms_min: null,
    timeline: null,
    finance_status: null,
  },
  intake_completion: { complete: false, missing_fields: ["budget_max_eur", "timeline"], captured_fields: ["locations"] },
  original_language: "bg",
  admin_locale: "en",
  show_original_available: true,
  contact_preference: "email",
  assigned_broker: "broker_bg",
  assignment_method: "rules",
  duplicate_status: "new_contact",
  sla_due_at: "2026-08-10T09:15:00.000Z",
  manager_escalation_due_at: "2026-08-10T10:00:00.000Z",
  contact: { name: "Durable Admin Lead", email: "durable-admin@example.invalid" },
  message_original: "Durable private message",
  contact_available: true,
};

function config(readLeadIntakesDurably) {
  return {
    ...appAdminConfigFromEnv(DURABLE_ENV),
    authEnv: AUTH_ENV,
    reviewedAt: "2026-08-10T09:05:00.000Z",
    readLeadIntakesDurably,
  };
}

async function adminGet(pathname, routeConfig, headers = HEADERS) {
  return renderAppAdminResponse(new Request(`https://example.test${pathname}`, { headers }), { config: routeConfig });
}

test("durable admin leads are read only after authentication and never merged with fixtures", async () => {
  let reads = 0;
  const routeConfig = config(async () => {
    reads += 1;
    return [durableLead];
  });

  const unauthorized = await adminGet("/api/admin/leads", routeConfig, {});
  assert.equal(unauthorized.status, 401);
  assert.equal(reads, 0, "private contacts must not be opened before authentication");

  const response = await adminGet("/api/admin/leads", routeConfig);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(reads, 1);
  assert.deepEqual(body.leads.map((lead) => lead.lead_id), [durableLead.lead_id]);
  assert.deepEqual(body.leads[0].contact, durableLead.contact);
  assert.equal(body.replies.length, 0);
  assert.equal(body.viewings.length, 0);
  assert.equal(body.deals.length, 0);
  assert.equal(body.sellerPipeline.length, 0);
  assert.equal(body.leadPipelineQueue.states.length, 1);
  assert.equal(JSON.stringify(body).includes("lead-draft-62c8e259-c555-4583-a2c4-0a1b5be53731"), false);

  const today = await adminGet("/api/admin/today", routeConfig);
  const todayBody = await today.json();
  assert.equal(today.status, 200);
  assert.deepEqual(todayBody.leads.map((lead) => lead.lead_id), [durableLead.lead_id]);
  assert.equal(JSON.stringify(todayBody).includes("lead-draft-62c8e259-c555-4583-a2c4-0a1b5be53731"), false);
});

test("durable admin lead reads return 503 without falling back to JSONL", async () => {
  const routeConfig = config(async () => {
    throw new Error("Payload read failed");
  });

  for (const pathname of ["/api/admin/leads", "/api/admin/today"]) {
    const response = await adminGet(pathname, routeConfig);
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "lead_store_unavailable");
  }
});

test("durable mode rejects admin mutations that only persist to local lead files", async () => {
  const routeConfig = config(async () => [durableLead]);
  const paths = [
    "/api/admin/replies",
    "/api/admin/replies/delivery",
    "/api/admin/lead-pipeline/outcome",
    "/api/admin/leads",
    "/api/admin/leads/assign",
    "/api/admin/accounts",
    "/api/admin/accounts/link",
    "/api/admin/documents/outcome",
    "/api/admin/consents/withdraw",
    "/api/admin/replies/draft",
    "/api/admin/viewings",
    "/api/admin/viewings/follow-up",
    "/api/admin/seller-pipeline/outcome",
    "/api/admin/deals/close",
  ];

  for (const pathname of paths) {
    const response = await renderAppAdminResponse(
      new Request(`https://example.test${pathname}`, {
        method: "POST",
        headers: { ...HEADERS, "content-type": "application/json" },
        body: "{}",
      }),
      { config: routeConfig },
    );
    assert.equal(response.status, 503, pathname);
    assert.equal((await response.json()).kind, "lead_store_read_only", pathname);
  }
});
