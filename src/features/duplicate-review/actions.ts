"use server";
import { redirect } from "next/navigation";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { deferContactReview } from "@/server/duplicate-review/review";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { isIssuedFormOperation } from "@/ui/form/server";
import type { ContactReviewState } from "./state";

function text(data: FormData, key: string) {
  const values = data.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string") throw new AppError("validation_failed");
  return values[0];
}
export async function deferContactReviewAction(
  locale: string,
  left: string,
  right: string,
  _previous: ContactReviewState,
  data: FormData,
): Promise<ContactReviewState> {
  const key =
    data.getAll("operationId").length === 1 && typeof data.get("operationId") === "string"
      ? String(data.get("operationId"))
      : "";
  const result = await action(
    async ({ db, session }) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!session) throw new AppError("unauthenticated");
      if (!isIssuedFormOperation(`contact-review:${session.account.id}:${left}:${right}`, key))
        throw new AppError("validation_failed");
      return deferContactReview(db, session, {
        operationId: key,
        left,
        right,
        leftVersion: Number(text(data, "leftVersion")),
        rightVersion: Number(text(data, "rightVersion")),
        inquiryId: text(data, "inquiryId"),
        nextStep: text(data, "nextStep"),
        reviewed: text(data, "reviewed") === "yes",
      });
    },
    { requireSession: true },
  );
  if (result.ok) redirect(`/${locale}/operations/duplicates/receipt?id=${result.data.operationId}`);
  // Unknown outcomes retain exactly the submitted key. A known rejection can be corrected.
  const retryKey = result.error.outcome === "unknown" ? key : _previous.operationId;
  return {
    operationId: retryKey,
    error: result.error.outcome === "unknown" ? "unknown" : "failure",
    nextStep:
      typeof data.get("nextStep") === "string" ? String(data.get("nextStep")).slice(0, 500) : "",
  };
}
