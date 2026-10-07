import { propertyTypes } from "@/domain/facts";
import type { OwnerInquiry } from "@/domain/owner-inquiry";
import type { PublicLocale } from "@/i18n/config";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
import { discoveryCopy } from "./copy";
import { inquiryReviewCopy } from "./inquiry-review-copy";
import type { InquiryValues } from "./inquiry-state";

export function OwnerInquiryFields({
  form,
  locale,
}: {
  form: FormController<InquiryValues>;
  locale: PublicLocale;
}) {
  const c = inquiryReviewCopy(locale),
    copy = discoveryCopy(locale);
  const selects = [
    {
      name: "ownerPropertyType",
      label: c.propertyType,
      options: propertyTypes.map((value) => [value, copy[value]]),
    },
    {
      name: "ownerTransaction",
      label: c.transaction,
      options: [
        ["sale", c.sale],
        ["long_term_rent", c.letting],
      ],
    },
    {
      name: "ownerRelationship",
      label: c.relationship,
      options: [
        ["owner", c.owner],
        ["co_owner", c.coOwner],
        ["representative", c.representative],
        ["other", c.other],
      ],
    },
  ] as const;
  return (
    <fieldset className="min-w-0 space-y-5 rounded-panel border border-divider p-5">
      <legend className="px-1 text-heading font-semibold">{c.ownerTitle}</legend>
      <p className="text-dense text-text-muted">{c.ownerNote}</p>
      <FormField
        {...form.field("ownerLocality")}
        label={c.locality}
        maxLength={160}
        optionalLabel={copy.optional}
      />
      {selects.map(({ name, label, options }) => {
        const field = form.field(name);
        return (
          <div key={name} className={fieldClass}>
            <label htmlFor={field.id} className={labelClass}>
              {label}
            </label>
            <select
              id={field.id}
              name={name}
              value={field.value}
              disabled={field.readOnly}
              onChange={field.onChange}
              className={controlClass}
              aria-invalid={Boolean(field.error) || undefined}
              aria-describedby={field.error ? `${field.id}-error` : undefined}
            >
              <option value="">{c.notProvided}</option>
              {options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
              <option value="unknown">{copy.unknown}</option>
            </select>
            {field.error ? (
              <p id={`${field.id}-error`} className="text-error">
                {field.error}
              </p>
            ) : null}
          </div>
        );
      })}
      <FormField
        {...form.field("ownerDocumentArea")}
        label={c.documentArea}
        maxLength={32}
        optionalLabel={copy.optional}
      />
      <FormField
        {...form.field("ownerPropertyStatus")}
        label={c.propertyStatus}
        maxLength={200}
        optionalLabel={copy.optional}
      />
      <FormField
        {...form.field("ownerDocumentSource")}
        label={c.documentSource}
        maxLength={200}
        optionalLabel={copy.optional}
      />
    </fieldset>
  );
}

export function OwnerInquirySummary({
  input,
  locale,
  includePrivateDetails = true,
}: {
  input: OwnerInquiry;
  locale: PublicLocale;
  includePrivateDetails?: boolean;
}) {
  const c = inquiryReviewCopy(locale),
    copy = discoveryCopy(locale);
  const relationships = {
    owner: c.owner,
    co_owner: c.coOwner,
    representative: c.representative,
    other: c.other,
    unknown: copy.unknown,
  };
  const facts = [
    ...(includePrivateDetails ? [[c.locality, input.locality]] : []),
    [c.propertyType, input.propertyType ? copy[input.propertyType] : undefined],
    [
      c.transaction,
      input.transaction === "sale"
        ? c.sale
        : input.transaction === "long_term_rent"
          ? c.letting
          : input.transaction
            ? copy.unknown
            : undefined,
    ],
    [c.documentArea, input.documentArea ? `${input.documentArea} m²` : undefined],
    [c.relationship, input.relationship ? relationships[input.relationship] : undefined],
    ...(includePrivateDetails
      ? [
          [c.propertyStatus, input.propertyStatus],
          [c.documentSource, input.documentSource],
        ]
      : []),
  ];
  return (
    <section className="min-w-0 space-y-4 wrap-anywhere" aria-label={c.ownerTitle}>
      <h2 className="text-heading font-semibold">{c.ownerTitle}</h2>
      <p className="text-dense text-text-muted">{c.ownerNote}</p>
      <dl className="grid gap-4 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-dense text-text-muted">{label}</dt>
            <dd className="whitespace-pre-wrap">{value || c.notProvided}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
