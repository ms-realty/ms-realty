// R08 C1: only revokeStaffGrant's observed grant/session denials; no restore executor.
import "server-only";
import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, grants, operations, principals, sessions } from "@/db/schema";
import { canonicalJson } from "@/domain/approval";
import { capabilities, rolePresets, roles } from "@/domain/capabilities";
import { publicLocales } from "@/domain/ids";
import { recoveryDigest } from "@/domain/recovery-archive";
import type { Transaction } from "../db";
import { type RecoverySourceContext, sourceContextDigest } from "./write-fence";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const principal = z.strictObject({ kind: z.enum(["staff", "client"]), id: z.uuid() });
const sessionIdentity = z.strictObject({
  id: z.uuid(),
  principalKind: z.enum(["staff", "client"]),
  principalId: z.uuid(),
});
const grantTarget = z.strictObject({
  kind: z.literal("grant"),
  id: z.uuid(),
  observedVersion: revision,
  version: revision,
});
const sessionTarget = sessionIdentity.extend({ kind: z.literal("session") });
/** An audit projection after the producer's checks, not independent proof of permission. */
export const grantRevocationDecision = z
  .strictObject({
    kind: z.literal("grant_revocation_server_observation_v2"),
    basis: z.literal("observed_server_checks_and_audit_projection"),
    decisionId: z.uuid(),
    operationId: z.uuid(),
    requestHash: sha,
    action: z.literal("access.capability.revoked"),
    capability: z.literal("access.grant"),
    reasonCode: z.literal("grant_revoked"),
    actor: z.strictObject({ kind: z.literal("staff"), id: z.uuid() }),
    checkedSession: sessionIdentity,
    targetPrincipal: principal,
    grant: grantTarget.extend({
      role: z.enum(roles).nullable(),
      capability: z.enum(capabilities).nullable(),
      scope: z.strictObject({
        recordType: z.string().min(1).max(80).nullable(),
        recordId: z.uuid().nullable(),
        locales: z.array(z.enum(publicLocales)).nullable(),
        expiresAt: z.iso.datetime().nullable(),
      }),
    }),
    checks: z.strictObject({
      liveFreshStaffSession: z.literal(true),
      activePasskeyMinimum: z.literal(true),
      authorityCapabilities: z.array(z.enum(capabilities)).min(1),
      usableManagerRemains: z.literal(true),
    }),
    revokedSessions: z.array(sessionIdentity),
  })
  .superRefine((body, ctx) => {
    const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
    if (
      body.checkedSession.principalKind !== "staff" ||
      body.checkedSession.principalId !== body.actor.id
    )
      invalid("Checked session differs from the staff actor.");
    if (
      body.grant.version !== body.grant.observedVersion + 1 ||
      Boolean(body.grant.role) === Boolean(body.grant.capability)
    )
      invalid("Grant revision or capability binding differs.");
    const ids = new Set<string>();
    for (const row of body.revokedSessions) {
      if (row.principalId !== body.targetPrincipal.id || ids.has(row.id))
        invalid("Revoked session principal or unique identity differs.");
      ids.add(row.id);
    }
    if (
      new Set(body.checks.authorityCapabilities).size !== body.checks.authorityCapabilities.length
    )
      invalid("Checked capabilities must be unique.");
  });
export type GrantRevocationDecision = z.infer<typeof grantRevocationDecision>;

function orderedDecision(input: GrantRevocationDecision) {
  const decision = grantRevocationDecision.parse(input);
  decision.revokedSessions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  decision.checks.authorityCapabilities.sort();
  return decision;
}
export const accessRecoveryRestriction = z
  .strictObject({
    codecVersion: z.literal(2),
    kind: z.literal("access_revocation"),
    decisionId: z.uuid(),
    authorizationDigest: sha,
    decision: grantRevocationDecision,
    principal: principal,
    target: z.discriminatedUnion("kind", [grantTarget, sessionTarget]),
  })
  .superRefine((restriction, ctx) => {
    const body = orderedDecision(restriction.decision);
    const target = restriction.target;
    const expectedTarget =
      target.kind === "grant"
        ? {
            kind: "grant",
            id: body.grant.id,
            observedVersion: body.grant.observedVersion,
            version: body.grant.version,
          }
        : body.revokedSessions.find((row) => row.id === target.id);
    const matches =
      target.kind === "grant"
        ? canonicalJson(target) === canonicalJson(expectedTarget)
        : expectedTarget &&
          canonicalJson(target) === canonicalJson({ kind: "session", ...expectedTarget });
    if (
      restriction.decisionId !== body.decisionId ||
      canonicalJson(restriction.principal) !== canonicalJson(body.targetPrincipal) ||
      !matches ||
      restriction.authorizationDigest !==
        recoveryDigest("access-grant-revocation-observation-v2", body)
    )
      ctx.addIssue({
        code: "custom",
        message: "Access denial decision or target binding differs.",
      });
  });
export type AccessRecoveryRestriction = z.infer<typeof accessRecoveryRestriction>;

