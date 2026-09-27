import type { PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { InquiryReceipt } from "@/server/inquiries/intake";
import type { FormCopy, FormReceipt, FormState } from "@/ui/form/contract";
import type { DiscoveryCopy } from "./copy";
export type InquiryValues = {
  purpose: string;
  name: string;
  contactKind: string;
  contactValue: string;
  message: string;
  callbackWindow: string;
  privacyNotice: string;
  listingReference: string;
  observedManifestId: string;
};
export const emptyInquiry: InquiryValues = {
  purpose: "question",
  name: "",
  contactKind: "email",
  contactValue: "",
  message: "",
  callbackWindow: "",
  privacyNotice: "",
  listingReference: "",
  observedManifestId: "",
};
export type InquiryState = FormState<InquiryValues>;
export const inquiryStatus = (locale: PublicLocale, key: string) =>
  `/${locale}/requests/${encodeURIComponent(key)}`;
export const inquiryPermalink = (locale: PublicLocale, key: string) =>
  `/${locale}/inquire?submission=${encodeURIComponent(key)}`;
export function inquiryFormCopy(copy: DiscoveryCopy): FormCopy {
  return {
    errorSummary: copy.check,
    pending: copy.sending,
    reapply: copy.ask,
    yourValue: copy.message,
    latestValue: copy.changed,
    revision: copy.reference,
    reference: copy.reference,
    recordedAt: copy.received,
    unknown: copy.notConfirmed,
    draftRetained: copy.retained,
  };
}
export function inquiryReceiptView(
  receipt: InquiryReceipt,
  locale: PublicLocale,
  copy: DiscoveryCopy,
): FormReceipt {
  return {
    title: copy.received,
    reference: receipt.reference,
    recordedAt: { dateTime: receipt.acceptedAt, label: formatDateTime(locale, receipt.acceptedAt) },
    nextStep: copy.next,
    destination: { href: inquiryStatus(locale, receipt.receiptId), label: copy.receipt },
  };
}
