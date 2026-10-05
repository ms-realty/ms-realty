// P12: receipt readback requires the original anonymous receipt session, never an RQ reference.
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { comparisonReturnHref } from "@/domain/inquiry-selection";
import { discoveryCopy } from "@/features/discovery/copy";
import { InquiryContent } from "@/features/discovery/inquiry-content";
import { OwnerInquirySummary } from "@/features/discovery/inquiry-owner";
import { inquiryReceiptView, inquiryStatus } from "@/features/discovery/inquiry-state";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
import { isRoutableLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getEnv } from "@/server/config/env";
import {
  readInquiryReceipt,
  receiptCookieName,
  validReceiptSession,
} from "@/server/inquiries/intake";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { Receipt } from "@/ui/receipt";
import { ReceiptListings } from "@/ui/receipt-listings";
export const metadata = discoveryMetadata;
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ locale: string; receiptId: string }>;
}) {
  const { locale, receiptId } = await params;
  if (!isRoutableLocale(locale)) notFound();
  const copy = discoveryCopy(locale);
  let receipt: Awaited<ReturnType<typeof readInquiryReceipt>>;
  try {
    receipt = await readInquiryReceipt(getDb(), {
      submissionKey: receiptId,
      receiptSession: validReceiptSession(
        (await cookies()).get(receiptCookieName(getEnv()))?.value,
      ),
    });
  } catch {
    const checkedAt = new Date().toISOString();
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.notConfirmed}</h1>
        <Notice tone="warning" title={copy.checkResult}>
          <time dateTime={checkedAt}>
            {copy.checkedAt.replace("{time}", formatDateTime(locale, checkedAt))}
          </time>
        </Notice>
        <a
          className={buttonClass("secondary", "self-start")}
          href={inquiryStatus(locale, receiptId)}
        >
          {copy.checkOperation}
        </a>
      </DiscoveryPage>
    );
  }
  const view = inquiryReceiptView(receipt, locale, copy);
  const returnReferences = receipt.selectedListingReferences.length
    ? receipt.selectedListingReferences
    : receipt.comparisonReferences;
  return (
    <DiscoveryPage>
      <div className="max-w-reading">
        <Receipt
          title={view.title}
          headingLevel={1}
          referenceLabel={copy.reference}
          reference={view.reference}
          recordedAt={view.recordedAt}
          recordedAtLabel={copy.received}
        >
          <p>{copy.next}</p>
          {view.listings ? <ReceiptListings listings={view.listings} /> : null}
        </Receipt>
      </div>
      <InquiryContent content={receipt.content} locale={locale} />
      {receipt.ownerInput ? (
        <OwnerInquirySummary
          input={receipt.ownerInput}
          locale={locale}
          includePrivateDetails={false}
        />
      ) : null}
      <a
        className="self-start underline"
        href={
          returnReferences.length
            ? comparisonReturnHref(locale, returnReferences)
            : `/${locale}/properties`
        }
      >
        {returnReferences.length ? copy.compare : copy.back}
      </a>
    </DiscoveryPage>
  );
}
