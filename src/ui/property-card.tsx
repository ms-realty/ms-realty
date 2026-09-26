"use client";

import { type ReactNode, useId } from "react";
import { ToggleButton } from "react-aria-components";
import { cx } from "./cx";
import { AreaIcon, BedIcon, BuildingIcon, CheckIcon, NoPhotoIcon, SaveIcon } from "./icons";
import { Link } from "./link";
import { VisuallyHidden } from "./visually-hidden";

/** A key fact on the card. `unknown` renders muted so an unconfirmed value never reads as known. */
export type CardFact =
  | string
  | { label: string; icon?: "bedrooms" | "area" | "type"; unknown?: boolean };

const factIcons = { bedrooms: BedIcon, area: AreaIcon, type: BuildingIcon };

export type PropertyCardProps = {
  href: string;
  /** Short factual identity, e.g. "Two-bedroom apartment". */
  title: string;
  /** A PriceDisplay. */
  price: ReactNode;
  /** e.g. "Sandanski, Blagoevgrad". */
  locality: string;
  /** Area with its basis, bedrooms, type: already formatted, at most a few. */
  facts: CardFact[];
  /** A StatusBadge of the availability family, shown over the photo. */
  availability?: ReactNode;
  /** A few genuinely distinguishing attributes. */
  highlights?: string[];
  /** An image element with a meaningful alt, or nothing when there is no photo. */
  image?: ReactNode;
  /** Reference and freshness, e.g. "MS-00242 · updated 3 days ago". */
  meta?: string;
  noPhotoLabel: string;
  saveLabel: string;
  compareLabel: string;
  isSaved?: boolean;
  onSavedChange?: (isSaved: boolean) => void;
  isCompared?: boolean;
  onComparedChange?: (isCompared: boolean) => void;
  headingLevel?: 2 | 3 | 4;
};

/**
 * Property result card (L02). Reading order: price, identity, locality, key facts,
 * highlights, reference. The title is the one main link (stretched over the card);
 * Save and Compare are independent controls outside it, so nothing interactive is nested.
 */
export function PropertyCard({
  href,
  title,
  price,
  locality,
  facts,
  availability,
  highlights,
  image,
  meta,
  noPhotoLabel,
  saveLabel,
  compareLabel,
  isSaved,
  onSavedChange,
  isCompared,
  onComparedChange,
  headingLevel = 3,
}: PropertyCardProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as const;
  return (
    <article
      aria-labelledby={titleId}
      data-compared={isCompared || undefined}
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-card border border-divider bg-surface shadow-raised",
        "transition-[box-shadow,border-color] duration-(--duration-base) ease-(--ease-out)",
        "has-[a:hover]:shadow-hover",
        "data-compared:border-action data-compared:ring-1 data-compared:ring-action",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-subtle [&_img]:size-full [&_img]:object-cover [&_img]:transition-transform [&_img]:duration-(--duration-slow) [&_img]:ease-(--ease-out) group-has-[a:hover]:[&_img]:scale-[1.02]">
        {image ?? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-caption text-text-muted">
            <NoPhotoIcon className="size-8" />
            <span>{noPhotoLabel}</span>
          </div>
        )}
        {availability ? (
          <div className="absolute start-3 top-3 rounded-md bg-surface/95 shadow-raised">
            {availability}
          </div>
        ) : null}
      </div>
      <ToggleButton
        isSelected={isSaved}
        onChange={onSavedChange}
        className={cx(
          "absolute end-3 top-3 z-10 inline-flex size-11 cursor-pointer items-center justify-center rounded-full bg-surface text-text shadow-raised",
          "data-hovered:text-action data-selected:text-action",
          "forced-colors:border forced-colors:border-[ButtonText]",
        )}
      >
        <SaveIcon className={isSaved ? "fill-current" : undefined} />
        <VisuallyHidden>
          {saveLabel}: {title}
        </VisuallyHidden>
      </ToggleButton>
      <div className="flex flex-1 flex-col gap-1.5 px-5 pt-4 pb-4">
        {price}
        <Heading id={titleId} className="text-compact font-semibold text-text">
          <Link
            href={href}
            variant="plain"
            className="text-text outline-none after:absolute after:inset-0 after:content-[''] data-hovered:underline"
          >
            {title}
          </Link>
        </Heading>
        <p className="text-caption text-text-muted">{locality}</p>
        {facts.length > 0 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 text-caption">
            {facts.map((fact) => {
              const item = typeof fact === "string" ? { label: fact } : fact;
              const Icon = "icon" in item && item.icon ? factIcons[item.icon] : null;
              const unknown = "unknown" in item && item.unknown;
              return (
                <li
                  key={item.label}
                  className={cx(
                    "inline-flex items-center gap-1.5 tabular-nums",
                    unknown ? "text-text-muted" : "text-text",
                  )}
                >
                  {Icon ? <Icon className="size-4 text-text-muted" /> : null}
                  {item.label}
                </li>
              );
            })}
          </ul>
        ) : null}
        {highlights && highlights.length > 0 ? (
          <ul className="flex flex-wrap gap-2 pt-1">
            {highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-md bg-subtle px-2 py-0.5 text-caption text-text"
              >
                {highlight}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="relative flex items-center gap-2 border-t border-divider ps-5 pe-2 py-1">
        <p className="me-auto min-w-0 text-caption text-text-muted">{meta}</p>
        <ToggleButton
          isSelected={isCompared}
          onChange={onComparedChange}
          className={cx(
            "group/compare inline-flex min-h-control cursor-pointer items-center gap-2 rounded-control px-2 text-caption font-medium text-text",
            "data-hovered:bg-subtle data-selected:text-action",
          )}
        >
          <span
            aria-hidden="true"
            className="inline-flex size-[1.125rem] items-center justify-center rounded-[4px] border-[1.5px] border-border bg-surface text-text-inverse group-data-selected/compare:border-action group-data-selected/compare:bg-action"
          >
            {isCompared ? <CheckIcon className="size-3.5" /> : null}
          </span>
          {compareLabel}
          <VisuallyHidden>: {title}</VisuallyHidden>
        </ToggleButton>
      </div>
    </article>
  );
}
