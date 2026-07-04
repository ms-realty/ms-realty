import React from 'react';
import { Avatar } from './Avatar';
import { Button } from '../actions/Button';
import { Icon } from '../general/Icon';

const CSS = `
.mk-agent {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: var(--space-5); font-family: var(--font-sans);
  display: flex; flex-direction: column; gap: var(--space-4);
}
.mk-agent__id { display: flex; align-items: center; gap: var(--space-3); }
.mk-agent__name {
  margin: 0; font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-lg); line-height: var(--lh-tight);
  letter-spacing: var(--tracking-tight); color: var(--text-strong);
}
.mk-agent__role { margin: 2px 0 0; font-size: var(--text-sm); color: var(--text-muted); }
.mk-agent__meta { display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--text-sm); color: var(--text-body); }
.mk-agent__meta-row { display: flex; align-items: center; gap: var(--space-2); }
.mk-agent__meta-row .mk-icon-slot { color: var(--text-muted); display: inline-flex; flex: none; }
.mk-agent__langs { display: flex; gap: 5px; flex-wrap: wrap; }
.mk-agent__lang {
  display: inline-grid; place-items: center; min-width: 26px; height: 20px; padding: 0 6px;
  border-radius: var(--radius-xs); background: var(--stone-200); color: var(--stone-700);
  font-size: 10px; font-weight: var(--fw-bold); letter-spacing: 0.05em; line-height: 1;
}
.mk-agent__actions { display: flex; flex-direction: column; gap: var(--space-2); }

/* compact row (team lists, message headers) */
.mk-agent--row { flex-direction: row; align-items: center; padding: var(--space-3) var(--space-4); }
.mk-agent--row .mk-agent__id { flex: 1; min-width: 0; }
.mk-agent--row .mk-agent__actions { flex-direction: row; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-agent-css')) {
  const el = document.createElement('style');
  el.id = 'mk-agent-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Agent contact card — the sticky panel on a listing page and the team-page
 * tile. The call action is `accent` (the single red CTA); message is secondary.
 */
export function AgentCard({
  name,
  role,
  office,
  phone,
  langs = [],
  src,
  tone = 'stone',
  layout = 'panel',
  callLabel = 'Call',
  messageLabel = 'Write a message',
  onCall,
  onMessage,
  children,
  className = '',
  ...rest
}) {
  const row = layout === 'row';
  return (
    <div className={['mk-agent', row ? 'mk-agent--row' : '', className].filter(Boolean).join(' ')} {...rest}>
      <div className="mk-agent__id">
        <Avatar name={name} src={src} tone={tone} size={row ? 44 : 52} />
        <div style={{ minWidth: 0 }}>
          <h3 className="mk-agent__name">{name}</h3>
          {(role || office) && (
            <p className="mk-agent__role">{[role, office].filter(Boolean).join(' · ')}</p>
          )}
        </div>
      </div>
      {!row && (phone || langs.length > 0) && (
        <div className="mk-agent__meta">
          {phone && (
            <span className="mk-agent__meta-row">
              <span className="mk-icon-slot"><Icon name="phone" size={15} /></span>{phone}
            </span>
          )}
          {langs.length > 0 && (
            <span className="mk-agent__meta-row">
              <span className="mk-icon-slot"><Icon name="languages" size={15} /></span>
              <span className="mk-agent__langs">
                {langs.map((l) => <span className="mk-agent__lang" key={l}>{l}</span>)}
              </span>
            </span>
          )}
        </div>
      )}
      {children}
      {(onCall || onMessage) && (
        <div className="mk-agent__actions">
          {onCall && (
            <Button variant="accent" size={row ? 'sm' : 'md'} iconStart="phone" fullWidth={!row} onClick={onCall}>
              {callLabel}
            </Button>
          )}
          {onMessage && (
            <Button variant="secondary" size={row ? 'sm' : 'md'} iconStart="mail" fullWidth={!row} onClick={onMessage}>
              {messageLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
