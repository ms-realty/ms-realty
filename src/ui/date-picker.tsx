"use client";

import {
  parseDate,
  parseDateTime,
  parseZonedDateTime,
  toCalendar,
  toCalendarDate,
  toCalendarDateTime,
} from "@internationalized/date";
import { type ReactNode, useEffect, useId, useReducer, useRef, useState } from "react";
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  DateInput,
  type DateInputProps,
  DateSegment,
  type DateValue,
  Dialog,
  Group,
  Heading,
  DateField as RACDateField,
  type DateFieldProps as RACDateFieldProps,
  DatePicker as RACDatePicker,
  type DatePickerProps as RACDatePickerProps,
  Text,
} from "react-aria-components";
import { cx } from "./cx";
import { FieldError, fieldClass, Label, ListPopover } from "./field";
import { controlClass, errorClass, labelClass } from "./field-class";
import { CalendarIcon, ChevronEndIcon, ChevronStartIcon, ClockIcon } from "./icons";

type DateFieldExtras = {
  label: ReactNode;
  description?: ReactNode;
  /**
   * The timezone the value is read in, always visible, e.g. "Bulgarian time (Europe/Sofia)".
   * A traveller must never have to guess it (A21).
   */
  timeZoneLabel: string;
  errorMessage?: ReactNode;
  optionalLabel?: string;
  className?: string;
};

const groupClass = cx(
  "flex min-h-input w-full items-center rounded-control border border-border bg-canvas ps-3 text-body text-text",
  "data-hovered:border-text data-focus-within:outline-3 data-focus-within:outline-offset-2 data-focus-within:outline-focus",
  "group-data-invalid:border-error",
  "group-data-readonly:border-dashed group-data-readonly:bg-subtle",
  "group-data-disabled:border-disabled-text group-data-disabled:bg-disabled group-data-disabled:text-disabled-text",
);

function Segments(props: Omit<DateInputProps, "children">) {
  return (
    <DateInput {...props} className="flex flex-1 flex-wrap items-center py-0.5 tabular-nums">
      {(segment) => (
        <DateSegment
          segment={segment}
          className={cx(
            // Editable segments meet the 44px control minimum; literals stay tight.
            "inline-flex min-h-control min-w-control items-center justify-center rounded-control px-0.5 outline-none",
            "data-placeholder:text-text-muted data-[type=literal]:min-w-0 data-[type=literal]:px-0",
            "data-focused:bg-action data-focused:text-text-inverse",
            "forced-colors:data-focused:bg-[Highlight] forced-colors:data-focused:text-[HighlightText]",
          )}
        />
      )}
    </DateInput>
  );
}

type DateBehaviorProps<T extends DateValue> = Omit<
  RACDateFieldProps<T>,
  "style" | "className" | "children" | "render"
>;

/** Native HTML cannot encode a zone/offset or a time hidden by the requested granularity. */
function nativeDateConfig<T extends DateValue>(props: DateBehaviorProps<T>, value: T | null) {
  const template = value ?? props.placeholderValue;
  const granularity = props.granularity ?? (template && "hour" in template ? "minute" : "day");
  if (template && !(granularity in template)) {
    throw new Error(`Invalid granularity ${granularity} for value ${template.toString()}`);
  }
  const hasTime = Boolean(template && "hour" in template) || granularity !== "day";
  const hasHiddenTime = (date?: DateValue | null) =>
    date &&
    "hour" in date &&
    (granularity === "day" ||
      (granularity === "hour" && (date.minute || date.second || date.millisecond)) ||
      (granularity === "minute" && (date.second || date.millisecond)) ||
      (granularity === "second" && date.millisecond));
  const zoned = Boolean(template && "timeZone" in template);
  const bounds = [props.minValue, props.maxValue];
  const canonical =
    zoned ||
    [template, ...bounds].some(hasHiddenTime) ||
    [template, ...bounds].some(
      (date) => date && (date.toString().startsWith("0000-") || date.toString().startsWith("-")),
    ) ||
    bounds.some((date) => date && "timeZone" in date);
  const type = canonical ? "text" : hasTime ? "datetime-local" : "date";
  const bound = (date?: DateValue | null) =>
    date ? (hasTime ? toCalendarDateTime(date) : toCalendarDate(date)).toString() : undefined;
  return {
    type,
    template,
    hasTime,
    kind: canonical ? (zoned ? "canonical-zoned" : "canonical") : type,
    value: value?.toString() ?? "",
    min: canonical ? undefined : bound(props.minValue),
    max: canonical ? undefined : bound(props.maxValue),
    step: granularity === "hour" ? 3600 : granularity === "minute" ? 60 : 1,
  } as const;
}

