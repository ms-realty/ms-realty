"use client";

import { type InputHTMLAttributes, useState, useSyncExternalStore } from "react";
import type { PublicLocale } from "@/domain/ids";
import { isInstantInput, localInputValue, readDateTimeEntry, readLocalInput } from "@/domain/time";
import { agencyTimeZone } from "@/i18n/config";
import { formatDateTime, timeZoneLabel } from "@/i18n/format";
import { timeCopy } from "@/i18n/time-copy";
import { cx } from "./cx";
import { controlClass, errorClass, fieldClass, labelClass } from "./field-class";
import { ClockIcon } from "./icons";

export type DateTimeFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "children" | "id"
> & {
  id: string;
  label: string;
  locale: PublicLocale;
  hint?: string;
  error?: string;
  optionalLabel?: string;
  /** IANA zone the wall time is entered in (the agency's by default); shown in words only. */
  timeZone?: string;
  /** A commitment needs an explicit autumn occurrence; a preference may take its first one. */
  repeatedHour?: "reject" | "first";
  /** Keep the resolved occurrence in an ActionForm's existing logical field value. */
  onValueChange?: (value: string) => void;
  /** A caller with its own clock-choice controls (viewing preferences) supplies them. */
  occurrence?: string;
  externalOccurrence?: boolean;
};

const noSubscription = () => () => {};

/**
 * UI11 date and time: the native `datetime-local` control (typed entry and the platform's
 * picker, posted without JavaScript) with its zone in words. After hydration it reads the value
 * back as the exact day and time, or says why the clocks make that time impossible or repeated.
 * The server reads the same value and explicit occurrence with `readDateTimeEntry`.
 */
export function DateTimeField({
  id,
  label,
  locale,
  hint,
  error,
  optionalLabel,
  timeZone = agencyTimeZone,
  repeatedHour = "reject",
  onValueChange,
  occurrence,
  externalOccurrence = false,
  className,
  onChange,
  ...props
}: DateTimeFieldProps) {
  const controlled = props.value !== undefined;
  const [typed, setTyped] = useState(String(props.defaultValue ?? ""));
  const raw = controlled ? String(props.value ?? "") : typed;
  const original = isInstantInput(raw) ? raw : "";
  const seconds = props.step === "any" || (props.step !== undefined && Number(props.step) < 60);
  const value = original ? localInputValue(original, timeZone, seconds ? "second" : "minute") : raw;
  const [choice, setChoice] = useState("");
  const first = original ? readLocalInput(value, timeZone, "earlier") : null;
  const savedChoice =
    original && first?.ok && first.repeated
      ? Math.floor(Date.parse(original) / 60_000) === Math.floor(Date.parse(first.instant) / 60_000)
        ? "earlier"
        : "later"
      : "";
  const selected = occurrence ?? (original ? savedChoice : choice);
  // The read-back is the browser's ICU wording; render it after hydration only.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const copy = timeCopy(locale);
  const read = value
    ? readDateTimeEntry(
        value,
        timeZone,
        selected || (repeatedHour === "first" ? "earlier" : ""),
        original,
      )
    : null;
  // A server error for the same value already says why; the read-back would repeat it.
  const readback =
    !read || (!read.ok && error)
      ? ""
      : read.ok
        ? [
            formatDateTime(locale, read.instant, { timeZone, seconds }),
            read.repeated && repeatedHour === "first" ? copy.repeatedFirst : "",
          ]
            .filter(Boolean)
            .join(" ")
        : read.reason === "nonexistent_local_time"
          ? copy.nonexistent
          : read.reason === "ambiguous_local_time"
            ? copy.repeated
            : "";
  const zone = timeZoneLabel(locale, timeZone);
  const describedBy = cx(
    `${id}-zone`,
    hint && `${id}-hint`,
    hydrated && readback && `${id}-readback`,
    error && `${id}-error`,
  );
  return (
    <div className={cx(fieldClass, className)} data-invalid={error ? "true" : undefined}>
      <label htmlFor={id} className={labelClass}>
        {label}
        {optionalLabel ? (
          <span className="font-normal text-text-muted"> {optionalLabel}</span>
        ) : null}
      </label>
      <p
        id={`${id}-zone`}
        className="inline-flex items-center gap-1.5 text-caption font-semibold text-text"
      >
        <ClockIcon className="size-4" />
        {zone.charAt(0).toLocaleUpperCase(locale) + zone.slice(1)}
      </p>
      {hint ? (
        <p id={`${id}-hint`} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
      <input
        {...props}
        value={value}
        defaultValue={undefined}
        id={id}
        type="datetime-local"
        dir="ltr"
        aria-describedby={describedBy}
        aria-invalid={Boolean(error) || undefined}
        className={cx(controlClass, "tabular-nums", props.readOnly && "bg-subtle")}
        onChange={(event) => {
          setChoice("");
          if (!controlled) setTyped(event.target.value);
          onChange?.(event);
        }}
      />
      {props.name && !externalOccurrence ? (
        <>
          <input type="hidden" name={`${props.name}WallTime`} value="yes" />
          <input type="hidden" name={`${props.name}Original`} value={original} />
        </>
      ) : null}
      {repeatedHour === "reject" && !externalOccurrence ? (
        <details
          open={Boolean(read && (read.ok ? read.repeated : read.reason === "ambiguous_local_time"))}
        >
          <summary className="cursor-pointer py-2 text-caption underline">
            {copy.occurrence}
          </summary>
          <label htmlFor={`${id}-occurrence`} className={labelClass}>
            {copy.occurrence}
          </label>
          <select
            id={`${id}-occurrence`}
            name={props.name ? `${props.name}Occurrence` : undefined}
            className={controlClass}
            value={selected}
            disabled={props.disabled || props.readOnly}
            onChange={(event) => {
              const next = event.target.value;
              setChoice(next);
              const resolved = readDateTimeEntry(value, timeZone, next, original);
              const nextValue = resolved.ok ? resolved.instant : value;
              if (controlled) onValueChange?.(nextValue);
              else setTyped(nextValue);
            }}
          >
            <option value="">{copy.choose}</option>
            <option value="earlier">{copy.earlier}</option>
            <option value="later">{copy.later}</option>
          </select>
        </details>
      ) : null}
      {hydrated ? (
        <p
          id={`${id}-readback`}
          aria-live="polite"
          className={cx(
            "text-caption empty:hidden",
            read && !read.ok ? "font-medium text-warning" : "text-text-muted",
          )}
        >
          {readback}
        </p>
      ) : null}
      {/* UI06 Error (6:68): the message sits under the field it belongs to. */}
      {error ? (
        <p id={`${id}-error`} className={errorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
