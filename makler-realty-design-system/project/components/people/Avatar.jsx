import React from 'react';

const TONE = {
  ink:   { fg: 'var(--ink-700)',   bg: 'var(--ink-100)',   solid: 'var(--ink-700)' },
  stone: { fg: 'var(--stone-700)', bg: 'var(--stone-200)', solid: 'var(--stone-500)' },
  brick: { fg: 'var(--brick-700)', bg: 'var(--brick-100)', solid: 'var(--brick-600)' },
  sea:   { fg: 'var(--sea-700)',   bg: 'var(--sea-100)',   solid: 'var(--sea-600)' },
  sun:   { fg: 'var(--sun-600)',   bg: 'var(--sun-100)',   solid: 'var(--sun-500)' },
};

const CSS = `
.mk-avatar {
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-full); flex: none; overflow: hidden;
  font-family: var(--font-sans); font-weight: var(--fw-semibold);
  letter-spacing: 0.01em; -webkit-user-select: none; user-select: none;
  background-size: cover; background-position: center;
}
.mk-avatar-group { display: inline-flex; }
.mk-avatar-group .mk-avatar { box-shadow: 0 0 0 2px var(--surface); }
.mk-avatar-group .mk-avatar + .mk-avatar { margin-left: -8px; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-avatar-css')) {
  const el = document.createElement('style');
  el.id = 'mk-avatar-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

function initialsOf(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

export function Avatar({
  name = '',
  initials,
  src,
  size = 36,
  tone = 'stone',
  solid = false,
  className = '',
  style,
  ...rest
}) {
  const t = TONE[tone] || TONE.stone;
  const text = src ? '' : (initials || initialsOf(name));
  return (
    <span
      className={['mk-avatar', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={name || undefined}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: src ? undefined : solid ? t.solid : t.bg,
        color: solid ? '#fff' : t.fg,
        backgroundImage: src ? `url(${src})` : undefined,
        ...style,
      }}
      {...rest}
    >
      {text}
    </span>
  );
}

export function AvatarGroup({ children, className = '', ...rest }) {
  return (
    <span className={['mk-avatar-group', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </span>
  );
}
