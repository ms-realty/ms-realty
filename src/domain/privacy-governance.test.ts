import { describe, expect, it } from "vitest";
import {
  emptyGovernanceDocument,
  governanceDocumentSchema,
  governanceEditionSchema,
  governanceFromValues,
  governanceIssues,
  governanceReviewEdition,
  governanceTimer,
  governanceToValues,
} from "./privacy-governance";

describe("O26/F30 privacy operating records", () => {
  it("holds unknown processing, transfer and notification facts instead of generating policy", () => {
    for (const kind of ["processing", "processor", "incident"] as const) {
      const document = emptyGovernanceDocument(kind);
      document.title = "Synthetic working evidence";
      document.nextAction = "Ask the responsible policy owner for evidence";
      expect(governanceDocumentSchema.safeParse(document).success).toBe(true);
      expect(governanceIssues(document)).toContain("ownerId");
      expect(governanceIssues(document)).toContain("evidenceReference");
      expect(governanceIssues(document)).toContain("reviewPolicyReference");
      expect(governanceTimer(document, false, new Date())).toEqual({ state: "held" });
      expect(governanceFromValues(kind, governanceToValues(document))).toEqual(document);
    }
  });
  it("counts only the reviewed human-entered deadline with its explicit timezone and source", () => {
    const document = emptyGovernanceDocument("incident");
    if (document.kind !== "incident") throw new Error("Expected incident");
    document.nextReviewAt = "2028-03-26T12:00:00+03:00";
    document.reviewPolicyReference = "Synthetic internal review policy";
    document.deadlineAt = "2028-03-27T12:00:00+03:00";
    document.deadlineTimezone = "Europe/Sofia";
    document.determinationReference = "Synthetic qualified human timestamp decision";
    document.notificationDecision = "required";
    const now = new Date("2028-03-26T10:00:00Z");
    expect(governanceTimer(document, false, now)).toMatchObject({
      kind: "internal_review",
      state: "overdue",
    });
    expect(governanceTimer(document, true, now)).toMatchObject({
      kind: "notification",
      state: "counting",
      at: document.deadlineAt,
      timezone: "Europe/Sofia",
      source: document.determinationReference,
      remainingMs: 23 * 3600000,
    });
    expect(governanceTimer(document, true, new Date("2028-03-27T09:00:00Z"))).toMatchObject({
      state: "overdue",
    });
    document.responseState = "response_recorded";
    expect(governanceTimer(document, true, now)).toEqual({ state: "response_recorded" });
  });
  it("accepts only exact typed processor source bindings while retaining legacy editions", () => {
    const document = emptyGovernanceDocument("processor");
    if (document.kind !== "processor") throw new Error("Expected processor");
    document.title = "Synthetic processor review";
    document.nextAction = "Review the exact linked processing source";
    document.processingRecordId = "00000000-0000-4000-8000-000000000001";
    const processingReview = {
      recordId: document.processingRecordId,
      recordVersion: 3,
      contentHash: "a".repeat(64),
    };
    const edition = governanceReviewEdition(document, processingReview);
    expect(governanceEditionSchema.parse(edition)).toEqual(edition);
    expect(governanceEditionSchema.parse(document)).toEqual(document);
    expect(
      governanceEditionSchema.safeParse({
        ...edition,
        processingReview: { ...processingReview, recordId: "00000000-0000-4000-8000-000000000002" },
      }).success,
    ).toBe(false);
    expect(
      governanceEditionSchema.safeParse({
        ...edition,
        processingReview: { ...processingReview, recordVersion: 0 },
      }).success,
    ).toBe(false);
    expect(
      governanceEditionSchema.safeParse({
        ...edition,
        processingReview: { ...processingReview, contentHash: "unverified" },
      }).success,
    ).toBe(false);
    expect(
      governanceEditionSchema.safeParse({
        ...edition,
        document: { ...document, kind: "processing" },
      }).success,
    ).toBe(false);
  });
  it("requires transfer assessment, notification determination, response evidence and valid instants", () => {
    const processor = emptyGovernanceDocument("processor");
    if (processor.kind !== "processor") throw new Error("Expected processor");
    expect(governanceIssues(processor)).toContain("transferState");
    processor.transferState = "reviewed_transfer";
    expect(governanceIssues(processor)).toContain("transferMechanismReference");
    const incident = emptyGovernanceDocument("incident");
    if (incident.kind !== "incident") throw new Error("Expected incident");
    incident.title = "Synthetic incident";
    incident.nextAction = "Review minimised evidence";
    incident.notificationDecision = "not_required";
    incident.deadlineAt = "2028-03-26T09:00:00Z";
    incident.responseState = "closed";
    expect(governanceIssues(incident)).toContain("deadlineAt");
    expect(governanceIssues(incident)).toContain("responseEvidenceReference");
    expect(
      governanceDocumentSchema.safeParse({ ...incident, deadlineTimezone: "invented-zone" })
        .success,
    ).toBe(false);
    expect(
      governanceDocumentSchema.safeParse({ ...incident, awarenessAt: "2028-03-26T10:00" }).success,
    ).toBe(false);
  });
});
