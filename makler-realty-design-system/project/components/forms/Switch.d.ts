import * as React from 'react';

export type SwitchSize = 'sm' | 'md';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Optional text label to the right of the track. */
  label?: React.ReactNode;
  /** @default 'md' */
  size?: SwitchSize;
}

/** On/off toggle for instant-effect settings (e.g. "Notify me about new listings"). */
export function Switch(props: SwitchProps): JSX.Element;
