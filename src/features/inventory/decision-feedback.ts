import type { ErrorBody } from "@/server/errors";
import type { FormOutcome, RecoveryLink } from "@/ui/form/contract";
import { inventoryCopy } from "./copy";
import {
  type InventoryDecisionContext,
  type InventoryDecisionValues,
  inventoryDecisionSection,
  inventorySections,
} from "./decision-contract";
import { inventoryDecisionCopy } from "./decision-copy";

/** Only known error codes become copy. Never render a provider/database error as a blocker. */
export function inventoryDecisionFeedback(
  error: ErrorBody,
  context: InventoryDecisionContext,
  values: InventoryDecisionValues,
  status: RecoveryLink,
): FormOutcome<InventoryDecisionValues> {
  const copy = inventoryCopy(context.locale),
    feedback = inventoryDecisionCopy(context.locale);
  const href = `/${context.locale}/inventory/${context.reference}`;
  const current = {
    // A fresh query reloads the reviewed record instead of retaining an old rejected form.
    href: `${href}?tab=review&review=${encodeURIComponent(error.correlationId)}#${inventoryDecisionSection(context.intent)}`,
    label: feedback.review,
  };
  if (error.code === "OPERATION_PENDING")
    return { kind: "accepted", message: copy.pending, status };
  if (error.outcome === "unknown")
    return { kind: "unknown", code: "OUTCOME_UNKNOWN", message: copy.form.unknown, status };
  if (error.code === "REVISION_CONFLICT" || error.code === "IDEMPOTENCY_KEY_REUSED")
    return { kind: "conflict", code: error.code, message: feedback.changed, recovery: current };
  if (error.code === "VALIDATION_FAILED") {
    const fields = error.fieldErrors ?? {};
    const fieldErrors: Partial<Record<keyof InventoryDecisionValues, string[]>> = {};
    if (["scope", "note", "reason", "evidence"].some((key) => fields[key]))
      fieldErrors.scope = [feedback.noteRequired];
    if (fields.confirmed) fieldErrors.confirmed = [feedback.confirmRequired];
    if (fields.publicationLocale) fieldErrors.publicationLocale = [feedback.localeRequired];
    if (Object.keys(fieldErrors).length)
      return {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.form.errorSummary,
        fieldErrors,
      };
  }
  if (error.code === "STEP_UP_REQUIRED" || error.code === "UNAUTHENTICATED")
    return {
      kind: "rejected",
      code: error.code,
      message: feedback.stepUp,
      retryable: false,
      recovery: {
        href: `/${context.locale}/access/reauth?returnTo=${encodeURIComponent(current.href)}`,
        label: feedback.reauthenticate,
      },
    };
  if (error.code === "NOT_AUTHORIZED" || error.code === "NOT_FOUND")
    return { kind: "rejected", code: error.code, message: feedback.forbidden, retryable: false };

  const reason =
    error.fieldErrors?.publication?.[0] ??
    (error.code === "APPROVAL_STALE" ? "approval_stale" : "");
  if (reason === "generation_superseded" || reason === "manifest_superseded")
    return {
      kind: "rejected",
      code: error.code,
      message: feedback.changed,
      retryable: false,
      recovery: current,
    };
  const missingFacts = Object.keys(error.fieldErrors ?? {}).some((key) => key.startsWith("fact."));
  const blocker = missingFacts ? "missing_facts" : reason;
  if (Object.hasOwn(feedback.blockers, blocker)) {
    const recovery =
      reason === "seller_instruction_required"
        ? { href: `${href}/evidence`, label: feedback.evidence }
        : reason === "media_not_eligible"
          ? { href: `${href}/media`, label: feedback.media }
          : reason === "locale_not_approved_for_source" &&
              /^(en|ru|de|nl|el|he)$/.test(values.publicationLocale)
            ? {
                href: `${href}/translations/${values.publicationLocale}`,
                label: feedback.translation,
              }
            : {
                href: `${href}?tab=review&review=${encodeURIComponent(error.correlationId)}#${reason === "listing_withdrawn" ? inventorySections.readiness : inventorySections.review}`,
                label: feedback.review,
              };
    return {
      kind: "rejected",
      code: error.code,
      message: feedback.blockers[blocker as keyof typeof feedback.blockers],
      retryable: false,
      recovery,
    };
  }
  return {
    kind: "rejected",
    code: error.code,
    message: error.retryable ? feedback.unavailable : copy.blocked,
    retryable: error.retryable,
    recovery: current,
  };
}
