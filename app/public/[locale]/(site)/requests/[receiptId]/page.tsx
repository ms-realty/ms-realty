// P12: receipt readback requires the original anonymous receipt session, never an RQ reference.
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { discoveryCopy } from "@/features/discovery/copy";
import { inquiryReceiptView, inquiryStatus } from "@/features/discovery/inquiry-state";
import { DiscoveryPage, discoveryMetadata } from "@/features/discovery/page";
import { isRoutableLocale } from "@/i18n/config";
import { getEnv } from "@/server/config/env";
import {
  readInquiryReceipt,
  receiptCookieName,
  validReceiptSession,
} from "@/server/inquiries/intake";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";
import { Receipt } from "@/ui/receipt";
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
    return (
      <DiscoveryPage>
        <h1 className="text-title font-semibold">{copy.notConfirmed}</h1>
        <Notice tone="warning" title={copy.checkOperation} />
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
          {receipt.listingReference ? (
            <p>
              {copy.reference}: <bdi>{receipt.listingReference}</bdi>
            </p>
          ) : null}
        </Receipt>
      </div>
      <a className="self-start underline" href={`/${locale}/properties`}>
        {copy.back}
      </a>
    </DiscoveryPage>
  );
}
