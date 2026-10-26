// O26/F30: host/origin/session checked native POST; no effect from a GET.
import "server-only";
import { z } from "zod";
import { erasureCategories } from "@/domain/privacy-erasure";
import { nativeAuthRoute } from "../auth/native";
import { currentStaffAccess } from "../auth/pages";
import { AppError, isAppError, wireCode } from "../errors";
import { applyPrivacyErasure, completePrivacyErasure } from "./erasure";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const path = (locale: string, id: string) => `/${locale}/operations/privacy/${id}/erasure`;
export const privacyErasureFormRoute = nativeAuthRoute(
  "staff",
  (locale, params) => path(locale, params.id ?? ""),
  async ({ db, form, locale, params }) => {
    const requestId = z.uuid().parse(params.id),
      access = await currentStaffAccess();
    if (access.state !== "ready") throw new AppError("unauthenticated");
    const type = z.enum(["apply", "complete"]).parse(text(form, "intent"));
    const envelope = {
      requestId,
      operationId: text(form, "operationId"),
      expectedVersion: Number(text(form, "expectedVersion")),
    };
    const position = new URLSearchParams({
      operation: envelope.operationId,
      type,
      version: String(envelope.expectedVersion),
    });
    try {
      const result =
        type === "apply"
          ? await applyPrivacyErasure(db, access.session, {
              ...envelope,
              inventoryDigest: text(form, "inventoryDigest"),
              purposes: form.getAll("purpose").map(String),
              decisions: erasureCategories.map((category) => ({
                category,
                disposition: text(form, `disposition:${category}`),
                classification: text(form, `classification:${category}`),
                sourceKeys: form.getAll(`source:${category}`).map(String),
                evidenceReference: text(form, `evidence:${category}`),
              })),
              confirmed: form.get("confirmed") === "yes",
            })
          : await completePrivacyErasure(db, access.session, {
              ...envelope,
              sequence: Number(text(form, "sequence")),
              digest: text(form, "digest"),
              confirmed: form.get("confirmed") === "yes",
            });
      position.set("receipt", result.operationId);
    } catch (error) {
      if (!isAppError(error)) throw error;
      // Preserve the issued exact key and version even when a reply was uncertain.
      position.set("error", wireCode(error.code));
      if (error.code === "step_up_required")
        return `/${locale}/access/reauth?returnTo=${encodeURIComponent(`${path(locale, requestId)}?${position}`)}`;
    }
    return `${path(locale, requestId)}?${position}`;
  },
);
