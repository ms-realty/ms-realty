"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isRoutableLocale } from "@/i18n/config";
import { requestEmailLink } from "@/server/auth/email-link";
import { localReturnPath, requestClientIp, requireAuthHost } from "@/server/auth/pages";
import { AppError, toErrorBody } from "@/server/errors";
import { getJobQueue } from "@/server/jobs/web";
export type ClientEmailState = { email: string; error: string | null; responseId: string };
/** C01: native Server Action retains the entered address in the response body, never a URL. */
export async function requestClientAccessLink(
  locale: string,
  returnPath: string | null,
  _previous: ClientEmailState,
  form: FormData,
): Promise<ClientEmailState> {
  await requireAuthHost("client");
  if (!isRoutableLocale(locale)) throw new AppError("not_found");
  const raw = form.get("email"),
    email = typeof raw === "string" ? raw.slice(0, 254) : "";
  const responseId = randomUUID(),
    returnTo = localReturnPath(returnPath, "client", locale);
  if (!z.email().max(254).safeParse(email.trim()).success)
    return { email, error: "VALIDATION_FAILED", responseId };
  try {
    await requestEmailLink(getDb(), {
      email,
      locale,
      returnTo,
      clientIp: await requestClientIp(),
      queue: await getJobQueue(),
    });
  } catch (error) {
    return { email, error: toErrorBody(error, responseId).code, responseId };
  }
  const query = new URLSearchParams({ sent: "1" });
  if (returnTo) query.set("returnTo", returnTo);
  redirect(`/${locale}/access?${query}`);
}
