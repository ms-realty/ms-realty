"use client";
import { useRef } from "react";
import { contentRoute, parseContentReference } from "@/domain/inquiry-content";
import {
  comparisonReturnHref,
  parseComparisonReferences,
  parseSelectedListingsJson,
} from "@/domain/inquiry-selection";
import type { PublicLocale } from "@/i18n/config";
import type { ListingCard } from "@/server/listings/view-models";
import { buttonClass } from "@/ui/button-class";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { DiscoveryCopy } from "./copy";
import { InquiryListingSummaries } from "./inquiry-listing-summaries";
import { OwnerInquiryFields } from "./inquiry-owner";
import { InquiryReview } from "./inquiry-review";
import { inquiryReviewCopy } from "./inquiry-review-copy";
import {
  type InquiryState,
  type InquiryValues,
  inquiryFormCopy,
  inquiryPermalink,
  inquiryStatus,
} from "./inquiry-state";
import { ViewingPreferenceFields } from "./inquiry-viewing";
import { viewingCopy } from "./viewing-copy";
import { emptyViewingValues, viewingFieldLabels } from "./viewing-fields";

export function InquiryForm({
  action,
  initialState,
  locale,
  copy,
  initialListings = [],
}: {
  action: FormAction<InquiryValues>;
  initialState: InquiryState;
  locale: PublicLocale;
  copy: DiscoveryCopy;
  /** Approved cards the page read for the requested subjects; review rechecks them. */
  initialListings?: readonly ListingCard[];
}) {
  const contacts = useRef<Record<string, string>>({});
  const reviewCopy = inquiryReviewCopy(locale);
  const viewing = viewingCopy(locale);
  return (
    <ActionForm
      layout="full"
      action={action}
      initialState={initialState}
      permalink={inquiryPermalink(locale, initialState.operationId, initialState.values)}
      reconciliation={{
        href: inquiryStatus(locale, initialState.operationId),
        label: copy.checkOperation,
      }}
      copy={inquiryFormCopy(copy, initialState.operationId)}
      labels={{
        purpose: copy.purpose,
        name: copy.name,
        contactKind: copy.contactMethod,
        contactValue: copy.contactMethod,
        message: copy.message,
        callbackWindow: copy.callbackWindow,
        privacyNotice: copy.privacy,
        listingReference: copy.reference,
        observedManifestId: copy.reference,
        selectedListings: copy.compare,
        comparisonReferences: copy.compare,
        contentReference: reviewCopy.sourceContext,
        ownerLocality: reviewCopy.locality,
        ownerPropertyType: reviewCopy.propertyType,
        ownerTransaction: reviewCopy.transaction,
        ownerDocumentArea: reviewCopy.documentArea,
        ownerRelationship: reviewCopy.relationship,
        ownerPropertyStatus: reviewCopy.propertyStatus,
        ownerDocumentSource: reviewCopy.documentSource,
        ...viewingFieldLabels(viewing),
      }}
      submitLabel={(state) =>
        (state as InquiryState).review ? reviewCopy.confirmAction : reviewCopy.reviewAction
      }
    >
      {(form) => {
        const review = (form.state as InquiryState).review;
        if (review)
          return (
            <InquiryReview
              review={review}
              values={form.values}
              locale={locale}
              copy={copy}
              pending={form.pending}
            />
          );
        const setContact = (kind: string) => {
          contacts.current[form.values.contactKind] = form.values.contactValue;
          form.setValue("contactKind", kind);
          form.setValue("contactValue", contacts.current[kind] ?? "");
        };
        const purpose = form.field("purpose"),
          contact = form.field("contactKind"),
          privacy = form.field("privacyNotice");
        const selected = parseSelectedListingsJson(form.values.selectedListings);
        const subjects = form.values.selectedListings
          ? selected &&
            !form.values.listingReference &&
            !form.values.observedManifestId &&
            !form.values.comparisonReferences
            ? selected
            : []
          : form.values.listingReference
            ? [
                {
                  reference: form.values.listingReference,
                  observedManifestId: form.values.observedManifestId,
                },
              ]
            : [];
        // A changed source is never shown as offered; its identity stays in the hidden fields.
        const entryListings = (form.state as InquiryState).sourcesChanged
          ? []
          : subjects.flatMap((subject) => {
              const listing = initialListings.find(
                (item) =>
                  item.reference === subject.reference &&
                  item.manifestId === subject.observedManifestId,
              );
              return listing ? [listing] : [];
            });
        const selection = form.field("selectedListings");
        const navigation = form.field("comparisonReferences");
        const returnReferences = parseComparisonReferences(form.values.comparisonReferences);
        const contentReference = parseContentReference(form.values.contentReference);
        const content = form.field("contentReference");
        const choices = form.values.selectedListings
          ? { question: copy.ask }
          : {
              question: copy.ask,
              callback: copy.callback,
              seller_consultation: copy.sell,
              landlord_consultation: copy.let,
              ...(form.values.listingReference ? { viewing_request: copy.viewing } : {}),
              ...(contentReference?.kind === "service"
                ? { service_consultation: reviewCopy.service }
                : {}),
            };
        return (
          <>
            <input type="hidden" name="inquiryStage" value="review" />
            <input type="hidden" name="contentReference" value={form.values.contentReference} />
            {entryListings.length ? (
              <section className="min-w-0 space-y-3" aria-label={reviewCopy.entrySources}>
                <p className="text-dense text-text-muted">{reviewCopy.entrySources}</p>
                <InquiryListingSummaries
                  listings={entryListings}
                  locale={locale}
                  copy={copy}
                  stage="entry"
                />
              </section>
            ) : null}
            <div className="min-w-0 max-w-reading space-y-5">
              {content.error || contentReference ? (
                <section
                  id={content.id}
                  tabIndex={-1}
                  aria-label={reviewCopy.sourceContext}
                  className="space-y-3 rounded-control border border-divider p-4 wrap-anywhere"
                  aria-describedby={content.error ? `${content.id}-error` : undefined}
                >
                  {content.error ? (
                    <p id={`${content.id}-error`} className={errorClass}>
                      {content.error}
                    </p>
                  ) : null}
                  {contentReference ? (
                    <a className="underline" href={`/${locale}${contentRoute(contentReference)}`}>
                      {reviewCopy.sourceContext}
                    </a>
                  ) : null}
                  {(form.state as InquiryState).sourcesChanged ? (
                    <button
                      type="submit"
                      name="refreshSources"
                      value="1"
                      className={buttonClass("secondary")}
                      disabled={form.pending}
                    >
                      {reviewCopy.refreshSources}
                    </button>
                  ) : null}
                </section>
              ) : null}
              {form.values.selectedListings || selection.error ? (
                <section
                  id={selection.id}
                  tabIndex={-1}
                  aria-label={copy.compare}
                  aria-describedby={selection.error ? `${selection.id}-error` : undefined}
                  className="min-w-0 space-y-3 rounded-control border border-divider p-4 wrap-anywhere"
                >
                  <h2 className="font-semibold">{copy.compare}</h2>
                  <ol className="list-decimal space-y-2 ps-5">
                    {selected?.map((item) => (
                      <li key={item.reference}>
                        <a
                          className="underline"
                          href={`/${locale}/properties/${item.reference}/${item.reference.toLowerCase()}`}
                        >
                          <bdi>{item.reference}</bdi>
                        </a>
                      </li>
                    ))}
                  </ol>
                  {selected ? (
                    <a
                      className="underline"
                      href={comparisonReturnHref(
                        locale,
                        selected.map((item) => item.reference),
                      )}
                    >
                      {copy.compare}
                    </a>
                  ) : (
                    <p>{copy.invalid}</p>
                  )}
                  {selection.error ? (
                    <p id={`${selection.id}-error`} className={errorClass}>
                      {selection.error}
                    </p>
                  ) : null}
                </section>
              ) : null}
              <input type="hidden" name="selectedListings" value={form.values.selectedListings} />
              <input
                type="hidden"
                name="comparisonReferences"
                value={form.values.comparisonReferences}
              />
              {form.values.comparisonReferences || navigation.error ? (
                <div
                  id={navigation.id}
                  tabIndex={-1}
                  className="min-w-0 space-y-2"
                  aria-describedby={navigation.error ? `${navigation.id}-error` : undefined}
                >
                  {returnReferences ? (
                    <a className="underline" href={comparisonReturnHref(locale, returnReferences)}>
                      {copy.compare}
                    </a>
                  ) : (
                    <p>{copy.invalid}</p>
                  )}
                  {navigation.error ? (
                    <p id={`${navigation.id}-error`} className={errorClass}>
                      {navigation.error}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {form.values.listingReference ? (
                <p>
                  {copy.reference}:{" "}
                  <a
                    className="underline"
                    href={`/${locale}/properties/${form.values.listingReference}/${form.values.listingReference.toLowerCase()}`}
                  >
                    <bdi>{form.values.listingReference}</bdi>
                  </a>
                </p>
              ) : null}
              <input type="hidden" name="listingReference" value={form.values.listingReference} />
              <input
                type="hidden"
                name="observedManifestId"
                value={form.values.observedManifestId}
              />
              <div className={fieldClass} data-invalid={purpose.error ? "true" : undefined}>
                <label htmlFor={purpose.id} className={labelClass}>
                  {copy.purpose}
                </label>
                <select
                  id={purpose.id}
                  name={purpose.name}
                  value={purpose.value}
                  disabled={purpose.readOnly}
                  aria-invalid={Boolean(purpose.error) || undefined}
                  aria-describedby={purpose.error ? `${purpose.id}-error` : undefined}
                  onChange={(event) => {
                    form.setValue("purpose", event.target.value);
                    if (event.target.value === "callback") setContact("phone");
                  }}
                  className={controlClass}
                >
                  {Object.entries(choices).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {purpose.error ? (
                  <p id={`${purpose.id}-error`} className={errorClass}>
                    {purpose.error}
                  </p>
                ) : null}
              </div>
              {["seller_consultation", "landlord_consultation"].includes(form.values.purpose) ? (
                <OwnerInquiryFields form={form} locale={locale} />
              ) : (
                Object.entries(form.values)
                  .filter(([name]) => name.startsWith("owner"))
                  .map(([name, value]) => (
                    <input type="hidden" key={name} name={name} value={value} />
                  ))
              )}
              {form.values.purpose === "viewing_request" ? (
                <>
                  <ViewingPreferenceFields form={form} locale={locale} />
                  <FormField
                    {...form.field("viewingAccessNeeds")}
                    label={viewing.accessNeeds}
                    hint={viewing.accessHint}
                    multiline
                    maxLength={500}
                    optionalLabel={copy.optional}
                  />
                </>
              ) : (
                Object.keys(emptyViewingValues).map((name) => (
                  <input
                    type="hidden"
                    key={name}
                    name={name}
                    value={form.values[name as keyof InquiryValues]}
                  />
                ))
              )}
              <FormField
                {...form.field("message")}
                label={copy.message}
                multiline
                maxLength={2000}
                hint={copy.messageHint}
                required={form.values.purpose === "question"}
                optionalLabel={form.values.purpose !== "question" ? copy.optional : undefined}
              />
              <FormField
                {...form.field("name")}
                label={copy.name}
                optionalLabel={copy.optional}
                maxLength={120}
                autoComplete="name"
              />
              <div className={fieldClass} data-invalid={contact.error ? "true" : undefined}>
                <label htmlFor={contact.id} className={labelClass}>
                  {copy.contactMethod}
                </label>
                <select
                  id={contact.id}
                  name={contact.name}
                  value={contact.value}
                  disabled={contact.readOnly}
                  onChange={(event) => setContact(event.target.value)}
                  aria-invalid={Boolean(contact.error) || undefined}
                  aria-describedby={contact.error ? `${contact.id}-error` : undefined}
                  className={controlClass}
                >
                  <option value="email">{copy.email}</option>
                  <option value="phone">{copy.phone}</option>
                </select>
                {contact.error ? (
                  <p id={`${contact.id}-error`} className={errorClass}>
                    {contact.error}
                  </p>
                ) : null}
              </div>
              <FormField
                {...form.field("contactValue")}
                label={form.values.contactKind === "phone" ? copy.phone : copy.email}
                type={form.values.contactKind === "phone" ? "tel" : "email"}
                autoComplete={form.values.contactKind === "phone" ? "tel" : "email"}
                dir="ltr"
                maxLength={254}
                required
              />
              <FormField
                {...form.field("callbackWindow")}
                label={copy.callbackWindow}
                optionalLabel={copy.optional}
                maxLength={200}
              />
              <div className={fieldClass}>
                <label htmlFor={privacy.id} className="flex min-h-11 items-start gap-3">
                  <input
                    id={privacy.id}
                    name={privacy.name}
                    type="checkbox"
                    value="true"
                    checked={privacy.value === "true"}
                    disabled={privacy.readOnly}
                    onChange={(event) =>
                      form.setValue("privacyNotice", event.target.checked ? "true" : "")
                    }
                    aria-invalid={Boolean(privacy.error) || undefined}
                    aria-describedby={privacy.error ? `${privacy.id}-error` : undefined}
                    className="mt-1 size-5 shrink-0 accent-action"
                  />
                  {copy.privacy}
                </label>
                {privacy.error ? (
                  <p id={`${privacy.id}-error`} className={errorClass}>
                    {privacy.error}
                  </p>
                ) : null}
              </div>
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
