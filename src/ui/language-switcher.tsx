"use client";

import { Button, Dialog, DialogTrigger, Popover } from "react-aria-components";
import { cx } from "./cx";
import { CheckIcon, ChevronDownIcon, LanguageIcon } from "./icons";
import { VisuallyHidden } from "./visually-hidden";

export type LanguageOption = {
  locale: string;
  /** The language's own name, e.g. "Български", "עברית". Never a flag. */
  endonym: string;
  href: string;
};

export type LanguageSwitcherProps = {
  /** e.g. "Language". Read before the current language. */
  label: string;
  current: string;
  options: LanguageOption[];
};

export function LanguageSwitcher({ label, current, options }: LanguageSwitcherProps) {
  const currentOption = options.find((option) => option.locale === current);
  return (
    <DialogTrigger>
      <Button className="inline-flex min-h-control cursor-pointer items-center gap-1.5 rounded-control border border-transparent px-2.5 sm:gap-2 sm:px-3 text-compact font-semibold text-text data-hovered:bg-subtle data-pressed:bg-selected">
        <LanguageIcon />
        <VisuallyHidden>{label}: </VisuallyHidden>
        {/* Narrow screens show the code; the endonym stays the accessible text. */}
        <span lang={current} className="max-sm:sr-only">
          {currentOption?.endonym ?? current}
        </span>
        <span aria-hidden="true" className="uppercase sm:hidden">
          {current}
        </span>
        <ChevronDownIcon className="size-4 text-text-muted" />
      </Button>
      <Popover
        offset={4}
        className="z-(--z-popover) min-w-48 rounded-card border border-divider bg-surface py-1.5 shadow-overlay"
      >
        <Dialog aria-label={label} className="outline-none">
          <ul>
            {options.map((option) => {
              const isCurrent = option.locale === current;
              return (
                <li key={option.locale}>
                  <a
                    href={option.href}
                    lang={option.locale}
                    hrefLang={option.locale}
                    aria-current={isCurrent ? "true" : undefined}
                    className={cx(
                      "flex min-h-control items-center justify-between gap-4 px-4 text-compact text-text no-underline outline-offset-[-2px] hover:bg-selected",
                      isCurrent && "font-semibold",
                    )}
                  >
                    {option.endonym}
                    {isCurrent ? <CheckIcon className="text-action" /> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
