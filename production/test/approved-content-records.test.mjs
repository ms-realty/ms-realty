import test from "node:test";
import assert from "node:assert/strict";
import {
  approvedAreaGuideFor,
  areaGuidePayloadFor,
  areaGuideSourceHash,
  assertApprovedAreaGuides,
  containsSeaClaim,
  normalizeAreaGuide,
  readApprovedAreaGuides,
} from "../lib/area-guides.mjs";
import {
  assertApprovedTeamProfiles,
  isPublishableTeamProfile,
  normalizeTeamProfile,
  publicTeamProfilesFor,
  readApprovedTeamProfiles,
  teamProfileSourceHash,
} from "../lib/team-profiles.mjs";
import {
  assertApprovedFinancingPartners,
  financingPartnerSourceHash,
  isPublishableFinancingPartner,
  normalizeFinancingPartner,
  publicFinancingPartnersFor,
  readApprovedFinancingPartners,
} from "../lib/financing-partners.mjs";
import {
  assertApprovedPurchaseFees,
  normalizePurchaseFeeLine,
  purchaseFeeAmount,
  purchaseFeeEstimate,
  purchaseFeeLineSourceHash,
  readApprovedPurchaseFees,
  requiredPurchaseFeeLines,
} from "../lib/purchase-fees.mjs";
import {
  areaGuidePayload,
  financingPartnersPayload,
  purchaseFeePayload,
  teamProfilesPayload,
} from "../lib/public-site.mjs";

const NOW = "2026-08-23T00:00:00Z";

function approvedProfile(overrides = {}) {
  const profile = normalizeTeamProfile({
    id: "maria-bg",
    profile_key: "maria",
    locale: "bg",
    source_locale: "bg",
    status: "approved",
    human_approved: true,
    reviewer: "editor_bg",
    approved_at: "2026-08-01T00:00:00Z",
    name: "Maria",
    role: "broker",
    office: "Sandanski",
    languages: ["bg", "en"],
    bio: "Handles buyer enquiries in the Struma valley.",
    ...overrides,
  });
  return { ...profile, source_hash: teamProfileSourceHash(profile) };
}

function approvedPartner(overrides = {}) {
  const partner = normalizeFinancingPartner({
    id: "partner-bg",
    partner_key: "partner",
    locale: "bg",
    source_locale: "bg",
    status: "approved",
    human_approved: true,
    reviewer: "operations_lead",
    approved_at: "2026-08-01T00:00:00Z",
    review_due_at: "2027-08-01T00:00:00Z",
    name: "Partner Bank",
    serves: "both",
    offering: ["Mortgages for EU residents buying a completed apartment."],
    contact_route: { kind: "agency_introduction", detail: "The agency introduces the buyer to the lender." },
    ...overrides,
  });
  return { ...partner, source_hash: financingPartnerSourceHash(partner) };
}

function approvedLine(overrides = {}) {
  const line = normalizePurchaseFeeLine({
    id: `${overrides.line_key || "agency_fee"}-${overrides.municipality || "default"}`,
    line_key: "agency_fee",
    applies_to: ["eu", "non_eu"],
    basis: "percent_of_price",
    percent: 3,
    label: "Agency fee",
    status: "approved",
    human_approved: true,
    reviewer: "operations_lead",
    approved_at: "2026-08-01T00:00:00Z",
    effective_from: "2026-01-01T00:00:00Z",
    max_approval_age_days: 365,
    sources: [
      {
        id: "agency-tariff",
        publisher: "MS Realty",
        url: "https://makler-realty.com/",
        checked_at: "2026-08-01",
        claim_ids: ["agency-fee"],
      },
    ],
    ...overrides,
  });
  return { ...line, source_hash: purchaseFeeLineSourceHash(line) };
}

