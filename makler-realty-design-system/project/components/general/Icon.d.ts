import * as React from 'react';

export interface IconProps extends Omit<React.SVGAttributes<SVGSVGElement>, 'name'> {
  /** Lucide icon name — kebab or PascalCase, e.g. "map-pin" or "MapPin". */
  name: string;
  /** Width & height in px. @default 20 */
  size?: number;
  /** Stroke width. @default 1.75 */
  strokeWidth?: number;
  /** Accessible label. Omit for purely decorative icons (renders aria-hidden). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Inline Lucide glyph. Inherits `color` via `currentColor`.
 * @dsCard group="Components"
 */
export function Icon(props: IconProps): JSX.Element;
