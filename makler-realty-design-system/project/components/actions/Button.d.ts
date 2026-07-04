import * as React from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Emphasis:
   * - `primary`   — solid Sea (brand) — default strong action
   * - `accent`    — solid Clay (terracotta) — marketing CTA ("Book a viewing")
   * - `secondary` — white with border — neutral action
   * - `ghost`     — transparent — low emphasis
   * - `subtle`    — tonal Sea — quiet brand action
   * @default 'primary'
   */
  variant?: ButtonVariant;
  /** @default 'md' */
  size?: ButtonSize;
  /** Leading icon: Lucide name (string) or a React node. */
  iconStart?: string | React.ReactNode;
  /** Trailing icon: Lucide name (string) or a React node. */
  iconEnd?: string | React.ReactNode;
  /** Stretch to container width. @default false */
  fullWidth?: boolean;
  /** Show a spinner and block interaction. @default false */
  loading?: boolean;
  /** Render as another element/component (e.g. 'a' for links). @default 'button' */
  as?: React.ElementType;
}

/**
 * Primary interactive control across MS surfaces.
 * @startingPoint section="Actions" subtitle="Buttons in every variant & size" viewport="700x220"
 */
export function Button(props: ButtonProps): JSX.Element;
