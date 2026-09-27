// P11: native Server Action, a server-issued identity and a pre-established receipt session.
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { InquiryForm } from "@/features/discovery/inquiry-form";
import { emptyInquiry, type InquiryState, inquiryStatus } from "@/features/discovery/inquiry-state";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
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
import { Notice } from "@/ui/notice";
import { sendInquiry } from "./actions";
export const metadata = discoveryMetadata;
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
  const session = validReceiptSession((await cookies()).get(receiptCookieName(getEnv()))?.value);
  if (!session && query.ready !== "1") {
    const next = new URLSearchParams();
    for (const name of ["purpose", "reference", "manifest", "submission"]) {
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
  const key =
    typeof query.submission === "string" && isIssuedSubmissionKey(query.submission)
      ? query.submission
      : issueSubmissionKey();
  const values = { ...emptyInquiry };
  if (
    typeof query.purpose === "string" &&
    [
      "question",
      "callback",
      "seller_consultation",
      "landlord_consultation",
      "viewing_request",
    ].includes(query.purpose)
  )
    values.purpose = query.purpose;
  if (values.purpose === "callback") values.contactKind = "phone";
  if (typeof query.reference === "string") {
    const result = await getPublicListing(getDb(), { reference: query.reference, locale }).catch(
      () => null,
    );
    if (result?.status !== "listing")
      return (
        <DiscoveryPage>
          <Notice tone="warning" title={result ? copy.unavailable : copy.failed} />
          <a className="underline" href={`/${locale}/properties`}>
            {copy.back}
          </a>
        </DiscoveryPage>
      );
    values.listingReference = result.listing.reference;
    values.observedManifestId =
      typeof query.manifest === "string" ? query.manifest : result.listing.manifestId;
  }
  const state: InquiryState = {
    operationId: key,
    expectedRevision: null,
    responseId: randomUUID(),
    reconciliation: { href: inquiryStatus(locale, key), label: copy.checkOperation },
    values,
    outcome: { kind: "idle" },
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
