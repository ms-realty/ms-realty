import { isUuid, parseReference } from "@/domain/ids";
import { inquiryPurposes } from "@/domain/inquiry";
import { type ContentReference, parseContentReference } from "@/domain/inquiry-content";
import { parseComparisonReferences, parseSelectedListingsJson } from "@/domain/inquiry-selection";
import type { OwnerInquiry } from "@/domain/owner-inquiry";
import type { ViewingPreferences } from "@/domain/viewing-preferences";
import type { PublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { InquiryReceipt } from "@/server/inquiries/intake";
import type { ListingCard } from "@/server/listings/view-models";
import type { FormCopy, FormReceipt, FormState } from "@/ui/form/contract";
import type { DiscoveryCopy } from "./copy";
import { emptyViewingValues } from "./viewing-fields";
export type InquiryValues = typeof emptyViewingValues & {
  purpose: string;
  name: string;
  contactKind: string;
  contactValue: string;
  message: string;
  callbackWindow: string;
  privacyNotice: string;
  listingReference: string;
  observedManifestId: string;
  selectedListings: string;
  comparisonReferences: string;
  contentReference: string;
  ownerLocality: string;
  ownerPropertyType: string;
  ownerTransaction: string;
  ownerDocumentArea: string;
  ownerRelationship: string;
  ownerPropertyStatus: string;
  ownerDocumentSource: string;
};
export const emptyInquiry: InquiryValues = {
  ...emptyViewingValues,
  purpose: "question",
  name: "",
  contactKind: "email",
  contactValue: "",
  message: "",
  callbackWindow: "",
  privacyNotice: "",
  listingReference: "",
  observedManifestId: "",
  selectedListings: "",
  comparisonReferences: "",
  contentReference: "",
  ownerLocality: "",
  ownerPropertyType: "",
  ownerTransaction: "",
  ownerDocumentArea: "",
  ownerRelationship: "",
  ownerPropertyStatus: "",
  ownerDocumentSource: "",
};
export type InquiryState = FormState<InquiryValues> & {
  sourcesChanged?: boolean;
  review?: {
    token: string;
    listings: readonly ListingCard[];
    ownerInput?: OwnerInquiry;
    viewingPreferences?: ViewingPreferences;
    content?: ContentReference & { title: string; locale: PublicLocale; sourceUrl: string };
  };
};
export const inquiryStatus = (locale: PublicLocale, key: string) =>
  `/${locale}/requests/${encodeURIComponent(key)}`;
export function inquiryPermalink(locale: PublicLocale, key: string, values?: InquiryValues) {
  const query = new URLSearchParams({ submission: key });
  if (values) {
    if (values.contentReference) {
      const content = parseContentReference(values.contentReference);
      query.set("contentReference", content ? JSON.stringify(content) : "invalid");
    }
    query.set(
      "purpose",
      inquiryPurposes.some((purpose) => purpose === values.purpose) ? values.purpose : "invalid",
    );
    if (values.selectedListings) {
      const selection = parseSelectedListingsJson(values.selectedListings);
      // Keep invalid context visibly invalid without copying arbitrary hidden-field text into URLs.
      query.set("selection", selection ? JSON.stringify(selection) : "invalid");
    }
    if (values.comparisonReferences) {
      const references = parseComparisonReferences(values.comparisonReferences);
      query.set("comparisonReferences", references ? references.join(",") : "invalid");
    }
    if (values.listingReference) {
      const reference = parseReference(values.listingReference);
      query.set("reference", reference?.kind === "listing" ? reference.reference : "invalid");
    }
    if (values.observedManifestId)
      query.set(
        "manifest",
        isUuid(values.observedManifestId) ? values.observedManifestId : "invalid",
      );
  }
  return `/${locale}/inquire?${query}`;
}
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
    nextStep: receipt.selectedListingReferences?.length
      ? `${copy.reference}: ${receipt.selectedListingReferences.join(", ")}. ${copy.next}`
      : receipt.listingReference
        ? `${copy.reference}: ${receipt.listingReference}. ${copy.next}`
        : copy.next,
    destination: { href: inquiryStatus(locale, receipt.receiptId), label: copy.receipt },
  };
}
