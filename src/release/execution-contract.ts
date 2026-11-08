// Disabled R00–R10 execution inspection contracts. No schema is runtime permission.
import { z } from "zod";
import { bundleBindingSchema } from "./bundle";
import {
  admittedReleaseTrustSchema,
  gatePolicySchema,
  readinessReportSchema,
  releaseManifestSchema,
} from "./schemas";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().regex(/^[A-Za-z0-9._:-]{3,128}$/);
const instant = z.iso.datetime({ offset: true });
const envelope = z.object({ payload: z.string(), signature: z.string() }).strict();
const key = (purpose: "execution_grant" | "execution_verification" | "remote_lease_observation") =>
  z.object({ keyId: identifier, fingerprint: digest, purpose: z.literal(purpose) }).strict();

export const executionKeysSchema = z
  .object({
    owner: key("execution_grant"),
    verifier: key("execution_verification"),
    watchdog: key("remote_lease_observation"),
  })
  .strict();

/** Supplied only by a future independently installed adapter, never by the packet/CLI. */
export const executionAdmissionSchema = z
  .object({ release: admittedReleaseTrustSchema, keys: executionKeysSchema })
  .strict();

/** Actual bytes must match the phasePermissions reference signed by the R00 authority. */
export const executionPhaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    execution: z
      .object({
        action: z.literal("canonical_route_cutover"),
        keysDigest: digest,
        scopeDigest: digest,
        procedures: z.object({ cutover: digest, rollback: digest }).strict(),
      })
      .strict(),
  })
  .strict();

export const executionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    action: z.literal("canonical_route_cutover"),
    snapshotId: digest,
    policyDigest: digest,
    contextDigest: digest,
    manifestDigest: digest,
    phasePermissionsDigest: digest,
    scopeDigest: digest,
    procedures: z.object({ cutover: digest, rollback: digest }).strict(),
    sourceCommit: sha,
    images: z.object({ web: digest, worker: digest, migration: digest, gateway: digest }).strict(),
    cutoverPlanDigest: digest,
    baselineDigest: digest,
    parityReportDigest: digest,
    operationId: z.uuid(),
    leaseId: z.uuid(),
    leaseObservationDigest: digest,
  })
  .strict();

export const executionDecisionSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.enum(["execution_grant", "execution_verification"]),
    actor: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("human"), name: z.literal("Ivan") }).strict(),
      z
        .object({ kind: z.literal("machine"), name: z.string().min(1), version: identifier })
        .strict(),
    ]),
    keyId: identifier,
    action: z.literal("canonical_route_cutover"),
    planDigest: digest,
    snapshotId: digest,
    policyDigest: digest,
    contextDigest: digest,
    operationId: z.uuid(),
    leaseId: z.uuid(),
    role: z.enum(["owner", "controller"]),
    decision: z.literal("approve"),
    cutoverPlanSha256: hex,
    reportSha256: hex,
    sourceCommit: sha,
    digest,
    reviewedScreens: z.literal(true),
    signedAt: instant,
    issuedAt: instant,
    expiresAt: instant,
  })
  .strict();

export const executionLeaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal("remote_lease_observation"),
    keyId: identifier,
    actor: z
      .object({ kind: z.literal("machine"), name: z.string().min(1), version: identifier })
      .strict(),
    operationId: z.uuid(),
    leaseId: z.uuid(),
    sourceCommit: sha,
    imageDigest: digest,
    baselineDigest: digest,
    zoneIds: z.array(z.string().regex(/^[a-f0-9]{32}$/)).length(2),
    state: z.literal("reserved"),
    observedAt: instant,
    expiresAt: instant,
  })
  .strict();

