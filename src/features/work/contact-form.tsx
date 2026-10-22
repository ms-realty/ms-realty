"use client";

import { contactMethodKinds } from "@/domain/parties";
import { isInstantInput } from "@/domain/time";
import { isPublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { DateTimeField } from "@/ui/date-time-field";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import type { FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { ContactState, ContactValues } from "./actions";
import { contactCopy, contactMethodLabel } from "./contact-copy";
import { workCopy } from "./copy";
import { InquiryDraftForm } from "./inquiry-draft";
import type { InquiryDraftOwner } from "./inquiry-draft-storage";

function Choice({
  form,
  name,
  label,
  options,
}: {
  form: FormController<ContactValues>;
  name: "contactChoice" | "result";
  label: string;
  options: { value: string; label: string }[];
}) {
  const field = form.field(name);
  return (
    // UI06 Error (6:68): the error border and the message under the control.
    <div className={fieldClass} data-invalid={field.error ? "true" : undefined}>
      <label htmlFor={field.id} className={labelClass}>
        {label}
      </label>
      <select
        id={field.id}
        name={field.name}
        value={field.value}
        disabled={field.readOnly}
        onChange={(event) => form.setValue(name, event.target.value)}
        required
        className={controlClass}
        aria-invalid={Boolean(field.error) || undefined}
        aria-describedby={field.error ? `${field.id}-error` : undefined}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {field.error ? (
        <p id={`${field.id}-error`} className={errorClass}>
          {field.error}
        </p>
      ) : null}
    </div>
  );
}

function Confirmation({
  form,
  name,
  label,
}: {
  form: FormController<ContactValues>;
  name: "promisedToClient" | "reviewed";
  label: string;
}) {
  const field = form.field(name);
  return (
    <div className={fieldClass}>
      <label htmlFor={field.id} className="flex items-start gap-3">
        <input
          id={field.id}
          type="checkbox"
          name={field.name}
          value="yes"
          checked={field.value === "yes"}
          disabled={field.readOnly}
          onChange={(event) => form.setValue(name, event.target.checked ? "yes" : "")}
          required={name === "reviewed"}
          className="mt-1 size-5 shrink-0 accent-accent"
          aria-invalid={Boolean(field.error) || undefined}
          aria-describedby={field.error ? `${field.id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      {field.error ? (
        <p id={`${field.id}-error`} className={errorClass}>
          {field.error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactForm({
  locale,
  id,
  contact,
  draftOwner,
  action,
  initialState,
}: {
  locale: string;
  id: string;
  contact: { id: string; version: number; kind: string; value: string };
  draftOwner: InquiryDraftOwner;
  action: FormAction<ContactValues>;
  initialState: FormState<ContactValues>;
}) {
  const copy = contactCopy(locale);
  const work = workCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <InquiryDraftForm
      owner={draftOwner}
      id={id}
      kind="contact"
      draftCopy={work.draft}
      action={action}
      initialState={{ ...initialState, currentContact: contact } as ContactState}
      permalink={path}
      nativeIdentity={`inquiry-contact:${id}`}
      reconciliation={{
        href: `${path}/operations?type=contact&key=${encodeURIComponent(initialState.operationId)}`,
        label: work.statusLink,
      }}
      copy={work.form}
      labels={{
        contactChoice: copy.contact,
        result: copy.result,
        contactedAt: copy.contactedAt,
        note: copy.note,
        nextAction: copy.nextAction,
        dueAt: copy.dueAt,
        promisedToClient: copy.promise,
        reviewed: copy.confirm,
      }}
      formatValue={(name, value, state) => {
        if (["contactedAt", "dueAt"].includes(name) && isInstantInput(value))
          return formatDateTime(isPublicLocale(locale) ? locale : "bg", value, {
            zoneLabel: true,
            seconds: name === "contactedAt",
          });
        if (name === "contactChoice") {
          const typed = state as ContactState;
          const method = [typed.previousContact, typed.currentContact, contact].find(
            (item) => item && value === `${item.id}:${item.version}`,
          );
          return method
            ? `${contactMethodLabel(method.kind, locale)} · ${method.value}`
            : value.includes(" · ")
              ? value.replace(/^[^·]+(?= · )/, (kind) =>
                  contactMethodKinds.some((item) => item === kind)
                    ? contactMethodLabel(kind, locale)
                    : kind,
                )
              : copy.chooseContact;
        }
        if (name === "result")
          return value === "useful_response" ? copy.useful_response : copy.unanswered;
        if (name === "reviewed" || name === "promisedToClient")
          return value === "yes"
            ? locale === "bg" || locale === "ru"
              ? "Да"
              : "Yes"
            : locale === "bg"
              ? "Не"
              : locale === "ru"
                ? "Нет"
                : "No";
        return value;
      }}
      submitLabel={copy.submit}
    >
      {(form) => {
        const state = form.state as ContactState;
        const current = state.currentContact === undefined ? contact : state.currentContact;
        return (
          <>
            <Choice
              form={form}
              name="contactChoice"
              label={copy.contact}
              options={[
                { value: "", label: copy.chooseContact },
                ...(current
                  ? [
                      {
                        value: `${current.id}:${current.version}`,
                        label: `${contactMethodLabel(current.kind, locale)} · ${current.value}`,
                      },
                    ]
                  : []),
              ]}
            />
            <Choice
              form={form}
              name="result"
              label={copy.result}
              options={[
                { value: "unanswered", label: copy.unanswered },
                { value: "useful_response", label: copy.useful_response },
              ]}
            />
            <DateTimeField
              {...form.field("contactedAt")}
              step={1}
              label={copy.contactedAt}
              hint={copy.timeHint}
              locale={isPublicLocale(locale) ? locale : "bg"}
              onValueChange={(value) => form.setValue("contactedAt", value)}
              required
            />
            <FormField
              {...form.field("note")}
              label={copy.note}
              multiline
              minLength={10}
              maxLength={2000}
              required
            />
            <FormField
              {...form.field("nextAction")}
              label={copy.nextAction}
              minLength={3}
              maxLength={500}
              required
            />
            <DateTimeField
              {...form.field("dueAt")}
              label={copy.dueAt}
              hint={work.utcHint}
              locale={isPublicLocale(locale) ? locale : "bg"}
              onValueChange={(value) => form.setValue("dueAt", value)}
              required
            />
            <Confirmation form={form} name="promisedToClient" label={copy.promise} />
            <Confirmation form={form} name="reviewed" label={copy.confirm} />
          </>
        );
      }}
    </InquiryDraftForm>
  );
}
