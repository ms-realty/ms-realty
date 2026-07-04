import * as React from 'react';

export interface TimelineItem {
  id?: string | number;
  /** Lucide icon in the circle. @default 'circle' */
  icon?: string | React.ReactNode;
  /** Circle tone. @default 'ink' */
  tone?: 'ink' | 'stone' | 'brick' | 'success' | 'sea' | 'sun';
  /** The event line — embed <b> for the subject. */
  text: React.ReactNode;
  /** Muted second line (agent · time). */
  meta?: React.ReactNode;
}

export interface TimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TimelineItem[];
}

/**
 * Vertical activity feed — icon circles on a hairline spine. For lead
 * history, listing changes, office activity. Promoted from the CRM kit.
 * @startingPoint section="Data" subtitle="Activity feed" viewport="640x300"
 */
export function Timeline(props: TimelineProps): JSX.Element;
