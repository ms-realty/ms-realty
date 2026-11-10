// The tenant profile: the values the property-management pack leaves to the installing agency
// (helm-ai-enterprise, packs/property-management/README.md, "Open parameters an installer must
// supply"), held in one place so the rest of the system reads them instead of repeating them.
// This is the MS Realty profile. Every value equals the one the system shipped with, so reading
// it from here changes no behaviour; the point is that a second agency edits one file.
//
// Isomorphic on purpose: the edge gateway, client components and the database schema import it,
// so it reads no environment and carries no server-only code.
//
// Pinned by the database (a change needs a migration alongside the edit): locales
// (`public_locale` and `staff_locale` enums, `DEFAULT 'bg'`, CHECKs on the source locale),
// currency codes (`currency` enum, `commission_records` CHECK on EUR), jurisdiction codes
// (`process_policy_scope` CHECK on BG/GR) and legacy domains (`legacy_domain` enum). Pinned by
// reviewed snapshots: an approved operating policy stores `timezone` and is hashed, so a different
// agency time zone invalidates existing policies rather than moving them.

// Jurisdictions.

/** ISO 3166-1 alpha-2 codes of the jurisdictions the agency operates in. */
export const jurisdictionCodes = ["BG", "GR"] as const;
export type JurisdictionCode = (typeof jurisdictionCodes)[number];

export function isJurisdictionCode(value: string): value is JurisdictionCode {
  return (jurisdictionCodes as readonly string[]).includes(value);
}

/** IANA zones a process policy may name: one per jurisdiction. */
export const jurisdictionTimeZones = ["Europe/Sofia", "Europe/Athens"] as const;
export type JurisdictionTimeZone = (typeof jurisdictionTimeZones)[number];

export interface JurisdictionProfile {
  readonly timeZone: JurisdictionTimeZone;
  /** The country's name in its own language, for forms that pick a jurisdiction. */
  readonly nativeName: string;
  /** Appointment scheduling (viewings, photography) is configured for this jurisdiction. */
  readonly appointments: boolean;
}

export const jurisdictionProfiles: Readonly<Record<JurisdictionCode, JurisdictionProfile>> = {
  BG: { timeZone: "Europe/Sofia", nativeName: "България", appointments: true },
  GR: { timeZone: "Europe/Athens", nativeName: "Ελλάδα", appointments: false },
};

export function jurisdictionTimeZone(code: JurisdictionCode): JurisdictionTimeZone {
  return jurisdictionProfiles[code].timeZone;
}

/** Whether the scheduling workflows run for a property in this country. */
export function appointmentsConfiguredIn(country: string): boolean {
  return isJurisdictionCode(country) && jurisdictionProfiles[country].appointments;
}

/** The agency's time zone; every date shown to people is formatted in an explicit zone. */
export const agencyTimeZone = "Europe/Sofia" satisfies JurisdictionTimeZone;

// Locales (AD9). The source locale is the editorial source; a public locale is indexable only
// after a recorded human approval (src/i18n/config.ts).

export const publicLocales = ["bg", "en", "ru", "de", "nl", "el", "he"] as const;
export type PublicLocale = (typeof publicLocales)[number];
export const staffLocales = ["bg", "ru", "en"] as const;
export type StaffLocale = (typeof staffLocales)[number];
export const sourceLocale = "bg" satisfies PublicLocale;
export const defaultStaffLocale = "bg" satisfies StaffLocale;

/** Locales written right to left. */
export const rtlLocales = ["he"] as const satisfies readonly PublicLocale[];

export function isRtlLocale(locale: string): boolean {
  return (rtlLocales as readonly string[]).includes(locale);
}

/**
 * The regional tag each route locale formats with: dates, numbers and money, and React Aria's
 * built-in strings. A bare language would leave the region to the runtime (en means US dates, he
 * may lack Israeli conventions); the agency's audience is European and Israeli.
 */
export const displayLocales: Readonly<Record<PublicLocale, string>> = {
  bg: "bg-BG",
  en: "en-GB",
  ru: "ru-RU",
  de: "de-DE",
  nl: "nl-NL",
  el: "el-GR",
  he: "he-IL",
};

