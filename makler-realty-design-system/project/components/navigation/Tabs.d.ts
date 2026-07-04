import * as React from 'react';

export interface TabItem {
  key: string;
  label: React.ReactNode;
  /** Lucide icon name or node. */
  icon?: string | React.ReactNode;
  /** Small count pill after the label. */
  count?: number | string;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: TabItem[];
  /** Active item key (controlled). */
  value?: string;
  onChange?: (key: string) => void;
  /** 'underline' — section switch on a hairline; 'segmented' — compact control-like toggle. @default 'underline' */
  variant?: 'underline' | 'segmented';
  /** @default 'md' */
  size?: 'sm' | 'md';
}

/**
 * Tab switcher. Underline = charcoal 2px bar for page sections (listing
 * Overview/Features/Location, CRM views). Segmented = grouped toggle for
 * view modes (Grid/List/Map).
 * @startingPoint section="Navigation" subtitle="Section tabs" viewport="640x140"
 */
export function Tabs(props: TabsProps): JSX.Element;
