import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { fileUploads } from "@/db/schema";
import { isPublicLocale } from "@/i18n/config";
import { getEnv } from "../config/env";
import { AppError, isAppError, toErrorBody } from "../errors";
import { fileServices } from "../files/config";
import { inspectFile } from "../files/inspect";
import { boundedFileForm } from "../files/native";
import { digestOf } from "../files/storage";
import { finalizeUpload, receiveUpload, uploadAuthorization } from "../files/uploads";
import {
  assertSameOrigin,
  correlationIdFrom,
  hostContextOf,
  identify,
  requireSession,
} from "../http/request";
import { getJobQueue } from "../jobs/web";
import { documentRequestWorkbench, startRequestedDocumentUpload } from "./requests";

/** A native, bounded upload. Refresh re-reads the saved operation and never claims a scan. */
export async function requestedDocumentFormRoute(
  request: Request,
  { params }: { params: Promise<{ locale: string; id: string }> },
) {
  const env = getEnv(),
    { locale, id } = await params;
  if (!isPublicLocale(locale) || hostContextOf(request.headers, env) !== "client")
    return new Response(null, { status: 404 });
  const path = `/${locale}/documents/requests/${encodeURIComponent(id)}`;
  const correlationId = correlationIdFrom(request.headers);
  let location = path;
  try {
    const headers = new Headers(request.headers);
    if (
      headers.get("sec-fetch-site") === "same-origin" &&
      (!headers.get("origin") || headers.get("origin") === "null")
    )
      headers.set("origin", env.hosts.client);
    assertSameOrigin(headers, env.hosts.client);
    const db = getDb(),
      session = requireSession(await identify(db, request.headers, env));
    // Prove current access before buffering a multipart request or exposing any file metadata.
    await documentRequestWorkbench(db, session, { id });
    const form = await boundedFileForm(request),
      file = form.get("file");
    if (!(file instanceof File)) throw new AppError("validation_failed");
    const bytes = Buffer.from(await file.arrayBuffer());
    const measured = await inspectFile(bytes, "document");
    const result = await startRequestedDocumentUpload(db, {
      session,
      requestId: id,
      operationId: String(form.get("operationId") ?? ""),
      expectedRevision: Number(form.get("expectedRevision")),
      input: {
        fileName: file.name,
        contentType: measured.contentType,
        payloadIdentity: digestOf(bytes),
        byteSize: measured.byteSize,
      },
    });
    const uploadId = result.outcome.uploadId;
    const [upload] = await db.select().from(fileUploads).where(eq(fileUploads.id, uploadId));
    if (!upload) throw new AppError("not_found");
    const services = fileServices();
    if (!upload.completedAt) {
      const authorization = await uploadAuthorization(db, session, uploadId);
      await receiveUpload(db, services, session, { uploadId, token: authorization.token, bytes });
    }
    await finalizeUpload(db, services, session, uploadId, await getJobQueue());
    location = `${path}?saved=${encodeURIComponent(uploadId)}`;
  } catch (error) {
    if (isAppError(error) && error.code === "cross_origin_request")
      return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
    if (isAppError(error) && error.code === "step_up_required")
      location = `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`;
    else if (isAppError(error) && error.code === "unauthenticated")
      location = `/${locale}/access?returnTo=${encodeURIComponent(path)}`;
    else location = `${path}?error=${encodeURIComponent(toErrorBody(error, correlationId).code)}`;
    if (!isAppError(error)) console.error(`[${correlationId}] requested document form failed`);
  }
  return new Response(null, {
    status: 303,
    headers: {
      location: new URL(location, env.hosts.client).toString(),
      "cache-control": "no-store",
      "x-correlation-id": correlationId,
    },
  });
}
