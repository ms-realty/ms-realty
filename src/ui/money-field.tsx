"use client";

import type { CurrencyCode, PublicLocale } from "@/domain/ids";
import { formatMoneyInput, parseMoneyInput } from "@/i18n/money";
import { moneyCopy } from "@/i18n/money-copy";
import { FormField } from "./form/form-field";

/** Native text posts the same locale notation before hydration; the server parses it exactly. */
export function MoneyField({
  id,
  name,
  label,
  locale,
  currency,
  value,
  onValueChange,
  error,
  hint,
  required,
  readOnly,
}: {
  id: string;
  name: string;
  label: string;
  locale: PublicLocale;
  currency?: CurrencyCode;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  const example = [formatMoneyInput(locale, 123456, currency ?? "EUR"), currency]
    .filter(Boolean)
    .join(" ");
  const guidance = moneyCopy(locale).hint.replace("{example}", example);
  return (
    <FormField
      id={id}
      name={name}
      label={currency ? `${label} (${currency})` : label}
      hint={[hint, guidance].filter(Boolean).join(" ")}
      error={error}
      type="text"
      inputMode="decimal"
      dir="ltr"
      value={value}
      required={required}
      readOnly={readOnly}
      maxLength={128}
      onChange={(event) => onValueChange(event.target.value)}
      onBlur={(event) => {
        if (!currency || readOnly) return;
        const minor = parseMoneyInput(locale, event.target.value, currency);
        if (!Number.isNaN(minor)) onValueChange(formatMoneyInput(locale, minor, currency));
      }}
    />
  );
}
