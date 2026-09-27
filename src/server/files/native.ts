// Native multipart forms stay usable without JavaScript. Only these explicit file POSTs
// accept Origin:null with browser-enforced same-origin provenance; shared CSRF stays strict.
import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { fileUploads, operations } from "@/db/schema";
import { isStaffLocale } from "@/i18n/config";
import { recordAudit } from "../audit";
import type { Session } from "../auth/sessions";
import { getEnv } from "../config/env";
import { hashRequest } from "../crypto";
import { caseDocumentAccess, startCaseDocumentUpload } from "../documents/case";
import { reviewDocument, startDocumentUpload } from "../documents/commands";
import { AppError, isAppError, toErrorBody } from "../errors";
import {
  assertSameOrigin,
  correlationIdFrom,
  hostContextOf,
  identify,
  requireSession,
} from "../http/request";
import { getJobQueue } from "../jobs/web";
import { expectVersion, placeMedia, reviewMedia, startMediaUpload } from "../media/commands";
import { runOperation } from "../operations";
import { documentAccess, type FileKind, targetAccess } from "./access";
import { fileServices } from "./config";
import { inspectFile } from "./inspect";
import { fileOperationTypes } from "./receipts";
import { digestOf, MAX_IMAGE_BYTES } from "./storage";
import { finalizeUpload, receiveUpload, uploadAuthorization } from "./uploads";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
async function boundedForm(request: Request) {
  const limit = MAX_IMAGE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError("validation_failed");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("validation_failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) throw new AppError("validation_failed");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  return new Response(new Uint8Array(Buffer.concat(chunks)), {
    headers: { "content-type": request.headers.get("content-type") ?? "" },
  }).formData();
}

async function upload(
  session: Session,
  kind: FileKind,
  reference: string,
  form: FormData,
  context: "listing" | "case",
) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new AppError("validation_failed");
  const bytes = Buffer.from(await file.arrayBuffer());
  const measured = await inspectFile(bytes, kind);
  const db = getDb();
  const command = {
    session,
    operationId: text(form, "operationId"),
    expectedRevision: Number(text(form, "expectedRevision")),
    reference,
  };
  let uploadId = text(form, "uploadId");
  if (!uploadId) {
    const result =
      kind === "media"
        ? await startMediaUpload(db, {
            ...command,
            input: {
              kind: text(form, "kind"),
              contentType: measured.contentType,
              payloadIdentity: digestOf(bytes),
            },
          })
        : await (context === "case" ? startCaseDocumentUpload : startDocumentUpload)(db, {
            ...command,
            caseId: reference,
            ...(text(form, "documentId") ? { documentId: text(form, "documentId") } : {}),
            input: {
              fileName: file.name,
              contentType: measured.contentType,
              payloadIdentity: digestOf(bytes),
              purpose: text(form, "purpose"),
              classification: text(form, "classification"),
            },
          });
    uploadId = result.outcome.uploadId;
  }
  const [existing] = await db.select().from(fileUploads).where(eq(fileUploads.id, uploadId));
  if (!existing || existing.targetType !== kind) throw new AppError("not_found");
  if (
    context === "case" &&
    (await documentAccess(db, session, existing.targetId, "upload")).document.caseId !== reference
  )
    throw new AppError("not_found");
  const services = fileServices();
  if (!existing.completedAt) {
    const authority = await uploadAuthorization(db, session, uploadId);
    await receiveUpload(db, services, session, { uploadId, token: authority.token, bytes });
  }
  await finalizeUpload(db, services, session, uploadId, await getJobQueue());
  return uploadId;
}

