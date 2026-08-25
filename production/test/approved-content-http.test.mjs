import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHttpApp, dispatchHttp } from "../lib/http.mjs";
import { loadLocaleRegistry } from "../lib/locales.mjs";
import { normalizePurchaseFeeLine, purchaseFeeLineSourceHash, writeApprovedPurchaseFees } from "../lib/purchase-fees.mjs";
import { approvedContentReviewPayload } from "../lib/approved-content-review.mjs";
import { approvedPublicSeedFixtureOptions } from "./approved-public-seed.fixture.mjs";

const ADMIN = { authorization: "Bearer local-admin-smoke" };

function tempFile(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ms-realty-approved-")), name);
}

function approvedLine(overrides) {
  const line = normalizePurchaseFeeLine({
    applies_to: ["eu", "non_eu"],
    basis: "percent_of_price",
    status: "approved",
    human_approved: true,
    reviewer: "operations_lead",
    approved_at: "2026-08-01T00:00:00Z",
    effective_from: "2026-01-01T00:00:00Z",
    max_approval_age_days: 3650,
    sources: [
      {
        id: "operator-approval",
        publisher: "MS Realty",
        url: "https://makler-realty.com/",
        checked_at: "2026-08-01",
        claim_ids: ["fee"],
      },
    ],
    ...overrides,
  });
  return { ...line, source_hash: purchaseFeeLineSourceHash(line) };
}

// A complete, approved table on a temp path: the only way this repository can
// show a total, because it ships no approved rates of its own.
function completeFeeTablePath() {
  const filePath = tempFile("approved-purchase-fees.json");
  writeApprovedPurchaseFees(
    {
      artifact_id: "test-purchase-fees",
      lines: [
        approvedLine({ id: "tax-sandanski", line_key: "local_transfer_tax", municipality: "Sandanski", percent: 2.5, label: "Transfer tax" }),
        approvedLine({ id: "notary", line_key: "notary_fee", basis: "fixed_eur", amount_eur: 900, label: "Notary" }),
        approvedLine({ id: "registry", line_key: "registry_entry_fee", percent: 0.1, label: "Registry" }),
        approvedLine({ id: "agency", line_key: "agency_fee", percent: 3, label: "Agency fee" }),
        approvedLine({ id: "company", line_key: "company_route_setup", applies_to: ["non_eu"], basis: "fixed_eur", amount_eur: 1200, label: "Company route" }),
      ],
    },
    { filePath },
  );
  return filePath;
}

test("the fee API refuses to total the shipped, unapproved table and names every missing line", async () => {
  const app = createHttpApp({ registry: loadLocaleRegistry() });
  const refused = await dispatchHttp(app, {
    method: "GET",
    url: "/api/purchase-fees/estimate?price_eur=120000&municipality=Sandanski&buyer=non_eu",
  });

  assert.equal(refused.status, 409);
  assert.equal(refused.body.available, false);
  assert.equal(refused.body.total_eur, undefined);
  assert.deepEqual(
    refused.body.missing.map((line) => line.line_key),
    ["local_transfer_tax", "notary_fee", "registry_entry_fee", "agency_fee", "company_route_setup"],
  );
  assert.equal(refused.body.missing.every((line) => line.reason === "not_approved"), true);
  assert.equal(typeof refused.body.notice, "string");
});

