// C05 / AT08: the sole cross-origin POST exception; nonce never enters a URL.
import { getDb } from "@/db/client";
import { isRoutableLocale } from "@/i18n/config";
import { savedContinuationCookie, validateSavedHandoff } from "@/server/account-saves/service";
import { serializeCookie } from "@/server/auth/cookies";
import { getEnv } from "@/server/config/env";
import { hostContextOf } from "@/server/http/request";
export async function POST(request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params,
    env = getEnv();
  if (
    !isRoutableLocale(locale) ||
    hostContextOf(request.headers, env) !== "client" ||
    request.headers.get("origin") !== env.hosts.public ||
    !request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")
  )
    return new Response(null, { status: 403 });
  const text = await request.text();
  if (text.length > 1024) return new Response(null, { status: 413 });
  const form = new URLSearchParams(text),
    nonce = form.get("nonce") ?? "",
    target = `${env.hosts.client}/${locale}/saved/handoff`;
  if (form.get("target") !== target) return new Response(null, { status: 403 });
  try {
    const transfer = await validateSavedHandoff(
      getDb(),
      nonce,
      request.headers.get("origin"),
      target,
    );
    return new Response(null, {
      status: 303,
      headers: {
        location: `${env.hosts.client}/${locale}/saved/import`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "set-cookie": serializeCookie(savedContinuationCookie(), nonce, {
          httpOnly: true,
          secure: env.hosts.client.startsWith("https://"),
          sameSite: "lax",
          path: "/",
          expires: transfer.expiresAt,
        }),
      },
    });
  } catch {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
    });
  }
}
