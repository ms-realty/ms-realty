import { fromRoot } from "./paths.mjs";
import { createLedgerStore } from "./sqlite-ledger.mjs";

export const DEFAULT_REALTY_CASE_LEDGER_PATH = fromRoot("production", "data", "realty-case-events.jsonl");
export const REALTY_WORKFLOW_VERSION = "2026-07-30.bg-gr-v1";
export const REALTY_EXECUTION_MODES = Object.freeze(["manual", "autonomous"]);
export const REALTY_CASE_TYPES = Object.freeze([
  "buyer_purchase",
  "seller_sale",
  "tenant_rental",
  "landlord_rental",
  "short_term_rental",
  "property_management",
]);

const store = createLedgerStore({
  name: "realty_case_events",
  columns: ["id", "case_id", "action", "step_key", "actor", "executor_kind", "recorded_at"],
  indexes: ["case_id", "action", "recorded_at"],
});

const PHASES = Object.freeze([
  "intake",
  "onboarding",
  "evidence",
  "commercial",
  "market",
  "agreement",
  "completion",
  "aftercare",
]);
const EXECUTOR_KINDS = new Set(["human", "agent"]);
const ACTIONS = new Set([
  "case_opened",
  "step_completed",
  "step_not_applicable",
  "step_blocked",
  "step_reopened",
  "mode_changed",
  "case_frozen",
  "case_resumed",
  "case_closed",
  "case_cancelled",
]);
const RESOLVED_STEP_STATUSES = new Set(["completed", "not_applicable"]);
const ASSET_KINDS = new Set(["residential", "commercial", "land", "new_build", "mixed_use"]);
const JURISDICTIONS = new Set(["BG", "GR"]);
const EVIDENCE_PRODUCERS = new Set([
  "agency",
  "agent",
  "bank",
  "client",
  "counterparty",
  "engineer",
  "insurer",
  "lawyer",
  "notary",
  "property_manager",
  "registry",
  "system",
  "tax_authority",
  "vendor",
]);
const PRIVATE_KEYS = new Set([
  "address",
  "body",
  "contact",
  "email",
  "full_name",
  "message",
  "name",
  "passport",
  "phone",
  "prompt",
  "tax_number",
]);

function step(key, phase, label, evidenceProducers = ["agency", "agent"], optional = false) {
  return Object.freeze({
    key,
    phase,
    label,
    optional,
    evidence_producers: Object.freeze(evidenceProducers),
  });
}

const internal = (key, phase, label, optional = false) =>
  step(key, phase, label, ["agency", "agent", "system"], optional);
const client = (key, phase, label, optional = false) =>
  step(key, phase, label, ["client", "counterparty", "agency", "agent"], optional);
const legal = (key, phase, label, optional = false) =>
  step(key, phase, label, ["lawyer", "notary", "registry"], optional);
const technical = (key, phase, label, optional = false) =>
  step(key, phase, label, ["engineer", "registry", "vendor"], optional);
const money = (key, phase, label, optional = false) =>
  step(key, phase, label, ["bank", "notary", "tax_authority"], optional);

export const REALTY_RULE_SOURCES = Object.freeze({
  bg_cadastre: Object.freeze({
    authority: "Geodesy, Cartography and Cadastre Agency",
    url: "https://www.cadastre.bg/faq/za-kakvo-sluzhi-skicata-shemata-na-nedvizhim-imot-ot-kadastralnata-karta",
    checked_on: "2026-07-30",
  }),
  bg_property_register: Object.freeze({
    authority: "Registry Agency",
    url: "https://www.registryagency.bg/bg/registri/imoten-registar/",
    checked_on: "2026-07-30",
  }),
  bg_property_transfer: Object.freeze({
    authority: "Ministry of Justice",
    url: "https://justice.government.bg/home/index/57b4f1d6-c88a-4d45-8114-6a0ecd87fb4f",
    checked_on: "2026-07-30",
  }),
  bg_property_tax: Object.freeze({
    authority: "Ministry of Finance",
    url: "https://www.minfin.bg/bg/778",
    checked_on: "2026-07-30",
  }),
  bg_transfer_tax: Object.freeze({
    authority: "Ministry of Finance",
    url: "https://www.minfin.bg/bg/784",
    checked_on: "2026-07-30",
  }),
  bg_sale_income_tax: Object.freeze({
    authority: "Ministry of Finance",
    url: "https://www.minfin.bg/bg/827",
    checked_on: "2026-07-30",
  }),
  bg_foreign_ownership: Object.freeze({
    authority: "Bulgarian eGovernment",
    url: "https://www.identity.egov.bg/wps/portal/egov/vashata%20evropa/prebivavane%20v%20druga%20darzhava%20chlenka/kupuvane%20i%20prodazhba%20na%20nedvizhimo%20imushtestvo/",
    checked_on: "2026-07-30",
  }),
  bg_energy_certificate: Object.freeze({
    authority: "Sustainable Energy Development Agency",
    url: "https://www.seea.government.bg/bg/dokumenti/neobhodimi-dokumenti-sgradi",
    checked_on: "2026-07-30",
  }),
  bg_tourism_registration: Object.freeze({
    authority: "Ministry of Tourism",
    url: "https://www.tourism.government.bg/bg/kategorii/uslugi-v-turizma/kategorizirane-na-mesta-za-nastanyavane",
    checked_on: "2026-07-30",
  }),
  bg_esti: Object.freeze({
    authority: "Ministry of Tourism",
    url: "https://www.tourism.government.bg/bg/kategorii/edinnata-sistema-za-turisticheska-informaciya",
    checked_on: "2026-07-30",
  }),
  bg_str_tax: Object.freeze({
    authority: "National Revenue Agency",
    url: "https://nra.bg/wps/portal/nra/taxes/godishen-danak-varhu-dohdite/kratkosrochno.otdavane.pod.naem.online.platform/kratkosrochno.otdavane.naem.online.platform/",
    checked_on: "2026-07-30",
  }),
  gr_tax_identity: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://aade.gr/omogeneis-katoikoi-exoterikoy/eggrafi-sto-forologiko-mitroo/apodosi-afm-kleidarithmoy-kai-orismos-forologikoy-ekprosopoy",
    checked_on: "2026-07-30",
  }),
  gr_transfer_tax: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://www.aade.gr/exypiretisi-enimerosi/hristikoi-odigoi/agora-akinitoy/prin-tin-agora-akinitoy",
    checked_on: "2026-07-30",
  }),
  gr_myproperty: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://www.aade.gr/dilosi-foroy-metabibasis-akiniton-doreas-gonikis-parohis-kai-klironomias",
    checked_on: "2026-07-30",
  }),
  gr_digital_transfer: Object.freeze({
    authority: "Hellenic Government",
    url: "https://www.gov.gr/upourgeia/upourgeio-psephiakes-diakuberneses/elleniko-ktematologio-ae/metavivasi",
    checked_on: "2026-07-30",
  }),
  gr_cadastre: Object.freeze({
    authority: "Hellenic Cadastre",
    url: "https://www.ktimatologio.gr/pliroforiako-yliko/ktimatografisi/9",
    checked_on: "2026-07-30",
  }),
  gr_building_identity: Object.freeze({
    authority: "Hellenic Ministry of Environment and Energy",
    url: "https://ypen.gov.gr/ilektroniki-taftotita-ktiriou-ypochreotiki-apo-01-02-2021/",
    checked_on: "2026-07-30",
  }),
  gr_property_tax: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://aade.gr/en/greeks-abroad-non-residents/property-taxation/unified-tax-ownership-real-estate-e9-enfia",
    checked_on: "2026-07-30",
  }),
  gr_lease_declaration: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://www.aade.gr/diloseis-misthosis-akiniton",
    checked_on: "2026-07-30",
  }),
  gr_lease_acceptance: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://www.aade.gr/egkyklioi-kai-apofaseis/1068-28-05-2025",
    checked_on: "2026-07-30",
  }),
  gr_str_registry: Object.freeze({
    authority: "Independent Authority for Public Revenue",
    url: "https://aade.gr/brahyhronia-misthosi-akiniton",
    checked_on: "2026-07-30",
  }),
  gr_str_safety: Object.freeze({
    authority: "Hellenic Ministry of Tourism",
    url: "https://mintour.gov.gr/wp-content/uploads/2025/09/%CE%A86%CE%9B%CE%98465%CE%A7%CE%98%CE%9F-%CE%93%CE%9F7.pdf",
    checked_on: "2026-07-30",
  }),
  gr_str_2026_restrictions: Object.freeze({
    authority: "Hellenic Republic",
    url: "https://www.aade.gr/sites/default/files/2026-07/apospasma-FEK%20%CE%91%20102%20%CE%9D%205313_2026.pdf",
    checked_on: "2026-07-30",
  }),
  gr_border_area: Object.freeze({
    authority: "Decentralized Administration of the Aegean",
    url: "https://www.apdaigaiou.gov.gr/arsi-apagorefsis-dikaiopraxion/",
    checked_on: "2026-07-30",
  }),
});

