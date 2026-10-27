"use server";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import { isPublicLocale } from "@/i18n/config";
import { createSavedTransfer } from "@/server/account-saves/service";
import { getEnv } from "@/server/config/env";
import { assertSameOrigin, clientIpFrom, hostContextOf } from "@/server/http/request";
import {
  newShareCreatorSession,
  shareCreatorCookieName,
  validShareCreatorSession,
} from "@/server/shares/public";
export async function prepareAccountSaves(
  locale: string,
  references: readonly string[],
  operationId: string,
) {
  const env = getEnv(),
    request = await headers();
  if (!isPublicLocale(locale) || hostContextOf(request, env) !== "public")
    return { error: true as const };
  assertSameOrigin(request, env.hosts.public);
  const jar = await cookies(),
    name = shareCreatorCookieName(env);
  const creator = validShareCreatorSession(jar.get(name)?.value) ?? newShareCreatorSession();
  jar.set(name, creator, {
    httpOnly: true,
    secure: env.hosts.public.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + 30 * 86400000),
  });
  try {
    return await createSavedTransfer(
      getDb(),
      creator,
      { locale, references: [...references], operationId },
      clientIpFrom(request),
    );
  } catch {
    return { error: true as const };
  }
}
