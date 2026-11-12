// The Deal path (ADR 0013): one ordered list of plain-language steps from first contact to keys
// in hand, the same for the client and the broker. Early steps are derived from records that
// already exist (Inquiry, Brief, Interests, Appointments, Proposal); later steps are recorded by
// a person from the tenant profile's template. The path records and shows what people did: it
// holds no money, executes no signature and states no legal requirement.
import {
  brokerageWithdrawalDays,
  customerDueDiligenceScope,
  type DealPathActor,
  type DealPathDuty,
  type DealPathStepTemplate,
  type DealPathTransaction,
  dealPathTemplates,
  genericDealPath,
  isJurisdictionCode,
} from "../config/tenant";
import type { CaseKind } from "./case";

/** `closure_outcome` of a Case closed by completing its path, instead of free text. */
export const dealCompletedOutcome = "deal_completed";

export const recordedStepStates = ["pending", "done", "skipped"] as const;
export type RecordedStepState = (typeof recordedStepStates)[number];

export const pathStepActions = ["done", "skip", "reopen", "expect"] as const;
export type PathStepAction = (typeof pathStepActions)[number];

/** How a step reads on the path. `not_recorded`: a derived step passed without its record. */
export type PathStepStatus = "done" | "skipped" | "not_recorded" | "current" | "next" | "upcoming";

export const stepKeyPattern = /^[a-z][a-z0-9_]{1,60}$/;

export const derivedStepKeys = [
  "request_received",
  "needs_agreed",
  "homes_shortlisted",
  "viewings",
  "terms_agreed",
] as const;
export type DerivedStepKey = (typeof derivedStepKeys)[number];

export function dealTransaction(kind: CaseKind): DealPathTransaction | null {
  if (kind === "buyer" || kind === "seller") return "sale";
  if (kind === "tenant" || kind === "landlord") return "long_term_rent";
  return null;
}

/** Whether the Case's client is the owner side (seller or landlord). */
export const ownerSide = (kind: CaseKind) => kind === "seller" || kind === "landlord";

export interface ResolvedTemplate {
  readonly key: string;
  readonly steps: readonly DealPathStepTemplate[];
}

/** The template for a property's country and the Deal's transaction, or the generic one. */
export function resolveTemplate(
  country: string | null,
  transaction: DealPathTransaction,
): ResolvedTemplate {
  if (country && isJurisdictionCode(country)) {
    const key = `${country}.${transaction}` as const;
    const steps = dealPathTemplates[key];
    if (steps) return { key, steps };
  }
  return { key: `generic.${transaction}`, steps: genericDealPath[transaction] };
}

/** The steps a stored template key names; null for an unknown key (a removed template). */
export function templateSteps(key: string): readonly DealPathStepTemplate[] | null {
  const known = dealPathTemplates[key as keyof typeof dealPathTemplates];
  if (known) return known;
  const [scope, transaction] = key.split(".");
  if (scope === "generic" && (transaction === "sale" || transaction === "long_term_rent"))
    return genericDealPath[transaction];
  return null;
}

/** The template definition of one stored step; undefined for a removed template or key. */
export function templateStep(template: string, key: string): DealPathStepTemplate | undefined {
  return templateSteps(template)?.find((step) => step.key === key);
}

/** The agreed terms a duty's scope depends on: amount, currency and period. */
export interface AgreedTerms {
  readonly amountMinor: number;
  readonly currency: string;
  readonly period: string;
}

/**
 * Whether an agency duty applies to this Deal (ADR 0015). The brokerage contract applies to
 * every Deal: the Case's client is the agency's own client. Customer due diligence applies to
 * every sale and to a letting from the profile's monthly rent; an unknown rent, or a rent in
 * another currency, counts as in scope.
 */
