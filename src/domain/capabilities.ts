// Capability catalog and role presets (spec §03, AD5, AD14).
import type { PublicLocale } from "./ids";

export const capabilities = [
  // Visitors and clients (always record-scoped for clients).
  "inquiry.submit",
  "portal.case.read",
  "portal.shortlist.manage",
  "portal.message.write",
  "portal.document.upload",
  "portal.appointment.request",
  "portal.proposal.respond",
  "portal.listing.approve",
  // Agency work.
  "inquiry.read",
  "inquiry.assign",
  "inquiry.respond",
  "case.read",
  "case.read_internal",
  "case.transition",
  "task.manage",
  "match.manage",
  "listing.read",
  "listing.edit",
  "listing.review_facts",
  "media.manage",
  "translation.draft",
  "translation.review",
  "publication.release",
  "content.edit",
  // Legal/tax/process claims: granted individually to qualified people, never by a preset.
  "claim.approve",
  "message.draft",
  "message.send_external",
  "appointment.manage",
  "document.read_restricted",
  "document.review",
  "proposal.manage",
  "service_request.manage",
  "spending.approve",
  "reservation.manage",
  "access.grant",
  "report.read",
  "settings.manage",
  "import.run",
  "privacy.manage",
  "audit.read",
  "ai.draft",
] as const;
export type Capability = (typeof capabilities)[number];

/** Capabilities that only ever produce drafts. Everything else is consequential. */
export const draftOnlyCapabilities = [
  "ai.draft",
  "translation.draft",
  "message.draft",
] as const satisfies readonly Capability[];

/** Capabilities whose grant may be narrowed to a set of locales. */
export const localeScopedCapabilities = [
  "translation.draft",
  "translation.review",
] as const satisfies readonly Capability[];

export const roles = [
  "visitor",
  "verified_client",
  "invited_collaborator",
  "assigned_broker",
  "coordinator",
  "content_editor",
  "translation_reviewer",
  "publishing_approver",
  "manager",
  "external_specialist",
  "ai_service",
] as const;
export type Role = (typeof roles)[number];

export const rolePresets: Record<Role, readonly Capability[]> = {
  visitor: ["inquiry.submit"],
  verified_client: [
    "inquiry.submit",
    "portal.case.read",
    "portal.shortlist.manage",
    "portal.message.write",
    "portal.document.upload",
    "portal.appointment.request",
    "portal.proposal.respond",
    "portal.listing.approve",
  ],
  // Exactly what the invitation grants; the preset is the floor, never household-wide access.
  invited_collaborator: ["portal.case.read", "portal.shortlist.manage"],
  assigned_broker: [
    "inquiry.read",
    "inquiry.assign",
    "inquiry.respond",
    "case.read",
    "case.read_internal",
    "case.transition",
    "task.manage",
    "match.manage",
    "listing.read",
    "listing.edit",
    "media.manage",
    "translation.draft",
    "message.draft",
    "message.send_external",
    "appointment.manage",
    "document.read_restricted",
    "proposal.manage",
    "ai.draft",
  ],
  // Scheduling without reading confidential documents.
  coordinator: [
    "inquiry.read",
    "case.read",
    "task.manage",
    "listing.read",
    "appointment.manage",
    "message.draft",
    "service_request.manage",
    "reservation.manage",
  ],
  content_editor: [
    "listing.read",
    "listing.edit",
    "media.manage",
    "content.edit",
    "translation.draft",
    "ai.draft",
  ],
  translation_reviewer: ["listing.read", "translation.draft", "translation.review"],
  publishing_approver: ["listing.read", "listing.review_facts", "publication.release"],
  manager: [
    "inquiry.read",
    "inquiry.assign",
    "case.read",
    "case.read_internal",
    "task.manage",
    "listing.read",
    "report.read",
    "access.grant",
    "settings.manage",
    "import.run",
    "privacy.manage",
    "spending.approve",
    "audit.read",
  ],
  external_specialist: ["portal.case.read", "portal.document.upload"],
  ai_service: [...draftOnlyCapabilities],
};

/**
 * Background jobs, by actor id, and the capabilities of the transitions they report on. Their
 * guards still demand the job's recorded evidence (destination outcomes, scan result, provider
 * reference), and every human-only step stays staff-only whatever a job holds.
 */
export const systemJobCapabilities: Readonly<Record<string, readonly Capability[]>> = {
  "publication-release": ["publication.release"],
  "document-scanner": ["portal.document.upload", "document.review"],
  "message-outbox": ["message.send_external"],
  "message-provider-callback": ["message.send_external"],
  "freshness-timer": ["listing.review_facts"],
};

export interface CapabilityScope {
  /** Restricts the grant to one record; absent means every record the role reaches. */
  readonly recordType?: string;
  readonly recordId?: string;
  /** For locale-scoped capabilities; absent means every locale. */
  readonly locales?: readonly PublicLocale[];
  /** ISO 8601 instant after which the grant no longer applies. */
  readonly expiresAt?: string;
}

export interface CapabilityGrant {
  readonly capability: Capability;
  readonly scope?: CapabilityScope;
}

export const actorKinds = ["staff", "client", "visitor", "ai_service", "system"] as const;
export type ActorKind = (typeof actorKinds)[number];

export interface Actor {
  readonly kind: ActorKind;
  readonly id: string;
}

export interface CapabilityContext {
  readonly recordType?: string;
  readonly recordId?: string;
  readonly locale?: PublicLocale;
  /** ISO 8601 instant, required for grants that expire. */
  readonly now?: string;
}

export function grantsForRoles(held: readonly Role[]): CapabilityGrant[] {
  return [...new Set(held.flatMap((role) => rolePresets[role]))].map((capability) => ({
    capability,
  }));
}

export function isDraftOnly(capability: Capability): boolean {
  return (draftOnlyCapabilities as readonly Capability[]).includes(capability);
}

/**
 * Server-side capability check. The AI service never holds a consequential capability,
 * whatever grants are presented for it: content cannot confer authority (A66).
 */
export function hasCapability(
  actor: Actor,
  grants: readonly CapabilityGrant[],
  capability: Capability,
  context: CapabilityContext = {},
): boolean {
  if (actor.kind === "ai_service" && !isDraftOnly(capability)) return false;
  return grants.some((grant) => {
    if (grant.capability !== capability) return false;
    const scope = grant.scope;
    if (!scope) return true;
    // Fails closed: an expiring grant needs a clock to be honoured.
    if (
      scope.expiresAt &&
      (!context.now || Date.parse(context.now) >= Date.parse(scope.expiresAt))
    ) {
      return false;
    }
    if (scope.recordType && scope.recordType !== context.recordType) return false;
    if (scope.recordId && scope.recordId !== context.recordId) return false;
    if (scope.locales && (!context.locale || !scope.locales.includes(context.locale))) return false;
    return true;
  });
}
