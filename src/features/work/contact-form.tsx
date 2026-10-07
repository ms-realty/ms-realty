"use client";

import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormAction, FormState } from "@/ui/form/contract";
import { ActionForm, type FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import type { ContactState, ContactValues } from "./actions";
import { contactCopy } from "./contact-copy";
import { workCopy } from "./copy";

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
  action,
  initialState,
}: {
  locale: string;
  id: string;
  contact: { id: string; version: number; kind: string; value: string };
  action: FormAction<ContactValues>;
  initialState: FormState<ContactValues>;
}) {
  const copy = contactCopy(locale);
  const work = workCopy(locale);
  const path = `/${locale}/inquiries/${id}`;
  return (
    <ActionForm
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
        if (name === "contactChoice") {
          const typed = state as ContactState;
          const method = [typed.previousContact, typed.currentContact, contact].find(
            (item) => item && value === `${item.id}:${item.version}`,
          );
          return method
            ? `${method.kind} · ${method.value}`
            : value.includes(" · ")
              ? value
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
                        label: `${current.kind} · ${current.value}`,
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
            <FormField
              {...form.field("contactedAt")}
              label={copy.contactedAt}
              hint={copy.timeHint}
              type="datetime-local"
              step={1}
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
            <FormField
              {...form.field("dueAt")}
              label={copy.dueAt}
              hint={work.utcHint}
              type="datetime-local"
              required
            />
            <Confirmation form={form} name="promisedToClient" label={copy.promise} />
            <Confirmation form={form} name="reviewed" label={copy.confirm} />
          </>
        );
      }}
    </ActionForm>
  );
}
