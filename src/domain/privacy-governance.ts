// O26/F30: controlled agency records. Unknown policy is held; no legal deadline is inferred.
import { z } from "zod";
import { settingsResources } from "./settings-resources";

export const privacyGovernanceId = settingsResources.privacyGovernance;
export const governanceKinds = ["processing", "processor", "incident"] as const;
export type GovernanceKind = (typeof governanceKinds)[number];
const reference = z.string().trim().min(3).max(1500).nullable();
const instant = z.iso.datetime({ offset: true }).nullable();
const owner = z.uuid().nullable();
const timezone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  })
  .nullable();
const common = {
  title: z.string().trim().min(3).max(160),
  ownerId: owner,
  evidenceReference: reference,
  reviewPolicyReference: reference,
  nextAction: z.string().trim().min(3).max(1500),
  nextReviewAt: instant,
};
export const governanceDocumentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...common,
      kind: z.literal("processing"),
      lifecycle: z.enum(["active", "retired"]),
      purpose: reference,
      dataSubjects: reference,
      dataClasses: reference,
      recipients: reference,
      systems: reference,
      lawfulBasisReference: reference,
      retentionReference: reference,
      securityReference: reference,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("processor"),
      lifecycle: z.enum(["active", "retired"]),
      processorName: reference,
      servicePurpose: reference,
      dataClasses: reference,
      processingRecordId: z.uuid().nullable(),
      territories: reference,
      transferState: z.enum(["unknown", "no_transfer", "reviewed_transfer"]),
      transferAssessmentReference: reference,
      transferMechanismReference: reference,
      agreementReference: reference,
      retentionReference: reference,
      securityReference: reference,
    })
    .strict(),
  z
    .object({
      ...common,
      kind: z.literal("incident"),
      observedAt: instant,
      awarenessAt: instant,
      affectedScope: reference,
      impactAssessmentReference: reference,
      responsePolicyReference: reference,
      notificationDecision: z.enum(["pending", "required", "not_required"]),
      determinationById: owner,
      determinationReference: reference,
      deadlineAt: instant,
      deadlineTimezone: timezone,
      responseState: z.enum(["open", "response_recorded", "closed"]),
      responseEvidenceReference: reference,
    })
    .strict(),
]);
export type GovernanceDocument = z.infer<typeof governanceDocumentSchema>;

/** Required fields are checked at review; a minimised, attributable working record can stay held. */
export function governanceIssues(document: GovernanceDocument): string[] {
  const issues: string[] = [];
  const needs = (fields: readonly string[]) => {
    for (const field of fields)
      if (!(document as Record<string, unknown>)[field]) issues.push(field);
  };
  needs(["ownerId", "evidenceReference", "reviewPolicyReference"]);
  const closed =
    document.kind === "incident"
      ? document.responseState === "closed"
      : document.lifecycle === "retired";
  if (!closed) needs(["nextReviewAt"]);
  if (document.kind === "processing") {
    needs([
      "purpose",
      "dataSubjects",
      "dataClasses",
      "recipients",
      "systems",
      "lawfulBasisReference",
      "retentionReference",
      "securityReference",
    ]);
  } else if (document.kind === "processor") {
    needs([
      "processorName",
      "servicePurpose",
      "dataClasses",
      "processingRecordId",
      "territories",
      "transferAssessmentReference",
      "agreementReference",
      "retentionReference",
      "securityReference",
    ]);
    if (document.transferState === "unknown") issues.push("transferState");
    if (document.transferState === "reviewed_transfer") needs(["transferMechanismReference"]);
  } else {
    needs([
      "observedAt",
      "awarenessAt",
      "affectedScope",
      "impactAssessmentReference",
      "responsePolicyReference",
      "determinationById",
      "determinationReference",
    ]);
    if (document.notificationDecision === "pending") issues.push("notificationDecision");
    if (document.notificationDecision === "required") needs(["deadlineAt", "deadlineTimezone"]);
    if (document.notificationDecision !== "required" && document.deadlineAt)
      issues.push("deadlineAt");
    if (
      document.observedAt &&
      document.awarenessAt &&
      new Date(document.awarenessAt).getTime() < new Date(document.observedAt).getTime()
    )
      issues.push("awarenessAt");
    if (
      document.deadlineAt &&
      document.awarenessAt &&
      new Date(document.deadlineAt).getTime() < new Date(document.awarenessAt).getTime()
    )
      issues.push("deadlineAt");
    if (document.responseState !== "open") needs(["responseEvidenceReference"]);
  }
  return [...new Set(issues)];
}

