// O03 Inquiry workspace (spec F18 steps 2–7, L08, A42, A43): the original request, the
// conversation with delivery states, suggested identity and case matches (proposals only,
// never merged), the related listing, and what this actor may do next.
import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import {
  approvals,
  cases,
  contactMethods,
  inquiries,
  listingSearchDocuments,
  listings,
  messages,
  outboxMessages,
  partyRelationships,
  persons,
  properties,
} from "@/db/schema";
import { type Actor, type Capability, hasCapability } from "@/domain/capabilities";
import { type InquiryState, inquiryMachine, inquiryTransitions } from "@/domain/inquiry";
import type { MessageState } from "@/domain/message";
import { assertCanRead, can, grantsFor } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import {
  dueView,
  inquiryResource,
  openInquiryStates,
  ownerRef,
  recordId,
  ref,
  requireStaff,
  respondingStates,
  staffNames,
} from "./shared";
import { nextTaskFor, openTaskCount } from "./tasks";
import type {
  CaseSuggestion,
  ConversationMessage,
  IdentitySuggestion,
  InquiryCommand,
  InquiryWorkspace,
  ListingSummary,
} from "./types";

const closedCaseStages = ["closed", "completed", "completion_handover", "failed"];

export async function getInquiryWorkspace(
  db: Executor,
  actor: Actor,
  input: { inquiryId: string; now?: Date },
): Promise<InquiryWorkspace> {
  requireStaff(actor);
  const now = input.now ?? new Date();
  const [inquiry] = await db
    .select()
    .from(inquiries)
    .where(eq(inquiries.id, recordId(input.inquiryId)));
  if (!inquiry) throw new AppError("not_found");
  const resource = inquiryResource(inquiry);
  await assertCanRead(db, actor, "inquiry.read", resource, now);

  const [route] = inquiry.contactMethodId
    ? await db.select().from(contactMethods).where(eq(contactMethods.id, inquiry.contactMethodId))
    : [];
  const personId = inquiry.personId ?? route?.personId ?? null;
  const [person] = personId
    ? await db
        .select({ id: persons.id, name: persons.displayName })
        .from(persons)
        .where(eq(persons.id, personId))
    : [];
  const [linkedCase] = inquiry.caseId
    ? await db
        .select({ id: cases.id, reference: cases.reference })
        .from(cases)
        .where(eq(cases.id, inquiry.caseId))
    : [];

  const conversation = await conversationOf(db, inquiry.id);
  const suggestions = await suggestionsFor(db, actor, inquiry, route ?? null, personId, now);
  const listing = inquiry.listingId ? await listingSummary(db, inquiry.listingId) : null;

  const grants = await grantsFor(db, actor, resource, now);
  const holds = (capability: Capability) =>
    hasCapability(actor, grants, capability, {
      recordType: "inquiry",
      recordId: inquiry.id,
      now: now.toISOString(),
    });
  const allowedTransitions = inquiryMachine.transitions[inquiry.state].filter((to) =>
    holds(inquiryTransitions.capabilityFor(inquiry.state, to, actor)),
  );
  const commands = commandsFor(inquiry.state, allowedTransitions, holds);

  const next = await nextTaskFor(db, { inquiryId: inquiry.id });
  const names = await staffNames(db, [
    inquiry.ownerStaffId,
    next?.ownerStaffId,
    ...suggestions.cases.map((c) => c.ownerId),
  ]);

  return {
    inquiry: ref("inquiry", inquiry.id, inquiry.reference),
    version: inquiry.version,
    state: inquiry.state,
    original: {
      purpose: inquiry.purpose,
      source: inquiry.source,
      submissionId: inquiry.submissionId,
      context: inquiry.context,
      language: inquiry.preferredLocale,
      preferredName: inquiry.preferredName,
      message: inquiry.message,
      callbackWindow: inquiry.callbackWindow,
      marketingOptIn: inquiry.marketingOptIn,
      receivedAt: inquiry.createdAt.toISOString(),
    },
    contactRoute: route
      ? {
          contactMethodId: route.id,
          kind: route.kind,
          value: route.value,
          verification: route.verification,
        }
      : null,
    person: person ?? null,
    owner: ownerRef(names, inquiry.ownerStaffId),
    coverageQueue: inquiry.coverageQueue,
    acknowledgedAt: inquiry.acknowledgedAt?.toISOString() ?? null,
    firstResponseAt: inquiry.firstResponseAt?.toISOString() ?? null,
    followUpAt: inquiry.followUpAt?.toISOString() ?? null,
    dispositionReason: inquiry.dispositionReason,
    linkedCase: linkedCase ? ref("case", linkedCase.id, linkedCase.reference) : null,
    conversation,
    suggestions: {
      persons: suggestions.persons,
      cases: suggestions.cases.map(
        ({ ownerId, ...c }): CaseSuggestion => ({ ...c, owner: ownerRef(names, ownerId) }),
      ),
      duplicateInquiries: suggestions.duplicates,
    },
    listing,
    allowedTransitions,
    commands,
    nextAction: next
      ? {
          task: ref("task", next.id),
          title: next.title,
          due: dueView(next.state === "waiting" ? next.followUpAt : next.dueAt, now),
          owner: ownerRef(names, next.ownerStaffId),
          commitment: next.commitment,
        }
      : null,
    openTaskCount: await openTaskCount(db, inquiry.id),
  };
}

