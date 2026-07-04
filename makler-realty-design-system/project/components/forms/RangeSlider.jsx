import React from 'react';

const CSS = `
.mk-range { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-range__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-range__track { position: relative; height: 26px; }
.mk-range__rail, .mk-range__fill {
  position: absolute; top: 50%; transform: translateY(-50%);
  height: 4px; border-radius: var(--radius-pill);
}
.mk-range__rail { left: 0; right: 0; background: var(--stone-200); }
.mk-range__fill { background: var(--ink-700); }
.mk-range__track input[type="range"] {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0;
  -webkit-appearance: none; appearance: none;
  background: transparent; pointer-events: none; outline: none;
}
.mk-range__track input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; pointer-events: auto;
  width: 18px; height: 18px; border-radius: var(--radius-full);
  background: var(--surface); border: 1.5px solid var(--ink-700);
  box-shadow: var(--shadow-sm); cursor: grab;
  transition: box-shadow var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-standard);
}
.mk-range__track input[type="range"]::-moz-range-thumb {
  pointer-events: auto;
  width: 15px; height: 15px; border-radius: var(--radius-full);
  background: var(--surface); border: 1.5px solid var(--ink-700);
  box-shadow: var(--shadow-sm); cursor: grab;
}
.mk-range__track input[type="range"]:active::-webkit-slider-thumb { cursor: grabbing; transform: scale(1.08); }
.mk-range__track input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: var(--shadow-focus); }
.mk-range__track input[type="range"]:focus-visible::-moz-range-thumb { box-shadow: var(--shadow-focus); }
.mk-range__vals { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--text-sm); color: var(--text-body); }
.mk-range__vals b { font-weight: var(--fw-semibold); color: var(--text-strong); font-variant-numeric: tabular-nums; }
.mk-range--disabled { opacity: 0.6; pointer-events: none; }
`;

if (typeof document !== 'undefined' && !document.getElementById('mk-range-css')) {
  const el = document.createElement('style');
  el.id = 'mk-range-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Dual-thumb range for price / area filters. Two overlaid native range
 * inputs (keyboard accessible) over a charcoal fill.
 */
export function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onChange,
  label,
  format = (v) => String(v),
  minGap,
  disabled = false,
  className = '',
  ...rest
}) {
  const gap = minGap != null ? minGap : step;
  const [inner, setInner] = React.useState(defaultValue || [min, max]);
  const [lo, hi] = value || inner;

  const set = (next) => {
    if (!value) setInner(next);
    if (onChange) onChange(next);
  };
  const setLo = (v) => set([Math.min(Number(v), hi - gap), hi]);
  const setHi = (v) => set([lo, Math.max(Number(v), lo + gap)]);

  const pct = (v) => ((v - min) / (max - min)) * 100;

  return (
    <div
      className={['mk-range', disabled ? 'mk-range--disabled' : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {label && <span className="mk-range__label">{label}</span>}
      <div className="mk-range__track">
        <span className="mk-range__rail" />
        <span className="mk-range__fill" style={{ left: pct(lo) + '%', right: (100 - pct(hi)) + '%' }} />
        <input
          type="range" min={min} max={max} step={step} value={lo}
          aria-label={label ? `${label} — from` : 'From'}
          onChange={(e) => setLo(e.target.value)} disabled={disabled}
        />
        <input
          type="range" min={min} max={max} step={step} value={hi}
          aria-label={label ? `${label} — to` : 'To'}
          onChange={(e) => setHi(e.target.value)} disabled={disabled}
        />
      </div>
      <div className="mk-range__vals">
        <b>{format(lo)}</b>
        <b>{format(hi)}</b>
      </div>
    </div>
  );
}
