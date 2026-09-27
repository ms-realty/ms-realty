// Capability checks over records (architecture §8.2). Effective grants combine role presets
// and single-capability grants (optionally narrowed to one record or locale) with Case
// participation and property relationships, which give clients access to exactly the cases and
// properties they are part of. The AI service is draft-only whatever it is granted (AT52).
import "server-only";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import {
  caseParticipants,
  grants as grantRows,
  principals,
  propertyRelationships,
  staffMemberships,
} from "@/db/schema";
import {
  type Actor,
  type Capability,
  type CapabilityContext,
  type CapabilityGrant,
  type CapabilityScope,
  capabilities,
  hasCapability,
  type Role,
  rolePresets,
  systemJobCapabilities,
} from "@/domain/capabilities";
import type { PublicLocale } from "@/domain/ids";
import type { Audience, ParticipantRole } from "@/domain/parties";
import type { Executor } from "./db";
import { AppError } from "./errors";

/** The record a check is about. Parent ids let case- or property-level access cover it. */
export interface Resource {
  readonly type: string;
  readonly id?: string;
  readonly locale?: PublicLocale;
  readonly caseId?: string;
  /** Covers the record only when it belongs to the property itself (see propertyRecordTypes). */
  readonly propertyId?: string;
  /** Who the record is for; internal records are never reachable by clients or visitors. */
  readonly audience?: Audience;
}

/**
 * Records that belong to a property itself. Property-level access reaches only these: cases,
 * documents and proposals that merely name the property belong to their own parties (§03).
 */
const propertyRecordTypes: readonly string[] = ["property", "listing"];

const sellerSideRoles: readonly ParticipantRole[] = [
  "seller",
  "landlord",
  "authorized_representative",
];

/** Acting for a principal: only principals respond to proposals or approve listings. */
const principalOnly: readonly Capability[] = [
  "portal.brief.acknowledge",
  "portal.proposal.respond",
  "portal.listing.acknowledge",
];

/**
 * Invited, non-principal parties get exactly what the invitation grants on top of a floor
 * (§03): an adviser or a stay guest is not automatically authorized for the whole case.
 */
const invitedRolePresets: Partial<Record<ParticipantRole, readonly Capability[]>> = {
  collaborator: rolePresets.invited_collaborator,
  adviser: rolePresets.invited_collaborator,
  guest: ["portal.case.read"],
  specialist: rolePresets.external_specialist,
};

/** Capabilities a party relationship confers on its case or property. */
export function relationshipCapabilities(
  role: ParticipantRole,
  authorityReviewed: boolean,
  invited: readonly Capability[],
): readonly Capability[] {
  const floor = invitedRolePresets[role];
  if (floor) {
    // Invitations may widen an invited party only within the client portal.
    const portal = invited.filter((c) => c.startsWith("portal.") && !principalOnly.includes(c));
    return [...floor, ...portal];
  }
  return rolePresets.verified_client.filter(
    // Acknowledging a listing preview needs seller-side authority that staff reviewed (AT18).
    (c) =>
      (c !== "portal.listing.acknowledge" ||
        (sellerSideRoles.includes(role) && authorityReviewed)) &&
      (c !== "portal.brief.acknowledge" ||
        ["buyer", "co_buyer", "tenant", "seller", "landlord"].includes(role)),
  );
}

function isCapability(value: unknown): value is Capability {
  return typeof value === "string" && (capabilities as readonly string[]).includes(value);
}

interface InvitationScope {
  capabilities?: unknown;
  resources?: unknown;
}

function scopedTo(
  recordType: string | null,
  recordId: string | null,
  locales: readonly PublicLocale[] | null,
  expiresAt: Date | null,
): CapabilityScope | undefined {
  const scope: CapabilityScope = {
    ...(recordType ? { recordType } : {}),
    ...(recordId ? { recordId } : {}),
    ...(locales?.length ? { locales } : {}),
    ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
  };
  return Object.keys(scope).length ? scope : undefined;
}

function expandGrant(row: typeof grantRows.$inferSelect): CapabilityGrant[] {
  const scope = scopedTo(row.recordType, row.recordId, row.locales, row.expiresAt);
  const granted: readonly Capability[] = row.role
    ? rolePresets[row.role as Role]
    : row.capability
      ? [row.capability]
      : [];
  return granted.map((capability) => (scope ? { capability, scope } : { capability }));
}

const liveGrant = (now: Date) =>
  and(isNull(grantRows.revokedAt), or(isNull(grantRows.expiresAt), gt(grantRows.expiresAt, now)));

