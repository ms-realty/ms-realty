import * as React from 'react';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Field label rendered above the control. */
  label?: string;
  /** Helper text shown below when there is no error. */
  hint?: string;
  /** Error message; also turns the field red. */
  error?: string;
  /** Leading icon: Lucide name or node (e.g. "map-pin", "search"). */
  iconStart?: string | React.ReactNode;
  /** Trailing icon: Lucide name or node. */
  iconEnd?: string | React.ReactNode;
  /** @default 'md' */
  size?: InputSize;
}

/** Single-line text field with label, icons, hint & error states. */
export function Input(props: InputProps): JSX.Element;
