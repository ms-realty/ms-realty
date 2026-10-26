// C18/O26 · AT43/AT45. Native commands and private byte/range delivery share current authority.
import "server-only";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isPublicLocale } from "@/i18n/config";
import { nativeAuthRoute } from "../auth/native";
import { currentStaffAccess } from "../auth/pages";
import { getEnv } from "../config/env";
import { AppError, isAppError } from "../errors";
import { fileServices } from "../files/config";
import { downloadResponse } from "../files/download";
import {
  correlationIdFrom,
  errorResponse,
  hostContextOf,
  identify,
  requireSession,
} from "../http/request";
import {
  attachPrivacyExportSupplement,
  capturePrivacyExportManifest,
  completePrivacyExport,
  exportSections,
  issuePrivacyExport,
  preparePrivacyExport,
  privacyExportDownload,
  redactPrivacyExport,
  reviewPrivacyExportCategory,
  revokePrivacyExport,
} from "./exports";

const path = (locale: string, id: string) => `/${locale}/operations/privacy/${id}/export`;
const text = (form: FormData, name: string) => String(form.get(name) ?? "");
export const privacyExportFormRoute = nativeAuthRoute(
  "staff",
  (locale, params) => path(locale, params.id ?? ""),
  async ({ db, form, locale, params }) => {
    const requestId = z.uuid().parse(params.id),
      access = await currentStaffAccess();
    if (access.state !== "ready") throw new AppError("unauthenticated");
    const envelope = {
      operationId: text(form, "operationId"),
      requestId,
      expectedVersion: Number(text(form, "expectedVersion")),
    };
    let result: { operationId: string };
    const frozen = {
      ...envelope,
      exportId: text(form, "exportId"),
      exportVersion: Number(text(form, "exportVersion")),
      digest: text(form, "digest"),
    };
    try {
      if (text(form, "intent") === "prepare")
        result = await preparePrivacyExport(db, access.session, {
          ...envelope,
          recipientId: text(form, "recipientId"),
          confirmed: form.get("confirmed") === "yes",
        });
      else if (text(form, "intent") === "inventory")
        result = await capturePrivacyExportManifest(db, access.session, frozen);
      else if (text(form, "intent") === "disposition") {
        const sourceKeys = form.getAll("sourceKey").map(String);
        result = await reviewPrivacyExportCategory(db, access.session, {
          ...frozen,
          reviewDigest: text(form, "reviewDigest"),
          category: text(form, "category"),
          disposition: text(form, "disposition"),
          basis: text(form, "basis"),
          policyReference: text(form, "policyReference"),
          evidenceReference: text(form, "evidenceReference"),
          sourceKeys,
          evidence: sourceKeys.flatMap((sourceKey) => {
            const documentVersionId = text(form, `proof:${sourceKey}`);
            return documentVersionId ? [{ sourceKey, documentVersionId }] : [];
          }),
          confirmed: form.get("confirmed") === "yes",
        });
      } else if (text(form, "intent") === "complete")
        result = await completePrivacyExport(db, access.session, {
          ...frozen,
          reviewDigest: text(form, "reviewDigest"),
          confirmed: form.get("confirmed") === "yes",
        });
      else if (text(form, "intent") === "redact") {
        const omitTexts = form.getAll("omitText").map((value) => {
          const [section, id, extra] = String(value).split(":");
          if (extra || !exportSections.includes(section as (typeof exportSections)[number]))
            throw new AppError("validation_failed");
          return { section, id };
        });
        result = await redactPrivacyExport(db, access.session, {
          ...envelope,
          exportId: text(form, "exportId"),
          exportVersion: Number(text(form, "exportVersion")),
          digest: text(form, "digest"),
          omitTexts,
        });
      } else if (text(form, "intent") === "issue") {
        result = await issuePrivacyExport(db, access.session, {
          ...envelope,
          exportId: text(form, "exportId"),
          exportVersion: Number(text(form, "exportVersion")),
          digest: text(form, "digest"),
          expiresMinutes: Number(text(form, "expiresMinutes")),
          reviewed: form.get("reviewed") === "yes",
          partialAcknowledged: form.get("partialAcknowledged") === "yes",
        });
      } else if (text(form, "intent") === "supplement")
        result = await attachPrivacyExportSupplement(db, fileServices().storage, access.session, {
          ...envelope,
          exportId: text(form, "exportId"),
          exportVersion: Number(text(form, "exportVersion")),
          digest: text(form, "digest"),
          documentVersionId: text(form, "documentVersionId"),
          category: text(form, "category"),
          reviewedRedaction: form.get("reviewedRedaction") === "yes",
        });
      else if (text(form, "intent") === "revoke")
        result = await revokePrivacyExport(db, access.session, {
          ...envelope,
          exportId: text(form, "exportId"),
          exportVersion: Number(text(form, "exportVersion")),
          confirmed: form.get("confirmed") === "yes",
        });
      else throw new AppError("validation_failed");
    } catch (error) {
      if (isAppError(error) && ["operation_pending", "outcome_unknown"].includes(error.code))
        return `${path(locale, requestId)}?operation=${encodeURIComponent(envelope.operationId)}`;
      throw error;
    }
    return `${path(locale, requestId)}?receipt=${result.operationId}`;
  },
);

export async function privacyExportGet(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const { locale, id } = await params,
    env = getEnv();
  if (
    hostContextOf(request.headers, env) !== "client" ||
    !isPublicLocale(locale) ||
    !z.uuid().safeParse(id).success
  )
    return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
  try {
    const db = getDb(),
      session = requireSession(await identify(db, request.headers, env));
    const file = await privacyExportDownload(db, session, id);
    return downloadResponse(file, request.headers.get("range"));
  } catch (error) {
    return errorResponse(error, correlationIdFrom(request.headers));
  }
}
