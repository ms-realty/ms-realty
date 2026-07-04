import * as React from 'react';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  /** Shown as a disabled first option and greyed until a choice is made. */
  placeholder?: string;
  /** Leading icon: Lucide name or node. */
  iconStart?: string | React.ReactNode;
  /** Options as strings or {value,label}. Omit to pass <option> children. */
  options?: Array<string | SelectOption>;
  /** @default 'md' */
  size?: SelectSize;
}

/** Native <select> styled to match MS fields, with a chevron and optional lead icon. */
export function Select(props: SelectProps): JSX.Element;