/** Every grant the actor holds right now, each with its record/locale/expiry scope. */
export async function resolveGrants(
  db: Executor,
  actor: Actor,
  now: Date = new Date(),
): Promise<CapabilityGrant[]> {
  switch (actor.kind) {
    case "visitor":
      return rolePresets.visitor.map((capability) => ({ capability }));
    case "system":
      // Each background job holds only the capabilities of the transitions it reports on; the
      // transition guards still require its recorded evidence (release outcomes, scan result).
      return (systemJobCapabilities[actor.id] ?? []).map((capability) => ({ capability }));
    case "ai_service": {
      const rows = await db
        .select()
        .from(grantRows)
        .where(and(eq(grantRows.serviceName, actor.id), liveGrant(now)));
      return rows.flatMap(expandGrant);
    }
    case "staff": {
      // Staff access needs an active staff principal with an active membership (§8.1).
      const [account] = await db
        .select({
          status: principals.status,
          kind: principals.kind,
          membership: staffMemberships.state,
        })
        .from(principals)
        .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
        .where(eq(principals.id, actor.id));
      if (account?.status !== "active" || account.kind !== "staff") return [];
      if (account.membership !== "active") return [];
      const rows = await db
        .select()
        .from(grantRows)
        .where(and(eq(grantRows.principalId, actor.id), liveGrant(now)));
      return rows.flatMap(expandGrant);
    }
    case "client": {
      const [account] = await db
        .select({ status: principals.status, kind: principals.kind, partyId: principals.partyId })
        .from(principals)
        .where(eq(principals.id, actor.id));
      if (account?.status !== "active" || account.kind !== "client") return [];
      const rows = await db
        .select()
        .from(grantRows)
        .where(and(eq(grantRows.principalId, actor.id), liveGrant(now)));
      // Client grants are always record-scoped; an unscoped one would reach every case.
      const grants = rows.filter((row) => row.recordId).flatMap(expandGrant);
      const participations = await db
        .select()
        .from(caseParticipants)
        .where(
          and(
            eq(caseParticipants.partyId, account.partyId),
            isNull(caseParticipants.revokedAt),
            lte(caseParticipants.validFrom, now),
            or(isNull(caseParticipants.expiresAt), gt(caseParticipants.expiresAt, now)),
          ),
        );
      const propertyLinks = await db
        .select()
        .from(propertyRelationships)
        .where(
          and(
            eq(propertyRelationships.partyId, account.partyId),
            isNull(propertyRelationships.revokedAt),
            lte(propertyRelationships.validFrom, now),
            or(isNull(propertyRelationships.expiresAt), gt(propertyRelationships.expiresAt, now)),
          ),
        );
      const relationships = [
        ...participations.map((p) => ({ ...p, target: ["case", p.caseId] as [string, string] })),
        ...propertyLinks.map((p) => ({
          ...p,
          target: ["property", p.propertyId] as [string, string],
        })),
      ];
      for (const rel of relationships) {
        // Specialist access is time-limited by definition; without an expiry it grants nothing.
        if (rel.role === "specialist" && !rel.expiresAt) continue;
        const invitation = (rel.scope ?? {}) as InvitationScope;
        const invited = Array.isArray(invitation.capabilities)
          ? invitation.capabilities.filter(isCapability)
          : [];
        const conferred = relationshipCapabilities(rel.role, rel.authority === "reviewed", invited);
        const targets: Array<[string, string]> = Array.isArray(invitation.resources)
          ? invitation.resources.flatMap((r: { type?: unknown; id?: unknown }) =>
              typeof r?.type === "string" && typeof r?.id === "string" ? [[r.type, r.id]] : [],
            )
          : [rel.target];
        for (const [recordType, recordId] of targets) {
          const scope = scopedTo(recordType, recordId, null, rel.expiresAt);
          for (const capability of conferred) grants.push({ capability, scope });
        }
      }
      return grants;
    }
  }
}

function contextsFor(resource: Resource | undefined, now: Date): CapabilityContext[] {
  const base = { now: now.toISOString(), ...(resource?.locale ? { locale: resource.locale } : {}) };
  if (!resource) return [base];
  return [
    { ...base, recordType: resource.type, ...(resource.id ? { recordId: resource.id } : {}) },
    ...(resource.caseId ? [{ ...base, recordType: "case", recordId: resource.caseId }] : []),
    ...(resource.propertyId && propertyRecordTypes.includes(resource.type)
      ? [{ ...base, recordType: "property", recordId: resource.propertyId }]
      : []),
  ];
}

const clientSideActors: readonly Actor["kind"][] = ["client", "visitor"];

function allows(
  actor: Actor,
  grants: readonly CapabilityGrant[],
  capability: Capability,
  resource: Resource | undefined,
  now: Date,
): boolean {
  if (resource?.audience === "internal" && clientSideActors.includes(actor.kind)) return false;
  return contextsFor(resource, now).some((ctx) => hasCapability(actor, grants, capability, ctx));
}

/** Whether `actor` may use `capability` on `resource` now. */
export async function can(
  db: Executor,
  actor: Actor,
  capability: Capability,
  resource?: Resource,
  now: Date = new Date(),
): Promise<boolean> {
  return allows(actor, await resolveGrants(db, actor, now), capability, resource, now);
}

/**
 * The actor's grants that reach `resource`, restated as grants on the record itself so the
 * domain transition contract can check them against the record (locale scope is kept).
 */
export async function grantsFor(
  db: Executor,
  actor: Actor,
  resource: Resource,
  now: Date = new Date(),
): Promise<CapabilityGrant[]> {
  const grants = await resolveGrants(db, actor, now);
  return grants
    .filter((grant) => allows(actor, [grant], grant.capability, resource, now))
    .map((grant) =>
      grant.scope?.locales
        ? { capability: grant.capability, scope: { locales: grant.scope.locales } }
        : { capability: grant.capability },
    );
}

/** Throws `forbidden` unless allowed. For actions on records the actor can already see. */
export async function assertCan(
  db: Executor,
  actor: Actor,
  capability: Capability,
  resource?: Resource,
  now?: Date,
): Promise<void> {
  if (!(await can(db, actor, capability, resource, now))) throw new AppError("forbidden");
}

/** Throws `not_found` unless allowed, so a private record's existence is not revealed. */
export async function assertCanRead(
  db: Executor,
  actor: Actor,
  capability: Capability,
  resource: Resource,
  now?: Date,
): Promise<void> {
  if (!(await can(db, actor, capability, resource, now))) throw new AppError("not_found");
}
