import * as React from 'react';

export type TagVariant = 'neutral' | 'outline' | 'brand';
export type TagSize = 'sm' | 'md';

export interface TagProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onClick'> {
  /** @default 'neutral' */
  variant?: TagVariant;
  /** @default 'md' */
  size?: TagSize;
  /** Leading Lucide icon name (e.g. 'bed', 'waves', 'trees'). */
  icon?: string;
  /** When set, renders a trailing remove (×) button — for active filter chips. */
  onRemove?: (e: React.MouseEvent) => void;
  /** Makes the whole tag clickable (filter toggle). */
  onClick?: (e: React.MouseEvent) => void;
}

/**
 * Neutral feature / filter chip — amenities ("Sea view", "Pool"), specs ("3 bed"),
 * and removable active filters. Distinct from Badge, which signals listing status.
 */
export function Tag(props: TagProps): JSX.Element;
