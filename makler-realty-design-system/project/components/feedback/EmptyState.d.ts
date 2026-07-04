import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lucide icon in the soft stone circle. @default 'search-x' */
  icon?: string | React.ReactNode | false;
  /** Serif heading — state the fact plainly (“No homes match”). */
  title?: React.ReactNode;
  /** @default 'md' */
  size?: 'sm' | 'md';
  /** Recovery actions (clear filters, browse all, contact an agent). */
  actions?: React.ReactNode;
  /** One or two sentences of guidance. */
  children?: React.ReactNode;
}

/**
 * Centred zero-result state for searches, saved homes, inbox and tables.
 * Always offers a way forward via `actions`.
 * @startingPoint section="Feedback" subtitle="Zero results" viewport="640x300"
 */
export function EmptyState(props: EmptyStateProps): JSX.Element;
