import * as React from 'react';

export type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Controlled visibility. Nothing renders while false. */
  open?: boolean;
  /** Called on ✕, Escape, and scrim click. Omit to hide the ✕. */
  onClose?: () => void;
  /** Serif dialog heading. */
  title?: React.ReactNode;
  /** Tiny uppercase kicker above the title (e.g. the listing ref). */
  eyebrow?: React.ReactNode;
  /** Muted line under the title. */
  subtitle?: React.ReactNode;
  /** @default 'md' (sm 440 · md 560 · lg 760) */
  size?: ModalSize;
  /** Right-aligned action row below a hairline divider. */
  footer?: React.ReactNode;
  /** @default true */
  closeOnScrim?: boolean;
  children?: React.ReactNode;
}

/**
 * Dialog over the page scrim — “Book a viewing”, “Request a call”, confirm
 * steps. Renders in place with position:fixed (no portal); mount it near the
 * root, outside transformed ancestors. Locks body scroll while open.
 * @startingPoint section="Feedback" subtitle="Dialog / book-a-viewing" viewport="700x460"
 */
export function Modal(props: ModalProps): JSX.Element | null;
