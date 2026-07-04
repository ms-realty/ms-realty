import * as React from 'react';
import { BadgeVariant } from './Badge';

export interface PropertyBadge {
  variant: BadgeVariant;
  label: string;
}

export interface PropertyCardProps extends React.HTMLAttributes<HTMLElement> {
  href?: string;
  /** Real photo URL. Omit to use the coastal placeholder tone. */
  image?: string;
  /**
   * Placeholder photo tone when no `image` is set.
   * @default 'sea'
   */
  tone?: 'sea' | 'sky' | 'sand' | 'sunset' | 'pine' | 'night';
  /** Status pills overlaid on the photo, e.g. [{variant:'for-sale',label:'For sale'}]. */
  badges?: PropertyBadge[];
  /** Formatted price, e.g. "€245,000" or "€900". */
  price?: string;
  /** Trailing price unit, e.g. "/mo" for rentals. */
  per?: string;
  title?: string;
  /** Human location line, e.g. "St Vlas, Burgas". */
  location?: string;
  beds?: number;
  baths?: number;
  /** Internal floor area in m². */
  area?: number;
  /** Photo count shown as a corner chip. */
  photos?: number;
  /** Reference code, e.g. "MK-2043". */
  reference?: string;
  saved?: boolean;
  onSave?: (saved: boolean) => void;
  /** @default 'vertical' — use 'horizontal' for search-result rows. */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * The hero listing card: photo with status badges + save heart + photo count,
 * then price, title, location and a bed/bath/m² spec row. Vertical in grids,
 * horizontal in search-result lists.
 * @startingPoint section="Display" subtitle="Property listing card" viewport="760x420"
 */
export function PropertyCard(props: PropertyCardProps): JSX.Element;
