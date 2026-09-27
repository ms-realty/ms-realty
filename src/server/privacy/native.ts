import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { operations } from "@/db/schema";
import type { PublicLocale } from "@/domain/ids";
import { nativeAuthRoute } from "../auth/native";
import { currentClientSession, currentStaffAccess } from "../auth/pages";
import type { Session } from "../auth/sessions";
import type { Executor } from "../db";
import { AppError, isAppError } from "../errors";
import {
  changeSubscription,
  editSearchSubscription,
  optIn,
  saveContactPreferences,
} from "./preferences";
import { reviewPrivacyRequest, submitPrivacyRequest } from "./requests";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const checked = (form: FormData, key: string) => form.get(key) === "yes";

export async function privateReceipt(db: Executor, session: Session, id: unknown) {
  if (!z.uuid().safeParse(id).success) return null;
  const [receipt] = await db
    .select({ id: operations.id, type: operations.operationType })
    .from(operations)
    .where(
      and(
        eq(operations.id, id as string),
        eq(operations.actorKind, session.actor.kind),
        eq(operations.actorId, session.actor.id),
        eq(operations.status, "succeeded"),
      ),
    );
  return receipt && /^(privacy|preferences)\./.test(receipt.type) ? receipt.id : null;
}

export function privacyFormRoute(area: "privacy" | "preferences" | "operations/privacy") {
  const staff = area === "operations/privacy";
  return nativeAuthRoute(
    staff ? "staff" : "client",
    (locale) => `/${locale}/${area}`,
    async ({ db, form, locale }) => {
      const access = staff ? await currentStaffAccess() : null;
      const session = staff
        ? access?.state === "ready"
          ? access.session
          : null
        : await currentClientSession();
      if (!session) throw new AppError("unauthenticated");
      const intent = text(form, "intent");
      const envelope = {
        operationId: text(form, "operationId"),
        id: text(form, "id"),
        expectedVersion: Number(text(form, "expectedVersion")),
      };
      let result: { operationId: string };
      try {
        if (area === "privacy" && intent === "request")
          result = await submitPrivacyRequest(db, session, {
            operationId: envelope.operationId,
            kind: text(form, "kind"),
            description: text(form, "description"),
            confirmed: checked(form, "confirmed"),
          });
        else if (staff && intent === "review")
          result = await reviewPrivacyRequest(db, session, {
            ...envelope,
            to: text(form, "to"),
            responsibleId: text(form, "responsibleId"),
            policyReference: text(form, "policyReference"),
            dueAt: text(form, "dueAt")
              ? new Date(`${text(form, "dueAt")}T12:00:00.000Z`).toISOString()
              : null,
            identityReviewed: checked(form, "identityReviewed"),
            legalHoldReason: text(form, "legalHoldReason"),
            legalHoldDisposition: text(form, "legalHoldDisposition"),
            holdResolved: checked(form, "holdResolved"),
            completionEvidence: text(form, "completionEvidence"),
            rejectionReason: text(form, "rejectionReason"),
            confirmed: checked(form, "confirmed"),
          });
        else if (area === "preferences" && intent === "contact")
          result = await saveContactPreferences(db, session, {
            ...envelope,
            locale: text(form, "preferredLocale"),
            timezone: text(form, "timezone"),
            channel: text(form, "channel"),
            contactWindow: text(form, "contactWindow"),
          });
        else if (area === "preferences" && intent === "subscription")
          result = await changeSubscription(db, session, {
            ...envelope,
            state: text(form, "state"),
          });
        else if (area === "preferences" && intent === "edit_search")
          result = await editSearchSubscription(db, session, {
            ...envelope,
            locale,
            termsVersionId: text(form, "termsVersionId"),
            confirmed: checked(form, "confirmed"),
            timezone: text(form, "timezone"),
            frequency: text(form, "frequency"),
            purpose: text(form, "searchPurpose"),
            q: text(form, "q"),
            maxPrice: text(form, "maxPrice")
              ? Math.round(Number(text(form, "maxPrice")) * 100)
              : null,
          });
        else if (area === "preferences" && intent === "opt_in")
          result = await optIn(db, session, {
            operationId: envelope.operationId,
            contactMethodId: text(form, "contactMethodId"),
            purpose: text(form, "purpose"),
            locale: locale as PublicLocale,
            termsVersionId: text(form, "termsVersionId"),
            confirmed: checked(form, "confirmed"),
            timezone: text(form, "timezone"),
            frequency: text(form, "frequency") || "daily",
            search: {
              purpose: text(form, "searchPurpose") || "sale",
              q: text(form, "q"),
              ...(text(form, "maxPrice")
                ? {
                    price: {
                      currency: "EUR",
                      max: Math.round(Number(text(form, "maxPrice")) * 100),
                    },
                  }
                : {}),
            },
          });
        else throw new AppError("validation_failed");
      } catch (error) {
        if (isAppError(error) && error.code === "step_up_required")
          return `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/${area}`)}`;
        throw error;
      }
      return `/${locale}/${area}?receipt=${result.operationId}`;
    },
  );
}
