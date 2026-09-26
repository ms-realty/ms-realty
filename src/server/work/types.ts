// View models of the agency work surfaces (spec §15.3 O01–O03, O06, O18; §19.2). The
// workspace UI is built against these names; change them only together with the UI.
import "server-only";
import type { InquiryPurpose, InquiryState } from "@/domain/inquiry";
import type { MessageChannel, MessageDirection, MessageKind, MessageState } from "@/domain/message";
import type {
  AuthorityState,
  ConsentPurpose,
  ConsentState,
  ContactMethodKind,
  ContactVerificationState,
  PartyRelationshipRole,
} from "@/domain/parties";
import type { CommitmentKind, TaskState, TaskType } from "@/domain/task";

export type RecordType =
  | "inquiry"
  | "case"
  | "listing"
  | "appointment"
  | "task"
  | "message"
  | "approval"
  | "person"
  | "property";

/** A link to a record by id, with its stable human reference when it has one. */
export interface RecordRef {
  readonly type: RecordType;
  readonly id: string;
  readonly reference: string | null;
}

/** A staff owner; null wherever a view model says "owner" means unassigned. */
export interface OwnerRef {
  readonly staffId: string;
  readonly name: string;
}

export interface DueView {
  /** ISO 8601 instant. */
  readonly at: string;
  readonly overdue: boolean;
}

// O01 Today (F19, L07, A45).

/** F19 priority order; `getToday` always returns sections in this order. */
export const todaySections = [
  "consequential_failures",
  "overdue_commitments",
  "appointments_today",
  "awaiting_first_response",
  "blocking_approvals",
  "planned_tasks",
] as const;
export type TodaySection = (typeof todaySections)[number];

export type TodayRowKind =
  | "delivery_problem"
  | "first_response_overdue"
  | "first_response"
  | "duplicate_review"
  | "client_commitment"
  | "client_follow_up"
  | "appointment"
  | "approval"
  | "task";

/** Consequence, not decoration: something already went wrong, work is due, or it is planned. */
export type TodaySeverity = "consequential" | "due" | "planned";

export type TodayActionKind =
  | "reconcile_delivery"
  | "claim_inquiry"
  | "reply"
  | "review_duplicate"
  | "follow_up"
  | "complete_task"
  | "review_dependency"
  | "confirm_appointment"
  | "open_appointment"
  | "record_appointment_outcome"
  | "review_approval";

export interface TodayRow {
  /** Stable across refreshes, e.g. `task:<uuid>`. */
  readonly id: string;
  readonly kind: TodayRowKind;
  readonly section: TodaySection;
  /** Verb + object, e.g. "Reply to RQ-2026-000012". English fallback; localize by `kind`. */
  readonly title: string;
  /** Why the row is here. English fallback; localize by `reasonCode`. */
  readonly reason: string;
  readonly reasonCode: string;
  /** Linked inquiry, case, listing and the row's own record. */
  readonly records: readonly RecordRef[];
  readonly owner: OwnerRef | null;
  readonly due: DueView | null;
  readonly severity: TodaySeverity;
  /** The one direct action for this row. */
  readonly action: { readonly kind: TodayActionKind; readonly target: RecordRef };
}

export type TodayGroupBy = "due" | "case" | "type";

export interface TodayGroup {
  /** A section for `due`, a record key such as `case:<uuid>` for `case`, a row kind for `type`. */
  readonly key: string;
  readonly label: string;
  readonly rows: readonly TodayRow[];
}

export interface OfficeStatus {
  readonly open: boolean;
  /** IANA timezone of the service policy. */
  readonly timezone: string;
}

export interface TodayView {
  readonly now: string;
  readonly timeZone: string;
  readonly groupBy: TodayGroupBy;
  /** Null when service hours are not configured or cannot be read: never guessed. */
  readonly office: OfficeStatus | null;
  /** Navigation aids, per F19 section. */
  readonly counts: Readonly<Record<TodaySection, number>>;
  readonly unownedCount: number;
  readonly overdueCount: number;
  readonly groups: readonly TodayGroup[];
  /** Present only when nothing is due: the next dated item, if any. */
  readonly empty: { readonly nextDueAt: string | null } | null;
}