function commandsFor(
  state: InquiryState,
  transitions: readonly InquiryState[],
  holds: (capability: Capability) => boolean,
): InquiryCommand[] {
  const open = openInquiryStates.includes(state);
  const responding = respondingStates.includes(state);
  const available: Record<InquiryCommand, boolean> = {
    claim: transitions.includes("assigned"),
    assign: open && holds("inquiry.assign"),
    draft_reply: open && holds("message.draft"),
    send_reply: responding && holds("inquiry.respond") && holds("message.send_external"),
    record_first_response: responding && holds("inquiry.respond"),
    mark_awaiting_client: transitions.includes("awaiting_client"),
    resolve_without_case: transitions.includes("resolved_without_case"),
    link_to_case: transitions.includes("case_linked") && holds("case.read"),
    create_case: transitions.includes("case_linked") && holds("case.transition"),
    set_next_action: open && holds("task.manage"),
  };
  return (Object.keys(available) as InquiryCommand[]).filter((command) => available[command]);
}

async function conversationOf(db: Executor, inquiryId: string): Promise<ConversationMessage[]> {
  const rows = await db
    .select({
      message: messages,
      sentById: approvals.decidedById,
      sentByKind: approvals.decidedByKind,
    })
    .from(messages)
    .leftJoin(approvals, eq(approvals.id, messages.approvalId))
    .where(eq(messages.inquiryId, inquiryId))
    .orderBy(asc(messages.createdAt), asc(messages.id));
  const ids = rows.map((r) => r.message.id);
  const deliveries = ids.length
    ? await db
        .select({
          messageId: outboxMessages.messageId,
          state: outboxMessages.state,
          errorCode: outboxMessages.lastErrorCode,
        })
        .from(outboxMessages)
        .where(inArray(outboxMessages.messageId, ids))
        .orderBy(desc(outboxMessages.createdAt))
    : [];
  const delivery = new Map<string, { state: MessageState; errorCode: string | null }>();
  for (const d of deliveries) {
    if (d.messageId && !delivery.has(d.messageId)) {
      delivery.set(d.messageId, { state: d.state, errorCode: d.errorCode });
    }
  }
  const names = await staffNames(
    db,
    rows.flatMap((r) => [
      r.message.authorKind === "staff" ? r.message.authorId : null,
      r.sentByKind === "staff" ? r.sentById : null,
    ]),
  );
  return rows.map(({ message: m, sentById, sentByKind }) => {
    const live = delivery.get(m.id);
    return {
      id: m.id,
      version: m.version,
      kind: m.kind,
      direction: m.direction,
      channel: m.channel,
      state: m.state,
      deliveryState: live?.state ?? m.state,
      deliveryErrorCode: live?.errorCode ?? null,
      author: {
        kind: m.authorKind,
        id: m.authorId,
        name: m.authorKind === "staff" ? (names.get(m.authorId) ?? null) : null,
      },
      sentBy: sentByKind === "staff" ? ownerRef(names, sentById) : null,
      draftedByAi: m.draftedByAi,
      subject: m.subject,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  });
}

/**
 * Other people sharing the inquiry's contact route, their open cases and other open inquiries
 * from the same route. Names and references only: no further contact data is disclosed.
 */
async function suggestionsFor(
  db: Executor,
  actor: Actor,
  inquiry: typeof inquiries.$inferSelect,
  route: typeof contactMethods.$inferSelect | null,
  personId: string | null,
  now: Date,
) {
  const matches = route
    ? await db
        .select({
          personId: persons.id,
          name: persons.displayName,
          kind: contactMethods.kind,
          verification: contactMethods.verification,
        })
        .from(contactMethods)
        .innerJoin(persons, eq(persons.id, contactMethods.personId))
        .where(
          and(
            eq(contactMethods.kind, route.kind),
            eq(contactMethods.normalizedValue, route.normalizedValue),
            isNull(persons.mergedIntoPersonId),
            personId ? ne(persons.id, personId) : undefined,
          ),
        )
    : [];
  const personSuggestions = new Map<string, IdentitySuggestion>();
  for (const m of matches) {
    const existing = personSuggestions.get(m.personId);
    personSuggestions.set(m.personId, {
      personId: m.personId,
      name: m.name,
      matchedOn: m.kind,
      channelVerified: existing?.channelVerified || m.verification === "verified",
    });
  }

  const people = [...(personId ? [personId] : []), ...personSuggestions.keys()];
  const caseRows = people.length
    ? await db
        .selectDistinctOn([cases.id], {
          id: cases.id,
          reference: cases.reference,
          kind: cases.kind,
          stage: cases.stage,
          ownerId: cases.ownerStaffId,
          viaPersonId: partyRelationships.personId,
        })
        .from(partyRelationships)
        .innerJoin(cases, eq(cases.id, partyRelationships.caseId))
        .where(
          and(
            inArray(partyRelationships.personId, people),
            isNull(partyRelationships.revokedAt),
            notInArray(cases.stage, closedCaseStages),
            inquiry.caseId ? ne(cases.id, inquiry.caseId) : undefined,
          ),
        )
        .orderBy(cases.id)
    : [];
  const caseSuggestions: Array<Omit<CaseSuggestion, "owner"> & { ownerId: string | null }> = [];
  for (const c of caseRows) {
    if (!(await can(db, actor, "case.read", { type: "case", id: c.id }, now))) continue;
    caseSuggestions.push({
      case: ref("case", c.id, c.reference),
      kind: c.kind,
      stage: c.stage,
      ownerId: c.ownerId,
      viaPersonId: c.viaPersonId as string,
    });
  }

  const sameRoute = route
    ? db
        .select({ id: contactMethods.id })
        .from(contactMethods)
        .where(
          and(
            eq(contactMethods.kind, route.kind),
            eq(contactMethods.normalizedValue, route.normalizedValue),
          ),
        )
    : null;
  const duplicateRows =
    sameRoute || personId
      ? await db
          .select({
            id: inquiries.id,
            reference: inquiries.reference,
            state: inquiries.state,
            createdAt: inquiries.createdAt,
          })
          .from(inquiries)
          .where(
            and(
              ne(inquiries.id, inquiry.id),
              inArray(inquiries.state, [...openInquiryStates]),
              or(
                sameRoute ? inArray(inquiries.contactMethodId, sameRoute) : undefined,
                personId ? eq(inquiries.personId, personId) : undefined,
              ),
            ),
          )
          .orderBy(desc(inquiries.createdAt))
          .limit(10)
      : [];

  return {
    persons: [...personSuggestions.values()],
    cases: caseSuggestions,
    duplicates: duplicateRows.map((d) => ({
      inquiry: ref("inquiry", d.id, d.reference),
      state: d.state,
      receivedAt: d.createdAt.toISOString(),
    })),
  };
}

async function listingSummary(db: Executor, listingId: string): Promise<ListingSummary | null> {
  const [row] = await db
    .select({
      id: listings.id,
      reference: listings.reference,
      purpose: listings.purpose,
      commercialState: listings.commercialState,
      propertyType: properties.propertyType,
      settlement: properties.settlement,
      region: properties.region,
      priceState: listingSearchDocuments.priceState,
      priceAmountMinor: listingSearchDocuments.priceAmountMinor,
      priceCurrency: listingSearchDocuments.priceCurrency,
      pricePeriod: listingSearchDocuments.pricePeriod,
    })
    .from(listings)
    .innerJoin(properties, eq(properties.id, listings.propertyId))
    .leftJoin(listingSearchDocuments, eq(listingSearchDocuments.listingId, listings.id))
    .where(eq(listings.id, listingId));
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    purpose: row.purpose,
    commercialState: row.commercialState,
    propertyType: row.propertyType,
    settlement: row.settlement,
    region: row.region,
    price: row.priceState
      ? {
          state: row.priceState,
          amountMinor: row.priceAmountMinor,
          currency: row.priceCurrency,
          period: row.pricePeriod,
        }
      : null,
  };
}
