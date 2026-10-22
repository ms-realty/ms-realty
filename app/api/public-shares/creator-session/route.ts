// Explicit public-host entry for anonymous P08/P09 link management. The subsequent share
// creation must read this returned cookie; minting it in the creation response is too late
// if the commit succeeds but the acknowledgment is lost.
import { isPublicLocale } from "@/domain/ids";
import { readCookie } from "@/server/auth/cookies";
import { getEnv } from "@/server/config/env";
import { hostContextOf } from "@/server/http/request";
import {
  newShareCreatorSession,
  shareCreatorCookieName,
  shareCreatorSetCookie,
  validShareCreatorSession,
} from "@/server/shares/public";

export function GET(request: Request): Response {
  const env = getEnv();
  if (hostContextOf(request.headers, env) !== "public") return new Response(null, { status: 404 });
  const locale = new URL(request.url).searchParams.get("locale");
  if (!locale || !isPublicLocale(locale))
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });

  const existing = validShareCreatorSession(
    readCookie(request.headers.get("cookie"), shareCreatorCookieName(env)),
  );
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    Location: new URL(`/${locale}/saved`, env.hosts.public).toString(),
  });
  if (!existing) headers.append("Set-Cookie", shareCreatorSetCookie(env, newShareCreatorSession()));
  return new Response(null, { status: 303, headers });
}
