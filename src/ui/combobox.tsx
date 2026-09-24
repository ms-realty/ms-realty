"use client";

import { type Key, type ReactNode, useState } from "react";
import {
  Button,
  Input,
  ListBox,
  ListBoxItem,
  ComboBox as RACComboBox,
  type ComboBoxProps as RACComboBoxProps,
  Text,
} from "react-aria-components";
import { cx } from "./cx";
import { controlClass, FieldError, fieldClass, Label, ListPopover, optionClass } from "./field";
import { CheckIcon, ChevronDownIcon, WarningIcon } from "./icons";

/** A place option. Region and country are always shown so equal names stay distinguishable. */
export type PlaceOption = { id: string; name: string; region: string; country: string };

export type ComboBoxProps = Omit<
  RACComboBoxProps<PlaceOption>,
  "children" | "className" | "items" | "allowsCustomValue"
> & {
  label: ReactNode;
  options: PlaceOption[];
  description?: ReactNode;
  errorMessage?: ReactNode;
  optionalLabel?: string;
  placeholder?: string;
  /**
   * Shown when the typed text matches more than one option exactly and none is chosen,
   * e.g. "Several places have this name. Choose the one in the right region." (A04)
   */
  ambiguousHint: string;
  className?: string;
};

function sameName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;
}

/**
 * Place picker. It never selects silently: a typed name only becomes a value when the person
 * picks an option (custom values are not allowed), and equal names are called out.
 */
export function ComboBox({
  label,
  options,
  description,
  errorMessage,
  optionalLabel,
  placeholder,
  ambiguousHint,
  className,
  onInputChange,
  onSelectionChange,
  ...props
}: ComboBoxProps) {
  const [inputValue, setInputValue] = useState("");
  const [uncontrolledSelected, setSelected] = useState<Key | null>(
    props.defaultSelectedKey ?? null,
  );
  // A controlled selectedKey always wins, so the confirmation line never goes stale.
  const selected = props.selectedKey !== undefined ? props.selectedKey : uncontrolledSelected;
  const selectedOption = options.find((option) => option.id === selected);
  const namesakes = options.filter((option) => sameName(option.name, inputValue.trim()));
  const isAmbiguous = namesakes.length > 1 && !selectedOption;

  return (
    <RACComboBox
      {...props}
      items={options}
      allowsCustomValue={false}
      onInputChange={(value) => {
        setInputValue(value);
        onInputChange?.(value);
      }}
      onSelectionChange={(key) => {
        setSelected(key);
        onSelectionChange?.(key);
      }}
      className={cx(fieldClass, className)}
    >
      <Label optionalLabel={optionalLabel} isRequired={props.isRequired}>
        {label}
      </Label>
      <Text slot="description" className="flex flex-col gap-1 text-caption text-text-muted">
        {description ? <span>{description}</span> : null}
        {selectedOption ? (
          <span className="font-semibold text-text">
            {selectedOption.name} · {selectedOption.region}, {selectedOption.country}
          </span>
        ) : null}
        <span aria-live="polite" className="empty:hidden">
          {isAmbiguous ? (
            <span className="flex items-start gap-1.5 text-compact text-warning">
              <WarningIcon className="mt-0.5" />
              <span>{ambiguousHint}</span>
            </span>
          ) : null}
        </span>
      </Text>
      <FieldError>{errorMessage}</FieldError>
      <div className="relative">
        <Input placeholder={placeholder} className={cx(controlClass, "py-2 pe-12")} />
        <Button className="absolute inset-y-0 end-0 flex w-control cursor-pointer items-center justify-center rounded-e-control text-text-muted data-hovered:text-text">
          <ChevronDownIcon />
        </Button>
      </div>
      <ListPopover>
        <ListBox items={options} className="py-1 outline-none">
          {(option) => (
            <ListBoxItem id={option.id} textValue={option.name} className={optionClass}>
              {({ isSelected }) => (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <Text slot="label">{option.name}</Text>
                    <Text slot="description" className="text-caption text-text-muted">
                      {option.region}, {option.country}
                    </Text>
                  </span>
                  {isSelected ? <CheckIcon className="text-action" /> : null}
                </>
              )}
            </ListBoxItem>
          )}
        </ListBox>
      </ListPopover>
    </RACComboBox>
  );
}
