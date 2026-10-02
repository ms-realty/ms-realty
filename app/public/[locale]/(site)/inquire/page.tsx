// P11: native Server Action, a server-issued identity and a pre-established receipt session.
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { isUuid, parseReference } from "@/domain/ids";
import { parseContentReference } from "@/domain/inquiry-content";
import {
  comparisonReturnHref,
  parseComparisonReferences,
  parseSelectedListingsJson,
} from "@/domain/inquiry-selection";
import { discoveryCopy } from "@/features/discovery/copy";
import { InquiryForm } from "@/features/discovery/inquiry-form";
import { inquiryReviewCopy } from "@/features/discovery/inquiry-review-copy";
import { emptyInquiry, type InquiryState, inquiryStatus } from "@/features/discovery/inquiry-state";
import { DiscoveryPage } from "@/features/discovery/page";
import type { QueryParams } from "@/features/discovery/query";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import {
  isIssuedSubmissionKey,
  issueSubmissionKey,
  receiptCookieName,
  validReceiptSession,
} from "@/server/inquiries/intake";
import { getPublicListing } from "@/server/listings/detail";
import { publicRouteMetadata } from "@/server/seo/public-metadata";
import { Notice } from "@/ui/notice";
import { sendInquiry } from "./actions";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicRouteMetadata((await params).locale, "/inquire");
}
export default async function InquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<QueryParams>;
}) {
  const { locale } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale),
    query = await searchParams;
  const key =
    typeof query.submission === "string" && isIssuedSubmissionKey(query.submission)
      ? query.submission
      : issueSubmissionKey();
  if (
    ["OUTCOME_UNKNOWN", "OPERATION_PENDING", "IDEMPOTENCY_KEY_REUSED"].includes(
      typeof query.error === "string" ? query.error : "",
    )
  )
    redirect(inquiryStatus(locale, key));
  const comparison =
    typeof query.comparisonReferences === "string"
      ? parseComparisonReferences(query.comparisonReferences)
      : null;
  const selected =
    typeof query.selection === "string" ? parseSelectedListingsJson(query.selection) : null;
  const content =
    typeof query.contentReference === "string"
      ? parseContentReference(query.contentReference)
      : null;
  const invalidContext =
    query.context !== undefined ||
    (query.reference !== undefined &&
      (typeof query.reference !== "string" ||
        parseReference(query.reference)?.kind !== "listing")) ||
    (query.manifest !== undefined &&
      (typeof query.manifest !== "string" || !isUuid(query.manifest) || !query.reference)) ||
    (query.contentReference !== undefined && !content) ||
    (query.purpose === "service_consultation" && content?.kind !== "service") ||
    [
      "purpose",
      "reference",
      "manifest",
      "submission",
      "selection",
      "comparisonReferences",
      "contentReference",
    ].some((name) => Array.isArray(query[name])) ||
    (query.selection !== undefined &&
      (!selected ||
        query.reference !== undefined ||
        query.manifest !== undefined ||
        comparison ||
        (query.purpose !== undefined && query.purpose !== "question"))) ||
    (query.comparisonReferences !== undefined &&
      (!comparison ||
        typeof query.reference !== "string" ||
        !comparison.includes(query.reference)));
  if (invalidContext)
    return (
      <DiscoveryPage>
        <Notice tone="warning" title={copy.invalid} />
        <a
          className="underline"
          href={comparison ? comparisonReturnHref(locale, comparison) : `/${locale}/compare`}
        >
          {copy.compare}
        </a>
      </DiscoveryPage>
    );
  const session = validReceiptSession((await cookies()).get(receiptCookieName(getEnv()))?.value);
  if (!session && query.ready !== "1") {
    const next = new URLSearchParams();
    for (const name of [
      "purpose",
      "reference",
      "manifest",
      "submission",
      "selection",
      "comparisonReferences",
      "contentReference",
      "error",
    ]) {
      if (typeof query[name] === "string") next.set(name, query[name]);
    }
    redirect(`/${locale}/inquire/start?${next}`);
  }
  if (!session)
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.ask}</h1>
        <Notice tone="warning" title={copy.notConfirmed} />
      </DiscoveryPage>
    );
  const values = {
    ...emptyInquiry,
    comparisonReferences: comparison?.join(",") ?? "",
    contentReference: content ? JSON.stringify(content) : "",
  };
  let selectionChanged = false;
  if (
    typeof query.purpose === "string" &&
    [
      "question",
      "callback",
      "seller_consultation",
      "landlord_consultation",
      "viewing_request",
      "service_consultation",
    ].includes(query.purpose)
  )
    values.purpose = query.purpose;
  if (values.purpose === "callback") values.contactKind = "phone";
  if (selected) {
    values.selectedListings = JSON.stringify(selected);
    for (const item of selected) {
      const result = await getPublicListing(getDb(), { reference: item.reference, locale }).catch(
        () => null,
      );
      if (
        result?.status !== "listing" ||
        result.listing.manifestId !== item.observedManifestId ||
        result.listing.availability.primaryAction === "view_similar"
      )
        selectionChanged = true;
    }
  }
  if (typeof query.reference === "string") {
    const result = await getPublicListing(getDb(), { reference: query.reference, locale }).catch(
      () => null,
    );
    // The native POST must render the same ActionForm even if a source was withdrawn.
    // Its returned draft and operation cannot be replaced by a new navigation-only page.
    values.listingReference =
      result?.status === "listing" ? result.listing.reference : query.reference;
    values.observedManifestId =
      typeof query.manifest === "string"
        ? query.manifest
        : result?.status === "listing"
          ? result.listing.manifestId
          : "";
    if (
      result?.status !== "listing" ||
      result.listing.availability.primaryAction === "view_similar" ||
      (typeof query.manifest === "string" && result.listing.manifestId !== query.manifest)
    )
      selectionChanged = true;
  }
  const state: InquiryState = {
    sourcesChanged: selectionChanged || query.error === "REVISION_CONFLICT",
    operationId: key,
    expectedRevision: null,
    responseId: randomUUID(),
    reconciliation: { href: inquiryStatus(locale, key), label: copy.checkOperation },
    values,
    outcome:
      selectionChanged || query.error === "REVISION_CONFLICT"
        ? {
            kind: "validation",
            code: "VALIDATION_FAILED",
            message: copy.changed,
            fieldErrors: { contentReference: [inquiryReviewCopy(locale).sourcesChanged] },
          }
        : typeof query.error === "string"
          ? {
              kind: "validation",
              code: "VALIDATION_FAILED",
              message: copy.check,
              fieldErrors: { message: [copy.invalid] },
            }
          : { kind: "idle" },
  };
  return (
    <DiscoveryPage>
      <header className="space-y-3">
        <h1 className="text-title font-semibold">{copy.ask}</h1>
        <p className="max-w-reading text-text-muted">{copy.next}</p>
      </header>
      <InquiryForm
        action={sendInquiry.bind(null, locale)}
        initialState={state}
        locale={locale}
        copy={copy}
      />
    </DiscoveryPage>
  );
}