function regulated(caseTypes, workflowStep, ruleRefs, assetKinds = null) {
  return Object.freeze({
    ...workflowStep,
    applies_to_case_types: Object.freeze(caseTypes),
    applies_to_asset_kinds: assetKinds ? Object.freeze(assetKinds) : null,
    rule_refs: Object.freeze(ruleRefs),
  });
}

export const REALTY_WORKFLOWS = Object.freeze({
  buyer_purchase: Object.freeze([
    internal("lead_intake", "intake", "Buyer inquiry captured and routed"),
    client("requirements_brief", "intake", "Budget, location, timing, asset, and use requirements recorded"),
    client("identity_verified", "onboarding", "Client identity and representation verified"),
    client("privacy_consent", "onboarding", "Privacy, channel, and marketing preferences recorded"),
    internal("aml_screening", "onboarding", "AML, sanctions, PEP, and risk screening completed"),
    step("source_of_funds", "onboarding", "Source of funds and payment capacity evidenced", ["client", "bank"]),
    client("buyer_mandate", "onboarding", "Buyer representation and negotiation authority recorded"),
    legal("foreign_buyer_structure", "onboarding", "Foreign-buyer ownership structure confirmed", true),
    step("financing_preapproval", "onboarding", "Financing route and lender preapproval confirmed", ["bank"], true),
    internal("property_shortlist", "evidence", "Candidate properties matched against approved requirements"),
    internal("property_evidence_pack", "evidence", "Property facts, provenance, availability, and disclosures assembled"),
    legal("title_encumbrance_review", "evidence", "Title, ownership, liens, claims, and authority reviewed"),
    technical("cadastral_planning_review", "evidence", "Cadastre, planning, permits, boundaries, and lawful use reviewed"),
    technical("technical_inspection", "evidence", "Independent condition and defect inspection completed", true),
    step("tax_cost_review", "evidence", "Taxes, fees, recurring costs, and buyer-specific treatment reviewed", ["lawyer", "tax_authority", "agency"]),
    client("viewing_completed", "market", "Physical or remote viewing completed"),
    internal("valuation_review", "commercial", "Comparable evidence and price position reviewed"),
    client("offer_authority", "commercial", "Client offer ceiling, terms, and negotiation mandate recorded"),
    step("offer_submitted", "commercial", "Attributed offer or reservation proposal delivered", ["agency", "agent", "counterparty"]),
    client("negotiation_resolved", "commercial", "Price, inclusions, timing, and material terms agreed"),
    legal("reservation_or_preliminary_contract", "agreement", "Reservation or preliminary agreement completed", true),
    legal("legal_due_diligence", "agreement", "Independent legal due diligence completed"),
    step("conditions_satisfied", "agreement", "All finance, title, technical, tax, and contractual conditions satisfied", ["agency", "agent", "lawyer", "bank"]),
    legal("final_contract_ready", "agreement", "Final transfer or sale contract certified ready"),
    money("funds_destination_verified", "agreement", "Payment destination and anti-fraud verification completed"),
    client("signing_authority", "agreement", "Signing attendance or valid power of attorney confirmed"),
    step("final_contract_signed", "completion", "Final contract signed by the parties", ["client", "counterparty", "notary"]),
    money("taxes_fees_paid", "completion", "Required taxes, fees, and closing costs paid"),
    legal("registry_filing", "completion", "Transfer filed or registered by the competent authority"),
    money("settlement_confirmed", "completion", "Purchase funds and settlement confirmed"),
    client("handover_inventory", "aftercare", "Possession, inventory, readings, defects, and retained items recorded"),
    client("keys_possession", "aftercare", "Keys and lawful possession transferred"),
    step("utilities_insurance", "aftercare", "Utilities, insurance, and local administration completed", ["agency", "agent", "insurer", "vendor"], true),
    internal("aftercare_complete", "aftercare", "Buyer aftercare and case reconciliation completed"),
  ]),
  seller_sale: Object.freeze([
    internal("lead_intake", "intake", "Seller or owner inquiry captured and routed"),
    client("sale_objective", "intake", "Timing, occupancy, price expectations, and constraints recorded"),
    client("identity_verified", "onboarding", "Owner identity and representation verified"),
    legal("ownership_authority", "onboarding", "Ownership, co-owner, company, inheritance, and power-of-attorney authority verified"),
    client("privacy_consent", "onboarding", "Privacy and communication preferences recorded"),
    internal("aml_screening", "onboarding", "AML, sanctions, PEP, and risk screening completed"),
    client("agency_mandate", "onboarding", "Listing, marketing, negotiation, fee, and representation mandate signed"),
    internal("property_evidence_pack", "evidence", "Property identity, facts, documents, provenance, and disclosures assembled"),
    legal("title_encumbrance_review", "evidence", "Title, liens, claims, and disposal restrictions reviewed"),
    technical("cadastral_planning_review", "evidence", "Cadastre, permits, boundaries, use, and planning status reviewed"),
    technical("technical_condition_review", "evidence", "Condition, defects, systems, and material disclosures recorded"),
    step("tax_cost_review", "evidence", "Seller taxes, fees, discharge costs, and net proceeds reviewed", ["lawyer", "tax_authority", "agency"]),
    internal("valuation_pricing", "commercial", "Comparable evidence, pricing strategy, and review cadence approved"),
    internal("listing_facts_verified", "commercial", "Price, area, rooms, land, status, location, and inclusions verified"),
    internal("media_floorplan_prepared", "commercial", "Photos, floor plans, video, tour, captions, and privacy controls prepared"),
    internal("translations_seo_approved", "commercial", "Required translations and public metadata approved"),
    client("publication_authority", "commercial", "Owner approved the exact listing and publication scope"),
    internal("listing_published", "market", "Listing published to approved channels with stable provenance"),
    internal("inquiry_viewing_management", "market", "Inquiries, access, keys, viewings, feedback, and security managed"),
    client("offer_received", "market", "Attributed offer with amount, terms, expiry, and buyer evidence recorded"),
    client("negotiation_resolved", "market", "Seller decision and negotiated commercial terms recorded"),
    step("buyer_qualification", "agreement", "Buyer identity, funds, financing, and conditions evidenced", ["client", "counterparty", "bank", "agency", "agent"]),
    legal("legal_due_diligence_support", "agreement", "Seller documents and responses supplied for legal due diligence"),
    legal("reservation_or_preliminary_contract", "agreement", "Reservation or preliminary agreement completed", true),
    step("conditions_satisfied", "agreement", "All sale conditions, discharges, consents, and approvals satisfied", ["agency", "agent", "lawyer", "bank"]),
    money("funds_destination_verified", "agreement", "Seller payment destination independently verified"),
    legal("final_contract_ready", "agreement", "Final transfer or sale contract certified ready"),
    step("final_contract_signed", "completion", "Final contract signed by the parties", ["client", "counterparty", "notary"]),
    money("taxes_liens_settled", "completion", "Taxes, liens, lender discharges, fees, and commission settled"),
    legal("registry_filing", "completion", "Transfer filed or registered by the competent authority"),
    money("sale_proceeds_confirmed", "completion", "Net sale proceeds confirmed received"),
    client("handover_inventory", "aftercare", "Keys, possession, readings, inventory, defects, and retained items handed over"),
    internal("commission_accounting", "aftercare", "Commission, invoice, referral, and accounting records reconciled"),
    internal("aftercare_complete", "aftercare", "Seller aftercare and case reconciliation completed"),
  ]),
  tenant_rental: Object.freeze([
    internal("lead_intake", "intake", "Tenant inquiry captured and routed"),
    client("requirements_brief", "intake", "Budget, location, household, timing, term, and property needs recorded"),
    client("identity_verified", "onboarding", "Tenant identity and representation verified"),
    client("privacy_consent", "onboarding", "Privacy and communication preferences recorded"),
    internal("eligibility_screening", "onboarding", "Lawful, proportionate rental eligibility checks completed"),
    internal("property_shortlist", "evidence", "Available rental properties matched against requirements"),
    internal("property_evidence_pack", "evidence", "Rent, charges, energy, inventory, rules, and disclosures assembled"),
    client("viewing_completed", "market", "Physical or remote viewing completed"),
    client("application_submitted", "commercial", "Tenant application and supporting references submitted"),
    client("selection_terms_agreed", "commercial", "Term, rent, deposit, start date, occupants, pets, and conditions agreed"),
    legal("lease_review", "agreement", "Lease and required disclosures reviewed"),
    money("deposit_destination_verified", "agreement", "Deposit and rent payment destination verified"),
    step("lease_signed", "agreement", "Lease signed by tenant and landlord", ["client", "counterparty", "lawyer"]),
    money("deposit_first_rent_paid", "completion", "Deposit and required first rent confirmed"),
    client("inventory_condition_report", "completion", "Inventory, condition, readings, photos, and defects agreed"),
    client("keys_possession", "completion", "Keys and lawful possession transferred"),
    step("utilities_insurance", "aftercare", "Utilities, insurance, registrations, and access services completed", ["agency", "agent", "insurer", "vendor"], true),
    internal("occupancy_support", "aftercare", "Repair, notice, renewal, and escalation channels activated"),
    client("exit_deposit_reconciliation", "aftercare", "Exit inspection, final balances, keys, and deposit reconciled", true),
    internal("aftercare_complete", "aftercare", "Tenant case and records reconciled"),
  ]),
  landlord_rental: Object.freeze([
    internal("lead_intake", "intake", "Landlord inquiry captured and routed"),
    client("letting_objective", "intake", "Term, availability, rent, restrictions, and management needs recorded"),
    client("identity_verified", "onboarding", "Landlord identity and representation verified"),
    legal("ownership_authority", "onboarding", "Ownership and authority to let verified"),
    client("privacy_consent", "onboarding", "Privacy and communication preferences recorded"),
    client("agency_mandate", "onboarding", "Letting, marketing, screening, negotiation, and fee mandate signed"),
    internal("property_evidence_pack", "evidence", "Property facts, documents, charges, rules, and disclosures assembled"),
    technical("safety_condition_review", "evidence", "Condition, equipment, safety, access, and repair obligations reviewed"),
    internal("rent_pricing", "commercial", "Rent, deposit, charges, and review strategy approved"),
    internal("listing_facts_media", "commercial", "Listing facts, media, inventory, translations, and privacy controls prepared"),
    client("publication_authority", "commercial", "Landlord approved exact listing and channel scope"),
    internal("listing_published", "market", "Rental listing published to approved channels"),
    internal("inquiry_viewing_management", "market", "Inquiries, access, viewings, feedback, and key security managed"),
    internal("tenant_screening", "market", "Lawful, proportionate tenant screening completed"),
    client("tenant_selection", "market", "Landlord selection and terms recorded"),
    legal("lease_review", "agreement", "Lease and required disclosures reviewed"),
    money("deposit_destination_verified", "agreement", "Deposit and rent payment destination verified"),
    step("lease_signed", "agreement", "Lease signed by landlord and tenant", ["client", "counterparty", "lawyer"]),
    money("deposit_first_rent_received", "completion", "Deposit and required first rent confirmed"),
    client("inventory_condition_report", "completion", "Inventory, condition, readings, photos, and defects agreed"),
    client("keys_possession", "completion", "Keys and lawful possession transferred"),
    internal("rent_maintenance_operations", "aftercare", "Rent schedule, maintenance, notices, and escalation activated"),
    client("renewal_termination", "aftercare", "Renewal, notice, or termination decision recorded", true),
    client("exit_deposit_reconciliation", "aftercare", "Exit inspection, final balances, keys, and deposit reconciled", true),
    internal("commission_accounting", "aftercare", "Fees, invoices, referrals, and accounting reconciled"),
    internal("aftercare_complete", "aftercare", "Landlord letting case reconciled"),
  ]),
  short_term_rental: Object.freeze([
    internal("owner_guest_intake", "intake", "Owner service scope or guest booking request captured"),
    client("identity_verified", "onboarding", "Contracting party identity verified"),
    client("privacy_consent", "onboarding", "Privacy and communication preferences recorded"),
    legal("ownership_operating_authority", "onboarding", "Ownership and lawful short-term operating authority verified"),
    client("management_mandate", "onboarding", "Pricing, channel, guest, payment, and property-management authority recorded"),
    internal("property_evidence_pack", "evidence", "Property facts, amenities, access, safety, rules, and disclosures assembled"),
    technical("safety_compliance_review", "evidence", "Safety, registration, local compliance, and emergency information reviewed"),
    internal("listing_pricing_channels", "commercial", "Listing, rates, fees, calendars, taxes, and channels configured"),
    client("publication_authority", "commercial", "Owner approved exact public listing and channel scope"),
    internal("listing_published", "market", "Short-term listing and availability published"),
    internal("booking_guest_screening", "market", "Booking, lawful guest checks, fraud controls, and communications completed"),
    money("payment_destination_verified", "agreement", "Guest payment and owner payout destinations verified"),
    step("booking_terms_accepted", "agreement", "Booking terms, house rules, cancellation, and fees accepted", ["client", "counterparty", "agent"]),
    money("booking_payment_confirmed", "completion", "Required booking payment confirmed"),
    client("check_in_handover", "completion", "Identity, access, inventory, and check-in completed"),
    internal("stay_support", "aftercare", "Guest support, incidents, maintenance, and vendor escalation operated"),
    client("check_out_inspection", "aftercare", "Checkout, condition, keys, readings, and damage evidence recorded"),
    money("payout_tax_reconciliation", "aftercare", "Payouts, fees, taxes, refunds, and owner statement reconciled"),
    internal("aftercare_complete", "aftercare", "Stay and property records reconciled"),
  ]),
  property_management: Object.freeze([
    internal("management_intake", "intake", "Owner objectives, portfolio, occupancy, and service scope recorded"),
    client("identity_verified", "onboarding", "Owner identity and representation verified"),
    legal("ownership_authority", "onboarding", "Ownership and authority to appoint a manager verified"),
    client("privacy_consent", "onboarding", "Privacy and communication preferences recorded"),
    client("management_mandate", "onboarding", "Management, spending, vendor, tenant, and emergency authority signed"),
    internal("property_evidence_pack", "evidence", "Property, tenancy, warranty, insurance, access, and compliance records assembled"),
    technical("baseline_condition_inventory", "evidence", "Condition, inventory, equipment, meters, keys, and defects baselined"),
    step("insurance_compliance", "evidence", "Insurance, safety, inspections, registration, and compliance confirmed", ["insurer", "engineer", "lawyer", "registry"]),
    client("budget_reserve_limits", "commercial", "Operating budget, reserve, approval thresholds, and reporting cadence agreed"),
    internal("vendor_access_setup", "commercial", "Approved vendors, access controls, keys, and service levels configured"),
    internal("tenant_booking_operations", "market", "Tenant or booking communications, collections, and service workflows activated"),
    money("collection_payout_routes", "agreement", "Rent, deposit, expense, and owner payout destinations verified"),
    legal("active_contracts_review", "agreement", "Leases, service contracts, notices, and renewals reviewed"),
    internal("maintenance_incident_operations", "completion", "Preventive maintenance, work orders, incidents, and emergencies activated"),
    internal("accounting_reporting", "completion", "Owner statements, invoices, reconciliations, and document retention activated"),
    client("periodic_inspection", "aftercare", "Periodic inspection and owner report completed", true),
    client("renewal_exit_decisions", "aftercare", "Renewals, terminations, sales, or manager exit decisions recorded", true),
    internal("aftercare_complete", "aftercare", "Management period reconciled and next period opened or closed"),
  ]),
});

