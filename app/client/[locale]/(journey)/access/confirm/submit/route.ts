import { consumeEmailLink } from "@/server/auth/email-link";
import { nativeAuthRoute } from "@/server/auth/native";
import { localReturnPath, requestClientIp, sessionTokenOf } from "@/server/auth/pages";
import { setSessionCookie } from "@/server/http/next";
import { enforceRateLimit } from "@/server/rate-limit";
export const POST = nativeAuthRoute(
  "client",
  (locale) => `/${locale}/access/confirm`,
  async ({ db, form, locale, correlationId }) => {
    await enforceRateLimit(db, "sign_in.ip", await requestClientIp());
    const issued = await consumeEmailLink(db, String(form.get("token") ?? ""), {
      currentSessionToken: await sessionTokenOf("client"),
      correlationId,
    });
    await setSessionCookie("client", issued.token, issued.session.expiresAt);
    return localReturnPath(issued.returnTo, "client", locale) ?? `/${locale}/access`;
  },
);
