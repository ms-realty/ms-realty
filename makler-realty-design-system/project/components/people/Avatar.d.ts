import * as React from 'react';

export type AvatarTone = 'ink' | 'stone' | 'brick' | 'sea' | 'sun';

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Full name — initials are derived (works for Cyrillic). Also the aria-label. */
  name?: string;
  /** Override the derived initials. */
  initials?: string;
  /** Photo URL — replaces initials. */
  src?: string;
  /** Diameter in px. @default 36 */
  size?: number;
  /** Tonal colour when no photo. @default 'stone' */
  tone?: AvatarTone;
  /** Filled (solid) tone with white initials. @default false */
  solid?: boolean;
}

export interface AvatarGroupProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Avatar children — overlapped with white keylines. */
  children?: React.ReactNode;
}

/**
 * Person circle for agents and clients — photo, or initials on a soft tone.
 * Keep tones `stone`/`ink` by default (monochrome brand).
 * @startingPoint section="People" subtitle="Initials / photo circles" viewport="640x140"
 */
export function Avatar(props: AvatarProps): JSX.Element;

/** Overlapping avatar stack (deal participants, office team). */
export function AvatarGroup(props: AvatarGroupProps): JSX.Element;