const ALL_CASE_TYPES = REALTY_CASE_TYPES;
const SALE_CASE_TYPES = Object.freeze(["buyer_purchase", "seller_sale"]);
const BUYER_CASE_TYPES = Object.freeze(["buyer_purchase"]);
const SELLER_CASE_TYPES = Object.freeze(["seller_sale"]);
const RENTAL_CASE_TYPES = Object.freeze(["tenant_rental", "landlord_rental"]);
const LANDLORD_CASE_TYPES = Object.freeze(["landlord_rental"]);
const SHORT_TERM_CASE_TYPES = Object.freeze(["short_term_rental"]);
const OWNER_OPERATION_CASE_TYPES = Object.freeze(["landlord_rental", "short_term_rental", "property_management"]);

export const REALTY_JURISDICTION_STEPS = Object.freeze({
  BG: Object.freeze([
    regulated(
      ALL_CASE_TYPES,
      step(
        "bg_regulatory_snapshot",
        "onboarding",
        "Dated Bulgaria rule, location, party, asset, representation, tax, and required-authority snapshot recorded",
        ["agency", "agent", "lawyer", "registry", "system", "tax_authority"],
      ),
      ["bg_property_register", "bg_property_tax"],
    ),
    regulated(
      BUYER_CASE_TYPES,
      legal("bg_foreign_land_eligibility", "onboarding", "Foreign-person land ownership eligibility and lawful acquisition structure confirmed", true),
      ["bg_foreign_ownership"],
      ["land", "mixed_use"],
    ),
    regulated(
      SALE_CASE_TYPES,
      legal("bg_property_register_extract", "evidence", "Current ownership, registered acts, mortgages, claims, and encumbrances evidenced"),
      ["bg_property_register"],
    ),
    regulated(
      SALE_CASE_TYPES,
      technical("bg_cadastral_sketch_scheme", "evidence", "Current cadastral sketch or independent-object scheme and identifiers matched"),
      ["bg_cadastre"],
    ),
    regulated(
      SALE_CASE_TYPES,
      step("bg_tax_valuation", "evidence", "Municipal tax valuation obtained and matched to parties and property", ["tax_authority", "lawyer", "notary"]),
      ["bg_transfer_tax", "bg_property_tax"],
    ),
    regulated(
      SELLER_CASE_TYPES,
      step("bg_sale_income_tax_analysis", "evidence", "Seller income-tax treatment, exemptions, records, and net proceeds documented", ["tax_authority", "lawyer", "agency"]),
      ["bg_sale_income_tax"],
    ),
    regulated(
      SALE_CASE_TYPES,
      legal("bg_notarial_deed_ready", "agreement", "Competent notary, deed, identity, authority, declarations, and source documents confirmed ready"),
      ["bg_property_transfer"],
    ),
    regulated(
      SALE_CASE_TYPES,
      money("bg_local_acquisition_tax", "completion", "Municipal acquisition tax base, rate, payer, and payment evidenced"),
      ["bg_transfer_tax"],
    ),
    regulated(
      SALE_CASE_TYPES,
      step("bg_notarial_deed_executed", "completion", "Notarial deed executed with attributable party or representative authority", ["client", "counterparty", "notary"]),
      ["bg_property_transfer"],
    ),
    regulated(
      SALE_CASE_TYPES,
      legal("bg_property_register_entry", "completion", "Transfer deed filed and Property Register entry result evidenced"),
      ["bg_property_register", "bg_property_transfer"],
    ),
    regulated(
      BUYER_CASE_TYPES,
      step("bg_post_transfer_tax_account", "aftercare", "Post-acquisition municipal property-tax and waste-fee account obligations completed", ["tax_authority", "agency", "agent"]),
      ["bg_property_tax"],
    ),
    regulated(
      RENTAL_CASE_TYPES,
      technical("bg_rental_energy_document", "evidence", "Applicable energy-performance document supplied or exception evidenced", true),
      ["bg_energy_certificate"],
      ["residential", "commercial", "new_build", "mixed_use"],
    ),
    regulated(
      RENTAL_CASE_TYPES,
      step("bg_lease_tax_setup", "agreement", "Rental income, invoicing, withholding, payment, and recordkeeping treatment documented", ["tax_authority", "lawyer", "agency", "agent"]),
      ["bg_property_tax"],
    ),
    regulated(
      LANDLORD_CASE_TYPES,
      step("bg_lease_reporting_schedule", "aftercare", "Rent, tax, accounting, notice, renewal, and document-retention schedule activated", ["tax_authority", "property_manager", "agency", "agent"]),
      ["bg_property_tax"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      legal("bg_tourism_registration_classification", "evidence", "Accommodation registration or classification and lawful operating scope evidenced"),
      ["bg_tourism_registration"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      legal("bg_national_tourism_register_entry", "evidence", "National Tourism Register entry and public operating data matched"),
      ["bg_tourism_registration"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      step("bg_esti_reporting_ready", "agreement", "ESTI access, system integration or operator process, guest fields, and reporting deadlines verified", ["registry", "property_manager", "agency", "agent", "system"]),
      ["bg_esti"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      step("bg_str_tax_social_setup", "agreement", "Short-term rental tax, VAT/patent-tax, social-security, invoicing, and platform reporting treatment documented", ["tax_authority", "lawyer", "agency", "agent"]),
      ["bg_str_tax"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      step("bg_esti_guest_reporting", "aftercare", "Guest registrations and stay data submitted to ESTI with receipt evidence", ["registry", "property_manager", "agent", "system"]),
      ["bg_esti"],
    ),
    regulated(
      OWNER_OPERATION_CASE_TYPES,
      step("bg_owner_tax_compliance", "aftercare", "Recurring property, waste, rental or operating tax obligations reconciled for the service period", ["tax_authority", "property_manager", "agency", "agent"]),
      ["bg_property_tax", "bg_str_tax"],
    ),
  ]),
  GR: Object.freeze([
    regulated(
      ALL_CASE_TYPES,
      step(
        "gr_regulatory_snapshot",
        "onboarding",
        "Dated Greece rule, location, party, asset, representation, tax, and required-authority snapshot recorded",
        ["agency", "agent", "lawyer", "registry", "system", "tax_authority"],
      ),
      ["gr_cadastre", "gr_property_tax"],
    ),
    regulated(
      ALL_CASE_TYPES,
      step("gr_tax_identity_ready", "onboarding", "Required AFM, TAXIS access, tax representative, and party details are ready and matched", ["tax_authority", "lawyer", "agency", "agent"]),
      ["gr_tax_identity"],
    ),
    regulated(
      BUYER_CASE_TYPES,
      legal("gr_border_area_clearance", "onboarding", "Border-area acquisition restriction and required clearance resolved", true),
      ["gr_border_area"],
    ),
    regulated(
      SALE_CASE_TYPES,
      legal("gr_cadastre_title_extract", "evidence", "Cadastre registration, title chain, property identity, claims, liens, and disposal authority evidenced"),
      ["gr_cadastre", "gr_digital_transfer"],
    ),
    regulated(
      SALE_CASE_TYPES,
      technical("gr_building_identity_extract", "evidence", "Electronic Building Identity or applicable independent-unit certificate matched", true),
      ["gr_building_identity"],
      ["residential", "commercial", "new_build", "mixed_use"],
    ),
    regulated(
      SALE_CASE_TYPES,
      technical("gr_energy_performance_certificate", "evidence", "Applicable energy-performance certificate supplied or exception evidenced", true),
      ["gr_building_identity"],
      ["residential", "commercial", "new_build", "mixed_use"],
    ),
    regulated(
      SELLER_CASE_TYPES,
      step("gr_e9_enfia_sale_clearance", "evidence", "Seller E9 property data, ENFIA status, and required transfer certificate matched", ["tax_authority", "lawyer", "notary"]),
      ["gr_property_tax"],
    ),
    regulated(
      SALE_CASE_TYPES,
      step("gr_objective_value_tax_basis", "evidence", "Objective value, declared consideration, transfer-tax base, exemptions, and costs reviewed", ["tax_authority", "lawyer", "notary", "agency"]),
      ["gr_transfer_tax"],
    ),
    regulated(
      SALE_CASE_TYPES,
      legal("gr_digital_transfer_file", "agreement", "Digital property transfer file authorities, source documents, and notary workflow are complete"),
      ["gr_digital_transfer", "gr_myproperty"],
    ),
    regulated(
      SALE_CASE_TYPES,
      step("gr_myproperty_declaration", "agreement", "myPROPERTY transfer declaration submitted and party acceptance evidenced", ["tax_authority", "notary", "client", "counterparty"]),
      ["gr_myproperty"],
    ),
    regulated(
      SALE_CASE_TYPES,
      money("gr_transfer_tax_payment", "completion", "Assessed transfer tax or valid exemption and payment receipt evidenced"),
      ["gr_transfer_tax", "gr_myproperty"],
    ),
    regulated(
      SALE_CASE_TYPES,
      legal("gr_cadastre_registration_result", "completion", "Notarial deed filed and Hellenic Cadastre acceptance, fee, or rejection resolution evidenced"),
      ["gr_digital_transfer", "gr_cadastre"],
    ),
    regulated(
      BUYER_CASE_TYPES,
      step("gr_post_transfer_e9", "aftercare", "Buyer E9 property record created automatically or filed, checked, and retained", ["tax_authority", "agency", "agent"]),
      ["gr_property_tax", "gr_digital_transfer"],
    ),
    regulated(
      RENTAL_CASE_TYPES,
      technical("gr_rental_energy_certificate", "evidence", "Applicable rental energy-performance certificate supplied or exception evidenced", true),
      ["gr_lease_declaration"],
      ["residential", "commercial", "new_build", "mixed_use"],
    ),
    regulated(
      RENTAL_CASE_TYPES,
      step("gr_lease_declaration", "completion", "Lease information declaration submitted to AADE with property, energy, term, rent, and party data matched", ["tax_authority", "client", "counterparty", "agency", "agent"]),
      ["gr_lease_declaration"],
    ),
    regulated(
      RENTAL_CASE_TYPES,
      step("gr_lease_party_acceptance", "completion", "Tenant and co-owner acceptance, rejection, or deadline outcome recorded", ["tax_authority", "client", "counterparty", "agency", "agent"]),
      ["gr_lease_acceptance"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      legal("gr_str_registry_eligibility", "evidence", "Property, manager, location, date, transfer history, and current first-registration restrictions permit operation"),
      ["gr_str_registry", "gr_str_2026_restrictions"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      step("gr_ama_registration", "evidence", "Short-Term Stay Property Registry entry and AMA or lawful exemption matched to each channel", ["tax_authority", "registry", "agency", "agent"]),
      ["gr_str_registry", "gr_str_2026_restrictions"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      technical("gr_str_safety_compliance", "evidence", "Current short-term rental safety, insurance, electrical, fire, ventilation, and emergency requirements evidenced"),
      ["gr_str_safety"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      step("gr_short_stay_declaration", "aftercare", "Per-stay Short-Term Stay Declaration, amendment, or cancellation submitted by the applicable deadline", ["tax_authority", "property_manager", "agent", "system"]),
      ["gr_str_registry"],
    ),
    regulated(
      SHORT_TERM_CASE_TYPES,
      step("gr_str_annual_finalization", "aftercare", "Annual short-term rental registry data finalized and reconciled to bookings, payouts, and tax records", ["tax_authority", "property_manager", "agency", "agent"]),
      ["gr_str_registry"],
    ),
    regulated(
      OWNER_OPERATION_CASE_TYPES,
      step("gr_owner_tax_compliance", "aftercare", "Recurring E9, ENFIA, rental or operating tax obligations reconciled for the service period", ["tax_authority", "property_manager", "agency", "agent"]),
      ["gr_property_tax", "gr_lease_declaration", "gr_str_registry"],
    ),
  ]),
});

function bounded(value, label, max = 160, required = true) {
  const text = String(value || "").trim();
  if (required && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return text || null;
}

function timestamp(value, label) {
  const text = bounded(value, label, 80);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(text).toISOString();
}

function stringList(value, label, max = 160) {
  const rows = [...new Set((Array.isArray(value) ? value : [value]).map((item) => bounded(item, label, max)).filter(Boolean))];
  if (!rows.length) throw new Error(`${label} must contain at least one value`);
  if (rows.length > 100) throw new Error(`${label} must contain 100 values or fewer`);
  return rows;
}

function containsPrivateKey(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  return Object.entries(value).some(([key, nested]) => PRIVATE_KEYS.has(key) || containsPrivateKey(nested));
}

function normalizedMandate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Case mandate is required");
  const signedAt = timestamp(value.signedAt || value.signed_at, "Mandate signedAt");
  const expiresAt = value.expiresAt || value.expires_at ? timestamp(value.expiresAt || value.expires_at, "Mandate expiresAt") : null;
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(signedAt)) throw new Error("Mandate expiresAt must follow signedAt");
  return {
    ref: bounded(value.ref, "Mandate ref"),
    granted_by_ref: bounded(value.grantedByRef || value.granted_by_ref, "Mandate grantedByRef"),
    signed_at: signedAt,
    signed_evidence_ref: bounded(
      value.signedEvidenceRef || value.signed_evidence_ref,
      "Mandate signedEvidenceRef",
      240,
    ),
    expires_at: expiresAt,
    capabilities: stringList(value.capabilities, "Mandate capability", 120).sort(),
  };
}

function normalizedExecutor(input) {
  const executorKind = bounded(input.executorKind || input.executor_kind, "Executor kind", 20);
  if (!EXECUTOR_KINDS.has(executorKind)) throw new Error("Executor kind must be human or agent");
  return {
    actor: bounded(input.actor, "Case actor", 80),
    executor_kind: executorKind,
  };
}

function normalizedEvidenceRefs(value) {
  if (!Array.isArray(value) || !value.length) throw new Error("Completed case step requires evidenceRefs");
  if (value.length > 20) throw new Error("Case step supports 20 evidence references or fewer");
  return value.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || containsPrivateKey(row)) {
      throw new Error("Case evidence references must contain identifiers only");
    }
    const producerKind = bounded(row.producerKind || row.producer_kind, "Evidence producer kind", 40);
    if (!EVIDENCE_PRODUCERS.has(producerKind)) throw new Error("Unknown evidence producer kind");
    return {
      ref: bounded(row.ref, "Evidence ref", 240),
      type: bounded(row.type, "Evidence type", 120),
      producer_kind: producerKind,
      issued_at: row.issuedAt || row.issued_at ? timestamp(row.issuedAt || row.issued_at, "Evidence issuedAt") : null,
      digest: row.digest ? bounded(row.digest, "Evidence digest", 160) : null,
    };
  });
}

function capabilityAllows(mandate, action, stepKey = null) {
  const capabilities = new Set(mandate.capabilities);
  return (
    capabilities.has("case:*") ||
    capabilities.has(`case:${action}`) ||
    (stepKey && capabilities.has(`step:${stepKey}`))
  );
}

function assertExecutor(caseRecord, executor, action, stepKey = null) {
  if (caseRecord.execution_mode === "manual" && executor.executor_kind !== "human") {
    throw new Error("Manual case actions require a human executor");
  }
  if (executor.executor_kind === "agent" && (!caseRecord.assurance_ref || caseRecord.execution_mode !== "autonomous")) {
    throw new Error("Agent execution requires an autonomous case with an assurance reference");
  }
  if (!capabilityAllows(caseRecord.mandate, action, stepKey)) {
    throw new Error("Case mandate does not authorize this action");
  }
}

function workflowFor(caseType, jurisdiction, assetKind) {
  const workflow = REALTY_WORKFLOWS[caseType];
  if (!workflow) throw new Error("Unknown realty case type");
  const jurisdictionSteps = (REALTY_JURISDICTION_STEPS[jurisdiction] || [])
    .filter(
      (row) =>
        row.applies_to_case_types.includes(caseType) &&
        (!row.applies_to_asset_kinds || row.applies_to_asset_kinds.includes(assetKind)),
    )
    .map(({ applies_to_case_types: _caseTypes, applies_to_asset_kinds: _assetKinds, ...row }) => row);
  const rows = [];
  for (let index = 0; index < workflow.length; index += 1) {
    const row = workflow[index];
    rows.push(row);
    if (workflow[index + 1]?.phase !== row.phase) {
      rows.push(...jurisdictionSteps.filter((candidate) => candidate.phase === row.phase));
    }
  }
  if (rows.some((row) => !PHASES.includes(row.phase))) throw new Error("Realty workflow contains an unknown phase");
  if (jurisdictionSteps.some((row) => !workflow.some((candidate) => candidate.phase === row.phase))) {
    throw new Error("Jurisdiction step references a phase absent from the base workflow");
  }
  if (new Set(rows.map((row) => row.key)).size !== rows.length) throw new Error("Realty workflow step keys must be unique");
  if (
    rows.some((row) =>
      (row.rule_refs || []).some((ruleRef) => !Object.hasOwn(REALTY_RULE_SOURCES, ruleRef)),
    )
  ) {
    throw new Error("Realty workflow references an unknown rule source");
  }
  return rows.map((row) => ({
    ...row,
    evidence_producers: [...row.evidence_producers],
    ...(row.rule_refs ? { rule_refs: [...row.rule_refs] } : {}),
  }));
}

function nextEventId(events, caseId, action) {
  let ordinal = events.filter((row) => row.case_id === caseId).length + 1;
  const ids = new Set(events.map((row) => row.id));
  let id = `realty-case-${caseId}-${action}-${ordinal}`;
  while (ids.has(id)) {
    ordinal += 1;
    id = `realty-case-${caseId}-${action}-${ordinal}`;
  }
  return id;
}

function eventMatchesRetry(event, input) {
  const evidenceInput = input.evidenceRefs || input.evidence_refs;
  const submittedEvidence = evidenceInput ? normalizedEvidenceRefs(evidenceInput) : null;
  const submittedMandate = input.mandate ? normalizedMandate(input.mandate) : null;
  const submittedMode = String(input.executionMode || input.execution_mode || "").trim() || null;
  const submittedAssurance = String(input.assuranceRef || input.assurance_ref || "").trim() || null;
  const assuranceMatches =
    submittedMode === "autonomous" || submittedAssurance
      ? (event.assurance_ref || null) === submittedAssurance
      : true;
  return (
    event.case_id === String(input.caseId || input.case_id || "").trim() &&
    event.action === String(input.action || "").trim() &&
    (event.step_key || null) === (String(input.stepKey || input.step_key || "").trim() || null) &&
    event.actor === String(input.actor || "").trim() &&
    event.executor_kind === String(input.executorKind || input.executor_kind || "").trim() &&
    (event.execution_mode || null) === submittedMode &&
    (event.authority_ref || null) === (String(input.authorityRef || input.authority_ref || "").trim() || null) &&
    (event.reason_code || null) === (String(input.reasonCode || input.reason_code || "").trim() || null) &&
    assuranceMatches &&
    (!submittedMandate || JSON.stringify(event.mandate) === JSON.stringify(submittedMandate)) &&
    (!submittedEvidence || JSON.stringify(event.evidence_refs) === JSON.stringify(submittedEvidence))
  );
}

function enrichedCase(caseRecord) {
  const steps = caseRecord.steps.map((row) => ({ ...row, evidence_producers: [...row.evidence_producers] }));
  const resolved = steps.filter((row) => RESOLVED_STEP_STATUSES.has(row.status)).length;
  const unresolved = steps.filter((row) => !RESOLVED_STEP_STATUSES.has(row.status));
  const phaseRank = new Map(caseRecord.workflow_phases.map((phase, index) => [phase, index]));
  const currentRank = unresolved.length
    ? Math.min(...unresolved.map((row) => phaseRank.get(row.phase)))
    : caseRecord.workflow_phases.length;
  return {
    ...caseRecord,
    steps,
    progress_percent: steps.length ? Math.round((resolved / steps.length) * 100) : 0,
    current_phase: currentRank < caseRecord.workflow_phases.length ? caseRecord.workflow_phases[currentRank] : "complete",
    next_steps: unresolved.filter((row) => phaseRank.get(row.phase) === currentRank),
    blockers: steps.filter((row) => row.status === "blocked"),
  };
}

export function deriveRealtyCases(events = []) {
  const cases = new Map();
  for (const event of events) {
    if (event.action === "case_opened") {
      if (cases.has(event.case_id)) throw new Error("Realty case was opened more than once");
      cases.set(event.case_id, {
        id: event.case_id,
        jurisdiction: event.jurisdiction,
        case_type: event.case_type,
        asset_kind: event.asset_kind,
        client_ref: event.client_ref,
        property_ref: event.property_ref,
        execution_mode: event.execution_mode,
        mandate: event.mandate,
        assurance_ref: event.assurance_ref,
        workflow_version: event.workflow_version,
        workflow_phases: event.workflow_phases || [...new Set(event.workflow_steps.map((row) => row.phase))],
        status: "active",
        created_at: event.recorded_at,
        last_recorded_at: event.recorded_at,
        last_actor: event.actor,
        last_action: event.action,
        steps: event.workflow_steps.map((row) => ({
          ...row,
          status: "pending",
          evidence_refs: [],
          authority_ref: null,
          reason_code: null,
          last_recorded_at: null,
          last_actor: null,
        })),
      });
      continue;
    }
    const caseRecord = cases.get(event.case_id);
    if (!caseRecord) throw new Error("Realty case event precedes case_opened");
    caseRecord.last_recorded_at = event.recorded_at;
    caseRecord.last_actor = event.actor;
    caseRecord.last_action = event.action;
    if (event.step_key) {
      const caseStep = caseRecord.steps.find((row) => row.key === event.step_key);
      if (!caseStep) throw new Error("Realty case event references an unknown step");
      if (event.action === "step_completed") {
        caseStep.status = "completed";
        caseStep.evidence_refs = event.evidence_refs;
      }
      if (event.action === "step_not_applicable") {
        caseStep.status = "not_applicable";
        caseStep.authority_ref = event.authority_ref;
        caseStep.reason_code = event.reason_code;
      }
      if (event.action === "step_blocked") {
        caseStep.status = "blocked";
        caseStep.reason_code = event.reason_code;
      }
      if (event.action === "step_reopened") {
        caseStep.status = "pending";
        caseStep.evidence_refs = [];
        caseStep.authority_ref = event.authority_ref;
        caseStep.reason_code = event.reason_code;
      }
      caseStep.last_recorded_at = event.recorded_at;
      caseStep.last_actor = event.actor;
    }
    if (event.action === "mode_changed") {
      caseRecord.execution_mode = event.execution_mode;
      caseRecord.mandate = event.mandate;
      caseRecord.assurance_ref = event.assurance_ref;
    }
    if (event.action === "case_frozen") caseRecord.status = "frozen";
    if (event.action === "case_resumed") caseRecord.status = "active";
    if (event.action === "case_closed") caseRecord.status = "closed";
    if (event.action === "case_cancelled") caseRecord.status = "cancelled";
  }
  return [...cases.values()].map(enrichedCase);
}

export function resetRealtyCaseLedger(filePath = DEFAULT_REALTY_CASE_LEDGER_PATH) {
  store.resetLedger(filePath);
}

export function readRealtyCaseEvents(filePath = DEFAULT_REALTY_CASE_LEDGER_PATH) {
  return store.readRows(filePath);
}

export function planOpenRealtyCase(
  input,
  { events = [], recordedAt = new Date().toISOString() } = {},
) {
  if (!input || typeof input !== "object" || containsPrivateKey(input)) {
    throw new Error("Realty cases store references, not raw personal data");
  }
  const caseId = bounded(input.id || input.caseId || input.case_id, "Case id");
  const existingCase = deriveRealtyCases(events).find((row) => row.id === caseId);
  if (existingCase) {
    const openingEvent = events.find((row) => row.case_id === caseId && row.action === "case_opened");
    const submittedMandate = normalizedMandate(input.mandate);
    const submittedExecutor = normalizedExecutor(input);
    const submittedPropertyRef = String(input.propertyRef || input.property_ref || "").trim() || null;
    const same =
      existingCase.jurisdiction === String(input.jurisdiction || "").toUpperCase() &&
      existingCase.case_type === String(input.caseType || input.case_type || "").trim() &&
      existingCase.asset_kind === String(input.assetKind || input.asset_kind || "").trim() &&
      existingCase.client_ref === String(input.clientRef || input.client_ref || "").trim() &&
      existingCase.property_ref === submittedPropertyRef &&
      existingCase.execution_mode === String(input.executionMode || input.execution_mode || "").trim() &&
      JSON.stringify(existingCase.mandate) === JSON.stringify(submittedMandate) &&
      (existingCase.assurance_ref || null) ===
        (String(input.assuranceRef || input.assurance_ref || "").trim() || null) &&
      openingEvent.actor === submittedExecutor.actor &&
      openingEvent.executor_kind === submittedExecutor.executor_kind;
    if (!same) throw new Error("Case id already belongs to another realty case");
    return { event: openingEvent, case: existingCase, idempotent: true };
  }
  const jurisdiction = String(input.jurisdiction || "").trim().toUpperCase();
  if (!JURISDICTIONS.has(jurisdiction)) throw new Error("Jurisdiction must be BG or GR");
  const caseType = bounded(input.caseType || input.case_type, "Case type");
  const assetKind = bounded(input.assetKind || input.asset_kind, "Asset kind");
  if (!ASSET_KINDS.has(assetKind)) throw new Error("Unknown realty asset kind");
  const executionMode = bounded(input.executionMode || input.execution_mode, "Execution mode");
  if (!REALTY_EXECUTION_MODES.includes(executionMode)) throw new Error("Execution mode must be manual or autonomous");
  const mandate = normalizedMandate(input.mandate);
  const executor = normalizedExecutor(input);
  const assuranceRef = input.assuranceRef || input.assurance_ref
    ? bounded(input.assuranceRef || input.assurance_ref, "Assurance ref", 240)
    : null;
  if (executionMode === "manual" && assuranceRef) throw new Error("Manual cases do not use an agent assurance reference");
  const provisional = { execution_mode: executionMode, assurance_ref: assuranceRef, mandate };
  assertExecutor(provisional, executor, "open");
  const recorded = timestamp(recordedAt, "recordedAt");
  if (mandate.expires_at && Date.parse(mandate.expires_at) <= Date.parse(recorded)) {
    throw new Error("Case mandate is expired");
  }
  const workflowSteps = workflowFor(caseType, jurisdiction, assetKind);
  const event = {
    id: bounded(input.eventId || input.event_id || `realty-case-${caseId}-opened`, "Case event id"),
    case_id: caseId,
    action: "case_opened",
    jurisdiction,
    case_type: caseType,
    asset_kind: assetKind,
    client_ref: bounded(input.clientRef || input.client_ref, "Client ref"),
    property_ref: input.propertyRef || input.property_ref
      ? bounded(input.propertyRef || input.property_ref, "Property ref")
      : null,
    execution_mode: executionMode,
    mandate,
    assurance_ref: assuranceRef,
    workflow_version: REALTY_WORKFLOW_VERSION,
    workflow_steps: workflowSteps,
    workflow_phases: [...new Set(workflowSteps.map((row) => row.phase))],
    ...executor,
    recorded_at: recorded,
  };
  if (events.some((row) => row.id === event.id)) throw new Error("Case event id already exists");
  return {
    event,
    case: deriveRealtyCases([...events, event]).find((row) => row.id === caseId),
    idempotent: false,
  };
}

export function openRealtyCase(
  input,
  { filePath = DEFAULT_REALTY_CASE_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  if (!input || typeof input !== "object" || containsPrivateKey(input)) {
    throw new Error("Realty cases store references, not raw personal data");
  }
  const planned = planOpenRealtyCase(input, { events: readRealtyCaseEvents(filePath), recordedAt });
  if (!planned.idempotent) store.appendRow(filePath, planned.event);
  return planned;
}

function assertEarlierPhasesResolved(caseRecord, caseStep) {
  const phaseRank = new Map(caseRecord.workflow_phases.map((phase, index) => [phase, index]));
  const rank = phaseRank.get(caseStep.phase);
  const unresolvedEarlier = caseRecord.steps.find(
    (row) => phaseRank.get(row.phase) < rank && !RESOLVED_STEP_STATUSES.has(row.status),
  );
  if (unresolvedEarlier) throw new Error("All earlier phases must be resolved before advancing this step");
}

function normalizedReason(input) {
  return bounded(input.reasonCode || input.reason_code, "Reason code", 120);
}

export function planRealtyCaseAction(
  input,
  { events = [], recordedAt = new Date().toISOString() } = {},
) {
  if (!input || typeof input !== "object" || containsPrivateKey(input)) {
    throw new Error("Realty case actions store references, not raw personal data");
  }
  const requestedId = String(input.id || "").trim();
  if (requestedId) {
    const prior = events.find((row) => row.id === requestedId);
    if (prior) {
      if (!eventMatchesRetry(prior, input)) throw new Error("Case event id already belongs to another action");
      const currentCase = deriveRealtyCases(events).find((row) => row.id === prior.case_id);
      return { event: prior, case: currentCase, idempotent: true };
    }
  }
  const caseId = bounded(input.caseId || input.case_id, "Case id");
  const caseRecord = deriveRealtyCases(events).find((row) => row.id === caseId);
  if (!caseRecord) throw new Error("Case action requires a known caseId");
  const action = bounded(input.action, "Case action");
  if (!ACTIONS.has(action) || action === "case_opened") throw new Error("Unknown realty case action");
  if (["closed", "cancelled"].includes(caseRecord.status)) throw new Error("Closed or cancelled cases are immutable");
  const executor = normalizedExecutor(input);
  const stepKey = String(input.stepKey || input.step_key || "").trim() || null;
  assertExecutor(caseRecord, executor, action, stepKey);
  const recorded = timestamp(recordedAt, "recordedAt");
  if (caseRecord.mandate.expires_at && Date.parse(caseRecord.mandate.expires_at) <= Date.parse(recorded)) {
    throw new Error("Case mandate is expired");
  }
  if (Date.parse(recorded) < Date.parse(caseRecord.last_recorded_at)) {
    throw new Error("Case actions must be recorded in chronological order");
  }
  const event = {
    id: requestedId || nextEventId(events, caseId, action),
    case_id: caseId,
    action,
    step_key: stepKey,
    ...executor,
    assurance_ref: executor.executor_kind === "agent" ? caseRecord.assurance_ref : null,
    recorded_at: recorded,
  };

  if (action.startsWith("step_")) {
    if (caseRecord.status === "frozen") throw new Error("A frozen case must be resumed before steps can change");
    if (!stepKey) throw new Error("Case step action requires stepKey");
    const caseStep = caseRecord.steps.find((row) => row.key === stepKey);
    if (!caseStep) throw new Error("Unknown realty case step");
    if (action !== "step_reopened") assertEarlierPhasesResolved(caseRecord, caseStep);
    if (action === "step_completed") {
      if (RESOLVED_STEP_STATUSES.has(caseStep.status)) throw new Error("Resolved case steps are immutable");
      event.evidence_refs = normalizedEvidenceRefs(input.evidenceRefs || input.evidence_refs);
      if (!event.evidence_refs.some((row) => caseStep.evidence_producers.includes(row.producer_kind))) {
        throw new Error("Case step lacks evidence from an accepted producer");
      }
    }
    if (action === "step_not_applicable") {
      if (!caseStep.optional) throw new Error("Required case steps cannot be marked not applicable");
      if (RESOLVED_STEP_STATUSES.has(caseStep.status)) throw new Error("Resolved case steps are immutable");
      event.authority_ref = bounded(input.authorityRef || input.authority_ref, "Authority ref", 240);
      event.reason_code = normalizedReason(input);
    }
    if (action === "step_blocked") {
      if (RESOLVED_STEP_STATUSES.has(caseStep.status)) throw new Error("Resolved case steps are immutable");
      event.reason_code = normalizedReason(input);
    }
    if (action === "step_reopened") {
      if (caseStep.status === "pending") throw new Error("Pending case step does not need reopening");
      const laterResolved = caseRecord.steps.some(
        (row) =>
          caseRecord.workflow_phases.indexOf(row.phase) > caseRecord.workflow_phases.indexOf(caseStep.phase) &&
          RESOLVED_STEP_STATUSES.has(row.status),
      );
      if (laterResolved) throw new Error("Case step cannot reopen after a later phase has advanced");
      event.authority_ref = bounded(input.authorityRef || input.authority_ref, "Authority ref", 240);
      event.reason_code = normalizedReason(input);
    }
  }

  if (action === "mode_changed") {
    event.execution_mode = bounded(input.executionMode || input.execution_mode, "Execution mode");
    if (!REALTY_EXECUTION_MODES.includes(event.execution_mode)) throw new Error("Execution mode must be manual or autonomous");
    if (event.execution_mode === caseRecord.execution_mode) throw new Error("Case already uses this execution mode");
    event.authority_ref = bounded(input.authorityRef || input.authority_ref, "Authority ref", 240);
    event.mandate = normalizedMandate(input.mandate);
    event.assurance_ref =
      event.execution_mode === "autonomous"
        ? bounded(input.assuranceRef || input.assurance_ref, "Assurance ref", 240)
        : null;
  }
  if (action === "case_frozen") {
    if (caseRecord.status !== "active") throw new Error("Only an active case can be frozen");
    event.authority_ref = bounded(input.authorityRef || input.authority_ref, "Authority ref", 240);
    event.reason_code = normalizedReason(input);
  }
  if (action === "case_resumed") {
    if (caseRecord.status !== "frozen") throw new Error("Only a frozen case can be resumed");
    event.authority_ref = bounded(input.authorityRef || input.authority_ref, "Authority ref", 240);
  }
  if (action === "case_closed") {
    if (caseRecord.status !== "active") throw new Error("Only an active case can close");
    if (caseRecord.steps.some((row) => !RESOLVED_STEP_STATUSES.has(row.status))) {
      throw new Error("Every case step must be resolved before closing");
    }
  }
  if (action === "case_cancelled") {
    event.authority_ref = bounded(input.authorityRef || input.authority_ref, "Authority ref", 240);
    event.reason_code = normalizedReason(input);
  }

  return {
    event,
    case: deriveRealtyCases([...events, event]).find((row) => row.id === caseId),
    idempotent: false,
  };
}

export function appendRealtyCaseAction(
  input,
  { filePath = DEFAULT_REALTY_CASE_LEDGER_PATH, recordedAt = new Date().toISOString() } = {},
) {
  if (!input || typeof input !== "object" || containsPrivateKey(input)) {
    throw new Error("Realty case actions store references, not raw personal data");
  }
  const planned = planRealtyCaseAction(input, { events: readRealtyCaseEvents(filePath), recordedAt });
  if (!planned.idempotent) store.appendRow(filePath, planned.event);
  return planned;
}

export function buildRealtyCaseQueue(events = [], { now = new Date().toISOString() } = {}) {
  const generatedAt = timestamp(now, "now");
  const cases = deriveRealtyCases(events);
  const rows = cases
    .filter((row) => ["active", "frozen"].includes(row.status))
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "frozen" ? -1 : 1;
      if (left.blockers.length !== right.blockers.length) return right.blockers.length - left.blockers.length;
      return left.created_at.localeCompare(right.created_at);
    });
  return {
    kind: "realty_case_queue",
    workflow_version: REALTY_WORKFLOW_VERSION,
    generated_at: generatedAt,
    rows,
    cases,
    summary: {
      total: cases.length,
      open: rows.length,
      active: rows.filter((row) => row.status === "active").length,
      frozen: rows.filter((row) => row.status === "frozen").length,
      blocked: rows.filter((row) => row.blockers.length).length,
      manual: rows.filter((row) => row.execution_mode === "manual").length,
      autonomous: rows.filter((row) => row.execution_mode === "autonomous").length,
      closed: cases.filter((row) => row.status === "closed").length,
      cancelled: cases.filter((row) => row.status === "cancelled").length,
    },
  };
}

export function assertRealtyCaseEvents(events) {
  if (!events.length) throw new Error("Realty case ledger must contain at least one event");
  const ids = new Set();
  for (const event of events) {
    if (!event.id || ids.has(event.id)) throw new Error("Realty case event ids must be present and unique");
    ids.add(event.id);
    if (
      !event.case_id ||
      !ACTIONS.has(event.action) ||
      !event.actor ||
      !EXECUTOR_KINDS.has(event.executor_kind) ||
      Number.isNaN(Date.parse(event.recorded_at))
    ) {
      throw new Error("Realty case event is missing routing or audit data");
    }
    if (containsPrivateKey(event)) throw new Error("Realty case ledger must not store raw personal data");
    if (event.executor_kind === "agent" && !event.assurance_ref) {
      throw new Error("Agent case events require an assurance reference");
    }
  }
  deriveRealtyCases(events);
  return true;
}
