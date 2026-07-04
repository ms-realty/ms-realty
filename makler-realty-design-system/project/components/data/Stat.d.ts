import * as React from 'react';

export type StatTone = 'ink' | 'stone' | 'brick' | 'success' | 'sea' | 'sun';

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Muted caption above the value. */
  label: React.ReactNode;
  /** Serif display number — pre-format it (`€4.2M`, `27 дни`). */
  value: React.ReactNode;
  /** Lucide icon in the tonal corner chip. */
  icon?: string | React.ReactNode;
  /** Chip tone. @default 'ink' */
  tone?: StatTone;
  /** Small change label shown in the trend pill (`+12%`). */
  delta?: React.ReactNode;
  /** Colours the delta pill. */
  trend?: 'up' | 'down' | 'flat';
  /** Muted footnote after the pill (`vs май`). */
  note?: React.ReactNode;
}

/**
 * KPI tile — white card, serif value, tonal icon chip, optional trend pill.
 * Promoted from the CRM kit's StatTile. Keep tone `ink`/`stone` by default
 * (monochrome brand); reserve coloured tones for semantic meaning.
 * @startingPoint section="Data" subtitle="KPI tile" viewport="640x180"
 */
export function Stat(props: StatProps): JSX.Element;