/** Fixed producer: a grant transition and the exact rows returned by its session UPDATE. */
export function grantRevocationRestrictions(
  input: GrantRevocationDecision,
): AccessRecoveryRestriction[] {
  const decision = orderedDecision(input);
  const shared = {
    codecVersion: 2 as const,
    kind: "access_revocation" as const,
    decisionId: decision.decisionId,
    authorizationDigest: recoveryDigest("access-grant-revocation-observation-v2", decision),
    decision,
    principal: decision.targetPrincipal,
  };
  return [
    {
      ...shared,
      target: {
        kind: "grant",
        id: decision.grant.id,
        observedVersion: decision.grant.observedVersion,
        version: decision.grant.version,
      },
    },
    ...decision.revokedSessions.map((row) => ({
      ...shared,
      target: { kind: "session" as const, ...row },
    })),
  ];
}

export function encodeAccessRecoveryRestriction(
  context: RecoverySourceContext,
  input: AccessRecoveryRestriction,
) {
  const restriction = accessRecoveryRestriction.parse(input);
  restriction.decision = orderedDecision(restriction.decision);
  const contextDigest = sourceContextDigest(context);
  const canonicalBody = canonicalJson([
    "recovery-access-restriction-v2",
    contextDigest,
    restriction,
  ]);
  return {
    contextDigest,
    kind: restriction.kind,
    subjectDigest: recoveryDigest("access-restriction-subject-v2", [contextDigest, restriction]),
    digest: createHash("sha256").update(canonicalBody, "utf8").digest("hex"),
    canonicalBody,
    byteLength: Buffer.byteLength(canonicalBody, "utf8"),
  };
}

/** Verifies canonical bytes and recomputes the retained observation's domain-separated digest. */
export function decodeAccessRecoveryRestriction(
  context: RecoverySourceContext,
  canonicalBody: string,
) {
  const [, contextDigest, restriction] = z
    .tuple([z.literal("recovery-access-restriction-v2"), sha, accessRecoveryRestriction])
    .parse(JSON.parse(canonicalBody));
  const encoded = encodeAccessRecoveryRestriction(context, restriction);
  if (contextDigest !== encoded.contextDigest || canonicalBody !== encoded.canonicalBody)
    throw new Error("Access denial canonical bytes or source context differs.");
  return restriction;
}

/** Bind the projection to real in-transaction rows. This does not re-prove granting rows. */
export async function validateGrantRevocationDecision(
  tx: Transaction,
  input: GrantRevocationDecision,
) {
  const body = orderedDecision(input);
  const [audit] = await tx
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.id, body.decisionId))
    .for("share");
  const [operation] = await tx
    .select()
    .from(operations)
    .where(eq(operations.id, body.operationId))
    .for("share");
  const [grant] = await tx.select().from(grants).where(eq(grants.id, body.grant.id)).for("share");
  const [person] = await tx
    .select({ id: principals.id, kind: principals.kind })
    .from(principals)
    .where(eq(principals.id, body.targetPrincipal.id));
  const [checked] = await tx
    .select({
      id: sessions.id,
      principalId: sessions.principalId,
      principalKind: sessions.principalKind,
    })
    .from(sessions)
    .where(eq(sessions.id, body.checkedSession.id));
  const changed = body.revokedSessions.length
    ? await tx
        .select({
          id: sessions.id,
          principalId: sessions.principalId,
          principalKind: sessions.principalKind,
          revokedAt: sessions.revokedAt,
        })
        .from(sessions)
        .where(
          inArray(
            sessions.id,
            body.revokedSessions.map((row) => row.id),
          ),
        )
        .for("share")
    : [];
  const payload = audit?.payload as { grantId?: string; revokedSessions?: number } | undefined;
  const actualCapabilities = grant?.capability
    ? [grant.capability]
    : grant?.role
      ? [...rolePresets[grant.role]].sort()
      : [];
  if (
    !audit ||
    audit.operationId !== body.operationId ||
    audit.action !== body.action ||
    audit.capability !== body.capability ||
    audit.actorKind !== body.actor.kind ||
    audit.actorId !== body.actor.id ||
    audit.recordType !== "principal" ||
    audit.recordId !== body.targetPrincipal.id ||
    payload?.grantId !== body.grant.id ||
    payload?.revokedSessions !== body.revokedSessions.length ||
    !operation ||
    operation.status !== "in_progress" ||
    operation.operationType !== "access.capability.revoke" ||
    operation.requestHash !== body.requestHash ||
    operation.actorKind !== body.actor.kind ||
    operation.actorId !== body.actor.id ||
    !grant?.revokedAt ||
    grant.revokedById !== body.actor.id ||
    grant.principalId !== body.targetPrincipal.id ||
    grant.version !== body.grant.version ||
    grant.role !== body.grant.role ||
    grant.capability !== body.grant.capability ||
    canonicalJson({
      recordType: grant.recordType,
      recordId: grant.recordId,
      locales: grant.locales,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
    }) !== canonicalJson(body.grant.scope) ||
    canonicalJson(actualCapabilities) !== canonicalJson(body.checks.authorityCapabilities) ||
    canonicalJson(person) !== canonicalJson(body.targetPrincipal) ||
    canonicalJson(checked) !== canonicalJson(body.checkedSession) ||
    changed.some((row) => !row.revokedAt) ||
    canonicalJson(
      changed
        .map(({ revokedAt: _revokedAt, ...row }) => row)
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
    ) !== canonicalJson(body.revokedSessions)
  )
    throw new Error(
      "Grant revocation observation differs from its persisted decision or target rows.",
    );
  return body;
}
