// Transport registry (architecture §19.3, §5.1): every application endpoint with its group, host
// context, authorization class, request/response schemas, idempotency and revision contract and
// the §5.1 errors it can return. Route handlers take their schemas and types from here, and
// scripts/openapi.mjs publishes it as docs/api/openapi.json. A test fails when a route file
// under app/api has no entry, or an entry has no route file.
import "server-only";
import { z } from "zod";
import type { Capability } from "@/domain/capabilities";
import { publicLocales } from "@/domain/ids";
import { inquiryPurposes } from "@/domain/inquiry";
import { inquiryContentSnapshotSchema } from "@/domain/inquiry-content-snapshot";
import { inquiryListingReceiptSchema } from "@/domain/inquiry-selection";
import { ownerInquiryReceiptSchema } from "@/domain/owner-inquiry";
import { gateIds, gateStatuses, readinessReportSchema } from "@/release/schemas";
import type { HostContext } from "../config/hosts";
import type { ErrorCode } from "../errors";
import { inquirySchema } from "../inquiries/intake";

/** The §19.3 transport groups. */
export const transportGroups = [
  "public_read",
  "public_submission",
  "client",
  "invitations_preferences",
  "agency_commands",
  "inventory_publication",
  "files",
  "jobs_imports",
  "provider_ingress",
  "operations",
] as const;
export type TransportGroup = (typeof transportGroups)[number];

/** Who may call an endpoint; the server derives the Principal, never the payload. */
export const authorizationClasses = {
  public: "Anyone. No session is read.",
  receipt_session:
    "An anonymous visitor holding the receipt-session cookie that made the submission.",
  client_session:
    "A signed-in client on the client host; record and field audience checks apply per record.",
  staff_session:
    "A signed-in staff member with an active membership on the staff host, holding the named capability.",
  private_session:
    "A current client or staff session on its own private host, with per-record authorization and audience checks.",
  provider_signature: "A provider webhook whose signature and account are verified.",
} as const;
export type AuthorizationClass = keyof typeof authorizationClasses;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Explicitly inventoried developer tools, unavailable on real hosts and excluded from OpenAPI. */
export const localTestOperations = [
  {
    method: "GET",
    path: "/api/test-outbox",
    requiredFlag: "ENABLE_TEST_OUTBOX",
    hosts: ["client", "staff"],
  },
] as const;

export interface ResponseDefinition {
  readonly status: number;
  readonly description: string;
  readonly schema?: z.ZodType;
  /** Defaults to application/json when a schema is given. */
  readonly contentType?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly example?: unknown;
}

export interface EndpointDefinition {
  /** Stable operation id, `<area>.<action>`. */
  readonly id: string;
  readonly summary: string;
  readonly description?: string;
  readonly group: TransportGroup;
  readonly method: HttpMethod;
  /** OpenAPI path template, e.g. `/api/inquiries/{submission}`. */
  readonly path: string;
  /** The host the endpoint is mounted on; `any` only for the host-neutral health check. */
  readonly host: HostContext | "private" | "any";
  readonly authorization: AuthorizationClass;
  readonly capability?: Capability;
  /** Acceptance scenarios (AT01–AT68) the endpoint carries. */
  readonly acceptance: readonly string[];
  /**
   * `submission_key`: a server-issued logical key bound to the payload digest (§5.1).
   * `operation_id`: a client-held operation id bound to the payload digest.
   */
  readonly idempotency: "none" | "submission_key" | "operation_id" | "provider_event_id";
  /** `expected_revision`: stale writes answer REVISION_CONFLICT with the latest state. */
  readonly revision: "none" | "expected_revision";
  readonly pagination: "none" | "cursor";
  readonly params?: z.ZodObject;
  readonly body?: {
    readonly schemas: Readonly<Record<string, z.ZodType>>;
    readonly example?: unknown;
  };
  readonly responses: readonly ResponseDefinition[];
  readonly errors: readonly ErrorCode[];
}

// Shared shapes.

/** §5.1 error body, as `toErrorBody` in src/server/errors.ts serializes it. */
export const errorBodySchema = z.object({
  code: z.string().describe("§5.1 standard code, e.g. VALIDATION_FAILED, REVISION_CONFLICT"),
  message: z.string().describe("Safe English fallback; clients localize by code"),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  retryable: z.boolean(),
  retryAfterSeconds: z.number().int().optional(),
  correlationId: z.string(),
  outcome: z.enum(["not_applied", "applied", "unknown"]),
  current: z.unknown().optional().describe("Latest authorized state, on revision conflicts"),
});
export const errorEnvelopeSchema = z.object({ error: errorBodySchema });