// O02 Inbox (F18, L08).

export const inboxViews = ["unassigned", "mine", "awaiting_client", "problems"] as const;
export type InboxView = (typeof inboxViews)[number];

export type InboxRequiredAction =
  | "resolve_delivery"
  | "fix_contact_route"
  | "assign"
  | "review_duplicate"
  | "first_response"
  | "follow_up"
  | "await_client"
  | "create_or_link_case"
  | "set_next_action"
  | "none";

export interface InboxRow {
  readonly inquiry: RecordRef;
  readonly version: number;
  readonly state: InquiryState;
  readonly person: { readonly id: string | null; readonly name: string | null };
  /** The contact route the request came with. */
  readonly channel: {
    readonly kind: ContactMethodKind;
    readonly verification: ContactVerificationState;
  } | null;
  readonly purpose: InquiryPurpose;
  readonly listing: RecordRef | null;
  /** Latest meaningful text: last sent or received message, else the request itself. */
  readonly snippet: string | null;
  readonly receivedAt: string;
  readonly ageSeconds: number;
  readonly owner: OwnerRef | null;
  readonly requiredAction: InboxRequiredAction;
  /** The earliest commitment: agreed follow-up, first-response promise or next task. */
  readonly commitmentDue: DueView | null;
  readonly deliveryProblem: boolean;
}

export interface InboxPage {
  readonly view: InboxView;
  readonly rows: readonly InboxRow[];
  readonly nextCursor: string | null;
  readonly counts: Readonly<Record<InboxView, number>>;
}

// O03 Inquiry workspace (F18, L08, A43).

export type InquiryCommand =
  | "claim"
  | "assign"
  | "draft_reply"
  | "send_reply"
  | "record_first_response"
  | "mark_awaiting_client"
  | "resolve_without_case"
  | "link_to_case"
  | "create_case"
  | "set_next_action";

export interface ConversationMessage {
  readonly id: string;
  readonly version: number;
  readonly kind: MessageKind;
  readonly direction: MessageDirection;
  readonly channel: MessageChannel;
  readonly state: MessageState;
  /** The live delivery state from the outbox once queued, otherwise the message state. */
  readonly deliveryState: MessageState;
  readonly deliveryErrorCode: string | null;
  readonly author: { readonly kind: string; readonly id: string; readonly name: string | null };
  /** The human who approved the send; differs from the author for an AI draft. */
  readonly sentBy: OwnerRef | null;
  readonly draftedByAi: boolean;
  readonly subject: string | null;
  readonly body: string;
  readonly createdAt: string;
}

export interface ListingSummary {
  readonly id: string;
  readonly reference: string;
  readonly purpose: string;
  readonly commercialState: string;
  readonly propertyType: string;
  readonly settlement: string;
  readonly region: string;
  readonly price: {
    readonly state: string;
    readonly amountMinor: number | null;
    readonly currency: string | null;
    readonly period: string | null;
  } | null;
}

export interface IdentitySuggestion {
  readonly personId: string;
  readonly name: string;
  /** Which channel kind matched; the matched value is the inquiry's own route. */
  readonly matchedOn: ContactMethodKind;
  readonly channelVerified: boolean;
}

export interface CaseSuggestion {
  readonly case: RecordRef;
  readonly kind: string;
  readonly stage: string;
  readonly owner: OwnerRef | null;
  readonly viaPersonId: string;
}

export interface NextActionView {
  readonly task: RecordRef;
  readonly title: string;
  readonly due: DueView | null;
  readonly owner: OwnerRef | null;
  readonly commitment: CommitmentKind;
}

