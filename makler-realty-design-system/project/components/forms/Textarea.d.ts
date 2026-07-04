import * as React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  /** Muted helper under the field. */
  hint?: React.ReactNode;
  /** Error message — replaces hint, turns the border danger-red. */
  error?: React.ReactNode;
  /** @default 4 */
  rows?: number;
  /** Show a mono character counter (requires maxLength). @default false */
  showCount?: boolean;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Multi-line field for enquiry messages and property descriptions.
 * Same label/hint/error anatomy as Input; vertical resize only.
 * @startingPoint section="Forms" subtitle="Message field" viewport="640x220"
 */
export function Textarea(props: TextareaProps): JSX.Element;
