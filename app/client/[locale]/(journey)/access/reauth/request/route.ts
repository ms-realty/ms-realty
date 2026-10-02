import type { PublicLocale } from "@/i18n/config";
import { requestEmailLink } from "@/server/auth/email-link";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentClientSession, localReturnPath, requestClientIp } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { getJobQueue } from "@/server/jobs/web";

export const POST = nativeAuthRoute(
  "client",
  (locale) => `/${locale}/access/reauth`,
  async ({ db, form, locale }) => {
    const session = await currentClientSession();
    if (!session) throw new AppError("unauthenticated");
    const [account] = await db
      .select({ email: principals.email })
      .from(principals)
      .where(eq(principals.id, session.account.id));
    if (!account?.email) throw new AppError("unauthenticated");
    const returnTo =
      localReturnPath(String(form.get("returnTo") ?? ""), "client", locale) ??
      `/${locale}/overview`;
    await requestEmailLink(db, {
      // The recipient comes from the current principal, never the submitted form.
      email: account.email,
      locale: locale as PublicLocale,
      returnTo,
      clientIp: await requestClientIp(),
      queue: await getJobQueue(),
    });
    return `/${locale}/access/reauth?${new URLSearchParams({ sent: "1", returnTo })}`;
  },
);

import { eq } from "drizzle-orm";
import { principals } from "@/db/schema";