export interface InquiryWorkspace {
  readonly inquiry: RecordRef;
  readonly version: number;
  readonly state: InquiryState;
  readonly original: {
    readonly purpose: InquiryPurpose;
    readonly source: string;
    readonly submissionId: string;
    readonly context: unknown;
    readonly language: string | null;
    readonly preferredName: string | null;
    readonly message: string | null;
    readonly callbackWindow: string | null;
    readonly marketingOptIn: boolean;
    readonly receivedAt: string;
  };
  readonly contactRoute: {
    readonly contactMethodId: string;
    readonly kind: ContactMethodKind;
    readonly value: string;
    readonly verification: ContactVerificationState;
  } | null;
  readonly person: { readonly id: string; readonly name: string } | null;
  readonly owner: OwnerRef | null;
  readonly coverageQueue: string | null;
  readonly acknowledgedAt: string | null;
  readonly firstResponseAt: string | null;
  readonly followUpAt: string | null;
  readonly dispositionReason: string | null;
  readonly linkedCase: RecordRef | null;
  readonly conversation: readonly ConversationMessage[];
  readonly suggestions: {
    readonly persons: readonly IdentitySuggestion[];
    readonly cases: readonly CaseSuggestion[];
    readonly duplicateInquiries: readonly {
      readonly inquiry: RecordRef;
      readonly state: InquiryState;
      readonly receivedAt: string;
    }[];
  };
  readonly listing: ListingSummary | null;
  /** Targets the transition table and this actor's capabilities allow now. */
  readonly allowedTransitions: readonly InquiryState[];
  readonly commands: readonly InquiryCommand[];
  readonly nextAction: NextActionView | null;
  readonly openTaskCount: number;
}

// O06 Contact record (read).

export interface ContactChannelView {
  readonly id: string;
  readonly kind: ContactMethodKind;
  /** Omitted (null) unless the actor may contact the person. */
  readonly value: string | null;
  readonly verification: ContactVerificationState;
  readonly verifiedAt: string | null;
  /** Omitted (null) unless the actor sends messages or manages privacy. */
  readonly consents:
    | readonly {
        readonly purpose: ConsentPurpose;
        readonly state: ConsentState;
        readonly recordedAt: string;
      }[]
    | null;
}

export interface ContactRelationshipView {
  readonly id: string;
  readonly role: PartyRelationshipRole;
  readonly case: RecordRef | null;
  readonly property: RecordRef | null;
  readonly authority: AuthorityState;
  /** Omitted (null) without internal case access. */
  readonly authorityReviewedBy: OwnerRef | null;
  readonly validFrom: string;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
}

export interface ContactRecord {
  readonly person: RecordRef;
  readonly version: number;
  readonly displayName: string;
  readonly givenName: string | null;
  readonly familyName: string | null;
  readonly preferredLocale: string | null;
  /** Set when this person was merged; the UI follows it. */
  readonly mergedInto: RecordRef | null;
  readonly channels: readonly ContactChannelView[];
  readonly relationships: readonly ContactRelationshipView[];
  readonly inquiries: readonly {
    readonly inquiry: RecordRef;
    readonly state: InquiryState;
    readonly purpose: InquiryPurpose;
    readonly receivedAt: string;
    readonly owner: OwnerRef | null;
  }[];
  readonly cases: readonly {
    readonly case: RecordRef;
    readonly kind: string;
    readonly stage: string;
    readonly owner: OwnerRef | null;
  }[];
  /** Field paths left out for this actor, e.g. `channels.value`. */
  readonly restricted: readonly string[];
}

// O18 Tasks (§07.6, §19.2 "Task").

export interface TaskRow {
  readonly task: RecordRef;
  readonly version: number;
  readonly title: string;
  readonly purpose: string | null;
  readonly type: TaskType;
  readonly commitment: CommitmentKind;
  readonly state: TaskState;
  readonly owner: OwnerRef | null;
  /** Handoff awaiting acceptance by the receiving owner. */
  readonly pendingOwner: OwnerRef | null;
  readonly due: DueView | null;
  readonly dueTimezone: string | null;
  readonly waitingOn: string | null;
  /** Follow-up for a waiting task, or the review point of a snoozed one. */
  readonly reviewAt: string | null;
  readonly evidenceRequired: boolean;
  /** Excluded from any generic "complete all". */
  readonly highImpact: boolean;
  readonly outcomeNote: string | null;
  readonly completedAt: string | null;
  readonly records: readonly RecordRef[];
}
