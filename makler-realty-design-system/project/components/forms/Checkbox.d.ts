import * as React from 'react';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Text label to the right of the box. */
  label?: React.ReactNode;
  /** Mixed/partial state (e.g. "select all"). @default false */
  indeterminate?: boolean;
}

/** Checkbox for multi-select filters (amenities, features) and consent. */
export function Checkbox(props: CheckboxProps): JSX.Element;
