import * as React from 'react';

export interface Language {
  /** Two-letter chip, e.g. 'BG'. */
  code: string;
  /** Native name, e.g. 'Български'. */
  label: string;
}

export interface LangSwitcherProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Active language code. @default 'BG' */
  value?: string;
  onChange?: (code: string) => void;
  /** @default the five brand languages BG / EN / DE / NL / RU with native names */
  languages?: Language[];
  /** Light text/hover for the dark Ink footer or CRM sidebar. @default false */
  onDark?: boolean;
}

/**
 * The five-language switcher (BG EN DE NL RU) — globe + current code
 * trigger, popover listing native names. Belongs in the site header
 * (and footer via onDark). Closes on outside click / Escape.
 * @startingPoint section="Navigation" subtitle="BG EN DE NL RU" viewport="640x260"
 */
export function LangSwitcher(props: LangSwitcherProps): JSX.Element;