export function fileFormRoute(kind: FileKind, context: "listing" | "case" = "listing") {
  return async (
    request: Request,
    { params }: { params: Promise<{ locale: string; reference?: string; id?: string }> },
  ) => {
    const env = getEnv();
    const values = await params;
    const locale = values.locale;
    const reference = (context === "case" ? values.id : values.reference) ?? "";
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    if (!isStaffLocale(locale) || hostContextOf(request.headers, env) !== "staff")
      return new Response(null, { status: 404 });
    const path = `/${locale}/${context === "case" ? "cases" : "inventory"}/${encodeURIComponent(reference)}/${kind === "media" ? "media" : "documents"}`;
    const correlationId = correlationIdFrom(request.headers);
    let location = path;
    try {
      const headers = new Headers(request.headers);
      if (
        headers.get("sec-fetch-site") === "same-origin" &&
        (!headers.get("origin") || headers.get("origin") === "null")
      )
        headers.set("origin", env.hosts.staff);
      assertSameOrigin(headers, env.hosts.staff);
      const db = getDb();
      const session = requireSession(await identify(db, request.headers, env));
      if (context === "case") await caseDocumentAccess(db, session, reference);
      const form = await boundedForm(request);
      const intent = text(form, "intent");
      const command = {
        session,
        operationId: text(form, "operationId"),
        expectedRevision: Number(text(form, "expectedRevision")),
      };
      if (
        context === "case" &&
        intent !== "upload" &&
        (await documentAccess(db, session, text(form, "id"))).document.caseId !== reference
      )
        throw new AppError("not_found");
      let saved: string | undefined;
      if (intent === "upload") saved = await upload(session, kind, reference, form, context);
      else if (intent === "review" && kind === "media")
        await reviewMedia(db, {
          ...command,
          id: text(form, "id"),
          input: {
            decision: text(form, "decision"),
            rightsHolder: text(form, "rightsHolder"),
            rightsReference: text(form, "rightsReference"),
            caption: text(form, "caption"),
            altText: text(form, "altText"),
            modification: text(form, "modification"),
            modificationDisclosure: text(form, "modificationDisclosure"),
            privacyReviewed: form.get("privacyReviewed") === "yes",
            rightsConfirmed: form.get("rightsConfirmed") === "yes",
          },
        });
      else if (intent === "review" && kind === "document") {
        const expiry = text(form, "expiresAt");
        await reviewDocument(db, {
          ...command,
          versionId: text(form, "id"),
          input: {
            reviewType: text(form, "reviewType"),
            note: text(form, "note"),
            confirmed: form.get("confirmed") === "yes",
            expiresAt: expiry ? new Date(expiry).toISOString() : null,
          },
        });
      } else if (intent === "place" && kind === "media")
        await placeMedia(db, {
          ...command,
          reference,
          relationId: text(form, "relationId"),
          ...(text(form, "before")
            ? { move: { before: text(form, "before") } }
            : text(form, "after")
              ? { move: { after: text(form, "after") } }
              : { hidden: text(form, "hidden") === "true" }),
        });
      else if (intent === "scan") {
        const id = text(form, "id");
        await targetAccess(db, session, kind, id);
        const queue = await getJobQueue();
        await runOperation(
          db,
          {
            actor: session.actor,
            type: "file.scan.request",
            idempotencyKey: command.operationId,
            requestHash: hashRequest({ kind, id, expectedRevision: command.expectedRevision }),
          },
          async ({ tx, operationId }) => {
            const target = await targetAccess(tx, session, kind, id);
            expectVersion(target.version, command.expectedRevision);
            if (!target.sealedKey) throw new AppError("transition_denied");
            await queue.send(
              "files.process",
              { kind, id },
              { db: tx, singletonKey: `${kind}:${id}` },
            );
            await recordAudit(tx, {
              actor: session.actor,
              action: "file.scan.requested",
              recordType: kind,
              recordId: id,
              operationId,
            });
            return { id };
          },
        );
      } else throw new AppError("validation_failed");
      if (!saved) {
        const [receipt] = await db
          .select({ id: operations.id })
          .from(operations)
          .where(
            and(
              eq(operations.actorKind, session.actor.kind),
              eq(operations.actorId, session.actor.id),
              eq(operations.idempotencyKey, command.operationId),
              eq(operations.status, "succeeded"),
              inArray(operations.operationType, fileOperationTypes),
            ),
          );
        saved = receipt?.id;
      }
      if (!saved) throw new Error("Successful file action has no durable receipt");
      location = `${path}?saved=${saved}`;
    } catch (error) {
      if (isAppError(error) && error.code === "cross_origin_request")
        return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
      if (isAppError(error) && error.code === "step_up_required")
        location = `/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`;
      else if (isAppError(error) && error.code === "unauthenticated")
        location = `/${locale}/access`;
      else location = `${path}?error=${toErrorBody(error, correlationId).code}`;
      if (!isAppError(error)) console.error(`[${correlationId}] file form failed`);
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: new URL(location, env.hosts.staff).toString(),
        "cache-control": "no-store",
        "x-correlation-id": correlationId,
      },
    });
  };
}