test("the fee API totals an approved table and validates its inputs", async () => {
  const app = createHttpApp({ registry: loadLocaleRegistry(), approvedPurchaseFeePath: completeFeeTablePath() });

  const eu = await dispatchHttp(app, {
    method: "GET",
    url: "/api/purchase-fees/estimate?price_eur=120000&municipality=Sandanski&buyer=eu",
  });
  assert.equal(eu.status, 200);
  assert.equal(eu.body.available, true);
  // 2.5% of 120000 + 900 notary + 0.1% registry + 3% agency.
  assert.equal(eu.body.estimate.total_eur, 3000 + 900 + 120 + 3600);
  assert.equal(eu.body.estimate.total_including_price_eur, 120000 + eu.body.estimate.total_eur);
  assert.equal(eu.body.estimate.lines.every((line) => line.reviewer === "operations_lead"), true);
  assert.equal(eu.body.estimate.lines.every((line) => line.sources.length > 0), true);

  // The non-EU route adds the company line, so the same price costs more.
  const nonEu = await dispatchHttp(app, {
    method: "GET",
    url: "/api/purchase-fees/estimate?price_eur=120000&municipality=Sandanski&buyer=non_eu",
  });
  assert.equal(nonEu.status, 200);
  assert.equal(nonEu.body.estimate.total_eur, eu.body.estimate.total_eur + 1200);

  // No municipality-specific transfer tax outside Sandanski, and no default:
  // a refusal that names the line, not a silent fallback.
  const elsewhere = await dispatchHttp(app, {
    method: "GET",
    url: "/api/purchase-fees/estimate?price_eur=120000&municipality=Bansko&buyer=eu",
  });
  assert.equal(elsewhere.status, 409);
  assert.deepEqual(elsewhere.body.missing, [
    { line_key: "local_transfer_tax", municipality: "Bansko", reason: "no_approved_record" },
  ]);

  // Without a price the endpoint reports table readiness so the page can show
  // the control at all.
  const readiness = await dispatchHttp(app, { method: "GET", url: "/api/purchase-fees/estimate?municipality=Sandanski" });
  assert.equal(readiness.status, 200);
  assert.equal(readiness.body.estimate, null);
  assert.equal(readiness.body.table.find((row) => row.buyer_scope === "non_eu").available, true);

  for (const badUrl of [
    "/api/purchase-fees/estimate?price_eur=-5",
    "/api/purchase-fees/estimate?price_eur=abc",
    "/api/purchase-fees/estimate?price_eur=1000&buyer=uk",
  ]) {
    const bad = await dispatchHttp(app, { method: "GET", url: badUrl });
    assert.equal(bad.status, 400, badUrl);
    assert.equal(bad.body.kind, "bad_request");
  }
});

test("a location page carries approved area copy and marks the absence where there is none", async () => {
  const app = createHttpApp({ registry: loadLocaleRegistry(), ...approvedPublicSeedFixtureOptions() });

  const hotovo = await dispatchHttp(app, { method: "GET", url: "/bg/lokacii/hotovo" });
  assert.equal(hotovo.status, 200);
  assert.equal(hotovo.body.body.area_guide.available, true);
  assert.equal(hotovo.body.body.area_guide.reviewer, "editor_bg");
  assert.match(hotovo.body.body.area_guide.sections[0].statements[0].text, /Среден Пирин/);

  const sandanski = await dispatchHttp(app, { method: "GET", url: "/bg/lokacii/sandanski" });
  assert.equal(sandanski.status, 200);
  assert.equal(sandanski.body.body.area_guide.available, false);
  assert.equal(typeof sandanski.body.body.area_guide.notice, "string");
  // The rule from AGENTS.md, checked on the rendered payload.
  assert.equal(/sea|море|плаж/i.test(JSON.stringify(sandanski.body.body.area_guide)), false);
});

test("a listing page carries the cost estimator contract without a total it cannot support", async () => {
  const app = createHttpApp({ registry: loadLocaleRegistry(), ...approvedPublicSeedFixtureOptions() });
  const listing = await dispatchHttp(app, { method: "GET", url: "/bg/imoti/MS-CRAWL-0001" });

  assert.equal(listing.status, 200);
  const estimator = listing.body.body.cost_estimator;
  assert.equal(estimator.endpoint, "/api/purchase-fees/estimate");
  assert.equal(estimator.currency, "EUR");
  assert.equal(estimator.available, false);
  assert.equal(estimator.estimate.total_eur, null);
  assert.equal(estimator.missing.length > 0, true);
  assert.deepEqual(estimator.buyer_scopes, ["eu", "non_eu"]);
});

