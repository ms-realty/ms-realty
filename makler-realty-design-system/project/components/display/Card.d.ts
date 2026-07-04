import * as React from 'react';

export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  /** Render as another element (e.g. 'a', 'section'). @default 'div' */
  as?: React.ElementType;
  /** Inner padding. @default 'md' */
  padding?: CardPadding;
  /** Borderless, resting on a soft shadow instead of a hairline. @default false */
  elevated?: boolean;
  /** Tinted (Stone-100) well with no border. @default false */
  sunken?: boolean;
  /** Hover lift + stronger shadow; use with `as="a"` for clickable cards. @default false */
  interactive?: boolean;
}

/**
 * Generic surface container — the neutral building block behind info panels,
 * agent cards, and form wells. For a listing, use PropertyCard instead.
 */
export function Card(props: CardProps): JSX.Element;
