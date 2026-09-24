// Fixtures for src/server integration tests. Test data only: example.test addresses, no
// real people.
import { randomUUID } from "node:crypto";
import {
  capabilityGrants,
  cases,
  clientAccounts,
  partyRelationships,
  persons,
  properties,
  staffAccounts,
} from "@/db/schema";
import type { Actor, Capability, Role } from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import type { AuthorityState, PartyRelationshipRole } from "@/domain/parties";
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

async function person(db: Executor, name: string): Promise<string> {
  const [row] = await db
    .insert(persons)
    .values({ displayName: name })
    .returning({ id: persons.id });
  if (!row) throw new Error("person insert failed");
  return row.id;
}

export async function createStaff(
  db: Executor,
  options: {
    roles?: Role[];
    grants?: GrantSpec[];
    email?: string;
    status?: "active" | "suspended";
  } = {},
): Promise<{ id: string; email: string; actor: Actor }> {
  const email = options.email ?? `staff-${next()}@example.test`;
  const [row] = await db
    .insert(staffAccounts)
    .values({
      personId: await person(db, "Test Staff"),
      email,
      displayName: "Test Staff",
      status: options.status ?? "active",
    })
    .returning({ id: staffAccounts.id });
  if (!row) throw new Error("staff insert failed");
  const grants: GrantSpec[] = [
    ...(options.roles ?? []).map((role) => ({ role })),
    ...(options.grants ?? []),
  ];
  for (const grant of grants) {
    await db.insert(capabilityGrants).values({
      staffAccountId: row.id,
      role: grant.role,
      capability: grant.capability,
      recordType: grant.recordType,
      recordId: grant.recordId,
      locales: grant.locales,
      expiresAt: grant.expiresAt,
      reason: "test fixture",
    });
  }
  return { id: row.id, email, actor: { kind: "staff", id: row.id } };
}

export async function createClient(
  db: Executor,
  options: { email?: string; status?: "active" | "suspended" } = {},
): Promise<{ id: string; personId: string; email: string; actor: Actor }> {
  const email = options.email ?? `client-${next()}@example.test`;
  const personId = await person(db, "Test Client");
  const [row] = await db
    .insert(clientAccounts)
    .values({ personId, email, status: options.status ?? "active" })
    .returning({ id: clientAccounts.id });
  if (!row) throw new Error("client insert failed");
  return { id: row.id, personId, email, actor: { kind: "client", id: row.id } };
}

export async function grantService(db: Executor, serviceName: string, grant: GrantSpec) {
  await db.insert(capabilityGrants).values({
    serviceName,
    role: grant.role,
    capability: grant.capability,
    reason: "test fixture",
  });
}

export async function createCase(db: Executor, ownerStaffId?: string): Promise<string> {
  const [row] = await db
    .insert(cases)
    .values({
      reference: `CS-2026-${next()}`,
      kind: "buyer",
      stage: "needs_agreed",
      title: "Test buyer case",
      ownerStaffId,
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

export async function relate(
  db: Executor,
  options: {
    personId: string;
    role: PartyRelationshipRole;
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
  const [row] = await db
    .insert(partyRelationships)
    .values({
      personId: options.personId,
      role: options.role,
      caseId: options.caseId,
      propertyId: options.propertyId,
      authority: options.authority ?? "not_claimed",
      authorityReviewedByStaffId: reviewed ? options.reviewedBy : undefined,
      authorityReviewedAt: reviewed ? new Date() : undefined,
      scope: options.scope ?? {},
      expiresAt: options.expiresAt,
      revokedAt: options.revokedAt,
    })
    .returning({ id: partyRelationships.id });
  if (!row) throw new Error("relationship insert failed");
  return row.id;
}

export const uuid = () => randomUUID();
