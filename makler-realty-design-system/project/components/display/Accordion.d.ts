import * as React from 'react';

export interface AccordionItem {
  id?: string | number;
  title: React.ReactNode;
  /** Optional leading Lucide icon. */
  icon?: string | React.ReactNode;
  content: React.ReactNode;
}

export interface AccordionProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AccordionItem[];
  /** Allow several rows open at once. @default false */
  multiple?: boolean;
  /** Item ids (or indices) open initially. @default [] */
  defaultOpen?: Array<string | number>;
  /** Wrap in a white card surface. @default false */
  card?: boolean;
}

/**
 * Expandable rows on hairline dividers — FAQs (“Can foreigners buy land?”),
 * buying-process steps, listing feature groups. Chevron rotates; panel
 * animates open (reduced-motion safe).
 * @startingPoint section="Display" subtitle="FAQ / expandable rows" viewport="640x300"
 */
export function Accordion(props: AccordionProps): JSX.Element;
