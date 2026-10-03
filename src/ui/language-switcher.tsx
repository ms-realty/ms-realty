import { cx } from "./cx";
import { CheckIcon, ChevronDownIcon, LanguageIcon } from "./icons";

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
  /** Show the endonym at every width instead of the code on compact screens. */
  wide?: boolean;
  /** Which edge the list aligns to. */
  align?: "start" | "end";
  className?: string;
};

/**
 * Language switch (UI04) as a native disclosure of plain links: it works without JavaScript,
 * every language is a real URL, and nothing redirects on its own. `data-dismissible` lets the
 * shell's DisclosureBehavior close it with Escape, an outside click or a navigation.
 */
export function LanguageSwitcher({
  label,
  current,
  options,
  wide = false,
  align = "end",
  className,
}: LanguageSwitcherProps) {
  const currentOption = options.find((option) => option.locale === current);
  return (
    <details data-dismissible="" className={cx("group/lang relative", className)}>
      <summary
        className={cx(
          "inline-flex min-h-control items-center gap-1.5 rounded-control px-2.5 text-compact font-semibold text-text",
          "transition-colors duration-(--duration-fast) hover:bg-subtle group-open/lang:bg-selected",
        )}
      >
        <LanguageIcon />
        <span className="sr-only">{label}: </span>
        {/* Compact screens show the code; the endonym stays the accessible text. */}
        <span lang={current} className={cx(!wide && "max-sm:sr-only")}>
          {currentOption?.endonym ?? current}
        </span>
        {wide ? null : (
          <span aria-hidden="true" className="uppercase sm:hidden">
            {current}
          </span>
        )}
        <ChevronDownIcon className="size-4 text-text-muted transition-transform duration-(--duration-fast) group-open/lang:rotate-180" />
      </summary>
      <ul
        className={cx(
          "absolute top-full z-(--z-popover) mt-1 min-w-48 rounded-panel border border-divider bg-surface py-1 shadow-overlay",
          align === "end" ? "end-0" : "start-0",
        )}
      >
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
                  "flex min-h-control items-center justify-between gap-4 px-4 text-compact text-text no-underline outline-offset-[-3px] hover:bg-subtle",
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
    </details>
  );
}
