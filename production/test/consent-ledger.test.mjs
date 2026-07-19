import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendConsentRecord,
  assertConsentLedger,
  createConsentRecord,
  createConsentWithdrawal,
  latestConsentStates,
  readConsentLedger,
  resetConsentLedger,
} from "../lib/consent-ledger.mjs";

function tempConsentLedger() {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-consent-test-`)}/consent.jsonl`;
  resetConsentLedger(file);
  return file;
}

test("consent ledger stores privacy-safe fingerprints instead of raw contact fields", () => {
  const filePath = tempConsentLedger();
  const emailConsent = appendConsentRecord(
    createConsentRecord(
      {
        consentType: "inquiry_follow_up",
        source: "website_listing_detail",
        subjectId: "lead-0001",
        locale: "he",
        contact: { email: " Buyer@Example.Test ", phone: "+359 88 000 0000" },
      },
      "2026-07-06T00:00:00Z",
    ),
    { filePath },
  );
  const phoneConsent = appendConsentRecord(
    createConsentRecord(
      {
        consentType: "saved_search_alerts",
        source: "website_saved_search",
        subjectId: "saved-search-0001",
        locale: "el",
        contact: { whatsapp: "+359 88 000 0000" },
        legalBasis: "consent",
        marketingOptIn: true,
      },
      "2026-07-06T00:01:00Z",
    ),
    { filePath },
  );

  const rows = readConsentLedger(filePath);
  assert.equal(assertConsentLedger(rows), true);
  assert.equal(rows.length, 2);
  assert.equal(emailConsent.contact_fingerprint.length, 64);
  assert.equal(phoneConsent.contact_fingerprint.length, 64);
  assert.notEqual(emailConsent.contact_fingerprint, phoneConsent.contact_fingerprint);
  assert.equal(rows[0].marketing_opt_in, false);
  assert.equal(rows[1].marketing_opt_in, true);
  assert.equal(rows[1].legal_basis, "consent");
  assert.equal(JSON.stringify(rows).includes("Buyer@Example.Test"), false);
  assert.equal(JSON.stringify(rows).includes("+359"), false);
});

test("consent workspace state is current, privacy-safe, and withdrawal-only", () => {
  const original = createConsentRecord(
    {
      consentType: "saved_search_alerts",
      source: "website_saved_search",
      subjectId: "saved-search-0001",
      locale: "en",
      contact: { email: "buyer@example.test" },
      legalBasis: "consent",
    },
    "2026-07-06T00:00:00Z",
  );
  const withdrawal = createConsentWithdrawal(
    {
      consentType: "saved_search_alerts",
      subjectId: "saved-search-0001",
      actor: "broker_en",
      reasonCode: "customer_request",
      humanConfirmed: true,
    },
    [original],
    "2026-07-06T01:00:00Z",
  );
  assert.equal(withdrawal.idempotent, false);
  assert.equal(withdrawal.record.granted, false);
  assert.equal(withdrawal.record.marketing_opt_in, false);
  assert.equal(withdrawal.record.actor, "broker_en");
  assert.equal(withdrawal.record.contact_fingerprint, original.contact_fingerprint);
  const states = latestConsentStates([original, withdrawal.record]);
  assert.equal(states.length, 1);
  assert.equal(states[0].granted, false);
  assert.match(states[0].contact_reference, /^fp:[a-f0-9]{12}$/);
  assert.equal(JSON.stringify(states).includes(original.contact_fingerprint), false);
  assert.equal(createConsentWithdrawal({ consentType: "saved_search_alerts", subjectId: "saved-search-0001", actor: "broker_en", humanConfirmed: true }, [original, withdrawal.record]).idempotent, true);
  assert.throws(
    () => createConsentWithdrawal({ consentType: "saved_search_alerts", subjectId: "unknown", actor: "broker_en", humanConfirmed: true }, [original]),
    /not found/,
  );
});

test("consent ledger rejects unknown consent types and raw private fields", () => {
  assert.throws(
    () => createConsentRecord({ consentType: "newsletter", source: "website" }),
    /Unknown consent type/,
  );
  assert.throws(
    () => createConsentRecord({ consentType: "language_request", source: "" }),
    /Consent source is required/,
  );
  assert.throws(
    () =>
      assertConsentLedger([
        {
          recorded_at: "2026-07-06T00:00:00Z",
          consent_type: "language_request",
          source: "website_language_request",
          locale: "fr",
          legal_basis: "legitimate_interest",
          email: "buyer@example.test",
          whatsapp: "+359880000000",
        },
      ]),
    /must not store raw contact/,
  );
});
