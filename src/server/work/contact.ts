// O06 Contact record, read side (spec §03, §04, F18 step 3, F20): channels with verification,
// scoped relationships, and the inquiries and cases this actor may see. Verification, consent
// and authority stay separate. Fields the actor has no business need for are omitted and named
// in `restricted`; cases the actor cannot read are left out entirely.
import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  cases,
  contactConsents,
  contactMethods,
  inquiries,
  partyRelationships,
  persons,
  properties,
} from "@/db/schema";
import { type Actor, type Capability, hasCapability } from "@/domain/capabilities";
import { can, resolveGrants } from "../authz";
import type { Executor } from "../db";
import { AppError } from "../errors";
import { ownerRef, recordId, ref, requireStaff, staffNames } from "./shared";
import type { ContactChannelView, ContactRecord, ContactRelationshipView } from "./types";

/** Who may see a channel's address: people who contact or schedule with the person. */
const contactValueCapabilities: readonly Capability[] = ["message.draft", "appointment.manage"];
/** Consent matters to whoever sends messages, and to privacy work. */
const consentCapabilities: readonly Capability[] = ["message.send_external", "privacy.manage"];

export async function getContactRecord(
  db: Executor,
  actor: Actor,
  input: { personId: string; now?: Date },
): Promise<ContactRecord> {
  requireStaff(actor);
  const now = input.now ?? new Date();
  const grants = await resolveGrants(db, actor, now);
  const holds = (capability: Capability) =>
    hasCapability(actor, grants, capability, { now: now.toISOString() });
  const readsInquiries = holds("inquiry.read");
  if (!readsInquiries && !holds("case.read")) throw new AppError("not_found");

  const [person] = await db
    .select()
    .from(persons)
    .where(eq(persons.id, recordId(input.personId)));
  if (!person) throw new AppError("not_found");
  const restricted: string[] = [];

  const showValues = contactValueCapabilities.some(holds);
  const showConsents = consentCapabilities.some(holds);
  if (!showValues) restricted.push("channels.value");
  if (!showConsents) restricted.push("channels.consents");
  const methods = await db
    .select()
    .from(contactMethods)
    .where(eq(contactMethods.personId, person.id))
    .orderBy(asc(contactMethods.createdAt));
  const consents =
    showConsents && methods.length
      ? await db
          .select()
          .from(contactConsents)
          .where(
            inArray(
              contactConsents.contactMethodId,
              methods.map((m) => m.id),
            ),
          )
          .orderBy(desc(contactConsents.recordedAt))
      : [];
  const channels: ContactChannelView[] = methods.map((m) => {
    // The latest record per purpose is the current consent.
    const latest = new Map<string, (typeof consents)[number]>();
    for (const c of consents) {
      if (c.contactMethodId === m.id && !latest.has(c.purpose)) latest.set(c.purpose, c);
    }
    return {
      id: m.id,
      kind: m.kind,
      value: showValues ? m.value : null,
      verification: m.verification,
      verifiedAt: m.verifiedAt?.toISOString() ?? null,
      consents: showConsents
        ? [...latest.values()].map((c) => ({
            purpose: c.purpose,
            state: c.state,
            recordedAt: c.recordedAt.toISOString(),
          }))
        : null,
    };
  });

  const relationshipRows = await db
    .select({
      relationship: partyRelationships,
      caseReference: cases.reference,
      caseKind: cases.kind,
      caseStage: cases.stage,
      caseOwner: cases.ownerStaffId,
      propertyReference: properties.reference,
    })
    .from(partyRelationships)
    .leftJoin(cases, eq(cases.id, partyRelationships.caseId))
    .leftJoin(properties, eq(properties.id, partyRelationships.propertyId))
    .where(eq(partyRelationships.personId, person.id))
    .orderBy(asc(partyRelationships.createdAt));
  const readableCases = new Set<string>();
  for (const row of relationshipRows) {
    const caseId = row.relationship.caseId;
    if (caseId && (await can(db, actor, "case.read", { type: "case", id: caseId }, now))) {
      readableCases.add(caseId);
    }
  }
  const internal = holds("case.read_internal");
  if (!internal) restricted.push("relationships.authorityReviewedBy");

  const inquiryRows = readsInquiries
    ? await db
        .select()
        .from(inquiries)
        .where(eq(inquiries.personId, person.id))
        .orderBy(desc(inquiries.createdAt))
    : [];
  if (!readsInquiries) restricted.push("inquiries");

  const names = await staffNames(db, [
    ...relationshipRows.flatMap((r) => [
      r.caseOwner,
      internal ? r.relationship.authorityReviewedByStaffId : null,
    ]),
    ...inquiryRows.map((i) => i.ownerStaffId),
  ]);

  const visible = relationshipRows.filter(
    (row) => !row.relationship.caseId || readableCases.has(row.relationship.caseId),
  );
  const relationships: ContactRelationshipView[] = visible.map(({ relationship: r, ...row }) => ({
    id: r.id,
    role: r.role,
    case: r.caseId ? ref("case", r.caseId, row.caseReference) : null,
    property: r.propertyId ? ref("property", r.propertyId, row.propertyReference) : null,
    authority: r.authority,
    authorityReviewedBy: internal ? ownerRef(names, r.authorityReviewedByStaffId) : null,
    validFrom: r.validFrom.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
  }));

  const seen = new Set<string>();
  const caseViews = visible.flatMap((row) => {
    const id = row.relationship.caseId;
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [
      {
        case: ref("case", id, row.caseReference),
        kind: row.caseKind as string,
        stage: row.caseStage as string,
        owner: ownerRef(names, row.caseOwner),
      },
    ];
  });

  return {
    person: ref("person", person.id),
    version: person.version,
    displayName: person.displayName,
    givenName: person.givenName,
    familyName: person.familyName,
    preferredLocale: person.preferredLocale,
    mergedInto: person.mergedIntoPersonId ? ref("person", person.mergedIntoPersonId) : null,
    channels,
    relationships,
    inquiries: inquiryRows.map((i) => ({
      inquiry: ref("inquiry", i.id, i.reference),
      state: i.state,
      purpose: i.purpose,
      receivedAt: i.createdAt.toISOString(),
      owner: ownerRef(names, i.ownerStaffId),
    })),
    cases: caseViews,
    restricted,
  };
}
