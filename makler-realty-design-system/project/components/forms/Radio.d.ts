import * as React from 'react';

export interface RadioProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Text label to the right of the dot. */
  label?: React.ReactNode;
}

/** Single-choice control. Group by sharing the same `name`. */
export function Radio(props: RadioProps): JSX.Element;