export function dutyInScope(
  duty: DealPathDuty,
  transaction: DealPathTransaction,
  terms: AgreedTerms | null,
): boolean {
  if (duty === "brokerage_contract") return true;
  if (transaction === "sale") return customerDueDiligenceScope.sale;
  if (terms?.period !== "month") return true;
  const from = customerDueDiligenceScope.monthlyRentFrom;
  return terms.currency !== from.currency || terms.amountMinor >= from.amountMinor;
}

/** Why a staff action on a recorded step is refused under the path's duties. */
export type StepDutyBlock = "duty_in_scope" | "identity_checks_first";

export function stepDutyBlock(input: {
  readonly step: DealPathStepTemplate | undefined;
  readonly action: PathStepAction;
  readonly transaction: DealPathTransaction;
  readonly terms: AgreedTerms | null;
  /** State of the Deal's identity checks step; null when the path has none. */
  readonly identityChecks: RecordedStepState | null;
}): StepDutyBlock | null {
  const { step } = input;
  if (!step) return null;
  if (
    input.action === "skip" &&
    step.duty &&
    dutyInScope(step.duty, input.transaction, input.terms)
  )
    return "duty_in_scope";
  if (input.action === "done" && step.afterIdentityChecks && input.identityChecks === "pending")
    return "identity_checks_first";
  return null;
}

