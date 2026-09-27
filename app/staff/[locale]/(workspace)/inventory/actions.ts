"use server";
import { randomUUID } from "node:crypto";
import { parseDateTime } from "@internationalized/date";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { operations } from "@/db/schema";
import { inventoryCopy } from "@/features/inventory/copy";
import type { InventoryValues } from "@/features/inventory/editor";
import { agencyTimeZone, isPublicLocale, isStaffLocale } from "@/i18n/config";
import { currentStaffAccess } from "@/server/auth/pages";
import { requireFreshAuth, requireLiveSession } from "@/server/auth/sessions";
import { assertCan } from "@/server/authz";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import {
  confirmListingAvailability,
  createListingDraft,
  freezeListingDraft,
  inventoryDetail,
  recordSellerInstruction,
  reviewSellerAuthority,
  saveListingDraft,
} from "@/server/inventory/commands";
import { emptyDraft } from "@/server/inventory/contracts";
import {
  activateManifest,
  approveFactRevision,
  approveListingRevision,
  prepareManifest,
  restrictPublication,
  submitListingRevision,
  withdrawPublication,
} from "@/server/publication/commands";
import type { FormState } from "@/ui/form/contract";
import { formFields } from "@/ui/form/contract";

export async function saveInventory(
  locale: string,
  reference: string | null,
  _previous: FormState<InventoryValues>,
  form: FormData,
): Promise<FormState<InventoryValues>> {
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const copy = inventoryCopy(locale);
  const values = Object.fromEntries(
    Object.keys(copy.labels).map((key) => [key, String(form.get(key) ?? "")]),
  ) as InventoryValues;
  const reapply = form.get(formFields.intent) === "reapply";
  const operationId = String(
    form.get(reapply ? formFields.reapplyOperationId : formFields.operationId) ?? "",
  );
  const expectedRevision = Number(
    form.get(reapply ? formFields.reapplyRevision : formFields.expectedRevision),
  );
  const status = {
    href: `/${locale}/inventory/operations/${encodeURIComponent(operationId)}`,
    label: copy.operation,
  };
  const state: FormState<InventoryValues> = {
    values,
    operationId,
    expectedRevision,
    responseId: randomUUID(),
    reconciliation: status,
    outcome: { kind: "idle" },
  };
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const session = await requireLiveSession(db, access.session);
      const draft = Object.fromEntries(
        Object.keys(emptyDraft).map((key) => [key, values[key as keyof InventoryValues]]),
      );
      const command = { actor: session.actor, operationId, expectedRevision };
      const recorded = await (reference
        ? saveListingDraft(db, { ...command, reference, draft })
        : createListingDraft(db, { ...command, input: { ...values, draft } }));
      const [receipt] = await db
        .select({ completedAt: operations.completedAt })
        .from(operations)
        .where(eq(operations.id, recorded.operationId));
      if (!receipt?.completedAt) throw new AppError("outcome_unknown");
      return { ...recorded, completedAt: receipt.completedAt.toISOString() };
    },
    { requireSession: true },
  );
  if (result.ok) {
    const ref = result.data.outcome.reference;
    return {
      ...state,
      outcome: {
        kind: "confirmed",
        receipt: {
          title: copy.saved,
          reference: ref,
          recordedAt: {
            dateTime: result.data.completedAt,
            label: new Date(result.data.completedAt).toLocaleString(locale),
          },
          nextStep: copy.next,
          destination: { href: `/${locale}/inventory/${ref}`, label: copy.open },
        },
      },
    };
  }
  const error = result.error;
  if (error.code === "VALIDATION_FAILED") {
    const errors = Object.fromEntries(
      Object.entries(error.fieldErrors ?? {}).map(([key, messages]) => [
        key.replace(/^draft\./, ""),
        messages,
      ]),
    );
    return {
      ...state,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.form.errorSummary,
        fieldErrors: errors,
      },
    };
  }
  if (error.code === "REVISION_CONFLICT" && reference) {
    const fresh = await action(
      async ({ db }) => {
        const access = await currentStaffAccess();
        if (access.state !== "ready") throw new AppError("unauthenticated");
        return inventoryDetail(db, access.session.actor, reference);
      },
      { requireSession: true },
    );
    if (fresh.ok) {
      const key = randomUUID();
      return {
        ...state,
        outcome: {
          kind: "conflict",
          code: "REVISION_CONFLICT",
          message: error.message,
          latest: {
            revision: fresh.data.listing.version,
            values: { ...values, ...(fresh.data.listing.draft as Partial<InventoryValues>) },
          },
          reapply: {
            operationId: key,
            expectedRevision: fresh.data.listing.version,
            status: { href: `/${locale}/inventory/operations/${key}`, label: copy.operation },
          },
        },
      };
    }
  }
  if (error.outcome === "unknown")
    return {
      ...state,
      outcome: { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.form.unknown, status },
    };
  return {
    ...state,
    outcome: {
      kind: "rejected",
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      recovery: { href: `/${locale}/inventory/${reference ?? "new"}`, label: copy.open },
    },
  };
}

