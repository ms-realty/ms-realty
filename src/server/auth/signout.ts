import "server-only";
import { getDb } from "@/db/client";
import { isRoutableLocale, isStaffLocale } from "@/i18n/config";
import { getEnv } from "../config/env";
import type { PrivateHostContext } from "../config/hosts";
import { hostContextOf } from "../http/request";
import { readCookie, sessionClearCookie, sessionCookieName } from "./cookies";
import { assertNativeAuthOrigin } from "./native";
import { revokeSession } from "./sessions";

export function signOutRoute(context: PrivateHostContext) {
  return async (request: Request, { params }: { params: Promise<{ locale: string }> }) => {
    const env = getEnv();
    const { locale } = await params;
    if (
      hostContextOf(request.headers, env) !== context ||
      !(context === "staff" ? isStaffLocale(locale) : isRoutableLocale(locale))
    ) {
      return new Response(null, { status: 404 });
    }
    try {
      assertNativeAuthOrigin(request.headers, env.hosts[context]);
    } catch {
      return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
    }
    const token = readCookie(request.headers.get("cookie"), sessionCookieName(env, context));
    if (token) await revokeSession(getDb(), token);
    return new Response(null, {
      status: 303,
      headers: {
        location: new URL(`/${locale}/access`, env.hosts[context]).toString(),
        "set-cookie": sessionClearCookie(env, context),
        "cache-control": "no-store",
        "clear-site-data": '"cache", "storage"',
        "referrer-policy": "no-referrer",
      },
    });
  };
}
