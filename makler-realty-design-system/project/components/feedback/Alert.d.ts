import * as React from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  /** @default 'info' */
  variant?: AlertVariant;
  /** Bold first line. */
  title?: React.ReactNode;
  /** Lucide icon name, a node, or `false` to hide the default variant icon. */
  icon?: string | React.ReactNode | false;
  /** Show a dismiss ✕ and call this when pressed. */
  onDismiss?: () => void;
  /** Inline text links/buttons rendered under the message. */
  actions?: React.ReactNode;
  /** Message body. */
  children?: React.ReactNode;
}

/**
 * Inline notice for form results and page-level messages (enquiry sent,
 * saved-search price drop, validation failure). Tonal, hairline-bordered.
 * `info` is charcoal (monochrome brand); `danger` uses the cooler error red.
 * @startingPoint section="Feedback" subtitle="Inline notices" viewport="640x220"
 */
export function Alert(props: AlertProps): JSX.Element;
