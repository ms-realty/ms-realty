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
import { gateIds, gateStatuses } from "@/release/schemas";
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
  provider_signature: "A provider webhook whose signature and account are verified.",
} as const;
export type AuthorizationClass = keyof typeof authorizationClasses;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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
  readonly host: HostContext | "any";
  readonly authorization: AuthorizationClass;
  readonly capability?: Capability;
  /** Acceptance scenarios (AT01–AT68) the endpoint carries. */
  readonly acceptance: readonly string[];
  /**
   * `submission_key`: a server-issued logical key bound to the payload digest (§5.1).
   * `operation_id`: a client-held operation id bound to the payload digest.
   */
  readonly idempotency: "none" | "submission_key" | "operation_id";
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
    .enum(["current", "missing", "other_release", "invalid"])
    .describe("`current` only when the readiness snapshot was evaluated for this exact build"),
  snapshot: z
    .object({
      snapshotId: z.string(),
      evaluatedAt: z.string(),
      releaseSha: z.string(),
      environment: z.string(),
      policyRevision: z.string(),
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
  receiptId: z.string().describe("The logical submission key"),
  status: z.literal("accepted"),
  reference: z.string().describe("Human reference, e.g. RQ-2026-000042"),
  acceptedAt: z.iso.datetime(),
  purpose: z.enum(inquiryPurposes),
  locale: z.enum(publicLocales),
  listingReference: z.string().nullable(),
});

export const inquiryAcceptedSchema = z.object({
  receipt: inquiryReceiptSchema,
  operationId: z.string(),
});

/** The no-JavaScript form post: the same command with flat fields. */
const inquiryFormSchema = z.object({
  submissionKey: z.string(),
  purpose: z.enum(inquiryPurposes),
  locale: z.enum(publicLocales),
  name: z.string().optional(),
  contactKind: z.enum(["email", "phone"]),
  contactValue: z.string(),
  message: z.string().optional(),
  listingReference: z.string().optional(),
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
  listingReference: null,
} as const;

export const endpoints = [
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
      "this exact build. A missing snapshot, or one for another release, reports every gate " +
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
] as const satisfies readonly EndpointDefinition[];
