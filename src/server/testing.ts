// Fixtures for src/server integration tests. Test data only: example.test addresses, no
// real people.
import { randomUUID } from "node:crypto";
import {
  caseParticipants,
  cases,
  grants,
  parties,
  principals,
  properties,
  propertyRelationships,
  staffMemberships,
} from "@/db/schema";
import type { Actor, Capability, Role } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import type { AuthorityState, ParticipantRole } from "@/domain/parties";
import { firstPartyIssuers } from "@/domain/records";
import type { Executor } from "./db";

let sequence = 0;
const next = () => {
  sequence += 1;
  return `${Date.now().toString(36)}${sequence}`;
};

export interface GrantSpec {
  readonly role?: Role;
  readonly capability?: Capability;
  readonly recordType?: string;
  readonly recordId?: string;
  readonly locales?: PublicLocale[];
  readonly expiresAt?: Date;
}

async function party(db: Executor, name: string): Promise<string> {
  const [row] = await db
    .insert(parties)
    .values({ kind: "person", displayName: name })
    .returning({ id: parties.id });
  if (!row) throw new Error("party insert failed");
  return row.id;
}

async function principal(
  db: Executor,
  kind: "staff" | "client",
  email: string,
  status: "active" | "suspended",
): Promise<{ id: string; partyId: string }> {
  const partyId = await party(db, kind === "staff" ? "Test Staff" : "Test Client");
  const [row] = await db
    .insert(principals)
    .values({
      kind,
      issuer: firstPartyIssuers[kind],
      subject: randomUUID(),
      partyId,
      email,
      displayName: kind === "staff" ? "Test Staff" : "Test Client",
      status,
    })
    .returning({ id: principals.id });
  if (!row) throw new Error("principal insert failed");
  return { id: row.id, partyId };
}

export async function createStaff(
  db: Executor,
  options: {
    roles?: Role[];
    grants?: GrantSpec[];
    email?: string;
    status?: "active" | "suspended";
    membership?: "active" | "suspended" | "ended";
  } = {},
): Promise<{ id: string; email: string; actor: Actor }> {
  const email = options.email ?? `staff-${next()}@example.test`;
  const { id } = await principal(db, "staff", email, options.status ?? "active");
  await db
    .insert(staffMemberships)
    .values({ principalId: id, state: options.membership ?? "active" });
  const specs: GrantSpec[] = [
    ...(options.roles ?? []).map((role) => ({ role })),
    ...(options.grants ?? []),
  ];
  for (const grant of specs) {
    await db.insert(grants).values({
      principalId: id,
      role: grant.role,
      capability: grant.capability,
      recordType: grant.recordType,
      recordId: grant.recordId,
      locales: grant.locales,
      expiresAt: grant.expiresAt,
      reason: "test fixture",
    });
  }
  return { id, email, actor: { kind: "staff", id } };
}

export async function createClient(
  db: Executor,
  options: { email?: string; status?: "active" | "suspended" } = {},
): Promise<{ id: string; partyId: string; email: string; actor: Actor }> {
  const email = options.email ?? `client-${next()}@example.test`;
  const { id, partyId } = await principal(db, "client", email, options.status ?? "active");
  return { id, partyId, email, actor: { kind: "client", id } };
}

export async function grantService(db: Executor, serviceName: string, grant: GrantSpec) {
  await db.insert(grants).values({
    serviceName,
    role: grant.role,
    capability: grant.capability,
    reason: "test fixture",
  });
}

/** An active buyer case; every active case has an accountable owner and a next action. */
export async function createCase(db: Executor, ownerId?: string): Promise<string> {
  const owner = ownerId ?? (await createStaff(db, { roles: ["assigned_broker"] })).id;
  const [row] = await db
    .insert(cases)
    .values({
      reference: `CS-2026-${next()}`,
      kind: "buyer",
      stage: "needs_agreed",
      title: "Test buyer case",
      ownerId: owner,
      nextAction: "Agree the brief",
    })
    .returning({ id: cases.id });
  if (!row) throw new Error("case insert failed");
  return row.id;
}

export async function createProperty(db: Executor): Promise<string> {
  const [row] = await db
    .insert(properties)
    .values({
      reference: `PR-2026-${next()}`,
      propertyType: "apartment",
      country: "BG",
      region: "Blagoevgrad",
      settlement: "Sandanski",
    })
    .returning({ id: properties.id });
  if (!row) throw new Error("property insert failed");
  return row.id;
}

/** Relates a party to a case (CaseParticipant) or to a property (PropertyRelationship). */
export async function relate(
  db: Executor,
  options: {
    partyId: string;
    role: ParticipantRole;
    caseId?: string;
    propertyId?: string;
    authority?: AuthorityState;
    reviewedBy?: string;
    scope?: Record<string, unknown>;
    expiresAt?: Date;
    revokedAt?: Date;
  },
): Promise<string> {
  const reviewed = options.authority === "reviewed";
  const common = {
    partyId: options.partyId,
    role: options.role,
    authorityReviewedById: reviewed ? options.reviewedBy : undefined,
    authorityReviewedAt: reviewed ? new Date() : undefined,
    scope: options.scope ?? {},
    expiresAt: options.expiresAt,
    revokedAt: options.revokedAt,
  };
  if (options.caseId) {
    const [row] = await db
      .insert(caseParticipants)
      .values({ ...common, caseId: options.caseId, authority: options.authority ?? "not_claimed" })
      .returning({ id: caseParticipants.id });
    if (!row) throw new Error("participant insert failed");
    return row.id;
  }
  if (!options.propertyId) throw new Error("relate needs a caseId or a propertyId");
  const [row] = await db
    .insert(propertyRelationships)
    .values({
      ...common,
      propertyId: options.propertyId,
      authority: options.authority ?? "self_declared",
    })
    .returning({ id: propertyRelationships.id });
  if (!row) throw new Error("relationship insert failed");
  return row.id;
}

export const uuid = () => randomUUID();