function readNativeDate<T extends DateValue>(
  raw: string,
  config: ReturnType<typeof nativeDateConfig<T>>,
  current: T | null,
): T | null | undefined {
  if (!raw) return null;
  if (raw === current?.toString()) return current;
  try {
    const template = config.template;
    let parsed: DateValue;
    if (template && "timeZone" in template) {
      // An explicit offset and the existing IANA zone are required. Never pick a DST fold.
      if (!/[+-]\d{2}:\d{2}(?::\d{2})?\[[^\]]+\]$/.test(raw)) return undefined;
      parsed = parseZonedDateTime(raw, "reject");
      if (parsed.timeZone !== template.timeZone) return undefined;
    } else {
      parsed = config.hasTime ? parseDateTime(raw) : parseDate(raw);
    }
    return (template ? toCalendar(parsed, template.calendar) : parsed) as T;
  } catch {
    // Keep an incomplete/unsupported edit in its native control; enhancement cannot erase it.
    return undefined;
  }
}

// The native control owns the name until handoff; RAC owns it afterwards. Never keep both.
// Segments render only after this read-back, avoiding Node/browser ICU literal mismatches.
function useProgressiveDate<T extends DateValue>(props: DateBehaviorProps<T>) {
  const [localValue, setLocalValue] = useState<T | null>(props.defaultValue ?? null);
  const controlled = props.value !== undefined;
  const value = controlled ? (props.value ?? null) : localValue;
  const config = nativeDateConfig(props, value);
  const inputRef = useRef<HTMLInputElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [, retry] = useReducer((revision: number) => revision + 1, 0);
  const pending = useRef<string | undefined>(undefined);
  const onChange: NonNullable<RACDateFieldProps<T>["onChange"]> = (next) => {
    if (!controlled) setLocalValue(next as T | null);
    props.onChange?.(next);
  };
  function adopt() {
    const input = inputRef.current;
    if (!input || props.isDisabled || props.isReadOnly) return;
    // Native partial segments can have value=""; only an intentional clear is a null value.
    if (input.validity.badInput) return;
    const next = readNativeDate(input.value, config, value);
    if (next === undefined) return;
    const nextKey = next?.toString() ?? "";
    if (nextKey !== (value?.toString() ?? "")) {
      if (pending.current !== nextKey) {
        pending.current = nextKey;
        onChange(next as Parameters<typeof onChange>[0]);
      }
      // A controlled owner must accept the edit before its native control can be replaced.
      if (controlled) return;
    } else pending.current = undefined;
    if (document.activeElement !== input) setEnhanced(true);
  }
  useEffect(() => {
    if (props.isDisabled || props.isReadOnly) setEnhanced(true);
    else adopt();
  });
  return { enhanced, value, onChange, config, inputRef, adopt, retry };
}

