"use client";

import { type ReactNode, useSyncExternalStore } from "react";
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
  "flex min-h-control w-full items-center rounded-control border border-border bg-surface ps-3 text-compact text-text",
  "data-hovered:border-text data-focus-within:outline-2 data-focus-within:outline-offset-2 data-focus-within:outline-focus",
  "group-data-invalid:border-2 group-data-invalid:border-error",
  "group-data-readonly:border-dashed group-data-readonly:bg-subtle",
  "group-data-disabled:border-disabled-text group-data-disabled:bg-disabled group-data-disabled:text-disabled-text",
);

const noSubscription = () => () => {};

// Date segment literals come from the runtime's ICU data, which differs between Node and
// browsers (e.g. narrow vs regular no-break spaces), so segments render after hydration.
function useIsHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function Segments(props: Omit<DateInputProps, "children">) {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return <span aria-hidden="true" className="flex-1 py-2" />;
  return (
    <DateInput {...props} className="flex flex-1 flex-wrap items-center py-2 tabular-nums">
      {(segment) => (
        <DateSegment
          segment={segment}
          className={cx(
            // Editable segments keep a 28px target; literals ("/", ".") stay tight.
            "inline-flex min-h-8 min-w-7 items-center justify-center rounded-[3px] px-0.5 outline-none",
            "data-placeholder:text-text-muted data-[type=literal]:min-w-0 data-[type=literal]:px-0",
            "data-focused:bg-action data-focused:text-text-inverse",
            "forced-colors:data-focused:bg-[Highlight] forced-colors:data-focused:text-[HighlightText]",
          )}
        />
      )}
    </DateInput>
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
      {description ? <span>{description}</span> : null}
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
  return (
    <RACDateField {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <DateDescription description={description} timeZoneLabel={timeZoneLabel} />
      <FieldError>{errorMessage}</FieldError>
      <div className={cx(groupClass, "pe-3")}>
        <Segments />
      </div>
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
  return (
    <RACDatePicker {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <DateDescription description={description} timeZoneLabel={timeZoneLabel} />
      <FieldError>{errorMessage}</FieldError>
      <Group className={groupClass}>
        <Segments />
        <Button className="flex size-control shrink-0 cursor-pointer items-center justify-center rounded-e-control border-s border-divider text-action outline-offset-[-2px] data-hovered:bg-selected data-pressed:bg-selected">
          <CalendarIcon />
        </Button>
      </Group>
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
                    "data-focus-visible:outline-2 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus",
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
