import * as React from 'react';

export interface RatingProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Score, 0–max. Fractional values render partial stars. */
  value?: number;
  /** @default 5 */
  max?: number;
  /** Star pixel size. @default 16 */
  size?: number;
  /** Show the numeric value beside the stars. @default false */
  showValue?: boolean;
  /** Review count, rendered as "(128)". */
  count?: number;
}

/**
 * Star rating in Sun gold (`--rating`), with fractional fill. Used on resort
 * pages and agent cards for review scores.
 */
export function Rating(props: RatingProps): JSX.Element;
