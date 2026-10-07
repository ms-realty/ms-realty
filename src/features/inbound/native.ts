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
import { reviewInboundEmail } from "@/server/inbound/service";
import { isIssuedFormOperation } from "@/ui/form/server";
export const inboundScope = "inbound.email.review";
const draftCookie = "msr_inbound_review";
const draftSchema = z.object({
  id: z.uuid(),
  reason: z.string().max(500),
  caseId: z.uuid().optional(),
  partyId: z.uuid().optional(),
});
const draftSignature = (session: Session, data: string) =>
  keyedHash(getEnv().authSecret, `${inboundScope}:${session.id}:${data}`);
export async function inboundDraft(session: Session, id: string) {
  const value = (await cookies()).get(draftCookie)?.value;
  if (!value || value.length > 4000) return null;
  const [data, mac] = value.split(".");
  if (
    !data ||
    !mac ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(draftSignature(session, data)))
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
async function retainDraft(session: Session, locale: string, id: string, form: FormData) {
  const parsed = draftSchema.safeParse({
    id,
    reason: String(form.get("reason") ?? "").slice(0, 500),
    caseId: form.get("caseId") || undefined,
    partyId: form.get("partyId") || undefined,
  });
  if (!parsed.success) return;
  const data = Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
  if (data.length > 3800) return;
  (await cookies()).set(draftCookie, `${data}.${draftSignature(session, data)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: getEnv().hosts.staff.startsWith("https:"),
    path: `/${locale}/operations/inbound`,
    maxAge: 300,
  });
}
export async function inboundReceipt(db: Executor, session: Session, id: string, receipt?: string) {
  const parsed = z.uuid().safeParse(receipt);
  if (!parsed.success) return null;
  const [row] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.id, parsed.data),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, session.actor.id),
        eq(operations.operationType, inboundScope),
        eq(operations.status, "succeeded"),
      ),
    );
  const outcome = z
    .object({ id: z.uuid(), state: z.enum(["assigned", "rejected"]) })
    .safeParse(row?.outcome);
  return outcome.success && outcome.data.id === id ? row?.id : null;
}
export const inboundFormRoute = nativeAuthRoute(
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
    if (!isIssuedFormOperation(`${inboundScope}:${params.id}`, operationId))
      throw new AppError("validation_failed");
    try {
      const result = await reviewInboundEmail(db, access.session, {
        operationId,
        id: params.id,
        expectedVersion: Number(text("expectedVersion")),
        decision: text("decision"),
        caseId: text("caseId") || undefined,
        caseVersion: text("caseVersion") ? Number(text("caseVersion")) : undefined,
        partyId: text("partyId") || undefined,
        reviewed: text("reviewed") === "yes",
        reason: text("reason"),
      });
      (await cookies()).set(draftCookie, "", { path: `/${locale}/operations/inbound`, maxAge: 0 });
      return `/${locale}/operations/inbound/${params.id}?receipt=${result.operationId}`;
    } catch (error) {
      await retainDraft(access.session, locale, params.id ?? "", form);
      if (!isAppError(error)) throw error;
      return `/${locale}/operations/inbound/${params.id}?error=${toErrorBody(error, correlationId).code}`;
    }
  },
);