// Currency (ISO 4217). Money stays in integer minor units with its recorded currency.

export const currencyCodes = ["EUR", "BGN", "USD", "GBP"] as const;
export type CurrencyCode = (typeof currencyCodes)[number];
export const currencyMinorDigits: Readonly<Record<CurrencyCode, number>> = {
  EUR: 2,
  BGN: 2,
  USD: 2,
  GBP: 2,
};
/** The currency new prices, proposals and searches default to. */
export const defaultCurrency = "EUR" satisfies CurrencyCode;
/**
 * The former national currency and its fixed legal rate into the default currency (the Council
 * conversion rate: 1 EUR = 1.95583 BGN). Historical amounts keep their recorded currency.
 */
export const legacyCurrency = {
  code: "BGN" satisfies CurrencyCode,
  perDefaultUnit: { numerator: 195_583n, denominator: 100_000n },
} as const;

// Operating defaults (architecture §7.1): conservative, not market facts. The agency may shorten
// them in its approved operating policy, never lengthen them.

export const availabilityReviewIntervalDays = { sale: 14, long_term_rent: 7 } as const;

// Publication policy (ADR 0012). How a listing earns its place on the public site: one recorded
// human decision ("staff_attestation") or the strict evidence path ("reviewed_documents": an
// uploaded, scanned and reviewed seller authority and brokerage agreement). A person publishes
// under either; a non-source translation still needs its own human approval.

export interface PublicationPolicy {
  /** What counts as the seller's permission to advertise. */
  readonly sellerEvidence: "staff_attestation" | "reviewed_documents";
  /** The person who wrote the listing may not be the one who publishes it. */
  readonly independentReview: boolean;
  /** Publishing waits until every placed photo is processed and cleared. */
  readonly photosRequired: boolean;
  /**
   * How recent the publisher's sign-in must be to publish or unpublish: an active staff session,
   * or a sign-in within the staff step-up window (5 minutes). Other sensitive actions keep their
   * own step-up rule.
   */
  readonly signIn: "active_session" | "recent";
  /**
   * An attestation keeps counting after its author leaves the agency (it was valid when it was
   * recorded by active staff). When false, it lapses with the author's membership (fail closed).
   */
  readonly attestationOutlivesAuthor: boolean;
}

/** The strict policy another brand may adopt; kept tested alongside the agency's own. */
export const strictPublicationPolicy: PublicationPolicy = {
  sellerEvidence: "reviewed_documents",
  independentReview: true,
  photosRequired: true,
  signIn: "recent",
  attestationOutlivesAuthor: false,
};

export const publicationPolicy: PublicationPolicy = {
  sellerEvidence: "staff_attestation",
  independentReview: false,
  photosRequired: false,
  signIn: "active_session",
  attestationOutlivesAuthor: true,
};

// Deal path (ADR 0013). The steps a person records after terms are agreed, from the first
// check to keys in hand, per jurisdiction and transaction. Labels and explanations live in the
// `dealPath` message catalogs under the same keys; this profile holds no wording. A Deal keeps
// the steps it was given when its path was first recorded, so editing a template changes new
// Deals only. Templates describe who usually acts, never a legal requirement.

/** Who acts on a step: the buyer or tenant side, the agency, the owner, a notary or a lawyer. */
export const dealPathActors = ["client", "agency", "owner", "notary", "lawyer"] as const;
export type DealPathActor = (typeof dealPathActors)[number];
export const dealPathTransactions = ["sale", "long_term_rent"] as const;
export type DealPathTransaction = (typeof dealPathTransactions)[number];

/**
 * A duty the agency itself carries on a Deal (ADR 0015), held as a path step rather than as a
 * wall before terms are agreed: `brokerage_contract` is the written brokerage contract with the
 * agency's own client (ADR 0009); `customer_due_diligence` is identifying both parties
 * (ADR 0008).
 */
export const dealPathDuties = ["brokerage_contract", "customer_due_diligence"] as const;
export type DealPathDuty = (typeof dealPathDuties)[number];