function completeFeeTable(overrides = {}) {
  return {
    lines: [
      approvedLine({ line_key: "local_transfer_tax", municipality: "Sandanski", basis: "percent_of_price", percent: 2.5, label: "Transfer tax" }),
      approvedLine({ line_key: "notary_fee", basis: "scale_of_price", percent: undefined, label: "Notary scale", scale: [
        { from_eur: 0, to_eur: 100000, fixed_eur: 500, percent_of_excess: 0.5 },
        { from_eur: 100000, to_eur: null, fixed_eur: 1000, percent_of_excess: 0.1 },
      ] }),
      approvedLine({ line_key: "registry_entry_fee", percent: 0.1, label: "Registry entry" }),
      approvedLine({ line_key: "agency_fee", percent: 3, label: "Agency fee" }),
      approvedLine({ line_key: "company_route_setup", applies_to: ["non_eu"], basis: "fixed_eur", percent: undefined, amount_eur: 900, label: "Company route" }),
      ...(overrides.extraLines || []),
    ].filter((line) => !(overrides.drop || []).includes(line.line_key)),
  };
}

test("the shipped approved-content files validate and publish nothing that a human has not approved", () => {
  const team = readApprovedTeamProfiles();
  const partners = readApprovedFinancingPartners();
  const fees = readApprovedPurchaseFees();
  const areas = readApprovedAreaGuides();

  assert.equal(assertApprovedTeamProfiles(team), true);
  assert.equal(assertApprovedFinancingPartners(partners), true);
  assert.equal(assertApprovedPurchaseFees(fees), true);
  assert.equal(assertApprovedAreaGuides(areas), true);

  // Every shipped team, financing and fee row is example content, so nothing
  // reaches a public surface.
  assert.equal(team.profiles.every((profile) => profile.example_record === true), true);
  assert.equal(partners.partners.every((partner) => partner.example_record === true), true);
  assert.equal(fees.lines.every((line) => line.example_record === true), true);
  assert.equal(publicTeamProfilesFor(team, "en", { now: NOW }).length, 0);
  assert.equal(publicFinancingPartnersFor(partners, "en", { now: NOW }).length, 0);

  // Area guides are projected from already-approved CMS guides, so they do
  // publish, and they carry the original reviewer and official source.
  const hotovo = approvedAreaGuideFor(areas, "Hotovo", "bg", { now: NOW });
  assert.equal(hotovo.reviewer, "editor_bg");
  assert.equal(hotovo.derived_from_document_id, "hotovo-locality-official-context");
  assert.equal(hotovo.sources[0].url.startsWith("https://sandanski.bg/"), true);
  // Sandanski has no approved place description, so its location page shows an
  // absence rather than borrowed copy.
  assert.equal(approvedAreaGuideFor(areas, "Sandanski", "bg", { now: NOW }), null);
});

test("a team profile publishes only while the recorded approval still covers its exact content", () => {
  const profile = approvedProfile();
  assert.equal(isPublishableTeamProfile(profile, { now: NOW }), true);
  assert.equal(isPublishableTeamProfile({ ...profile, name: "Someone else" }, { now: NOW }), false);
  assert.equal(isPublishableTeamProfile({ ...profile, status: "draft", human_approved: false }, { now: NOW }), false);
  assert.equal(isPublishableTeamProfile({ ...profile, example_record: true }, { now: NOW }), false);
  assert.equal(
    isPublishableTeamProfile({ ...profile, review_due_at: "2026-08-01T00:00:00Z" }, { now: NOW }),
    false,
    "a profile past its review date is stale",
  );

  // A translation needs its own human approval.
  const translated = approvedProfile({ id: "maria-en", locale: "en", source_document_id: "maria-bg" });
  assert.equal(isPublishableTeamProfile(translated, { now: NOW }), false);
  const approvedTranslation = approvedProfile({
    id: "maria-en",
    locale: "en",
    source_document_id: "maria-bg",
    human_translation_approved: true,
  });
  assert.equal(isPublishableTeamProfile(approvedTranslation, { now: NOW }), true);

  // An unapproved photo never reaches the page.
  const withPhoto = approvedProfile({ photo: { url: "/hero/team.jpg", alt: "Maria at the Sandanski office" } });
  assert.equal(publicTeamProfilesFor({ profiles: [withPhoto] }, "bg", { now: NOW })[0].photo, null);
  const approvedPhoto = approvedProfile({
    photo: { url: "/hero/team.jpg", alt: "Maria at the Sandanski office", approved: true },
  });
  assert.equal(publicTeamProfilesFor({ profiles: [approvedPhoto] }, "bg", { now: NOW })[0].photo_available, true);
});

