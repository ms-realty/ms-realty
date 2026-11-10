// F01 Butler answers (ADR 0017): the form post of "Ask about this home". Without JavaScript the
// browser follows the 303 back to the listing page at #ask-butler; the enhanced form asks for
// JSON and gets the same panel. The target page is derived from the listing reference, never
// from the request.
import { type NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { parseReference } from "@/domain/ids";
import { maxQuestionLength } from "@/domain/public-answer";
import { panelForResult } from "@/features/butler-answers/panel";
import { discoveryCopy } from "@/features/discovery/copy";
import { isRoutableLocale } from "@/i18n/config";
import { askAboutListing } from "@/server/ai/public-answer";
import { loadPublicAnswerSource } from "@/server/ai/public-answer-source";
import { getEnv } from "@/server/config/env";
import { isAppError } from "@/server/errors";
import { assertSameOrigin, clientIpFrom } from "@/server/http/request";
import { listingSlug } from "@/server/publication/presentation";

const noStore = { "cache-control": "no-store" };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) return new Response(null, { status: 404 });
  const env = getEnv();
  try {
    assertSameOrigin(request.headers, env.hosts.public);
  } catch {
    return new Response(null, { status: 403, headers: noStore });
  }
  const form = await request.formData().catch(() => null);
  const reference = form?.get("reference");
  const suggested = form?.get("suggested");
  const typed = form?.get("question");
  const raw = typeof suggested === "string" && suggested ? suggested : typed;
  if (
    typeof reference !== "string" ||
    parseReference(reference)?.kind !== "listing" ||
    typeof raw !== "string"
  )
    return new Response(null, { status: 400, headers: noStore });
  const question = raw.slice(0, maxQuestionLength * 4);
  const copy = discoveryCopy(locale);
  const db = getDb();
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");
  const page = new URL(
    `/${locale}/properties/${reference}/${listingSlug(reference)}`,
    env.hosts.public,
  );
  let param = "failed";
  let panel = null;
  try {
    const result = await askAboutListing(db, {
      reference,
      locale,
      question,
      clientIp: clientIpFrom(request.headers),
      labels: { viewing: copy.viewing, ask: copy.ask },
    });
    if (result.kind === "off" || result.kind === "not_found")
      return wantsJson
        ? NextResponse.json({ panel: null }, { headers: noStore })
        : NextResponse.redirect(page, { status: 303, headers: noStore });
    if (wantsJson) {
      const source = await loadPublicAnswerSource(db, { reference, locale });
      panel = source
        ? await panelForResult(
            db,
            locale,
            { reference, manifestId: source.manifestId, listingId: source.listingId },
            result,
            question,
          )
        : null;
    } else {
      param =
        result.kind === "invalid"
          ? result.reason === "empty"
            ? "empty"
            : "long"
          : result.kind === "limited"
            ? (result.receiptId ?? "limited")
            : result.receiptId;
    }
  } catch (error) {
    if (!isAppError(error)) console.error("butler answer failed", error);
  }
  if (wantsJson) return NextResponse.json({ panel }, { headers: noStore });
  page.searchParams.set("butler", param);
  page.hash = "ask-butler";
  return NextResponse.redirect(page, { status: 303, headers: noStore });
}