// Operations.

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  build: z.string().describe("Commit SHA of the running build, or `dev`"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  release: z.object({
    sha: z.string().nullable().describe("BUILD_SHA of the running process; null when unset"),
  }),
  snapshotState: z
    .enum([
      "current",
      "missing",
      "other_release",
      "invalid",
      "unbound",
      "other_environment",
      "other_manifest",
      "other_policy",
      "other_snapshot",
      "expired",
    ])
    .describe(
      "`current` only for an unmodified, unexpired snapshot matching every deployed identity pin",
    ),
  snapshot: z
    .object({
      snapshotId: readinessReportSchema.shape.snapshotId,
      evaluatedAt: readinessReportSchema.shape.evaluatedAt,
      expiresAt: readinessReportSchema.shape.expiresAt,
      releaseSha: readinessReportSchema.shape.release.shape.releaseSha,
      environment: readinessReportSchema.shape.release.shape.environment,
      policyRevision: readinessReportSchema.shape.policy.shape.policyRevision,
      manifestDigest: readinessReportSchema.shape.release.shape.manifestDigest,
      policyDigest: readinessReportSchema.shape.policy.shape.policyDigest,
    })
    .nullable(),
  verdict: z.enum(gateStatuses),
  gates: z.array(
    z.object({
      id: z.enum(gateIds),
      status: z.enum(gateStatuses),
      blockers: z.array(z.string()),
    }),
  ),
});
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

// Inquiry intake.

const submissionKeyExample = `${"A".repeat(43)}.${"0".repeat(32)}`;

export const submissionKeyResponseSchema = z.object({ submissionKey: z.string() });

export const inquiryReceiptSchema = z.object({
  content: inquiryContentSnapshotSchema.optional(),
  ownerInput: ownerInquiryReceiptSchema.optional(),
  receiptId: z.string().describe("The logical submission key"),
  status: z.literal("accepted"),
  reference: z.string().describe("Human reference, e.g. RQ-2026-000042"),
  acceptedAt: z.iso.datetime(),
  purpose: z.enum(inquiryPurposes),
  locale: z.enum(publicLocales),
  listing: inquiryListingReceiptSchema.nullable(),
  selectedListings: z.array(inquiryListingReceiptSchema),
  listingReference: z.string().nullable(),
  selectedListingReferences: z.array(z.string()),
  comparisonReferences: z.array(z.string()),
});

export const inquiryAcceptedSchema = z.object({
  receipt: inquiryReceiptSchema,
  operationId: z.string(),
});

/** The no-JavaScript form post: the same command with flat fields. */
const inquiryFormSchema = z.object({
  contentReference: z.string().max(512).optional(),
  ownerInput: z.string().max(2048).optional(),
  viewingPreferences: z.string().max(4096).optional(),
  submissionKey: z.string(),
  purpose: z.enum(inquiryPurposes),
  locale: z.enum(publicLocales),
  name: z.string().optional(),
  contactKind: z.enum(["email", "phone"]),
  contactValue: z.string(),
  message: z.string().optional(),
  listingReference: z.string().optional(),
  observedManifestId: z.uuid().optional(),
  comparisonReferences: z
    .string()
    .max(62)
    .optional()
    .describe(
      "Navigation only: 1–3 comma-separated canonical unique ordered listing references, including the individual inquiry subject",
    ),
  selectedListings: z
    .string()
    .max(1000)
    .optional()
    .describe(
      "JSON array of 1–3 ordered unique reference/observedManifestId pairs; mutually exclusive with listingReference",
    ),
  callbackWindow: z.string().optional(),
  privacyNotice: z.literal("on"),
  marketingOptIn: z.literal("on").optional(),
  website: z.string().optional().describe("Honeypot; people leave it empty"),
});

const receiptExample = {
  receiptId: submissionKeyExample,
  status: "accepted",
  reference: "RQ-2026-000042",
  acceptedAt: "2026-09-27T09:30:00.000Z",
  purpose: "question",
  locale: "bg",
  listing: null,
  selectedListings: [],
  listingReference: null,
  selectedListingReferences: [],
  comparisonReferences: [],
} as const;