test("team profile validation refuses input that would put an unchecked claim on the page", () => {
  assert.throws(() => normalizeTeamProfile({ ...approvedProfile(), role: "notary" }), /role must be one of/);
  assert.throws(
    () => normalizeTeamProfile({ ...approvedProfile(), licence: { reference: "BG-1" } }),
    /licence.authority is required/,
  );
  assert.throws(
    () => normalizeTeamProfile({ ...approvedProfile(), photo: { url: "http://example.com/a.jpg", alt: "a" } }),
    /photo.url must be a site-relative path or an HTTPS URL/,
  );
  assert.throws(() => normalizeTeamProfile({ ...approvedProfile(), photo: { url: "/a.jpg" } }), /photo.alt is required/);
  assert.throws(
    () => normalizeTeamProfile({ ...approvedProfile(), status: "approved", human_approved: true, reviewer: "" }),
    /reviewer must be a stable operator ID/,
  );
});

test("area guides refuse a statement without evidence and refuse the sea for an inland area", () => {
  const areas = readApprovedAreaGuides();
  const hotovo = areas.guides.find((guide) => guide.area_key === "Hotovo");

  assert.throws(
    () =>
      normalizeAreaGuide({
        ...hotovo,
        source_hash: undefined,
        sections: { what_it_is: [{ text: "A nice place.", claim_id: "invented", source_id: "sandanski-hotovo-locality" }] },
      }),
    /which no attached source backs/,
  );

  // The rule from AGENTS.md, enforced in validation rather than by memory.
  assert.equal(containsSeaClaim("Sandanski is a sea destination"), true);
  assert.equal(containsSeaClaim("Сандански е морски курорт"), true);
  assert.equal(containsSeaClaim("Сандански е в подножието на Пирин"), false);
  assert.throws(
    () =>
      normalizeAreaGuide({
        ...hotovo,
        id: "sandanski-bg",
        area_key: "Sandanski",
        source_hash: undefined,
        title: "Sandanski, a seaside town",
      }),
    /must not describe an inland area as a sea destination/,
  );
  assert.throws(
    () => normalizeAreaGuide({ ...hotovo, id: "sandanski-bg", area_key: "Sandanski", source_hash: undefined, sea_access: true }),
    /may not declare sea access/,
  );
  assert.throws(
    () => assertApprovedAreaGuides({ guides: [{ ...hotovo, sea_access: true }] }),
    /may not declare sea access/,
  );

  // An edited sentence stops publishing until it is re-approved.
  const edited = { ...hotovo, title: "Hotovo, revised" };
  assert.notEqual(areaGuideSourceHash(edited), edited.source_hash);
  assert.equal(areaGuidePayloadFor({ guides: [edited] }, "Hotovo", "bg", { now: NOW }).reason, "changed_since_approval");
  assert.equal(areaGuidePayloadFor({ guides: [] }, "Hotovo", "bg", { now: NOW }).available, false);
});

