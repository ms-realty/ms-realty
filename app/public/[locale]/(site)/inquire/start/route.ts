// P11: establish the anonymous receipt capability before the HTML form is submitted.
import { type NextRequest, NextResponse } from "next/server";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import {
  isIssuedSubmissionKey,
  issueSubmissionKey,
  newReceiptSession,
  receiptCookieName,
  receiptSetCookie,
  validReceiptSession,
} from "@/server/inquiries/intake";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) return new Response(null, { status: 404 });
  const env = getEnv(),
    target = new URL(`/${locale}/inquire`, env.hosts.public);
  for (const name of ["purpose", "reference", "manifest"]) {
    const value = request.nextUrl.searchParams.get(name);
    if (value && value.length <= 100) target.searchParams.set(name, value);
  }
  const existing = request.nextUrl.searchParams.get("submission");
  target.searchParams.set(
    "submission",
    existing && isIssuedSubmissionKey(existing) ? existing : issueSubmissionKey(),
  );
  target.searchParams.set("ready", "1");
  const response = NextResponse.redirect(target, 303);
  response.headers.set("cache-control", "no-store");
  if (!validReceiptSession(request.cookies.get(receiptCookieName(env))?.value))
    response.headers.append("set-cookie", receiptSetCookie(env, newReceiptSession()));
  return response;
}
