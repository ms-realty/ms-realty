import * as React from 'react';

export type SkeletonVariant = 'text' | 'rect' | 'circle' | 'photo';

export interface SkeletonProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default 'text' */
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  /** For variant="text": number of lines (last line renders shorter). @default 1 */
  lines?: number;
}

/**
 * Loading placeholder with a soft shimmer sweep (disabled under
 * prefers-reduced-motion). Compose to mirror the loaded layout —
 * photo + text lines approximates a loading PropertyCard.
 * @startingPoint section="Feedback" subtitle="Loading shimmer" viewport="640x220"
 */
export function Skeleton(props: SkeletonProps): JSX.Element;