test("the approved-content review surface is admin-gated and reports why each record is withheld", async () => {
  const app = createHttpApp({ registry: loadLocaleRegistry() });

  const unauthorized = await dispatchHttp(app, { method: "GET", url: "/api/admin/approved-content" });
  assert.equal(unauthorized.status, 401);

  const review = await dispatchHttp(app, { method: "GET", url: "/api/admin/approved-content", headers: ADMIN });
  assert.equal(review.status, 200);
  assert.equal(review.headers["cache-control"], "no-store");
  assert.equal(review.body.kind, "admin_approved_content");
  assert.deepEqual(
    review.body.sections.map((section) => section.id),
    ["team_profiles", "area_guides", "financing_partners", "purchase_fees", "guide_translations"],
  );
  // Drafted buyer-guide copy is visible to a reviewer and publishable by none
  // of it: an agent may write a translation, only a human may approve one.
  const guideTranslations = review.body.sections.find((section) => section.id === "guide_translations");
  assert.equal(guideTranslations.publishable, 0);
  assert.equal(guideTranslations.blocked, guideTranslations.total);
  // Blocked at the first gate -- nobody approved them at all -- and the row
  // also names the gate that outlasts a plain approval: the translation itself.
  assert.equal(guideTranslations.rows.every((row) => row.blocked_reason === "not_approved"), true);
  assert.equal(guideTranslations.rows.every((row) => row.awaiting === "translation_not_approved"), true);
  assert.equal(guideTranslations.rows.every((row) => row.reviewer === null || row.reviewer === ""), true);
  assert.equal(guideTranslations.rows.every((row) => row.drafted_by === "claude_translator"), true);
  const team = review.body.sections.find((section) => section.id === "team_profiles");
  assert.equal(team.publishable, 0);
  assert.equal(team.rows.every((row) => row.blocked_reason === "example_record"), true);
  assert.equal(typeof team.publish_requirement, "string");
  const areas = review.body.sections.find((section) => section.id === "area_guides");
  assert.equal(areas.publishable, areas.total);
  assert.equal(review.body.purchase_fee_table.every((row) => row.available === false), true);
});

test("the review surface requires content:read, so an operations-only broker is refused", async () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    MS_REALTY_ADMIN_TOKEN: process.env.MS_REALTY_ADMIN_TOKEN,
    MS_REALTY_ADMIN_ACTOR: process.env.MS_REALTY_ADMIN_ACTOR,
    MS_REALTY_ADMIN_CREDENTIALS_JSON: process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON,
  };
  try {
    delete process.env.MS_REALTY_ADMIN_TOKEN;
    delete process.env.MS_REALTY_ADMIN_ACTOR;
    process.env.MS_REALTY_ADMIN_CREDENTIALS_JSON = JSON.stringify([
      { id: "editor_bg", token: "editor-bg-approved-content-token-01", roles: ["editor"] },
      { id: "agent_bot", token: "agent-approved-content-token-0123456", roles: ["agent"] },
    ]);
    const app = createHttpApp({ registry: loadLocaleRegistry() });

    const editor = await dispatchHttp(app, {
      method: "GET",
      url: "/api/admin/approved-content",
      headers: { authorization: "Bearer editor-bg-approved-content-token-01" },
    });
    assert.equal(editor.status, 200);

    const agent = await dispatchHttp(app, {
      method: "GET",
      url: "/api/admin/approved-content",
      headers: { authorization: "Bearer agent-approved-content-token-0123456" },
    });
    assert.equal(agent.status, 403);
    assert.equal(agent.body.required_capability, "content:read");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the review payload survives a missing approved-content file instead of failing the screen", () => {
  const payload = approvedContentReviewPayload({
    teamProfilePath: tempFile("absent-team.json"),
    areaGuidePath: tempFile("absent-areas.json"),
    financingPartnerPath: tempFile("absent-partners.json"),
    purchaseFeePath: tempFile("absent-fees.json"),
    guideTranslationPath: tempFile("absent-guide-translations.json"),
    now: "2026-08-23T00:00:00Z",
  });
  assert.equal(payload.summary.total, 0);
  assert.equal(payload.purchase_fee_table.every((row) => row.available === false), true);
});
