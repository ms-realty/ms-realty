import { z } from "zod";
import { getDb } from "@/db/client";
import { isRoutableLocale } from "@/i18n/config";
import { readCookie } from "@/server/auth/cookies";
import { getEnv } from "@/server/config/env";
import { AppError, isAppError } from "@/server/errors";
import { fileServices } from "@/server/files/config";
import { boundedFileForm } from "@/server/files/native";
import {
  assertSameOrigin,
  clientIpFrom,
  correlationIdFrom,
  errorResponse,
  hostContextOf,
} from "@/server/http/request";
import {
  maxInquiryPhotoBytes,
  ownerPhotoInquiry,
  receiveInquiryPhoto,
} from "@/server/inquiries/attachments";
import { receiptCookieName, validReceiptSession } from "@/server/inquiries/intake";
import { getJobQueue } from "@/server/jobs/web";
import { enforceRateLimit } from "@/server/rate-limit";
import { assertRecoveryOpen } from "@/server/recovery/quarantine";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ submission: string }> },
) {
  const env = getEnv();
  const locale = new URL(request.url).searchParams.get("locale") ?? "bg";
  if (hostContextOf(request.headers, env) !== "public" || !isRoutableLocale(locale))
    return new Response(null, { status: 404 });
  const { submission: receiptId } = await params;
  const owner = {
    submissionKey: receiptId,
    receiptSession: validReceiptSession(
      readCookie(request.headers.get("cookie"), receiptCookieName(env)),
    ),
  };
  let operationId = "";
  const redirect = (code?: string) => {
    const target = new URL(
      `/${locale}/requests/${encodeURIComponent(receiptId)}`,
      env.hosts.public,
    );
    if (z.uuid().safeParse(operationId).success)
      target.searchParams.set("photoOperation", operationId);
    if (code) target.searchParams.set("photoError", code);
    return new Response(null, {
      status: 303,
      headers: { location: target.toString(), "cache-control": "no-store" },
    });
  };
  try {
    const headers = new Headers(request.headers);
    // Only this native file form may use a browser-proven same-origin opaque Origin.
    if (
      headers.get("origin") === "null" &&
      headers.get("sec-fetch-site") === "same-origin" &&
      headers.get("sec-fetch-mode") === "navigate" &&
      headers.get("sec-fetch-dest") === "document"
    )
      headers.set("origin", env.hosts.public);
    assertSameOrigin(headers, env.hosts.public);
    const db = getDb();
    await assertRecoveryOpen(db);
    await ownerPhotoInquiry(db, owner, true);
    await enforceRateLimit(db, "inquiry_photo.ip", clientIpFrom(request.headers));
    const form = await boundedFileForm(request, maxInquiryPhotoBytes + 64 * 1024).catch(() => {
      throw new AppError("validation_failed");
    });
    operationId = String(form.get("operationId") ?? "");
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > maxInquiryPhotoBytes ||
      form.getAll("file").length !== 1 ||
      form.getAll("operationId").length !== 1 ||
      form.getAll("sharedForInquiry").length !== 1 ||
      [...form.keys()].some((key) => !["file", "operationId", "sharedForInquiry"].includes(key))
    )
      throw new AppError("validation_failed");
    await receiveInquiryPhoto(db, fileServices(), await getJobQueue(), {
      ...owner,
      operationId,
      bytes: Buffer.from(await file.arrayBuffer()),
      sharedForInquiry: form.get("sharedForInquiry") === "1",
    });
    return redirect();
  } catch (error) {
    if (
      isAppError(error) &&
      !["not_found", "cross_origin_request", "forbidden"].includes(error.code)
    )
      return redirect(error.code);
    return errorResponse(error, correlationIdFrom(request.headers));
  }
}