/** The last day a client may withdraw from a brokerage contract signed online or off-premises. */
export function withdrawalEndsOn(signedOn: string): string {
  const date = new Date(`${signedOn}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + brokerageWithdrawalDays);
  return date.toISOString().slice(0, 10);
}

/** What is recorded with the brokerage contract step (ADR 0009 §4), as yes/no answers. */
export interface BrokerageDetails {
  /** Signed online or away from the agency's office. */
  readonly away: boolean;
  /** The client asked in writing for work to start within the withdrawal period. */
  readonly earlyStart: boolean | null;
}

/** What the existing records say about the early steps. */
export interface DerivedFacts {
  readonly requestReceivedAt: Date;
  readonly briefAgreedAt: Date | null;
  readonly shortlisted: boolean;
  readonly viewingDoneAt: Date | null;
  /** An upcoming confirmed viewing. */
  readonly viewingExpectedAt: Date | null;
  readonly termsAgreedAt: Date | null;
}

export interface RecordedStepInput {
  readonly key: string;
  readonly actor: DealPathActor;
  readonly evidenceExpected: boolean;
  readonly clientVisible: boolean;
  readonly state: RecordedStepState;
  /** Calendar dates (YYYY-MM-DD) in the agency's zone. */
  readonly expectedOn: string | null;
  readonly doneOn: string | null;
}

export interface PathStepBase {
  readonly key: string;
  readonly source: "derived" | "recorded";
  readonly actor: DealPathActor;
  readonly clientVisible: boolean;
  readonly evidenceExpected: boolean;
  /** When it happened: an instant for derived steps, a calendar date for recorded ones. */
  readonly doneAt: Date | string | null;
  readonly expectedAt: Date | string | null;
  readonly settled: "done" | "skipped" | null;
}

export function derivedSteps(kind: CaseKind, facts: DerivedFacts): PathStepBase[] {
  const owner = ownerSide(kind);
  const derived = (
    key: DerivedStepKey,
    actor: DealPathActor,
    doneAt: Date | null,
    done = Boolean(doneAt),
    expectedAt: Date | null = null,
  ): PathStepBase => ({
    key,
    source: "derived",
    actor,
    clientVisible: true,
    evidenceExpected: false,
    doneAt,
    expectedAt,
    settled: done ? "done" : null,
  });
  // Sellers and landlords reach terms through the agency's marketing, not a client's search.
  if (owner)
    return [
      derived("request_received", "agency", facts.requestReceivedAt),
      derived("terms_agreed", "client", facts.termsAgreedAt),
    ];
  return [
    derived("request_received", "agency", facts.requestReceivedAt),
    derived("needs_agreed", "agency", facts.briefAgreedAt),
    derived("homes_shortlisted", "client", null, facts.shortlisted),
    derived("viewings", "agency", facts.viewingDoneAt, undefined, facts.viewingExpectedAt),
    derived("terms_agreed", "client", facts.termsAgreedAt),
  ];
}

export function recordedSteps(rows: readonly RecordedStepInput[]): PathStepBase[] {
  return rows.map((row) => ({
    key: row.key,
    source: "recorded",
    actor: row.actor,
    clientVisible: row.clientVisible,
    evidenceExpected: row.evidenceExpected,
    doneAt: row.state === "done" ? row.doneOn : null,
    expectedAt: row.expectedOn,
    settled: row.state === "pending" ? null : row.state,
  }));
}

/** A template's steps before anyone recorded them: all pending. */
export function previewSteps(template: readonly DealPathStepTemplate[]): RecordedStepInput[] {
  return template.map((step) => ({
    key: step.key,
    actor: step.actor,
    evidenceExpected: step.evidence,
    clientVisible: step.clientVisible,
    state: "pending",
    expectedOn: null,
    doneOn: null,
  }));
}

export type PathStep<T extends PathStepBase = PathStepBase> = T & {
  readonly status: PathStepStatus;
};

/**
 * One audience's view of the path. Hidden steps are dropped first, so "you are here" and "next"
 * are always steps this reader can see. A derived step that a later settled step passed without
 * its own record reads `not_recorded`, never done; recorded steps keep their recorded state.
 */
export function composePath<T extends PathStepBase>(
  steps: readonly T[],
  audience: "client" | "staff",
): { steps: PathStep<T>[]; current: string | null; next: string | null } {
  const visible = audience === "client" ? steps.filter((s) => s.clientVisible) : [...steps];
  const lastSettled = visible.reduce((last, s, index) => (s.settled ? index : last), -1);
  let current: string | null = null,
    next: string | null = null;
  const out = visible.map((step, index): PathStep<T> => {
    if (step.settled) return { ...step, status: step.settled };
    if (step.source === "derived" && index < lastSettled)
      return { ...step, status: "not_recorded" };
    if (current === null) {
      current = step.key;
      return { ...step, status: "current" };
    }
    if (next === null) {
      next = step.key;
      return { ...step, status: "next" };
    }
    return { ...step, status: "upcoming" };
  });
  // A client never reads that a step "has no record": passed early steps are left out for them.
  const shown = audience === "client" ? out.filter((s) => s.status !== "not_recorded") : out;
  return { steps: shown, current, next };
}

/**
 * Completion is allowed once terms are agreed, every recorded step is done or not needed and the
 * final step (keys handed over) is done. Not needing the final step is not a completed Deal.
 */
export function completionReadiness(
  facts: Pick<DerivedFacts, "termsAgreedAt">,
  rows: readonly Pick<RecordedStepInput, "state">[],
  /** An in-scope agency duty (brokerage contract, identity checks) is not done. */
  dutyOpen = false,
): {
  ready: boolean;
  reason: "terms_not_agreed" | "steps_open" | "final_step_open" | "duty_open" | null;
} {
  if (!facts.termsAgreedAt) return { ready: false, reason: "terms_not_agreed" };
  if (!rows.length || rows.some((row) => row.state === "pending"))
    return { ready: false, reason: "steps_open" };
  if (dutyOpen) return { ready: false, reason: "duty_open" };
  if (rows.at(-1)?.state !== "done") return { ready: false, reason: "final_step_open" };
  return { ready: true, reason: null };
}

/** The state change one staff action makes, or null when the step cannot take it. */
export function nextRecordedState(
  from: RecordedStepState,
  action: PathStepAction,
): RecordedStepState | null {
  switch (action) {
    case "done":
      return from === "pending" ? "done" : null;
    case "skip":
      return from === "pending" ? "skipped" : null;
    case "reopen":
      return from === "pending" ? null : "pending";
    case "expect":
      return from === "pending" ? "pending" : null;
  }
}

/** Today's calendar date in a zone, as YYYY-MM-DD. */
export function calendarDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A real calendar date in YYYY-MM-DD form. */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
