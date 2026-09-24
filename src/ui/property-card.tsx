"use client";

import { type ReactNode, useId } from "react";
import { ToggleButton } from "react-aria-components";
import { cx } from "./cx";
import { CompareIcon, NoPhotoIcon, SaveIcon } from "./icons";
import { Link } from "./link";
import { VisuallyHidden } from "./visually-hidden";

export type PropertyCardProps = {
  href: string;
  /** Short factual identity, e.g. "Two-bedroom apartment". */
  title: string;
  /** A PriceDisplay. */
  price: ReactNode;
  /** e.g. "Sandanski, Blagoevgrad". */
  locality: string;
  /** Area with its basis, bedrooms, type: already formatted, at most a few. */
  facts: string[];
  /** A StatusBadge of the availability family. */
  availability?: ReactNode;
  /** A few genuinely distinguishing attributes. */
  highlights?: string[];
  /** An image element with a meaningful alt, or nothing when there is no photo. */
  image?: ReactNode;
  noPhotoLabel: string;
  saveLabel: string;
  compareLabel: string;
  isSaved?: boolean;
  onSavedChange?: (isSaved: boolean) => void;
  isCompared?: boolean;
  onComparedChange?: (isCompared: boolean) => void;
  headingLevel?: 2 | 3 | 4;
};

const toggleClass = cx(
  "inline-flex min-h-control min-w-control cursor-pointer items-center justify-center gap-2 rounded-control border border-transparent px-3",
  "text-compact font-semibold text-action",
  "data-hovered:bg-subtle data-pressed:bg-selected",
  "data-selected:border-action data-selected:bg-selected",
  "forced-colors:data-selected:border-[Highlight]",
);

/**
 * Property result card (L02). Reading order: price, identity, locality, key facts,
 * availability, highlights. The title is the one main link (stretched over the card);
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
      className={cx(
        "relative flex flex-col overflow-hidden rounded-card border border-divider bg-surface",
        "has-[a:hover]:border-border",
        "has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-subtle [&_img]:size-full [&_img]:object-cover">
        {image ?? (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-caption text-text-muted">
            <NoPhotoIcon className="size-8" />
            <span>{noPhotoLabel}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {price}
        <Heading id={titleId} className="text-subheading font-semibold text-text">
          <Link
            href={href}
            variant="plain"
            className="text-text outline-none after:absolute after:inset-0 after:content-[''] data-hovered:underline"
          >
            {title}
          </Link>
        </Heading>
        <p className="text-compact text-text-muted">{locality}</p>
        {facts.length > 0 ? (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-compact text-text">
            {facts.map((fact) => (
              <li key={fact} className="tabular-nums">
                {fact}
              </li>
            ))}
          </ul>
        ) : null}
        {availability}
        {highlights && highlights.length > 0 ? (
          <ul className="flex flex-wrap gap-2 pt-1">
            {highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-control bg-subtle px-2 py-0.5 text-caption text-text"
              >
                {highlight}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="relative flex gap-2 border-t border-divider px-2 py-1">
        <ToggleButton isSelected={isSaved} onChange={onSavedChange} className={toggleClass}>
          <SaveIcon className={isSaved ? "fill-current" : undefined} />
          {saveLabel}
          <VisuallyHidden>: {title}</VisuallyHidden>
        </ToggleButton>
        <ToggleButton isSelected={isCompared} onChange={onComparedChange} className={toggleClass}>
          <CompareIcon className={isCompared ? "fill-selected" : undefined} />
          {compareLabel}
          <VisuallyHidden>: {title}</VisuallyHidden>
        </ToggleButton>
      </div>
    </article>
  );
}