export async function inventoryDecision(form: FormData): Promise<void> {
  const locale = String(form.get("locale") ?? "");
  if (!isStaffLocale(locale)) throw new AppError("not_found");
  const reference = String(form.get("reference") ?? "");
  const key = String(form.get("operationId") ?? "");
  const intent = String(form.get("intent") ?? "");
  const result = await action(
    async ({ db }) => {
      const access = await currentStaffAccess();
      if (access.state !== "ready") throw new AppError("unauthenticated");
      const session = await requireLiveSession(db, access.session);
      const detail = await inventoryDetail(db, session.actor, reference);
      const common = {
        actor: session.actor,
        operationId: key,
        expectedRevision: Number(form.get("expectedRevision")),
        reference,
      };
      if (!/^[0-9a-f-]{36}$/.test(key) || !Number.isSafeInteger(common.expectedRevision))
        throw new AppError("validation_failed");
      if (intent === "freeze") return freezeListingDraft(db, common);
      if (form.get("confirmed") !== "yes") throw new AppError("validation_failed");
      if (intent === "availability")
        return confirmListingAvailability(db, {
          ...common,
          evidence: String(form.get("scope") ?? ""),
        });
      requireFreshAuth(session);
      if (intent === "authority")
        return reviewSellerAuthority(db, {
          ...common,
          partyId: String(form.get("partyId") ?? ""),
          documentVersionId: String(form.get("documentVersionId") ?? ""),
          role: String(form.get("role") ?? "") as
            | "seller"
            | "landlord"
            | "authorized_representative",
          note: String(form.get("scope") ?? ""),
        });
      function localInstant(field: string, optional = false) {
        const value = String(form.get(field) ?? "");
        if (!value && optional) return null;
        try {
          return parseDateTime(value).toDate(agencyTimeZone, "reject").toISOString();
        } catch {
          throw new AppError("validation_failed", {
            fieldErrors: { [field]: ["Enter a unique valid time in Europe/Sofia."] },
          });
        }
      }
      if (intent === "instruction")
        return recordSellerInstruction(db, {
          ...common,
          input: {
            partyId: String(form.get("partyId") ?? ""),
            documentVersionId: String(form.get("documentVersionId") ?? ""),
            representationScope: String(form.get("representationScope") ?? ""),
            commissionTerms: String(form.get("commissionTerms") ?? ""),
            agreedAt: localInstant("agreedAt"),
            expiresAt: localInstant("expiresAt", true),
            publicationPermission: form.get("publicationPermission") === "yes",
            mediaUsageGranted: form.get("mediaUsageGranted") === "yes",
          },
        });
      const reason = String(form.get("scope") ?? "").trim();
      // Recheck grants before a stored operation can be replayed; commands check again inside.
      const capability =
        intent === "submit"
          ? "listing.edit"
          : ["facts", "approve"].includes(intent)
            ? "listing.review_facts"
            : "publication.release";
      await assertCan(db, session.actor, capability, {
        type: "listing",
        id: detail.listing.id,
        propertyId: detail.property.id,
      });
      const revisionId = String(form.get("revisionId") ?? "");
      switch (intent) {
        case "facts": {
          // A confirmed correction must fence existing exposure before replacing its facts.
          if (
            detail.publications.some((p) => p.state === "active") &&
            detail.property.approvedFactRevisionId !== detail.revision?.factRevisionId
          ) {
            throw new AppError("publication_ineligible", {
              fieldErrors: {
                publication: [
                  "Restrict the existing publication before approving a changed factual revision.",
                ],
              },
            });
          }
          if (!detail.revision || detail.revision.id !== revisionId)
            throw new AppError("version_conflict");
          return approveFactRevision(db, {
            ...common,
            factRevisionId: detail.revision.factRevisionId,
            scope: reason,
          });
        }
        case "submit":
          return submitListingRevision(db, { ...common, revisionId });
        case "approve":
          return approveListingRevision(db, { ...common, revisionId, note: reason });
        case "prepare": {
          const language = String(form.get("publicationLocale") ?? "bg");
          if (!isPublicLocale(language)) throw new AppError("validation_failed");
          return prepareManifest(db, { ...common, locale: language });
        }
        case "activate":
          return activateManifest(db, {
            ...common,
            manifestId: String(form.get("manifestId") ?? ""),
          });
        case "restrict":
          return restrictPublication(db, { ...common, reason });
        case "withdraw":
          return withdrawPublication(db, { ...common, reason });
        default:
          throw new AppError("validation_failed");
      }
    },
    { requireSession: true },
  );
  if (!result.ok) {
    if (result.error.code === "STEP_UP_REQUIRED")
      redirect(
        `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/inventory/${reference}`)}`,
      );
    redirect(`/${locale}/inventory/${reference}?error=${encodeURIComponent(result.error.code)}`);
  }
  redirect(`/${locale}/inventory/operations/${key}?reference=${encodeURIComponent(reference)}`);
}
