import * as React from 'react';
import { AvatarTone } from './Avatar';

export interface AgentCardProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  /** e.g. "Старши брокер". */
  role?: string;
  /** e.g. "Свети Влас". Joined to role with a middot. */
  office?: string;
  phone?: string;
  /** Language codes shown as chips — public website or broker language codes, e.g. BG EN RU EL HE. */
  langs?: string[];
  /** Photo URL for the avatar. */
  src?: string;
  /** Avatar tone when no photo. @default 'stone' */
  tone?: AvatarTone;
  /** 'panel' = vertical sticky sidebar card; 'row' = compact horizontal tile. @default 'panel' */
  layout?: 'panel' | 'row';
  /** @default 'Call' */
  callLabel?: React.ReactNode;
  /** @default 'Write a message' */
  messageLabel?: React.ReactNode;
  /** Renders the red accent call button (the single high-intent CTA). */
  onCall?: () => void;
  /** Renders the secondary message button. */
  onMessage?: () => void;
  /** Extra content between meta and actions (e.g. office hours). */
  children?: React.ReactNode;
}

/**
 * Agent contact card — the sticky panel beside a listing, and the team-page
 * tile (`layout="row"`). Shows name, role · office, phone, language chips,
 * and the call (accent) / message (secondary) actions.
 * @startingPoint section="People" subtitle="Agent contact panel" viewport="640x320"
 */
export function AgentCard(props: AgentCardProps): JSX.Element;