test("a financing partner may not carry a rate without the approval that covers it", () => {
  const partner = approvedPartner();
  assert.equal(isPublishableFinancingPartner(partner, { now: NOW }), true);
  assert.equal(publicFinancingPartnersFor({ partners: [partner] }, "bg", { now: NOW })[0].rates_available, false);

  assert.throws(
    () => normalizeFinancingPartner({ ...partner, source_hash: undefined, rates: [{ label: "Fixed", value: 4, unit: "percent" }] }),
    /effective_from must be an ISO date/,
  );
  assert.throws(
    () =>
      normalizeFinancingPartner({
        ...partner,
        source_hash: undefined,
        rates: [{ label: "Fixed", value: 4, unit: "percent", effective_from: "2026-08-01T00:00:00Z" }],
      }),
    /approved_at must be an ISO date/,
  );
  assert.throws(() => normalizeFinancingPartner({ ...partner, source_hash: undefined, review_due_at: "" }), /review_due_at/);
  assert.throws(
    () => normalizeFinancingPartner({ ...partner, source_hash: undefined, contact_route: { kind: "partner_direct", detail: "Apply online" } }),
    /url is required for a partner_direct route/,
  );

  const withRate = normalizeFinancingPartner({
    ...partner,
    source_hash: undefined,
    rates: [
      {
        label: "Indicative fixed rate",
        value: 4,
        unit: "percent",
        effective_from: "2026-08-01T00:00:00Z",
        approved_at: "2026-08-01T00:00:00Z",
        reviewer: "operations_lead",
      },
    ],
  });
  const published = publicFinancingPartnersFor(
    { partners: [{ ...withRate, source_hash: financingPartnerSourceHash(withRate) }] },
    "bg",
    { now: NOW },
  );
  assert.equal(published[0].rates_available, true);
  assert.equal(published[0].rates[0].effective_from, "2026-08-01T00:00:00Z");

  // Past its review date the whole partner disappears rather than ageing into
  // fiction.
  const stale = approvedPartner({ review_due_at: "2026-08-01T00:00:00Z" });
  assert.equal(isPublishableFinancingPartner(stale, { now: NOW }), false);
  assert.equal(financingPartnersPayload({ localeCode: "bg", document: { partners: [stale] }, now: NOW }).reason, "approval_expired");
});

test("the fee estimator totals a complete table and refuses an incomplete one by name", () => {
  const table = completeFeeTable();
  const estimate = purchaseFeeEstimate(table, { priceEur: 120000, municipality: "Sandanski", buyerScope: "eu", now: NOW });
  assert.equal(estimate.available, true);
  assert.deepEqual(estimate.resolved_lines, requiredPurchaseFeeLines("eu"));
  // 2.5% transfer tax + notary (1000 + 0.1% of 20000) + 0.1% registry + 3% agency.
  assert.equal(estimate.lines.find((line) => line.line_key === "local_transfer_tax").amount_eur, 3000);
  assert.equal(estimate.lines.find((line) => line.line_key === "notary_fee").amount_eur, 1020);
  assert.equal(estimate.total_eur, 3000 + 1020 + 120 + 3600);
  assert.equal(estimate.total_including_price_eur, 120000 + estimate.total_eur);

  // The non-EU route needs the company line, and says so when it is absent.
  const nonEu = purchaseFeeEstimate(completeFeeTable({ drop: ["company_route_setup"] }), {
    priceEur: 120000,
    municipality: "Sandanski",
    buyerScope: "non_eu",
    now: NOW,
  });
  assert.equal(nonEu.available, false);
  assert.equal(nonEu.total_eur, null);
  assert.deepEqual(nonEu.missing, [
    { line_key: "company_route_setup", municipality: null, reason: "no_approved_record" },
  ]);

  // A line whose approval is older than the record allows is refused, not used.
  const expired = completeFeeTable({ drop: ["agency_fee"] });
  expired.lines.push(approvedLine({ approved_at: "2024-01-01T00:00:00Z", max_approval_age_days: 30 }));
  const expiredEstimate = purchaseFeeEstimate(expired, { priceEur: 120000, municipality: "Sandanski", buyerScope: "eu", now: NOW });
  assert.equal(expiredEstimate.available, false);
  assert.deepEqual(expiredEstimate.missing, [{ line_key: "agency_fee", municipality: null, reason: "approval_expired" }]);

  // A line edited after approval is refused too.
  const changed = completeFeeTable({ drop: ["registry_entry_fee"] });
  changed.lines.push({ ...approvedLine({ line_key: "registry_entry_fee", percent: 0.1, label: "Registry entry" }), percent: 9 });
  const changedEstimate = purchaseFeeEstimate(changed, { priceEur: 120000, municipality: "Sandanski", buyerScope: "eu", now: NOW });
  assert.equal(changedEstimate.available, false);
  assert.deepEqual(changedEstimate.missing, [
    { line_key: "registry_entry_fee", municipality: null, reason: "changed_since_approval" },
  ]);

  assert.throws(() => purchaseFeeEstimate(table, { priceEur: 0, buyerScope: "eu" }), /priceEur must be a positive number/);
  assert.throws(() => purchaseFeeEstimate(table, { priceEur: 100, buyerScope: "uk" }), /buyerScope must be one of/);
});

