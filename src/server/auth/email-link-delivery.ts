// F13/AT38/AT45: a queued credential email grants no authority from its old snapshot.
import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { emailSignInTokens, type externalActions, principals } from "@/db/schema";
import { publicLocales } from "@/domain/ids";
import { getEnv } from "../config/env";
import { hashRequest, sha256Hex } from "../crypto";
import type { Executor } from "../db";
import { privacyProcessingRestricted } from "../privacy/restrictions";

export const emailLinkTemplate = "auth.email_link";
export const emailLinkSubject = "email_sign_in_token";
const payloadSchema = z
  .object({
    channel: z.literal("email"),
    recipient: z.email(),
    template: z.literal(emailLinkTemplate),
    params: z.object({ locale: z.enum(publicLocales), expiresAt: z.iso.datetime() }).strict(),
    secretDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

/** Caller retains these token/account share locks through the bounded provider handoff.
 * Legacy untagged rows are accepted only with their original token-bound effect key. */
export async function emailLinkDeliveryIsCurrent(
  db: Executor,
  row: typeof externalActions.$inferSelect,
  now: Date,
) {
  const payload = payloadSchema.safeParse(row.payload);
  const secret = z.object({ url: z.url() }).strict().safeParse(row.secretPayload);
  if (
    !payload.success ||
    !secret.success ||
    row.kind !== "email_send" ||
    row.payloadDigest !== hashRequest(row.payload) ||
    payload.data.secretDigest !== hashRequest(secret.data)
  )
    return false;
  let url: URL;
  try {
    url = new URL(secret.data.url);
  } catch {
    return false;
  }
  const token = url.searchParams.get("token");
  if (
    url.origin !== new URL(getEnv().hosts.client).origin ||
    url.pathname !== `/${payload.data.params.locale}/access/confirm` ||
    url.hash ||
    url.username ||
    url.password ||
    url.searchParams.size !== 1 ||
    !token ||
    !/^[A-Za-z0-9_-]{43}$/.test(token)
  )
    return false;
  const [credential] = await db
    .select()
    .from(emailSignInTokens)
    .where(eq(emailSignInTokens.tokenHash, sha256Hex(token)))
    .for("share");
  if (
    !credential?.principalId ||
    credential.purpose !== "sign_in" ||
    credential.principalKind !== "client" ||
    credential.revokedAt ||
    credential.consumedAt ||
    now >= credential.expiresAt ||
    now < credential.createdAt ||
    credential.email.toLowerCase() !== payload.data.recipient.toLowerCase() ||
    credential.expiresAt.toISOString() !== payload.data.params.expiresAt ||
    row.effectKey !== `email_link:${credential.id}` ||
    !(
      (row.subjectType === emailLinkSubject && row.subjectId === credential.id) ||
      (row.subjectType === null && row.subjectId === null)
    )
  )
    return false;
  const [account] = await db
    .select()
    .from(principals)
    .where(and(eq(principals.id, credential.principalId), eq(principals.kind, "client")))
    .for("share");
  return Boolean(
    account?.status === "active" &&
      account.email.toLowerCase() === credential.email.toLowerCase() &&
      !(await privacyProcessingRestricted(db, account.partyId, "client_access")),
  );
}
