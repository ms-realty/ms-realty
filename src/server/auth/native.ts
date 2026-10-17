// Native form POSTs work without JavaScript. Token pages suppress Referrer; browsers can then
// send Origin:null. Accept that only with browser-enforced same-origin Fetch Metadata.
import "server-only";
import { getDb } from "@/db/client";
import { isRoutableLocale, isStaffLocale } from "@/i18n/config";
import { getEnv } from "../config/env";
import type { PrivateHostContext } from "../config/hosts";
import type { Database } from "../db";
import { AppError, isAppError, toErrorBody } from "../errors";
import { assertSameOrigin, correlationIdFrom, hostContextOf } from "../http/request";

export function assertNativeAuthOrigin(headers: Headers, origin: string): void {
  const checked = new Headers(headers);
  if (
    checked.get("sec-fetch-site") === "same-origin" &&
    (!checked.get("origin") || checked.get("origin") === "null")
  ) {
    checked.set("origin", origin);
  }
  assertSameOrigin(checked, origin);
}
interface NativeContext {
  db: Database;
  form: FormData;
  locale: string;
  correlationId: string;
  params: Record<string, string>;
}
export function nativeAuthRoute(
  context: PrivateHostContext,
  failurePath: (locale: string, params: Record<string, string>) => string,
  handler: (ctx: NativeContext) => Promise<string>,
) {
  return async (request: Request, { params }: { params: Promise<Record<string, string>> }) => {
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { allow: "POST" } });
    const env = getEnv();
    const values = await params;
    const locale = values.locale ?? "";
    if (
      hostContextOf(request.headers, env) !== context ||
      !(context === "staff" ? isStaffLocale(locale) : isRoutableLocale(locale))
    ) {
      return new Response(null, { status: 404 });
    }
    const correlationId = correlationIdFrom(request.headers);
    try {
      assertNativeAuthOrigin(request.headers, env.hosts[context]);
      const form = await request.formData();
      const next = await handler({ db: getDb(), form, locale, correlationId, params: values });
      return new Response(null, {
        status: 303,
        headers: {
          location: new URL(next, env.hosts[context]).toString(),
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
          "x-correlation-id": correlationId,
        },
      });
    } catch (error) {
      if (!isAppError(error)) console.error(`[${correlationId}] authentication form failed`);
      const code = toErrorBody(error, correlationId).code;
      // Failed origin checks get a denial, never a redirect that looks like a successful form.
      if (error instanceof AppError && error.code === "cross_origin_request") {
        return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
      }
      return new Response(null, {
        status: 303,
        headers: {
          location: new URL(
            `${failurePath(locale, values)}?error=${code}`,
            env.hosts[context],
          ).toString(),
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        },
      });
    }
  };
}
