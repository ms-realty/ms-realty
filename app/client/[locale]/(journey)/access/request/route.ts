import type { PublicLocale } from "@/i18n/config";
import { requestEmailLink } from "@/server/auth/email-link";
import { nativeAuthRoute } from "@/server/auth/native";
import { localReturnPath, requestClientIp } from "@/server/auth/pages";
import { getJobQueue } from "@/server/jobs/web";
export const POST = nativeAuthRoute(
  "client",
  (locale) => `/${locale}/access`,
  async ({ db, form, locale }) => {
    const returnTo = localReturnPath(String(form.get("returnTo") ?? ""), "client", locale);
    await requestEmailLink(db, {
      email: String(form.get("email") ?? ""),
      locale: locale as PublicLocale,
      returnTo,
      clientIp: await requestClientIp(),
      queue: await getJobQueue(),
    });
    const query = new URLSearchParams({ sent: "1" });
    if (returnTo) query.set("returnTo", returnTo);
    return `/${locale}/access?${query}`;
  },
);