export type GovernanceTimer =
  | { state: "held" | "inactive" | "response_recorded" }
  | {
      state: "counting" | "overdue";
      kind: "notification" | "internal_review";
      at: string;
      timezone: string;
      source: string | null;
      remainingMs: number;
    };
/** Counts to a human-entered instant only. Working legal determinations never become timers. */
export function governanceTimer(
  document: GovernanceDocument,
  reviewed: boolean,
  now: Date,
): GovernanceTimer {
  if (document.kind !== "incident" && document.lifecycle === "retired")
    return { state: "inactive" as const };
  if (document.kind === "incident" && document.responseState === "closed" && reviewed)
    return { state: "response_recorded" as const };
  if (document.kind === "incident" && reviewed && document.notificationDecision === "required") {
    if (document.responseState !== "open") return { state: "response_recorded" as const };
    if (document.deadlineAt && document.deadlineTimezone && document.determinationReference) {
      const remainingMs = new Date(document.deadlineAt).getTime() - now.getTime();
      return {
        state: remainingMs <= 0 ? ("overdue" as const) : ("counting" as const),
        kind: "notification" as const,
        at: document.deadlineAt,
        timezone: document.deadlineTimezone,
        source: document.determinationReference,
        remainingMs,
      };
    }
  }
  if (document.nextReviewAt) {
    const remainingMs = new Date(document.nextReviewAt).getTime() - now.getTime();
    return {
      state: remainingMs <= 0 ? ("overdue" as const) : ("counting" as const),
      kind: "internal_review" as const,
      at: document.nextReviewAt,
      timezone: "UTC",
      source: document.reviewPolicyReference,
      remainingMs,
    };
  }
  return { state: "held" as const };
}

export function emptyGovernanceDocument(kind: GovernanceKind): GovernanceDocument {
  const shared = {
    title: "",
    ownerId: null,
    evidenceReference: null,
    reviewPolicyReference: null,
    nextAction: "",
    nextReviewAt: null,
  };
  switch (kind) {
    case "processing":
      return {
        ...shared,
        kind,
        lifecycle: "active",
        purpose: null,
        dataSubjects: null,
        dataClasses: null,
        recipients: null,
        systems: null,
        lawfulBasisReference: null,
        retentionReference: null,
        securityReference: null,
      };
    case "processor":
      return {
        ...shared,
        kind,
        lifecycle: "active",
        processorName: null,
        servicePurpose: null,
        dataClasses: null,
        processingRecordId: null,
        territories: null,
        transferState: "unknown",
        transferAssessmentReference: null,
        transferMechanismReference: null,
        agreementReference: null,
        retentionReference: null,
        securityReference: null,
      };
    case "incident":
      return {
        ...shared,
        kind,
        observedAt: null,
        awarenessAt: null,
        affectedScope: null,
        impactAssessmentReference: null,
        responsePolicyReference: null,
        notificationDecision: "pending",
        determinationById: null,
        determinationReference: null,
        deadlineAt: null,
        deadlineTimezone: null,
        responseState: "open",
        responseEvidenceReference: null,
      };
  }
}

export type GovernanceValues = Record<string, string>;
export function governanceToValues(document: GovernanceDocument): GovernanceValues {
  return Object.fromEntries(Object.entries(document).map(([key, value]) => [key, value ?? ""]));
}
export function governanceFromValues(kind: GovernanceKind, values: GovernanceValues) {
  const entries = Object.entries(emptyGovernanceDocument(kind)).map(([key, initial]) => [
    key,
    key === "kind" ? kind : initial === null ? values[key]?.trim() || null : (values[key] ?? ""),
  ]);
  return governanceDocumentSchema.parse(Object.fromEntries(entries));
}
