import { respondToClientInvitation } from "@/server/auth/invitations";
import { nativeAuthRoute } from "@/server/auth/native";
import { currentClientSession, requestClientIp, sessionTokenOf } from "@/server/auth/pages";
import { rotateSession } from "@/server/auth/sessions";
import { AppError } from "@/server/errors";
import { setSessionCookie } from "@/server/http/next";
export const POST = nativeAuthRoute(
  "client",
  (locale, params) => `/${locale}/invitations/${params.id}`,
  async ({ db, form, locale, params, correlationId }) => {
    const session = await currentClientSession();
    if (!session) throw new AppError("unauthenticated");
    const decision = form.get("decision");
    if (decision !== "accept" && decision !== "decline") throw new AppError("validation_failed");
    await respondToClientInvitation(db, params.id ?? "", session, decision, {
      clientIp: await requestClientIp(),
      correlationId,
    });
    const token = await sessionTokenOf("client");
    const rotated = token ? await rotateSession(db, token) : null;
    if (!rotated) throw new AppError("unauthenticated");
    await setSessionCookie("client", rotated.token, rotated.session.expiresAt);
    return `/${locale}/invitations/${params.id}`;
  },
);
