"use client";

import type { ReactNode } from "react";
import {
  Button,
  ListBox,
  ListBoxItem,
  Select as RACSelect,
  type SelectProps as RACSelectProps,
  SelectValue,
  Text,
} from "react-aria-components";
import { cx } from "./cx";
import {
  controlClass,
  Description,
  FieldError,
  fieldClass,
  Label,
  ListPopover,
  optionClass,
} from "./field";
import { CheckIcon, ChevronDownIcon } from "./icons";

export type SelectOption = {
  id: string;
  label: string;
  description?: string;
  /** Language of the label when it differs from the page, e.g. a language's endonym. */
  lang?: string;
};

export type SelectProps = Omit<RACSelectProps<SelectOption>, "children" | "className"> & {
  label: ReactNode;
  options: SelectOption[];
  description?: ReactNode;
  errorMessage?: ReactNode;
  optionalLabel?: string;
  className?: string;
};

export function Select({
  label,
  options,
  description,
  errorMessage,
  optionalLabel,
  className,
  ...props
}: SelectProps) {
  return (
    <RACSelect {...props} className={cx(fieldClass, className)}>
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Description>{description}</Description>
      <FieldError>{errorMessage}</FieldError>
      <Button
        className={cx(
          controlClass,
          "flex cursor-pointer items-center justify-between gap-2 py-2 text-start",
        )}
      >
        <SelectValue className="truncate data-placeholder:text-text-muted" />
        <ChevronDownIcon className="text-text-muted" />
      </Button>
      <ListPopover>
        <ListBox items={options} className="py-1 outline-none">
          {(option) => (
            <ListBoxItem id={option.id} textValue={option.label} className={optionClass}>
              {({ isSelected }) => (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Text slot="label" lang={option.lang}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text slot="description" className="text-caption text-text-muted">
                        {option.description}
                      </Text>
                    ) : null}
                  </span>
                  {isSelected ? <CheckIcon className="text-action" /> : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </ListPopover>
    </RACSelect>
  );
}