export interface DealPathStepTemplate {
  /** Stable key: stored on the recorded step and used as the message key. */
  readonly key: string;
  readonly actor: DealPathActor;
  /** A document is usually kept as evidence of this step (never required to record it). */
  readonly evidence: boolean;
  /** Whether the client sees the step on their Deal path. */
  readonly clientVisible: boolean;
  /** The agency duty this step records; such a step cannot be marked not needed when in scope. */
  readonly duty?: DealPathDuty;
  /**
   * The step hands over money, a signature or the property (deposit, preliminary contract,
   * deed, registration, lease, keys): it can be marked done only after the identity checks.
   */
  readonly afterIdentityChecks?: boolean;
}

const step = (
  key: string,
  actor: DealPathActor,
  evidence = false,
  options: Partial<
    Pick<DealPathStepTemplate, "clientVisible" | "duty" | "afterIdentityChecks">
  > = {},
): DealPathStepTemplate => ({ key, actor, evidence, clientVisible: true, ...options });
const brokerage = step("brokerage_agreement", "agency", true, { duty: "brokerage_contract" });
const identity = step("identity_checks", "agency", true, { duty: "customer_due_diligence" });
/** A step that moves money, a signature or the property. */
const handover = (key: string, actor: DealPathActor, evidence = false) =>
  step(key, actor, evidence, { afterIdentityChecks: true });

/** Recorded steps keyed `${jurisdiction}.${transaction}`; the last step completes the Deal. */
export const dealPathTemplates: Readonly<
  Partial<Record<`${JurisdictionCode}.${DealPathTransaction}`, readonly DealPathStepTemplate[]>>
> = {
  "BG.sale": [
    brokerage,
    identity,
    handover("deposit_preliminary_contract", "client", true),
    step("property_checks", "agency", true),
    step("funds_ready", "client"),
    handover("notary_deed", "notary", true),
    handover("registration", "notary", true),
    handover("keys_handed_over", "owner"),
  ],
  "BG.long_term_rent": [
    brokerage,
    identity,
    handover("lease_signed", "client", true),
    handover("deposit_first_rent", "client"),
    handover("keys_handed_over", "owner"),
  ],
  "GR.sale": [
    brokerage,
    identity,
    step("tax_number", "client", true),
    step("lawyer_property_checks", "lawyer", true),
    handover("deposit_preliminary_contract", "client", true),
    handover("notary_deed", "notary", true),
    handover("registration", "lawyer", true),
    handover("keys_handed_over", "owner"),
  ],
};

/** For a jurisdiction and transaction without a template. */
export const genericDealPath: Readonly<
  Record<DealPathTransaction, readonly DealPathStepTemplate[]>
> = {
  sale: [
    brokerage,
    identity,
    handover("contract_signed", "client", true),
    handover("keys_handed_over", "owner"),
  ],
  long_term_rent: [
    brokerage,
    identity,
    handover("lease_signed", "client", true),
    handover("keys_handed_over", "owner"),
  ],
};

/**
 * Where the customer due diligence duty applies (ADR 0008 §1, for this brand's jurisdictions
 * BG and GR): every sale, and a letting from this monthly rent. A letting in another currency
 * is treated as in scope, because no rate is assumed.
 */
export const customerDueDiligenceScope = {
  sale: true,
  monthlyRentFrom: { amountMinor: 1_000_000, currency: "EUR" satisfies CurrencyCode },
} as const;

/**
 * The withdrawal period of a brokerage contract concluded online or away from the office
 * (ADR 0009 §4), in calendar days from signing. Shown on the path; never enforced as a wall.
 */
export const brokerageWithdrawalDays = 14;

// Deal policy (ADR 0015). How a Deal reaches "terms agreed" and what a broker may record. A
// brand that wants independent review, documents before agreement or client accounts for
// every party turns the strict values on; the system checks and records either way.

