import * as React from 'react';

export type BadgeVariant =
  | 'for-sale' | 'for-rent' | 'new' | 'reduced' | 'featured' | 'sold' | 'neutral';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /**
   * Listing status. Tonal by default; use `solid` when overlaying photography.
   * @default 'neutral'
   */
  variant?: BadgeVariant;
  /** @default 'sm' */
  size?: BadgeSize;
  /** Filled treatment for use over images. @default false */
  solid?: boolean;
  /** Show a leading status dot. @default false */
  dot?: boolean;
  /** Optional leading Lucide icon name. */
  icon?: string;
}

/**
 * Small uppercase status pill for listing state (For sale, For rent, New, Reduced…).
 * @startingPoint section="Display" subtitle="Listing status pills" viewport="700x140"
 */
export function Badge(props: BadgeProps): JSX.Element;
