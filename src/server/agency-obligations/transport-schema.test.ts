import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { agencyCommands } from "@/features/agency-obligations/contract";
import { photographyRequestSchema } from "../appointments/service";
import { buildOpenApiDocument } from "../transport/openapi";
import { endpoints } from "../transport/registry";
import { partnerTermsDecisionSchema, partnerTermsSaveSchema } from "./partner-terms";
import {
  caseReviewConsentSchema,
  caseReviewDocumentConsentSchema,
  caseReviewSaveSchema,
  caseReviewVerifySchema,
} from "./reviews";
import {
  agencyCommandSchema,
  agencyCommandSchemas,
  agencyRequestSchema,
  agencyResponseSchema,
} from "./transport-schema";

const id = randomUUID(),
  key = randomUUID(),
  hash = "a".repeat(64);
const envelope = { id, operationId: key, expectedVersion: 1, reviewed: true };
const bodies = {
  partnerSave: {
    ...envelope,
    expectedVersion: 0,
    caseId: null,
    counterpartyPartyId: randomUUID(),
    relationship: "partner",
    purpose: "Synthetic source binding",
    sourceReference: "Synthetic source",
    sourceVersion: "fixture-1",
    termsText: "Synthetic supplied exact terms, no real fees.",
    documentVersionId: null,
    acceptedReference: null,
    acceptedAt: null,
    validUntil: null,
    unknowns: "Actual counterparty acceptance and validity are held.",
  },
  partnerDecision: {
    ...envelope,
    expectedHash: hash,
    action: "revoke",
    professionalName: "",
    note: "Synthetic revocation",
  },
  reviewSave: {
    ...envelope,
    expectedVersion: 0,
    caseId: randomUUID(),
    authorPartyId: randomUUID(),
    contentPageVersionId: randomUUID(),
    displayChoice: "anonymous",
  },
  reviewDocumentConsent: {
    ...envelope,
    expectedHash: hash,
    decision: "withdrawn",
    policyVersionId: null,
    documentVersionId: null,
    sourceReference: "Synthetic withdrawn assent",
  },
  reviewVerify: { ...envelope, expectedHash: hash, note: "Synthetic exact qualified review" },
  clientConsent: { ...envelope, expectedHash: hash, decision: "withdrawn", policyVersionId: null },
  photography: {
    ...envelope,
    preferredWindow: "Synthetic morning",
    photographyScope: "Synthetic property work, actual access held.",
  },
} as const;
it("reuses every actual command parser and inventories only its supported command names", () => {
  expect(agencyCommandSchemas).toEqual({
    partnerSave: partnerTermsSaveSchema,
    partnerDecision: partnerTermsDecisionSchema,
    reviewSave: caseReviewSaveSchema,
    reviewDocumentConsent: caseReviewDocumentConsentSchema,
    reviewVerify: caseReviewVerifySchema,
    clientConsent: caseReviewConsentSchema,
    photography: photographyRequestSchema,
  });
  expect([...agencyCommandSchema.options].sort()).toEqual(Object.keys(agencyCommands).sort());
  expect(agencyCommandSchema.safeParse("constructor").success).toBe(false);
  for (const [command, schema] of Object.entries(agencyCommandSchemas)) {
    const body = bodies[command as keyof typeof bodies];
    expect(schema.safeParse(body).success, command).toBe(true);
    expect(agencyRequestSchema.safeParse(body).success, command).toBe(true);
    for (const patch of [
      { operationId: "short" },
      { expectedVersion: -1 },
      { id: "unknown" },
      { reviewed: false },
    ])
      expect(schema.safeParse({ ...body, ...patch }).success, command).toBe(false);
    expect(schema.safeParse({ ...body, expectedVersion: 0 }).success, command).toBe(
      ["partnerSave", "reviewSave"].includes(command),
    );
  }
  expect(agencyRequestSchema.safeParse({ id }).success).toBe(false);
  expect(
    agencyCommandSchemas.partnerDecision.safeParse({
      ...bodies.partnerDecision,
      expectedHash: "stale",
    }).success,
  ).toBe(false);
});
it("publishes a private typed operation with both cookie schemes, revision and recovery errors", () => {
  const entry = endpoints.find((value) => value.id === "agency.command");
  expect(entry).toMatchObject({
    path: "/api/agency/{command}",
    host: "private",
    authorization: "private_session",
    idempotency: "operation_id",
    revision: "expected_revision",
  });
  const operation = buildOpenApiDocument().paths["/api/agency/{command}"]?.post;
  expect(operation).toMatchObject({
    security: [{ clientSession: [] }, { staffSession: [] }],
    servers: [{ url: "https://my.makler-realty.com" }, { url: "https://app.makler-realty.com" }],
    requestBody: { content: { "application/json": { schema: { anyOf: expect.any(Array) } } } },
    responses: { "409": expect.anything() },
  });
  expect(entry?.errors).toEqual(
    expect.arrayContaining([
      "cross_origin_request",
      "step_up_required",
      "idempotency_key_reused",
      "operation_pending",
      "outcome_unknown",
      "approval_stale",
    ]),
  );
  expect(
    agencyResponseSchema.safeParse({
      operationId: key,
      replayed: true,
      outcome: { id, version: 2, consentState: "withdrawn" },
    }).success,
  ).toBe(true);
  expect(
    agencyResponseSchema.safeParse({ operationId: key, replayed: "yes", outcome: { id } }).success,
  ).toBe(false);
});
