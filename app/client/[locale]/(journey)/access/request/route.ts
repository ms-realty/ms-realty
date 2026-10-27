import { cookies } from "next/headers";
import type { PublicLocale } from "@/i18n/config";
import {
  clientInputCookieName,
  clientInputLifetime,
  sealClientInput,
} from "@/server/auth/client-input";
import { requestEmailLink } from "@/server/auth/email-link";
import { nativeAuthRoute } from "@/server/auth/native";
import { localReturnPath, requestClientIp } from "@/server/auth/pages";
import { getEnv } from "@/server/config/env";
import { getJobQueue } from "@/server/jobs/web";
export const POST = nativeAuthRoute(
  "client",
  (locale) => `/${locale}/access`,
  async ({ db, form, locale }) => {
    const returnTo = localReturnPath(String(form.get("returnTo") ?? ""), "client", locale);
    const email = String(form.get("email") ?? ""),
      env = getEnv(),
      jar = await cookies();
    jar.set(
      clientInputCookieName(env),
      sealClientInput(
        { email: email.length <= 254 ? email : "", returnTo, locale: locale as PublicLocale },
        env,
      ),
      {
        httpOnly: true,
        secure: env.hosts.client.startsWith("https://"),
        sameSite: "lax",
        path: "/",
        expires: new Date(Date.now() + clientInputLifetime),
      },
    );
    await requestEmailLink(db, {
      email,
      locale: locale as PublicLocale,
      returnTo,
      clientIp: await requestClientIp(),
      queue: await getJobQueue(),
    });
    jar.set(clientInputCookieName(env), "", {
      httpOnly: true,
      secure: env.hosts.client.startsWith("https://"),
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    const query = new URLSearchParams({ sent: "1" });
    if (returnTo) query.set("returnTo", returnTo);
    return `/${locale}/access?${query}`;
  },
);
