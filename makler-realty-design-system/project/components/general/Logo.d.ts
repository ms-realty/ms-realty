import * as React from 'react';

export interface LogoProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'height'> {
  /** Image source. Defaults to the embedded MS Realty mark chosen by `variant`.
   *  Pass a URL/data-URI to override. */
  src?: string;
  /** Which embedded mark to use on this surface.
   *  - `default`  full colour (red MS + charcoal REALTY) — light surfaces.
   *  - `reversed` red MS + warm-white REALTY — dark surfaces (Ink footer, photo hero).
   *  @default 'default' */
  variant?: 'default' | 'reversed';
  /** Rendered height in px (width scales automatically). @default 40 */
  height?: number;
  /** @default 'MS Realty' */
  alt?: string;
}

/** The MS Realty brand mark, embedded as a data URI (self-contained: renders
 *  offline and survives PPTX/PDF export). */
export function Logo(props: LogoProps): JSX.Element;

/** Full-colour mark data URI (red MS + charcoal REALTY), for light surfaces. */
export const LOGO_SRC: string;
/** Reversed mark data URI (red MS + warm-white REALTY), for dark surfaces. */
export const LOGO_SRC_REVERSED: string;
/** Native aspect ratio of the mark (172 / 88). */
export const LOGO_ASPECT: number;