export const endpoints = [
  {
    id: "files.upload",
    summary: "Upload and seal scoped staging bytes",
    group: "files",
    method: "PUT",
    path: "/api/files/uploads/{id}",
    host: "private",
    authorization: "private_session",
    acceptance: ["AT42"],
    idempotency: "operation_id",
    revision: "none",
    pagination: "none",
    description:
      "Requires x-upload-token for the expiring upload slot, current session and exact same-origin. Repeated bytes reconcile to the same sealed object; different bytes conflict. Raw media maximum 25 MB, documents 20 MB. Scanning is queued, never implied by acceptance.",
    params: z.object({ id: z.uuid() }),
    body: { schemas: { "application/octet-stream": z.string().meta({ format: "binary" }) } },
    responses: [
      {
        status: 200,
        description: "Sealed; scanning pending",
        schema: z.object({ state: z.literal("sealed"), next: z.literal("scanning") }).passthrough(),
      },
    ],
    errors: [
      "unauthenticated",
      "forbidden",
      "not_found",
      "cross_origin_request",
      "validation_failed",
      "version_conflict",
      "unavailable",
    ],
  },
  {
    id: "files.privateDownload",
    summary: "Read an authorized private file",
    group: "files",
    method: "GET",
    path: "/api/files/private/{kind}/{id}",
    host: "private",
    authorization: "private_session",
    acceptance: ["AT39", "AT42"],
    idempotency: "none",
    revision: "none",
    pagination: "none",
    description:
      "Authorization and current byte provenance are rechecked for every full or range request. preview=1 serves only a media derivative. Original documents are attachments; no-store.",
    params: z.object({ kind: z.enum(["media", "document"]), id: z.uuid() }),
    responses: [
      {
        status: 200,
        description: "Authorized file bytes",
        contentType: "application/octet-stream",
        schema: z.string().meta({ format: "binary" }),
      },
      { status: 206, description: "Authorized byte range" },
      { status: 416, description: "Invalid byte range" },
    ],
    errors: ["unauthenticated", "forbidden", "not_found", "unavailable"],
  },
  {
    id: "files.publicMedia",
    summary: "Read an eligible published image rendition",
    group: "public_read",
    method: "GET",
    path: "/api/media/{id}/{digest}",
    host: "public",
    authorization: "public",
    acceptance: ["AT24", "AT25", "AT42"],
    idempotency: "none",
    revision: "none",
    pagination: "none",
    description:
      "Rechecks active website manifest membership, rights, clean scanned sealed bytes and exact derivative digest on every request. Private originals and staging bytes are never served. No-store enables immediate restriction.",
    params: z.object({ id: z.uuid(), digest: z.string().regex(/^[a-f0-9]{64}$/) }),
    responses: [
      {
        status: 200,
        description: "Reviewed derivative",
        contentType: "image/webp",
        schema: z.string().meta({ format: "binary" }),
      },
      { status: 206, description: "Eligible derivative byte range" },
    ],
    errors: ["not_found", "unavailable"],
  },
  {
    id: "operations.health",
    summary: "Minimal health check",
    description: "Answers on every host without a session. It reveals no dependency or secret.",
    group: "operations",
    method: "GET",
    path: "/api/health",
    host: "any",
    authorization: "public",
    acceptance: [],
    idempotency: "none",
    revision: "none",
    pagination: "none",
    responses: [
      {
        status: 200,
        description: "The process answers",
        schema: healthResponseSchema,
        example: { status: "ok", build: "dev" },
      },
    ],
    errors: [],
  },
  {
    id: "operations.readiness",
    summary: "Release readiness for the running build",
    description:
      "Release identity and the R00–R12 gate summary from the readiness snapshot evaluated for " +
      "this exact build/environment/manifest/policy. A missing, expired, unbound or invalid snapshot reports every gate " +
      "blocked. No secret, evidence content or personal data is returned.",
    group: "operations",
    method: "GET",
    path: "/api/ops/readiness",
    host: "staff",
    authorization: "staff_session",
    capability: "report.read",
    acceptance: ["AT67"],
    idempotency: "none",
    revision: "none",
    pagination: "none",
    responses: [
      {
        status: 200,
        description: "Gate summary",
        schema: readinessResponseSchema,
        headers: { "cache-control": "no-store; never cache operational detail" },
        example: {
          release: { sha: null },
          snapshotState: "missing",
          snapshot: null,
          verdict: "blocked",
          gates: gateIds.map((id) => ({ id, status: "blocked", blockers: ["no_snapshot"] })),
        },
      },
    ],
    errors: ["unauthenticated", "forbidden", "internal_error"],
  },
  {
    id: "inquiries.issueSubmissionKey",
    summary: "Issue a logical submission key for an inquiry form",
    description:
      "Returns a server-issued key (256 random bits plus a MAC) and makes sure the browser holds " +
      "a receipt-session cookie.",
    group: "public_submission",
    method: "GET",
    path: "/api/inquiries",
    host: "public",
    authorization: "public",
    acceptance: ["AT10"],
    idempotency: "none",
    revision: "none",
    pagination: "none",
    responses: [
      {
        status: 200,
        description: "A fresh submission key",
        schema: submissionKeyResponseSchema,
        headers: { "set-cookie": "Receipt-session cookie, when the browser has none" },
        example: { submissionKey: submissionKeyExample },
      },
    ],
    errors: [],
  },
  {
    id: "inquiries.submit",
    summary: "Receive one inquiry",
    description:
      "One logical submission per key: the same key and payload return the same receipt (200), " +
      "another payload under the key is refused. JSON clients get the receipt; a form post is " +
      "answered 303 to the receipt page, or back to the form with only the key and error code.",
    group: "public_submission",
    method: "POST",
    path: "/api/inquiries",
    host: "public",
    authorization: "public",
    acceptance: ["AT01", "AT10", "AT11", "AT12", "AT13"],
    idempotency: "submission_key",
    revision: "none",
    pagination: "none",
    body: {
      schemas: {
        "application/json": inquirySchema,
        "application/x-www-form-urlencoded": inquiryFormSchema,
      },
      example: {
        submissionKey: submissionKeyExample,
        purpose: "question",
        locale: "bg",
        contact: { kind: "email", value: "visitor@example.test" },
        message: "Is the apartment still offered?",
        privacyNotice: true,
      },
    },
    responses: [
      {
        status: 201,
        description: "Accepted (JSON)",
        schema: inquiryAcceptedSchema,
        example: { receipt: receiptExample, operationId: "8a7c2f7e-3f0d-4c1e-9d6a-2b1f0e5c4d3a" },
      },
      {
        status: 200,
        description: "A retry of an accepted submission: the original receipt (JSON)",
        schema: inquiryAcceptedSchema,
      },
      {
        status: 303,
        description: "Form post: to the receipt page, or back to the form with the error code",
        headers: { location: "/{locale}/requests/{key} or /{locale}/inquire?submission=…&error=…" },
      },
    ],
    errors: [
      "validation_failed",
      "cross_origin_request",
      "rate_limited",
      "idempotency_key_reused",
      "operation_pending",
      "outcome_unknown",
      "internal_error",
    ],
  },
  {
    id: "inquiries.receipt",
    summary: "Reconcile an inquiry receipt",
    description:
      "Acceptance state only, never contact details or the message. Needs the receipt session " +
      "that submitted it; otherwise the same not-found as a submission that never arrived.",
    group: "public_submission",
    method: "GET",
    path: "/api/inquiries/{submission}",
    host: "public",
    authorization: "receipt_session",
    acceptance: ["AT10", "AT11"],
    idempotency: "none",
    revision: "none",
    pagination: "none",
    params: z.object({ submission: z.string().describe("The submission key") }),
    responses: [
      {
        status: 200,
        description: "The receipt",
        schema: z.object({ receipt: inquiryReceiptSchema }),
        example: { receipt: receiptExample },
      },
    ],
    errors: ["not_found", "internal_error"],
  },
  {
    id: "providers.resend.ingest",
    summary: "Verify and record a Resend delivery event",
    group: "provider_ingress",
    method: "POST",
    path: "/api/providers/resend/webhook",
    host: "staff",
    authorization: "provider_signature",
    acceptance: ["AT46", "AT47", "AT48"],
    idempotency: "provider_event_id",
    revision: "none",
    pagination: "none",
    description:
      "Verify the exact raw UTF-8 body using the account's Svix webhook secret and svix-id, svix-timestamp and svix-signature headers. Deduplicate the signed event, persist only delivery identifiers, and reconcile the external-action ledger. Inbound email never grants identity or Case access. 128 KiB body limit.",
    body: {
      schemas: {
        "application/json": z.object({
          type: z.string(),
          created_at: z.string(),
          data: z.object({ email_id: z.string().optional() }).passthrough(),
        }),
      },
    },
    responses: [
      {
        status: 202,
        description: "Signed event durably accepted; acceptance does not establish delivery",
        schema: z.object({ accepted: z.literal(true), duplicate: z.boolean() }),
      },
    ],
    errors: ["unauthenticated", "validation_failed", "unavailable", "internal_error"],
  },
] as const satisfies readonly EndpointDefinition[];
