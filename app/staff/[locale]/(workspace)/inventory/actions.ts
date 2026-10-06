"use server";
import { randomUUID } from "node:crypto";
import { parseDateTime } from "@internationalized/date";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { operations } from "@/db/schema";
import { inventoryCopy } from "@/features/inventory/copy";
import {
  type InventoryDecisionContext,
  type InventoryDecisionValues,
  inventoryDecisionIntents,
  inventoryDecisionSection,
} from "@/features/inventory/decision-contract";
import { inventoryDecisionCopy } from "@/features/inventory/decision-copy";
import { inventoryDecisionFeedback } from "@/features/inventory/decision-feedback";
import type { InventoryValues } from "@/features/inventory/editor";
import { safeNext } from "@/features/inventory/next";
import { savedAckField, savedOperationCookie } from "@/features/inventory/saved-operation";
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
import { draftSchema, emptyDraft } from "@/server/inventory/contracts";
import { workingDraftFrom } from "@/server/inventory/working-draft";
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
  const priceDecision = reference ? String(form.get("_priceDecision") ?? "") : "";
  // UX 03.3 without JavaScript: Photos/Review submit `_leave`. An unchanged draft goes on;
  // unsaved work gets Save draft (the form) / Discard (the destination) / Stay (the values).
  const leave = reference ? safeNext(locale, form.get("_leave")) : null;
  if (leave && reference) {
    const current = await action(
      async ({ db }) => {
        const access = await currentStaffAccess();
        if (access.state !== "ready") throw new AppError("unauthenticated");
        return inventoryDetail(db, access.session.actor, reference);
      },
      { requireSession: true },
    );
    if (current.ok) {
      const stored = draftSchema.safeParse(current.data.listing.draft);
      const saved: Record<string, string> = stored.success
        ? stored.data
        : workingDraftFrom(current.data.revision, current.data.facts);
      if (
        Object.keys(emptyDraft).every(
          (key) => (saved[key] ?? "") === values[key as keyof InventoryValues],
        )
      )
        redirect(leave);
    }
    return {
      ...state,
      outcome: {
        kind: "rejected",
        code: "UNSAVED_CHANGES",
        message: copy.o12.unsavedNative,
        retryable: true,
        recovery: { href: leave, label: copy.o12.discard },
      },
    };
  }
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
        ? saveListingDraft(db, {
            ...command,
            reference,
            draft,
            // The broker's explicit choice to keep an uncarriable source price unknown, bound to
            // the revision it was shown against; the command rejects a stale or missing one.
            ...(priceDecision
              ? {
                  priceDecision: {
                    kind: "retain_unknown" as const,
                    sourceRevisionId: priceDecision,
                  },
                }
              : {}),
          })
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
    const next = safeNext(locale, form.get("_next"));
    // O12SAVED: an edit lands on its focused receipt, rendered only for this actor's own save.
    if (reference) {
      // Acknowledge this exact submit to the unsaved-work guard before the receipt's full page
      // load. Without a valid nonce (no script) there is no guard to tell.
      const ack = String(form.get(savedAckField) ?? "");
      if (/^[0-9a-f-]{36}$/.test(ack))
        (await cookies()).set(savedOperationCookie, ack, {
          path: "/",
          maxAge: 60,
          sameSite: "strict",
        });
      redirect(
        `/${locale}/inventory/${encodeURIComponent(ref)}?saved=${encodeURIComponent(operationId)}${form.get("_tab") === "facts" ? "&tab=facts" : ""}${next ? `&next=${encodeURIComponent(next)}` : ""}`,
      );
    }
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
        // The price decision is shown at the price status it decides about.
        key === "priceDecision" ? "priceState" : key.replace(/^draft\./, ""),
        key === "priceDecision" ? [copy.o12.priceUnknownError] : messages,
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
  // A newer version, or an operation this editor already completed (a page kept after its
  // save): show the latest and offer a deliberate reapply on a fresh operation.
  if (
    (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED") &&
    reference
  ) {
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
          code: error.code,
          message: error.code === "IDEMPOTENCY_KEY_REUSED" ? copy.o12.keptSaved : error.message,
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

async function runInventoryDecision(form: FormData, preserveDraft = false) {
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
      // Input validation happens before a durable command starts, so a corrected draft may
      // retain this operation key. A recorded rejection must be reviewed as a new decision.
      if (preserveDraft && intent !== "freeze") {
        const fieldErrors: Record<string, string[]> = {};
        const note = String(form.get("scope") ?? "").trim();
        if (note.length < 5 || note.length > 1000) fieldErrors.scope = ["review_note_required"];
        if (form.get("confirmed") !== "yes")
          fieldErrors.confirmed = ["review_confirmation_required"];
        if (intent === "prepare" && !isPublicLocale(String(form.get("publicationLocale"))))
          fieldErrors.publicationLocale = ["supported_locale_required"];
        if (Object.keys(fieldErrors).length)
          throw new AppError("validation_failed", { fieldErrors });
      }
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
                publication: ["restrict_affected_publications_first"],
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
  return result;
}

/** Legacy evidence forms retain their native adapter; workbench decisions use typed state. */
export async function inventoryDecision(form: FormData): Promise<void> {
  const locale = String(form.get("locale") ?? ""),
    reference = String(form.get("reference") ?? ""),
    key = String(form.get("operationId") ?? "");
  const result = await runInventoryDecision(form);
  if (!result.ok) {
    if (result.error.code === "STEP_UP_REQUIRED")
      redirect(
        `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/inventory/${reference}`)}`,
      );
    redirect(`/${locale}/inventory/${reference}?error=${encodeURIComponent(result.error.code)}`);
  }
  redirect(`/${locale}/inventory/operations/${key}?reference=${encodeURIComponent(reference)}`);
}

/** O12/O16: progressive enhancement preserves one draft and command identity per decision. */
export async function submitInventoryDecision(
  context: InventoryDecisionContext,
  _previous: FormState<InventoryDecisionValues>,
  form: FormData,
): Promise<FormState<InventoryDecisionValues>> {
  if (!isStaffLocale(context.locale) || !inventoryDecisionIntents.includes(context.intent))
    throw new AppError("not_found");
  const values: InventoryDecisionValues = {
    scope: String(form.get("scope") ?? ""),
    confirmed: form.get("confirmed") === "yes" ? "yes" : "",
    publicationLocale: String(form.get("publicationLocale") ?? "bg"),
  };
  const copy = inventoryCopy(context.locale),
    feedback = inventoryDecisionCopy(context.locale);
  const operationId = String(form.get(formFields.operationId) ?? "");
  const expectedRevision = Number(form.get(formFields.expectedRevision));
  const reconciliation = {
    href: `/${context.locale}/inventory/operations/${encodeURIComponent(operationId)}?reference=${encodeURIComponent(context.reference)}`,
    label: copy.operation,
  };
  const state: FormState<InventoryDecisionValues> = {
    values,
    operationId,
    expectedRevision,
    reconciliation,
    responseId: randomUUID(),
    outcome: { kind: "idle" },
  };
  const command = new FormData();
  for (const [key, value] of Object.entries(values)) command.set(key, value);
  for (const [key, value] of Object.entries(context))
    if (value !== undefined) command.set(key, value);
  command.set("operationId", operationId);
  command.set("expectedRevision", String(expectedRevision));
  const result = await runInventoryDecision(command, true);
  if (!result.ok)
    return {
      ...state,
      outcome: inventoryDecisionFeedback(result.error, context, values, reconciliation),
    };
  const receipt = await action(
    async ({ db }) => {
      const [row] = await db
        .select({ completedAt: operations.completedAt })
        .from(operations)
        .where(eq(operations.id, result.data.operationId));
      if (!row?.completedAt) throw new AppError("outcome_unknown");
      return row.completedAt.toISOString();
    },
    { requireSession: true },
  );
  if (!receipt.ok)
    return {
      ...state,
      outcome: {
        kind: "unknown",
        code: "OUTCOME_UNKNOWN",
        message: copy.form.unknown,
        status: reconciliation,
      },
    };
  return {
    ...state,
    outcome: {
      kind: "confirmed",
      receipt: {
        title: copy.succeeded,
        reference: context.reference,
        recordedAt: {
          dateTime: receipt.data,
          label: new Date(receipt.data).toLocaleString(context.locale),
        },
        nextStep: feedback.next,
        destination: {
          // Force a fresh GET even for hydrated actions, then return to the same section.
          href: `/${context.locale}/inventory/${context.reference}?tab=review&operation=${operationId}#${inventoryDecisionSection(context.intent)}`,
          label: copy.open,
        },
      },
    },
  };
}
