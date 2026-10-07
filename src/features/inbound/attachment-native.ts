import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { operations } from "@/db/schema";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentStaffAccess } from "@/server/auth/pages";
import type { Session } from "@/server/auth/sessions";
import { getEnv } from "@/server/config/env";
import { keyedHash } from "@/server/crypto";
import type { Executor } from "@/server/db";
import { AppError, isAppError, toErrorBody } from "@/server/errors";
import { fileServices } from "@/server/files/config";
import { configuredAttachmentProvider } from "@/server/inbound/attachment-provider";
import { attachmentImportScope, importInboundAttachment } from "@/server/inbound/attachments";
import { readInboundEmail } from "@/server/inbound/service";
import { getJobQueue } from "@/server/jobs/web";
import { isIssuedFormOperation } from "@/ui/form/server";

const cookieName = "msr_inbound_attachment";
const draftSchema = z.object({
  id: z.uuid(),
  attachmentId: z.uuid(),
  fileName: z.string().max(160),
  purpose: z.string().max(40),
  classification: z.string().max(40),
  reason: z.string().max(500),
});
const signature = (session: Session, data: string) =>
  keyedHash(getEnv().authSecret, `${attachmentImportScope}:${session.id}:${data}`);
export async function attachmentDraft(session: Session, id: string) {
  const cookie = (await cookies()).get(cookieName)?.value;
  if (!cookie || cookie.length > 3800) return null;
  const [data, mac] = cookie.split(".");
  if (
    !data ||
    !mac ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(signature(session, data)))
  )
    return null;
  try {
    const parsed = draftSchema.safeParse(
      JSON.parse(Buffer.from(data, "base64url").toString("utf8")),
    );
    return parsed.success && parsed.data.id === id ? parsed.data : null;
  } catch {
    return null;
  }
}
async function saveDraft(session: Session, locale: string, value: unknown) {
  const parsed = draftSchema.safeParse(value);
  if (!parsed.success) return;
  const data = Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
  (await cookies()).set(cookieName, `${data}.${signature(session, data)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: getEnv().hosts.staff.startsWith("https:"),
    path: `/${locale}/operations/inbound`,
    maxAge: 300,
  });
}
export async function attachmentReceipt(
  db: Executor,
  session: Session,
  id: string,
  receipt?: string,
) {
  if (!z.uuid().safeParse(receipt).success) return null;
  const [row] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.id, receipt as string),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, session.actor.id),
        eq(operations.operationType, attachmentImportScope),
        eq(operations.status, "succeeded"),
      ),
    );
  const outcome = z.object({ id: z.uuid(), versionId: z.uuid() }).safeParse(row?.outcome);
  return row && outcome.success && outcome.data.id === id
    ? { id: row.id, versionId: outcome.data.versionId }
    : null;
}
export const attachmentFormRoute = nativeAuthRoute(
  "staff",
  (locale, params) => `/${locale}/operations/inbound/${params.id}`,
  async ({ db, form, locale, params, correlationId }) => {
    const access = await currentStaffAccess();
    if (access.state !== "ready") throw new AppError("unauthenticated");
    const text = (name: string) =>
      form.getAll(name).length === 1 && typeof form.get(name) === "string"
        ? String(form.get(name))
        : "";
    const operationId = text("operationId");
    if (!isIssuedFormOperation(`${attachmentImportScope}:${params.id}`, operationId))
      throw new AppError("validation_failed");
    const input = {
      operationId,
      id: params.id,
      attachmentId: text("attachmentId"),
      caseId: text("caseId"),
      caseVersion: Number(text("caseVersion")),
      expectedVersion: Number(text("expectedVersion")),
      fileName: text("fileName"),
      purpose: text("purpose"),
      classification: text("classification"),
      reason: text("reason"),
      reviewed: text("reviewed") === "yes",
    };
    try {
      const row = await readInboundEmail(db, access.session, params.id ?? ""),
        files = fileServices();
      const result = await importInboundAttachment(db, access.session, input, {
        provider: configuredAttachmentProvider(row.provider, files.storage),
        files,
        queue: await getJobQueue(),
      });
      (await cookies()).set(cookieName, "", { path: `/${locale}/operations/inbound`, maxAge: 0 });
      return `/${locale}/operations/inbound/${params.id}?importReceipt=${result.operationId}`;
    } catch (error) {
      await saveDraft(access.session, locale, input);
      if (!isAppError(error)) throw error;
      return `/${locale}/operations/inbound/${params.id}?error=${toErrorBody(error, correlationId).code}`;
    }
  },
);
