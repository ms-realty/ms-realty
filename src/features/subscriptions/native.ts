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
import { decideAlertRule } from "@/server/subscriptions/approval";
import { currentAlertRule } from "@/server/subscriptions/rule";
import { isIssuedFormOperation } from "@/ui/form/server";

const cookieName = "msr_alert_rule_draft";
export const alertFormScope = "subscriptions.rule.decide";
const draftSchema = z.object({ note: z.string().max(1000), expiresAt: z.string().max(30) });
const signature = (session: Session, data: string) =>
  keyedHash(getEnv().authSecret, `${alertFormScope}:${session.id}:${data}`);
export async function retainedAlertRuleDraft(session: Session) {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value || value.length > 6500) return null;
  const [data, mac] = value.split(".");
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
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
async function retain(session: Session, locale: string, form: FormData) {
  const data = Buffer.from(
    JSON.stringify({
      note: String(form.get("note") ?? "").slice(0, 1000),
      expiresAt: String(form.get("expiresAt") ?? "").slice(0, 30),
    }),
  ).toString("base64url");
  // UTF-8 note length can exceed the browser's cookie budget; preserve only a bounded draft.
  if (data.length > 3500) return;
  (await cookies()).set(cookieName, `${data}.${signature(session, data)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: getEnv().hosts.staff.startsWith("https:"),
    path: `/${locale}/operations/subscriptions`,
    maxAge: 300,
  });
}
export async function alertRuleReceipt(db: Executor, session: Session, value?: string) {
  if (!z.uuid().safeParse(value).success) return null;
  const [row] = await db
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        eq(operations.id, value as string),
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, session.actor.id),
        eq(operations.operationType, alertFormScope),
        eq(operations.status, "succeeded"),
      ),
    );
  return row?.id ?? null;
}
export const alertRuleFormRoute = nativeAuthRoute(
  "staff",
  (locale) => `/${locale}/operations/subscriptions`,
  async ({ db, form, locale, correlationId }) => {
    const access = await currentStaffAccess();
    if (access.state !== "ready") throw new AppError("unauthenticated");
    const session = access.session,
      operationId = String(form.get("operationId") ?? "");
    if (!isIssuedFormOperation(alertFormScope, operationId))
      throw new AppError("validation_failed");
    const text = (name: string) =>
      form.getAll(name).length === 1 ? String(form.get(name) ?? "") : "";
    try {
      const result = await decideAlertRule(db, session, currentAlertRule(), {
        operationId,
        decision: text("decision"),
        expectedRuleHash: text("expectedRuleHash"),
        expectedDecisionId: text("expectedDecisionId") || null,
        expectedDecisionVersion: Number(text("expectedDecisionVersion")),
        note: text("note"),
        reviewed: text("reviewed") === "yes",
        expiresAt:
          text("decision") === "disable"
            ? null
            : /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(text("expiresAt"))
              ? `${text("expiresAt")}:00.000Z`
              : text("expiresAt") || null,
      });
      (await cookies()).set(cookieName, "", {
        path: `/${locale}/operations/subscriptions`,
        maxAge: 0,
      });
      return `/${locale}/operations/subscriptions?receipt=${result.operationId}`;
    } catch (error) {
      await retain(session, locale, form);
      if (isAppError(error) && error.code === "step_up_required")
        return `/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/operations/subscriptions`)}`;
      if (!isAppError(error)) throw error;
      return `/${locale}/operations/subscriptions?error=${toErrorBody(error, correlationId).code}`;
    }
  },
);
