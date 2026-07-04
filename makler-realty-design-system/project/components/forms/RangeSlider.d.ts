import * as React from 'react';

export interface RangeSliderProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  /** @default 0 */
  min?: number;
  /** @default 100 */
  max?: number;
  /** @default 1 */
  step?: number;
  /** Controlled [from, to]. */
  value?: [number, number];
  /** Uncontrolled initial [from, to]. @default [min, max] */
  defaultValue?: [number, number];
  onChange?: (value: [number, number]) => void;
  label?: React.ReactNode;
  /** Formats the printed end values — pass a € formatter. @default String */
  format?: (v: number) => string;
  /** Minimum distance the thumbs keep. @default step */
  minGap?: number;
  disabled?: boolean;
}

/**
 * Dual-thumb range for the price / area filters in the search sidebar.
 * Charcoal fill, white ink-ringed thumbs, keyboard accessible (two native
 * range inputs).
 * @startingPoint section="Forms" subtitle="Price range" viewport="640x160"
 */
export function RangeSlider(props: RangeSliderProps): JSX.Element;
