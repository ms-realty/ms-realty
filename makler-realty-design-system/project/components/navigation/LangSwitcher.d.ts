import * as React from 'react';

export interface Language {
  /** Two-letter chip, e.g. 'BG'. */
  code: string;
  /** Native name, e.g. 'Български'. */
  label: string;
  /** Text direction for the native label. */
  dir?: 'ltr' | 'rtl';
}

export interface LangSwitcherProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Active language code. @default 'BG' */
  value?: string;
  onChange?: (code: string) => void;
  /** @default approved public website locales BG / EN / DE / NL / RU / EL / HE with native names */
  languages?: Language[];
  /** Light text/hover for the dark Ink footer or CRM sidebar. @default false */
  onDark?: boolean;
}

/**
 * Approved public website language switcher — globe + current code
 * trigger, popover listing native names. Belongs in the site header
 * (and footer via onDark). Closes on outside click / Escape.
 * @startingPoint section="Navigation" subtitle="BG EN DE NL RU EL HE" viewport="640x260"
 */
export function LangSwitcher(props: LangSwitcherProps): JSX.Element;
