import { describe, expect, it } from "vitest";
import {
  agency,
  agencyTimeZone,
  appointmentsConfiguredIn,
  assistantLabel,
  availabilityReviewIntervalDays,
  brokerageWithdrawalDays,
  currencyCodes,
  customerDueDiligenceScope,
  type DealPathStepTemplate,
  dealPathActors,
  dealPathTemplates,
  dealPolicy,
  defaultCurrency,
  defaultStaffLocale,
  displayLocales,
  genericDealPath,
  imageAdmissionRules,
  isJurisdictionCode,
  isRtlLocale,
  jurisdictionCodes,
  jurisdictionProfiles,
  jurisdictionTimeZone,
  jurisdictionTimeZones,
  legacyCurrency,
  legacyDomains,
  mediaPolicy,
  legacyTitleSuffixes,
  privatePageRecheckAfterMs,
  publicationPolicy,
  publicLocales,
  referencePrefixes,
  rtlLocales,
  scanFirstMediaPolicy,
  serviceNotificationEnabled,
  serviceNotificationEvents,
  serviceNotifications,
  sourceLocale,
  staffLocales,
  strictDealPolicy,
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

  it("keeps the shipped Deal path templates (ADR 0013, ADR 0015)", () => {
    // `case_path_steps_actor` CHECKs this list; recorded steps keep their template's keys.
    expect(dealPathActors).toEqual(["client", "agency", "owner", "notary", "lawyer"]);
    // key:actor[:evidence][:duty][:after_identity]
    const shape = (steps: readonly DealPathStepTemplate[] = []) =>
      steps.map((step) =>
        [
          step.key,
          step.actor,
          ...(step.evidence ? ["evidence"] : []),
          ...(step.duty ? [step.duty] : []),
          ...(step.afterIdentityChecks ? ["after_identity"] : []),
        ].join(":"),
      );
    const duties = [
      "brokerage_agreement:agency:evidence:brokerage_contract",
      "identity_checks:agency:evidence:customer_due_diligence",
    ];
    expect(Object.keys(dealPathTemplates)).toEqual(["BG.sale", "BG.long_term_rent", "GR.sale"]);
    expect(shape(dealPathTemplates["BG.sale"])).toEqual([
      ...duties,
      "deposit_preliminary_contract:client:evidence:after_identity",
      "property_checks:agency:evidence",
      "funds_ready:client",
      "notary_deed:notary:evidence:after_identity",
      "registration:notary:evidence:after_identity",
      "keys_handed_over:owner:after_identity",
    ]);
    expect(shape(dealPathTemplates["BG.long_term_rent"])).toEqual([
      ...duties,
      "lease_signed:client:evidence:after_identity",
      "deposit_first_rent:client:after_identity",
      "keys_handed_over:owner:after_identity",
    ]);
    expect(shape(dealPathTemplates["GR.sale"])).toEqual([
      ...duties,
      "tax_number:client:evidence",
      "lawyer_property_checks:lawyer:evidence",
      "deposit_preliminary_contract:client:evidence:after_identity",
      "notary_deed:notary:evidence:after_identity",
      "registration:lawyer:evidence:after_identity",
      "keys_handed_over:owner:after_identity",
    ]);
    expect(shape(genericDealPath.sale)).toEqual([
      ...duties,
      "contract_signed:client:evidence:after_identity",
      "keys_handed_over:owner:after_identity",
    ]);
    expect(shape(genericDealPath.long_term_rent)).toEqual([
      ...duties,
      "lease_signed:client:evidence:after_identity",
      "keys_handed_over:owner:after_identity",
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

  it("keeps the duty scope the ADRs name (ADR 0008 §1, ADR 0009 §4)", () => {
    expect(customerDueDiligenceScope).toEqual({
      sale: true,
      monthlyRentFrom: { amountMinor: 1_000_000, currency: "EUR" },
    });
    expect(brokerageWithdrawalDays).toBe(14);
  });

  it("pins this brand's deal policy and keeps the strict one available (ADR 0015)", () => {
    expect(dealPolicy).toEqual({
      agreementBasis: "staff_attestation",
      counterpartyAccountRequired: false,
      shortlistNeedsStructuredBrief: false,
      proposalsNeedPublishedListing: false,
    });
    expect(strictDealPolicy).toEqual({
      agreementBasis: "reviewed_process",
      counterpartyAccountRequired: true,
      shortlistNeedsStructuredBrief: true,
      proposalsNeedPublishedListing: true,
    });
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
      publisherApprovesLanguages: true,
    });
    expect(strictPublicationPolicy).toEqual({
      sellerEvidence: "reviewed_documents",
      independentReview: true,
      photosRequired: true,
      signIn: "recent",
      attestationOutlivesAuthor: false,
      publisherApprovesLanguages: false,
    });
  });

  it("sends every service notification for this brand", () => {
    expect(serviceNotifications.enabled).toBe(true);
    expect(serviceNotificationEvents).toEqual([
      "viewing.proposed",
      "viewing.confirmed",
      "viewing.moved",
      "viewing.cancelled",
      "proposal.ready",
      "proposal.withdrawn",
      "proposal.expired",
      "proposal.agreed",
      "document.requested",
      "message.from_broker",
      "deal.step_done",
      "deal.completed",
      "client.viewing_confirmed",
      "client.viewing_cancelled",
      "client.viewing_new_time",
      "client.proposal_accepted",
      "client.proposal_declined",
      "client.proposal_countered",
      "client.document_uploaded",
      "client.message",
      "inquiry.acknowledged",
    ]);
    expect(Object.keys(serviceNotifications.events).sort()).toEqual(
      [...serviceNotificationEvents].sort(),
    );
    for (const event of serviceNotificationEvents) {
      expect(serviceNotifications.events[event]).toBe(true);
      expect(serviceNotificationEnabled(event)).toBe(true);
    }
  });

  it("admits this brand's images by re-encoding them, and keeps the scanner-first rule", () => {
    expect(imageAdmissionRules).toEqual(["reencode", "virus_scan"]);
    expect(mediaPolicy).toEqual({ imageAdmission: "reencode" });
    expect(scanFirstMediaPolicy).toEqual({ imageAdmission: "virus_scan" });
  });

  it("names the old site's title endings for every public locale and the private-page threshold", () => {
    for (const locale of publicLocales)
      expect(legacyTitleSuffixes[locale]?.length).toBeGreaterThan(0);
    expect(privatePageRecheckAfterMs).toBe(15 * 60_000);
  });
});
