import type { PublicLocale } from "@/i18n/config";
import { requestEmailLink } from "@/server/auth/email-link";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentClientSession, localReturnPath, requestClientIp } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";
import { getJobQueue } from "@/server/jobs/web";
import { proposalDraftTokens } from "@/server/reauth-drafts/cookies";
import { reauthLineageForRequest } from "@/server/reauth-drafts/service";

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
    const tokens = await proposalDraftTokens();
    const clientIp = await requestClientIp();
    const queue = await getJobQueue();
    await db.transaction(async (tx) =>
      requestEmailLink(tx, {
        // The recipient comes from the current principal, never the submitted form.
        email: account.email,
        locale: locale as PublicLocale,
        returnTo,
        clientIp,
        queue,
        reauth: await reauthLineageForRequest(tx, session, getEnv().hosts.client, returnTo, tokens),
      }),
    );
    return `/${locale}/access/reauth?${new URLSearchParams({ sent: "1", returnTo })}`;
  },
);

import { eq } from "drizzle-orm";
import { principals } from "@/db/schema";
