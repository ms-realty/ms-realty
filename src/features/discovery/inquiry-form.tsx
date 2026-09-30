"use client";
import { useRef } from "react";
import {
  comparisonReturnHref,
  parseComparisonReferences,
  parseSelectedListingsJson,
} from "@/domain/inquiry-selection";
import type { PublicLocale } from "@/i18n/config";
import { controlClass, fieldClass } from "@/ui/field-class";
import type { FormAction } from "@/ui/form/contract";
import { ActionForm } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { DiscoveryCopy } from "./copy";
import {
  type InquiryState,
  type InquiryValues,
  inquiryFormCopy,
  inquiryPermalink,
  inquiryStatus,
} from "./inquiry-state";

export function InquiryForm({
  action,
  initialState,
  locale,
  copy,
}: {
  action: FormAction<InquiryValues>;
  initialState: InquiryState;
  locale: PublicLocale;
  copy: DiscoveryCopy;
}) {
  const contacts = useRef<Record<string, string>>({});
  return (
    <ActionForm
      action={action}
      initialState={initialState}
      permalink={inquiryPermalink(locale, initialState.operationId, initialState.values)}
      reconciliation={{
        href: inquiryStatus(locale, initialState.operationId),
        label: copy.checkOperation,
      }}
      copy={inquiryFormCopy(copy)}
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
      }}
      submitLabel={copy.ask}
    >
      {(form) => {
        const setContact = (kind: string) => {
          contacts.current[form.values.contactKind] = form.values.contactValue;
          form.setValue("contactKind", kind);
          form.setValue("contactValue", contacts.current[kind] ?? "");
        };
        const purpose = form.field("purpose"),
          contact = form.field("contactKind"),
          privacy = form.field("privacyNotice");
        const selected = parseSelectedListingsJson(form.values.selectedListings);
        const selection = form.field("selectedListings");
        const navigation = form.field("comparisonReferences");
        const returnReferences = parseComparisonReferences(form.values.comparisonReferences);
        const choices = form.values.selectedListings
          ? { question: copy.ask }
          : {
              question: copy.ask,
              callback: copy.callback,
              seller_consultation: copy.sell,
              landlord_consultation: copy.let,
              ...(form.values.listingReference ? { viewing_request: copy.viewing } : {}),
            };
        return (
          <>
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
                  <p id={`${selection.id}-error`} className="text-error">
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
                  <p id={`${navigation.id}-error`} className="text-error">
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
            <input type="hidden" name="observedManifestId" value={form.values.observedManifestId} />
            <div className={fieldClass}>
              <label htmlFor={purpose.id} className="font-semibold">
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
                <p id={`${purpose.id}-error`} className="text-error">
                  {purpose.error}
                </p>
              ) : null}
            </div>
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
            <div className={fieldClass}>
              <label htmlFor={contact.id} className="font-semibold">
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
                <p id={`${contact.id}-error`} className="text-error">
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
                <p id={`${privacy.id}-error`} className="text-error">
                  {privacy.error}
                </p>
              ) : null}
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