export const executionRawPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    environment: z.literal("production"),
    purpose: z.literal("complete_parity"),
    operationId: z.uuid(),
    accountId: z.string().regex(/^[a-f0-9]{32}$/),
    sourceCommit: sha,
    digest,
    workerName: z.string().min(1),
    gatewayVersionId: z.uuid(),
    gatewayDeploymentId: z.uuid(),
    image: z.string().min(1),
    timeoutSeconds: z.literal(600),
    rollbackTimeoutSeconds: z.literal(120),
    databasePolicy: z.literal("preserve-current"),
    dnsPolicy: z.literal("preserve-all"),
    baselineSha256: hex,
    routes: z
      .array(
        z
          .object({
            zoneId: z.string().regex(/^[a-f0-9]{32}$/),
            pattern: z.string().min(1),
            baselineRouteId: z
              .string()
              .regex(/^[a-f0-9]{32}$/)
              .nullable(),
          })
          .strict(),
      )
      .min(6)
      .max(100),
    artifacts: z
      .object({
        gateway: hex,
        inputs: hex,
        routes: hex,
        media: hex,
        runtime: hex,
        database: hex,
        ownership: hex,
        recovery: hex,
      })
      .strict(),
  })
  .strict();

export const executionPacketSchema = z
  .object({
    execution: z.literal("single_operator_owner_review"),
    candidate: z
      .object({
        policy: gatePolicySchema,
        manifest: releaseManifestSchema,
        snapshot: readinessReportSchema,
        evidence: z.array(z.object({ file: z.string().min(1), content: z.string() }).strict()),
        bundle: bundleBindingSchema.optional(),
      })
      .strict(),
    phasePermissions: z.string(),
    procedures: z.object({ cutover: z.string(), rollback: z.string() }).strict(),
    candidateBytes: z
      .object({ domains: z.string(), dataImport: z.string(), dependencies: z.string() })
      .strict(),
    plan: executionPlanSchema,
    lease: envelope,
    grant: envelope,
    verification: envelope,
    production: z
      .object({
        plan: z.string(),
        baseline: z.string(),
        artifacts: z.record(z.string(), z.string()),
        report: envelope,
        expected: z
          .object({
            purpose: z.literal("complete_parity"),
            sourceCommit: sha,
            digest,
            routesSha256: hex,
            mediaSha256: hex,
            inputsSha256: hex,
            provenanceSha256: hex,
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const executionPreparationSchema = executionPacketSchema.omit({
  plan: true,
  grant: true,
  verification: true,
});

// v2 runtime uses the authoritative Durable Object receipt directly, never a third signer.
export const runtimePhaseSchema = executionPhaseSchema.extend({
  schemaVersion: z.literal(2),
  execution: executionPhaseSchema.shape.execution.extend({
    leaseAuthority: z.literal("watchdog_durable_state"),
    recoveryAuthority: z.literal("original_operation_restore_and_separate_lease_release"),
    conditionalAcceptance: z.literal("original_operation_complete_production_parity"),
  }),
});
export const runtimePlanSchema = executionPlanSchema.extend({
  schemaVersion: z.literal(2),
  admissionDigest: digest,
  leaseAuthority: z.literal("watchdog_durable_state"),
});
export const runtimeDecisionSchema = executionDecisionSchema.extend({
  schemaVersion: z.literal(2),
  admissionDigest: digest,
  leaseAuthority: z.literal("watchdog_durable_state"),
});
export const runtimeExecutionPacketSchema = executionPacketSchema.omit({ lease: true }).extend({
  protocolVersion: z.literal(2),
  plan: runtimePlanSchema,
});
export const runtimePreparationSchema = runtimeExecutionPacketSchema.omit({
  plan: true,
  grant: true,
  verification: true,
});

/** Constructed from authenticated transport or actual storage, never taken from packet fields. */
export const remoteLeaseStateSchema = z
  .object({
    scope: z
      .object({
        operationId: z.uuid(),
        leaseId: z.uuid(),
        sourceCommit: sha,
        digest,
        baselineSha256: hex,
        zoneIds: z.array(z.string().regex(/^[a-f0-9]{32}$/)).length(2),
      })
      .strict(),
    reservedAt: z.number().int(),
    expiresAt: z.number().int(),
    status: z.enum([
      "reserved",
      "armed",
      "restoring",
      "restored",
      "reconciliation_required",
      "accepted",
      "released",
    ]),
    receipt: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RemoteLeaseState = z.infer<typeof remoteLeaseStateSchema>;
export type RuntimeExecutionPacket = z.infer<typeof runtimeExecutionPacketSchema>;

export type ExecutionPacket = z.infer<typeof executionPacketSchema>;
export type ExecutionAdmission = z.infer<typeof executionAdmissionSchema>;
