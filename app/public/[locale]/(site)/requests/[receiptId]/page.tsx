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
import { brandPhone } from "@/features/shell/agency";
import { isRoutableLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { getEnv } from "@/server/config/env";
import {
  issuedCheckCode,
  readInquiryReceipt,
  receiptCheckAttempted,
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
  // The brand line is the one verified channel that cannot start a duplicate inquiry.
  const call = (
    <a className={buttonClass("primary", "self-start")} href={`tel:${brandPhone.e164}`}>
      {copy.callAgency} <span dir="ltr">{brandPhone.display}</span>
    </a>
  );
  // P12 telephone check code: only for a key this server issued; it never unlocks a receipt.
  const checkCode = issuedCheckCode(receiptId);
  const notShown = (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{copy.notConfirmed}</h1>
      <p className="max-w-reading">
        {checkCode ? copy.notShownBodyCode.replace("{code}", checkCode) : copy.notShownBody}
      </p>
      {call}
    </DiscoveryPage>
  );
  // Preparing the lookup is not a check: a failure here must not claim one.
  let db: ReturnType<typeof getDb>;
  let receiptSession: ReturnType<typeof validReceiptSession>;
  // Outside the catch: Next signals dynamic rendering by throwing from cookies().
  const jar = await cookies();
  try {
    db = getDb();
    receiptSession = validReceiptSession(jar.get(receiptCookieName(getEnv()))?.value);
  } catch {
    return notShown;
  }
  let receipt: Awaited<ReturnType<typeof readInquiryReceipt>>;
  try {
    receipt = await readInquiryReceipt(db, { submissionKey: receiptId, receiptSession });
  } catch (error) {
    if (!receiptCheckAttempted(error)) return notShown;
    const checkedAt = new Date().toISOString();
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.checkUnknownTitle}</h1>
        <Notice tone="warning" title={copy.checkResult}>
          {checkCode ? <p>{copy.checkCode.replace("{code}", checkCode)}</p> : null}
          <p>
            <time dateTime={checkedAt}>
              {copy.checkedAt.replace("{time}", formatDateTime(locale, checkedAt))}
            </time>
          </p>
        </Notice>
        <p className="max-w-reading">{copy.checkUnknownBody.replace("{code}", checkCode ?? "")}</p>
        <div className="flex flex-wrap gap-3">
          {call}
          {/* The same check again; it never resends the inquiry. */}
          <a
            className={buttonClass("secondary", "self-start")}
            href={inquiryStatus(locale, receiptId)}
          >
            {copy.checkAgain}
          </a>
        </div>
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
