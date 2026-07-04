import * as React from 'react';

export type IconButtonVariant = 'ghost' | 'solid' | 'outline' | 'glass';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Lucide icon name (string) or a React node. */
  icon: string | React.ReactNode;
  /** Required accessible label (e.g. "Save to favourites"). */
  label: string;
  /**
   * - `ghost`   — transparent (toolbars)
   * - `solid`   — filled Sea
   * - `outline` — white with border
   * - `glass`   — translucent, for use over photography
   * @default 'ghost'
   */
  variant?: IconButtonVariant;
  /** @default 'md' */
  size?: IconButtonSize;
  /** Fully round instead of rounded-square. @default false */
  round?: boolean;
  /** Toggled/pressed state (e.g. favourited). @default false */
  active?: boolean;
}

/** Square/round button carrying a single icon (save, share, close, nav). */
export function IconButton(props: IconButtonProps): JSX.Element;
