import React from 'react';
import { IconButton } from '../actions/IconButton';

const CSS = `
.mk-modal-root { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: var(--space-6); }
.mk-modal__scrim {
  position: absolute; inset: 0; background: var(--overlay);
  animation: mk-modal-fade var(--dur-base) var(--ease-out) both;
}
.mk-modal {
  position: relative; width: 100%; display: flex; flex-direction: column;
  max-height: calc(100vh - var(--space-16));
  background: var(--surface); border-radius: var(--radius-modal);
  box-shadow: var(--shadow-modal); font-family: var(--font-sans);
  animation: mk-modal-in var(--dur-base) var(--ease-out) both;
}
.mk-modal--sm { max-width: 440px; }
.mk-modal--md { max-width: 560px; }
.mk-modal--lg { max-width: 760px; }

.mk-modal__head { display: flex; align-items: flex-start; gap: var(--space-4); padding: var(--space-6) var(--space-6) 0; }
.mk-modal__eyebrow {
  font-size: var(--text-xs); font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase;
  color: var(--text-muted); margin-bottom: var(--space-2);
}
.mk-modal__title {
  margin: 0; font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-xl); line-height: var(--lh-tight);
  letter-spacing: var(--tracking-tight); color: var(--text-strong);
}
.mk-modal__sub { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-muted); line-height: var(--lh-normal); }
.mk-modal__close { margin-left: auto; flex: none; }
.mk-modal__body { padding: var(--space-5) var(--space-6); overflow-y: auto; color: var(--text-body); font-size: var(--text-base); line-height: var(--lh-normal); }
.mk-modal__foot {
  display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3);
  padding: var(--space-4) var(--space-6); border-top: 1px solid var(--border);
}

@keyframes mk-modal-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mk-modal-in {
  from { opacity: 0; transform: translateY(14px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .mk-modal, .mk-modal__scrim { animation: none; }
}
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-modal-css')) {
  const el = document.createElement('style');
  el.id = 'mk-modal-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Modal renders in place with position:fixed (no portal), so it works in any
 * artifact without a ReactDOM dependency. Mount it near the root of the tree,
 * outside ancestors that create transform/filter containing blocks.
 */
export function Modal({
  open = false,
  onClose,
  title,
  eyebrow,
  subtitle,
  size = 'md',
  footer,
  closeOnScrim = true,
  className = '',
  children,
  ...rest
}) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="mk-modal-root" role="presentation">
      <div className="mk-modal__scrim" onClick={closeOnScrim && onClose ? onClose : undefined} />
      <div
        className={['mk-modal', `mk-modal--${size}`, className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        {...rest}
      >
        {(title || eyebrow || onClose) && (
          <div className="mk-modal__head">
            <div style={{ minWidth: 0 }}>
              {eyebrow && <div className="mk-modal__eyebrow">{eyebrow}</div>}
              {title && <h2 className="mk-modal__title">{title}</h2>}
              {subtitle && <p className="mk-modal__sub">{subtitle}</p>}
            </div>
            {onClose && (
              <span className="mk-modal__close">
                <IconButton icon="x" variant="ghost" aria-label="Close" onClick={onClose} />
              </span>
            )}
          </div>
        )}
        <div className="mk-modal__body">{children}</div>
        {footer && <div className="mk-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
