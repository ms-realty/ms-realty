import { acceptStaffInvitation } from "@/server/auth/invitations";
import { nativeAuthRoute } from "@/server/auth/native";
import { requestClientIp, sessionTokenOf } from "@/server/auth/pages";
import { setSessionCookie } from "@/server/http/next";
export const POST = nativeAuthRoute(
  "staff",
  (locale) => `/${locale}/access/invitation`,
  async ({ db, form, locale, correlationId }) => {
    const issued = await acceptStaffInvitation(db, String(form.get("token") ?? ""), {
      currentSessionToken: await sessionTokenOf("staff"),
      clientIp: await requestClientIp(),
      correlationId,
    });
    await setSessionCookie("staff", issued.token, issued.session.expiresAt);
    return `/${locale}/access/enrol`;
  },
);