export interface DealPolicy {
  /**
   * `staff_attestation`: the broker's recorded word that each party accepted the exact terms is
   * the basis; documents are optional evidence. `reviewed_process`: terms are agreed only after
   * the reviewed process policy, per-party due diligence and signed service agreements
   * (`assertCaseAgreementReady`).
   */
  readonly agreementBasis: "staff_attestation" | "reviewed_process";
  /** The other side (seller or landlord on a buyer's Deal) must answer in the client area. */
  readonly counterpartyAccountRequired: boolean;
  /** A home joins a buyer's or tenant's Deal only through a structured Brief and match review. */
  readonly shortlistNeedsStructuredBrief: boolean;
  /** A proposal needs a published listing and a current agreed seller instruction. */
  readonly proposalsNeedPublishedListing: boolean;
}

/** The behaviour the system shipped with before ADR 0015; kept for brands that want it. */
export const strictDealPolicy: DealPolicy = {
  agreementBasis: "reviewed_process",
  counterpartyAccountRequired: true,
  shortlistNeedsStructuredBrief: true,
  proposalsNeedPublishedListing: true,
};

/** This brand: the broker's recorded decision is the basis (ADR 0015). */
export const dealPolicy: DealPolicy = {
  agreementBasis: "staff_attestation",
  counterpartyAccountRequired: false,
  shortlistNeedsStructuredBrief: false,
  proposalsNeedPublishedListing: false,
};

// Human references. Listings keep the legacy lot-number format (MS-00100) so every reference
// already in circulation stays valid; other records get a yearly sequence.

export const referencePrefixes = {
  listing: "MS",
  property: "PR",
  inquiry: "RQ",
  case: "CS",
  appointment: "AP",
  proposal: "PP",
  document: "DC",
  seller_instruction: "SI",
  privacy_request: "PQ",
  complaint: "CM",
  key_set: "KY",
  import_batch: "IM",
} as const;
/** Lot numbers are padded to this many digits; longer numbers stay valid. */
export const listingReferenceMinDigits = 5;

// Legacy site. URL decisions are recorded in data/legacy/url-decisions.json (architecture §18.1).

export const legacyDomains = ["makler-realty.com", "makler-realty.ru"] as const;

// Agency identity. Public copy keeps the brand in its message files; shared modules read it here.

export const agency = {
  name: "MS Realty",
  /** The AI service as people see it (code identifiers use `ai_service`). */
  assistantName: "Butler",
  logoPath: "/brand/logo-ms-realty.png",
  phone: {
    /** E.164, for tel: links. The only public phone number. */
    e164: "+359879696870",
    display: "+359 879 696 870",
  },
} as const;

/** How the assistant introduces itself to providers and OAuth consent screens. */
export const assistantLabel = `${agency.name} ${agency.assistantName}`;

// Service notifications (ADR 0014). Automatic e-mail notices about a person's own Deal, sent from
// pre-approved templates without a person pressing send. Not marketing; the client area stays
// the source of truth. `enabled: false` switches the whole family off for the brand; each event
// can also be switched off on its own. Delivery still needs a configured email provider.

export const serviceNotificationEvents = [
  // To the client.
  "viewing.proposed",
  "viewing.confirmed",
  "viewing.moved",
  "viewing.cancelled",
  "proposal.ready",
  "proposal.withdrawn",
  "proposal.expired",
  "document.requested",
  "message.from_broker",
  "deal.step_done",
  "deal.completed",
  // To the accountable broker.
  "client.viewing_confirmed",
  "client.viewing_cancelled",
  "client.viewing_new_time",
  "client.proposal_accepted",
  "client.proposal_declined",
  "client.proposal_countered",
  "client.document_uploaded",
  "client.message",
  // To a website visitor who left an e-mail address with an inquiry.
  "inquiry.acknowledged",
] as const;
export type ServiceNotificationEvent = (typeof serviceNotificationEvents)[number];

export const serviceNotifications: {
  readonly enabled: boolean;
  readonly events: Readonly<Record<ServiceNotificationEvent, boolean>>;
} = {
  enabled: true,
  events: Object.fromEntries(serviceNotificationEvents.map((event) => [event, true])) as Record<
    ServiceNotificationEvent,
    boolean
  >,
};

export function serviceNotificationEnabled(event: ServiceNotificationEvent): boolean {
  return serviceNotifications.enabled && serviceNotifications.events[event] === true;
}
