"use client";

import type { ReactNode } from "react";
import { Button as RACButton } from "react-aria-components";
import { cx } from "./cx";
import { AssistIcon, CheckIcon, CloseIcon, PendingIcon, PlusIcon } from "./icons";

/**
 * Criteria and filter chips (spec §16.3 Filters/chips, F01/F02).
 * - criterion: an applied criterion, removable.
 * - assist: interpreted by the assistant from the visitor's words; removable and never applied
 *   silently — the search runs only after the visitor sees it.
 * - question: an uncertain criterion kept as a question; pressing it asks for a decision.
 * - selected / add: a toggle and an "add criterion" entry.
 */
export type ChipKind = "criterion" | "assist" | "question" | "selected" | "add";

const kindClass: Record<ChipKind, string> = {
  criterion: "border-border bg-surface text-text",
  assist: "border-assist-line bg-assist-soft text-assist",
  question: "border-dashed border-warning bg-surface text-warning",
  selected: "border-action bg-selected text-action",
  add: "border-divider bg-surface text-text-muted",
};

const base = cx(
  "inline-flex min-h-control items-center gap-1.5 rounded-full border ps-4 text-caption font-medium",
  "forced-colors:border-[CanvasText]",
);

export function ChipList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-2">
      {children}
    </ul>
  );
}

export type ChipProps = {
  kind: ChipKind;
  label: string;
  /** Removable chips (criterion, assist): the accessible name of the remove button is
   * `${removeLabel}: ${label}`. */
  onRemove?: () => void;
  removeLabel?: string;
  /** Question, add and selected chips are buttons. */
  onPress?: () => void;
  isSelected?: boolean;
};

export function Chip({ kind, label, onRemove, removeLabel, onPress, isSelected }: ChipProps) {
  const Icon =
    kind === "assist"
      ? AssistIcon
      : kind === "question"
        ? PendingIcon
        : kind === "add"
          ? PlusIcon
          : kind === "selected"
            ? CheckIcon
            : null;
  const icon = Icon ? <Icon className="size-4" /> : null;

  if (onPress) {
    return (
      <li className="flex">
        <RACButton
          onPress={onPress}
          aria-pressed={kind === "selected" ? Boolean(isSelected) : undefined}
          className={cx(
            base,
            kindClass[kind],
            "cursor-pointer pe-4 data-hovered:bg-subtle data-pressed:bg-divider",
          )}
        >
          {icon}
          {label}
        </RACButton>
      </li>
    );
  }

  return (
    <li className={cx(base, kindClass[kind], onRemove ? "pe-0" : "pe-4")} data-kind={kind}>
      {icon}
      <span>{label}</span>
      {onRemove ? (
        <RACButton
          onPress={onRemove}
          aria-label={`${removeLabel ?? "Remove"}: ${label}`}
          className="-my-px inline-flex size-control cursor-pointer items-center justify-center rounded-full data-hovered:bg-black/5 data-pressed:bg-black/10"
        >
          <CloseIcon className="size-4" />
        </RACButton>
      ) : null}
    </li>
  );
}