function NativeDateField<T extends DateValue>({
  props,
  entry,
}: {
  props: DateFieldProps<T> | DatePickerProps<T>;
  entry: ReturnType<typeof useProgressiveDate<T>>;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const data = Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith("data-")));
  return (
    <div
      {...data}
      className={cx(fieldClass, props.className)}
      style={typeof props.style === "function" ? undefined : props.style}
      lang={props.lang}
      dir={props.dir}
      data-native-date-kind={entry.config.kind}
      data-invalid={props.isInvalid || undefined}
      data-disabled={props.isDisabled || undefined}
      data-readonly={props.isReadOnly || undefined}
    >
      <label htmlFor={id} className={labelClass}>
        {props.label}
        {props.optionalLabel && !props.isRequired ? (
          <span className="font-normal text-text-muted"> {props.optionalLabel}</span>
        ) : null}
      </label>
      <div id={descriptionId} className="flex flex-col gap-0.5 text-caption text-text-muted">
        {props.description ? (
          <>
            <span>{props.description}</span>{" "}
          </>
        ) : null}
        <span className="inline-flex items-center gap-1.5 font-semibold text-text">
          <ClockIcon className="size-4" />
          {props.timeZoneLabel}
        </span>
      </div>
      <input
        ref={entry.inputRef}
        id={id}
        name={props.name}
        form={props.form}
        type={entry.config.type}
        placeholder={entry.config.type === "text" ? entry.config.template?.toString() : undefined}
        defaultValue={entry.config.value}
        min={entry.config.min}
        max={entry.config.max}
        step={entry.config.type === "datetime-local" ? entry.config.step : undefined}
        disabled={props.isDisabled}
        readOnly={props.isReadOnly}
        required={props.isRequired && props.validationBehavior !== "aria"}
        aria-required={props.isRequired || undefined}
        aria-invalid={props.isInvalid || undefined}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        aria-describedby={cx(
          descriptionId,
          props.isInvalid && Boolean(props.errorMessage) && errorId,
          props["aria-describedby"],
        )}
        autoComplete={props.autoComplete}
        // biome-ignore lint/a11y/noAutofocus: Preserve the existing caller's explicit opt-in through enhancement.
        autoFocus={props.autoFocus}
        dir="ltr"
        className={cx(
          controlClass,
          "tabular-nums focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
        onChange={entry.adopt}
        onFocus={(event) => {
          props.onFocus?.(event);
          props.onFocusChange?.(true);
        }}
        onBlur={(event) => {
          props.onBlur?.(event);
          props.onFocusChange?.(false);
          entry.retry();
        }}
        onKeyDown={props.onKeyDown}
        onKeyUp={props.onKeyUp}
      />
      {props.isInvalid && props.errorMessage ? (
        <p id={errorId} className={errorClass}>
          {props.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function DateDescription({
  description,
  timeZoneLabel,
}: {
  description?: ReactNode;
  timeZoneLabel: string;
}) {
  return (
    <Text slot="description" className="flex flex-col gap-0.5 text-caption text-text-muted">
      {description ? (
        <>
          <span>{description}</span>{" "}
        </>
      ) : null}
      <span className="inline-flex items-center gap-1.5 font-semibold text-text">
        <ClockIcon className="size-4" />
        {timeZoneLabel}
      </span>
    </Text>
  );
}

export type DateFieldProps<T extends DateValue> = Omit<
  RACDateFieldProps<T>,
  "className" | "children"
> &
  DateFieldExtras;

export function DateField<T extends DateValue>({
  label,
  description,
  timeZoneLabel,
  errorMessage,
  optionalLabel,
  className,
  ...props
}: DateFieldProps<T>) {
  const entry = useProgressiveDate(props);
  if (!entry.enhanced) {
    return (
      <NativeDateField
        props={{
          ...props,
          label,
          description,
          timeZoneLabel,
          errorMessage,
          optionalLabel,
          className,
        }}
        entry={entry}
      />
    );
  }
  return (
    <RACDateField
      {...props}
      value={entry.value}
      onChange={entry.onChange}
      className={cx(fieldClass, className)}
    >
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <DateDescription description={description} timeZoneLabel={timeZoneLabel} />
      <div className={cx(groupClass, "pe-3")}>
        <Segments />
      </div>
      <FieldError>{errorMessage}</FieldError>
    </RACDateField>
  );
}

export type DatePickerProps<T extends DateValue> = Omit<
  RACDatePickerProps<T>,
  "className" | "children"
> &
  DateFieldExtras;

const navButtonClass =
  "flex size-control cursor-pointer items-center justify-center rounded-control text-action data-hovered:bg-selected data-pressed:bg-selected";

export function DatePicker<T extends DateValue>({
  label,
  description,
  timeZoneLabel,
  errorMessage,
  optionalLabel,
  className,
  ...props
}: DatePickerProps<T>) {
  const entry = useProgressiveDate(props);
  if (!entry.enhanced) {
    return (
      <NativeDateField
        props={{
          ...props,
          label,
          description,
          timeZoneLabel,
          errorMessage,
          optionalLabel,
          className,
        }}
        entry={entry}
      />
    );
  }
  return (
    <RACDatePicker
      {...props}
      value={entry.value}
      onChange={entry.onChange}
      className={cx(fieldClass, className)}
    >
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <DateDescription description={description} timeZoneLabel={timeZoneLabel} />
      <Group className={groupClass}>
        <Segments />
        <Button className="flex size-control shrink-0 cursor-pointer items-center justify-center rounded-e-control border-s border-divider text-action outline-offset-2 data-hovered:bg-selected data-pressed:bg-selected">
          <CalendarIcon />
        </Button>
      </Group>
      <FieldError>{errorMessage}</FieldError>
      <ListPopover className="max-h-none p-3">
        <Dialog className="outline-none">
          <Calendar className="flex flex-col gap-2">
            <header className="flex items-center justify-between gap-2">
              <Button slot="previous" className={navButtonClass}>
                <ChevronStartIcon directional />
              </Button>
              <Heading className="text-compact font-semibold" />
              <Button slot="next" className={navButtonClass}>
                <ChevronEndIcon directional />
              </Button>
            </header>
            <CalendarGrid className="border-separate border-spacing-0.5 text-center text-compact [&_th]:pb-1 [&_th]:text-caption [&_th]:font-semibold [&_th]:text-text-muted">
              {(date) => (
                <CalendarCell
                  date={date}
                  className={cx(
                    "flex size-control cursor-pointer items-center justify-center rounded-control tabular-nums outline-none",
                    "data-hovered:bg-selected data-outside-month:hidden",
                    "data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus",
                    "data-selected:bg-action data-selected:font-semibold data-selected:text-text-inverse",
                    "data-disabled:cursor-not-allowed data-disabled:text-disabled-text data-unavailable:text-disabled-text data-unavailable:line-through",
                    "forced-colors:data-selected:bg-[Highlight] forced-colors:data-selected:text-[HighlightText]",
                  )}
                />
              )}
            </CalendarGrid>
          </Calendar>
        </Dialog>
      </ListPopover>
    </RACDatePicker>
  );
}
