// P11: establish the anonymous receipt capability before the HTML form is submitted.
import { type NextRequest, NextResponse } from "next/server";
import { parseContentReference } from "@/domain/inquiry-content";
import { parseComparisonReferences, parseSelectedListingsJson } from "@/domain/inquiry-selection";
import { parseServiceEntry } from "@/domain/service-scope";
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
  const query = request.nextUrl.searchParams;
  if (
    [
      "purpose",
      "reference",
      "manifest",
      "selection",
      "submission",
      "comparisonReferences",
      "contentReference",
      "serviceScope",
      "question",
    ].some((name) => query.getAll(name).length > 1)
  )
    return new Response(null, { status: 400 });
  if (query.has("context")) return new Response(null, { status: 400 });
  const rawContent = query.get("contentReference");
  const rawService = query.get("serviceScope");
  if (rawService !== null) {
    const service = parseServiceEntry(rawService);
    if (!service) return new Response(null, { status: 400 });
    target.searchParams.set("serviceScope", JSON.stringify(service));
  }
  if (rawContent !== null) {
    const content = parseContentReference(rawContent);
    if (!content) return new Response(null, { status: 400 });
    target.searchParams.set("contentReference", JSON.stringify(content));
  }
  const rawComparison = query.get("comparisonReferences");
  if (rawComparison !== null) {
    const comparison = parseComparisonReferences(rawComparison);
    if (!comparison?.includes(query.get("reference") ?? "") || query.has("selection"))
      return new Response(null, { status: 400 });
    target.searchParams.set("comparisonReferences", comparison.join(","));
  }
  const selection = query.get("selection");
  if (selection !== null) {
    if (
      !parseSelectedListingsJson(selection) ||
      query.has("reference") ||
      query.has("manifest") ||
      (query.has("purpose") && query.get("purpose") !== "question")
    )
      return new Response(null, { status: 400 });
    target.searchParams.set("selection", selection);
  }
  for (const name of ["purpose", "reference", "manifest", "error"]) {
    const value = request.nextUrl.searchParams.get(name);
    if (value && value.length <= 100) target.searchParams.set(name, value);
  }
  // The question a visitor asked Butler on a listing page, carried to the form as a draft.
  const question = query.get("question");
  if (question !== null && question.length <= 300 && query.has("reference"))
    target.searchParams.set("question", question);
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
