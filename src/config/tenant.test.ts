import { describe, expect, it } from "vitest";
import {
  agency,
  agencyTimeZone,
  appointmentsConfiguredIn,
  assistantLabel,
  availabilityReviewIntervalDays,
  currencyCodes,
  dealPathActors,
  dealPathTemplates,
  defaultCurrency,
  defaultStaffLocale,
  displayLocales,
  genericDealPath,
  isJurisdictionCode,
  isRtlLocale,
  jurisdictionCodes,
  jurisdictionProfiles,
  jurisdictionTimeZone,
  jurisdictionTimeZones,
  legacyCurrency,
  legacyDomains,
  publicationPolicy,
  publicLocales,
  referencePrefixes,
  rtlLocales,
  sourceLocale,
  staffLocales,
  strictPublicationPolicy,
} from "./tenant";

// The profile holds the values the agency shipped with. Each pin below is also a database
// enum, CHECK constraint, hashed snapshot or recorded reference format; a change here without
// the matching migration would break the live data, so the test says so before CI does.
describe("tenant profile", () => {
  it("keeps the shipped jurisdictions, with one time zone each", () => {
    expect(jurisdictionCodes).toEqual(["BG", "GR"]);
    expect(jurisdictionTimeZones).toEqual(["Europe/Sofia", "Europe/Athens"]);
    for (const code of jurisdictionCodes) {
      expect(jurisdictionTimeZones).toContain(jurisdictionTimeZone(code));
      expect(jurisdictionProfiles[code].nativeName.length).toBeGreaterThan(0);
    }
    expect(isJurisdictionCode("BG")).toBe(true);
    expect(isJurisdictionCode("bg")).toBe(false);
    expect(isJurisdictionCode("DE")).toBe(false);
  });

  it("schedules appointments only where the profile says so", () => {
    expect(appointmentsConfiguredIn("BG")).toBe(true);
    expect(appointmentsConfiguredIn("GR")).toBe(false);
    expect(appointmentsConfiguredIn("")).toBe(false);
    expect(appointmentsConfiguredIn("XX")).toBe(false);
  });

  it("formats in the agency's zone, which is one of its jurisdictions' zones", () => {
    expect(agencyTimeZone).toBe("Europe/Sofia");
    expect(jurisdictionTimeZones).toContain(agencyTimeZone);
    expect(() => new Intl.DateTimeFormat("en", { timeZone: agencyTimeZone })).not.toThrow();
  });

  it("keeps the locale registry the database enums were generated from", () => {
    expect(publicLocales).toEqual(["bg", "en", "ru", "de", "nl", "el", "he"]);
    expect(staffLocales).toEqual(["bg", "ru", "en"]);
    expect(sourceLocale).toBe("bg");
    expect(defaultStaffLocale).toBe("bg");
    expect(publicLocales).toContain(sourceLocale);
    for (const locale of staffLocales) expect(publicLocales).toContain(locale);
    for (const locale of rtlLocales) expect(publicLocales).toContain(locale);
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("bg")).toBe(false);
    expect(Object.keys(displayLocales).sort()).toEqual([...publicLocales].sort());
    for (const tag of Object.values(displayLocales)) {
      expect(new Intl.Locale(tag).region).toBeTruthy();
    }
  });

  it("keeps the currency enum, the default and the fixed legacy rate", () => {
    expect(currencyCodes).toEqual(["EUR", "BGN", "USD", "GBP"]);
    expect(defaultCurrency).toBe("EUR");
    expect(currencyCodes).toContain(defaultCurrency);
    expect(currencyCodes).toContain(legacyCurrency.code);
    expect(legacyCurrency.code).not.toBe(defaultCurrency);
    expect(Number(legacyCurrency.perDefaultUnit.numerator)).toBe(195_583);
    expect(Number(legacyCurrency.perDefaultUnit.denominator)).toBe(100_000);
  });

  it("keeps the operating defaults the policy schema bounds derive from", () => {
    expect(availabilityReviewIntervalDays).toEqual({ sale: 14, long_term_rent: 7 });
  });

  it("keeps the reference prefixes unique and the legacy listing format", () => {
    const prefixes = Object.values(referencePrefixes);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) expect(prefix).toMatch(/^[A-Z]{2}$/);
    expect(referencePrefixes.listing).toBe("MS");
  });

  it("keeps the shipped Deal path templates (ADR 0013)", () => {
    // `case_path_steps_actor` CHECKs this list; recorded steps keep their template's keys.
    expect(dealPathActors).toEqual(["client", "agency", "owner", "notary", "lawyer"]);
    const shape = (steps: readonly { key: string; actor: string; evidence: boolean }[] = []) =>
      steps.map((step) => `${step.key}:${step.actor}${step.evidence ? ":evidence" : ""}`);
    expect(Object.keys(dealPathTemplates)).toEqual(["BG.sale", "BG.long_term_rent", "GR.sale"]);
    expect(shape(dealPathTemplates["BG.sale"])).toEqual([
      "identity_checks:agency:evidence",
      "deposit_preliminary_contract:client:evidence",
      "property_checks:agency:evidence",
      "funds_ready:client",
      "notary_deed:notary:evidence",
      "registration:notary:evidence",
      "keys_handed_over:owner",
    ]);
    expect(shape(dealPathTemplates["BG.long_term_rent"])).toEqual([
      "identity_checks:agency:evidence",
      "lease_signed:client:evidence",
      "deposit_first_rent:client",
      "keys_handed_over:owner",
    ]);
    expect(shape(dealPathTemplates["GR.sale"])).toEqual([
      "identity_checks:agency:evidence",
      "tax_number:client:evidence",
      "lawyer_property_checks:lawyer:evidence",
      "deposit_preliminary_contract:client:evidence",
      "notary_deed:notary:evidence",
      "registration:lawyer:evidence",
      "keys_handed_over:owner",
    ]);
    expect(shape(genericDealPath.sale)).toEqual([
      "identity_checks:agency:evidence",
      "contract_signed:client:evidence",
      "keys_handed_over:owner",
    ]);
    expect(shape(genericDealPath.long_term_rent)).toEqual([
      "identity_checks:agency:evidence",
      "lease_signed:client:evidence",
      "keys_handed_over:owner",
    ]);
    for (const steps of [...Object.values(dealPathTemplates), ...Object.values(genericDealPath)]) {
      const keys = (steps ?? []).map((step) => step.key);
      expect(new Set(keys).size).toBe(keys.length);
      // The last step is what completes a Deal: keys in hand.
      expect(keys.at(-1)).toBe("keys_handed_over");
      for (const step of steps ?? []) {
        expect(step.key).toMatch(/^[a-z][a-z0-9_]{1,60}$/);
        expect(step.clientVisible).toBe(true);
      }
    }
  });

  it("keeps the recorded legacy domains and the public identity", () => {
    expect(legacyDomains).toEqual(["makler-realty.com", "makler-realty.ru"]);
    expect(agency.name).toBe("MS Realty");
    expect(agency.logoPath).toMatch(/^\/brand\/.+\.png$/);
    expect(agency.phone.e164).toBe("+359879696870");
    expect(agency.phone.display.replaceAll(" ", "")).toBe(agency.phone.e164);
    expect(assistantLabel).toBe("MS Realty Butler");
  });

  it("publishes by one recorded staff decision, with the strict path still defined", () => {
    expect(publicationPolicy).toEqual({
      sellerEvidence: "staff_attestation",
      independentReview: false,
      photosRequired: false,
      signIn: "active_session",
      attestationOutlivesAuthor: true,
    });
    expect(strictPublicationPolicy).toEqual({
      sellerEvidence: "reviewed_documents",
      independentReview: true,
      photosRequired: true,
      signIn: "recent",
      attestationOutlivesAuthor: false,
    });
  });
});
