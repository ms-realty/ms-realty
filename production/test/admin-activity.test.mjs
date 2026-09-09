import test from "node:test";
import assert from "node:assert/strict";
import { renderAdminActivityPayload } from "../lib/admin-payloads.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { renderReactAdminBody } from "../lib/react-admin-site.mjs";

function auditRow(index, metadata = {}) {
  return {
    recorded_at: new Date(Date.UTC(2026, 6, 19, 0, index)).toISOString(),
    actor: index % 2 ? "broker_en" : "editor_bg",
    action: index % 2 ? "lead_pipeline_outcome_recorded" : "listing_edited",
    object_type: index % 2 ? "lead_pipeline_outcome" : "listing",
    object_id: index % 2 ? `outcome-${index}` : `MS-CRAWL-${String(index).padStart(4, "0")}`,
    locale: null,
    status: "recorded",
    metadata,
  };
}

test("activity payload provides privacy-safe lead and listing timelines with bounded pagination", () => {
  const rows = Array.from({ length: 55 }, (_, index) =>
    auditRow(index, index === 3 ? { lead_id: "lead-target", listing_id: "MS-CRAWL-0114" } : {}),
  );
  const registry = loadLocaleRegistry();
  const firstPage = renderAdminActivityPayload(registry, "en", rows, null, { page: 1 });
  assert.equal(firstPage.auditLog.length, 50);
  assert.deepEqual(firstPage.pagination, { page: 1, pageSize: 50, totalRows: 55, totalPages: 2 });

  const leadTimeline = renderAdminActivityPayload(registry, "en", rows, null, { leadId: "lead-target" });
  assert.equal(leadTimeline.auditLog.length, 1);
  assert.equal(leadTimeline.auditLog[0].metadata.lead_id, "lead-target");
  assert.equal(leadTimeline.summary.totalAvailable, 55);

  const listingTimeline = renderAdminActivityPayload(registry, "en", rows, null, { listingId: "MS-CRAWL-0114" });
  assert.equal(listingTimeline.auditLog.length, 1);
  assert.equal(listingTimeline.filters.listingId, "MS-CRAWL-0114");

  const html = renderReactAdminBody(
    renderAdminActivityPayload(registry, "en", [auditRow(1, { public_enabled: true, object_id: "lead-target" })]),
  );
  assert.match(html, /placeholder="e.g. enquiry number"/);
  assert.match(html, /placeholder="e.g. listing reference"/);
  assert.match(html, /<dt>Publicly enabled<\/dt>/);
  assert.match(html, /<dt>Object ID<\/dt>/);
  assert.doesNotMatch(html, /placeholder="MS-00815"/);
  assert.doesNotMatch(html, /<dt>public enabled<\/dt>/);
});
