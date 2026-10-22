"use client";

import { ToggleButton } from "react-aria-components/ToggleButton";
import { CheckIcon, SaveIcon } from "./icons";

interface ToggleProps {
  title: string;
  label: string;
  selected?: boolean;
  onChange?: (selected: boolean) => void;
}

/** Only the two controls hydrate; the listing's facts and media remain server-rendered. */
export function CardSaveControl({ title, label, selected, onChange }: ToggleProps) {
  return (
    <ToggleButton
      isSelected={selected}
      onChange={onChange}
      aria-label={`${label}: ${title}`}
      className="absolute end-3 top-3 z-10 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface text-text shadow-raised data-hovered:text-action data-selected:text-action forced-colors:border forced-colors:border-[ButtonText]"
    >
      {({ isSelected }) => <SaveIcon className={isSelected ? "fill-current" : undefined} />}
    </ToggleButton>
  );
}

export function CardCompareControl({ title, label, selected, onChange }: ToggleProps) {
  return (
    <ToggleButton
      isSelected={selected}
      onChange={onChange}
      aria-label={`${label}: ${title}`}
      className="group/compare inline-flex min-h-control cursor-pointer items-center gap-2 rounded-control px-2 text-caption font-medium text-text data-hovered:bg-subtle data-selected:text-action"
    >
      {({ isSelected }) => (
        <>
          <span
            aria-hidden="true"
            className="inline-flex size-[1.125rem] items-center justify-center rounded-control border-[1.5px] border-border bg-surface text-text-inverse group-data-selected/compare:border-action group-data-selected/compare:bg-action"
          >
            {isSelected ? <CheckIcon className="size-3.5" /> : null}
          </span>
          {label}
        </>
      )}
    </ToggleButton>
  );
}