test("a municipality-specific fee line beats the default rate, and a scale respects its bounds", () => {
  const table = completeFeeTable();
  table.lines.push(approvedLine({ line_key: "local_transfer_tax", percent: 3, label: "Transfer tax (default)" }));
  const sandanski = purchaseFeeEstimate(table, { priceEur: 100000, municipality: "Sandanski", buyerScope: "eu", now: NOW });
  const elsewhere = purchaseFeeEstimate(table, { priceEur: 100000, municipality: "Bansko", buyerScope: "eu", now: NOW });
  assert.equal(sandanski.lines.find((line) => line.line_key === "local_transfer_tax").amount_eur, 2500);
  assert.equal(elsewhere.lines.find((line) => line.line_key === "local_transfer_tax").amount_eur, 3000);

  const bounded = approvedLine({ basis: "percent_of_price", percent: 3, minimum_eur: 1000, maximum_eur: 2000 });
  assert.equal(purchaseFeeAmount(bounded, 10000), 1000);
  assert.equal(purchaseFeeAmount(bounded, 1000000), 2000);
  assert.throws(
    () => normalizePurchaseFeeLine({ ...bounded, source_hash: undefined, line_key: "notary_fee", municipality: "Sandanski" }),
    /may not be scoped to a municipality/,
  );
  assert.throws(
    () => normalizePurchaseFeeLine({ ...bounded, source_hash: undefined, line_key: "company_route_setup", applies_to: ["eu"] }),
    /buyer scope this line never applies to/,
  );
});

test("the public payload builders expose approved content and mark every absence", () => {
  const areas = readApprovedAreaGuides();
  const present = areaGuidePayload({ localeCode: "bg", location: "Hotovo", document: areas, now: NOW });
  assert.equal(present.available, true);
  assert.equal(present.sections[0].id, "what_it_is");
  assert.equal(present.sections[0].statements[0].source.publisher, "Община Сандански");

  const absent = areaGuidePayload({ localeCode: "bg", location: "Sandanski", document: areas, now: NOW });
  assert.equal(absent.available, false);
  assert.equal(typeof absent.notice, "string");

  const team = teamProfilesPayload({ localeCode: "en", document: { profiles: [approvedProfile()] }, now: NOW });
  assert.equal(team.available, true, "the bg source profile is used for a locale with no approved translation");
  assert.equal(team.profiles[0].name, "Maria");
  const noTeam = teamProfilesPayload({ localeCode: "en", document: { profiles: [approvedProfile({ example_record: true })] }, now: NOW });
  assert.equal(noTeam.available, false);
  assert.equal(noTeam.reason, "example_record");

  const financing = financingPartnersPayload({
    localeCode: "bg",
    buyerScope: "non_eu",
    document: { partners: [approvedPartner(), approvedPartner({ id: "eu-only", partner_key: "eu-only", serves: "eu" })] },
    now: NOW,
  });
  assert.equal(financing.available, true);
  assert.deepEqual(financing.partners.map((partner) => partner.partner_key), ["partner"]);

  const fees = purchaseFeePayload({
    localeCode: "bg",
    priceEur: 120000,
    municipality: "Sandanski",
    document: completeFeeTable(),
    now: NOW,
  });
  assert.equal(fees.available, true);
  assert.equal(fees.estimate.total_eur, 7740);
  assert.equal(fees.endpoint, "/api/purchase-fees/estimate");

  const blocked = purchaseFeePayload({ localeCode: "bg", priceEur: 120000, municipality: "Sandanski", now: NOW });
  assert.equal(blocked.available, false, "the shipped fee table is example content, so no total is offered");
  assert.equal(blocked.missing.length > 0, true);
  assert.equal(typeof blocked.notice, "string");
});
