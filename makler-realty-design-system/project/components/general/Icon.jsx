import React from 'react';

/**
 * Icon — renders a Lucide glyph as an inline SVG.
 *
 * NOTE: Lucide is a SUBSTITUTE icon set (no brand icons were provided).
 * In the design-system HTML artifacts + UI kits, the Lucide UMD build is
 * loaded from CDN and exposes `window.lucide.icons`. In production React,
 * install `lucide-react` and swap the lookup for that package.
 */

const KEBAB_TO_CAMEL = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'fill-rule': 'fillRule',
  'clip-rule': 'clipRule',
  'fill-opacity': 'fillOpacity',
  'stroke-opacity': 'strokeOpacity',
};

function camelAttrs(attrs) {
  const out = {};
  for (const k in attrs) out[KEBAB_TO_CAMEL[k] || k] = attrs[k];
  return out;
}

function toPascal(name) {
  return String(name)
    .replace(/(?:^|[-_\s])([a-z0-9])/g, (_, c) => c.toUpperCase())
    .replace(/[-_\s]/g, '');
}

function renderNode(node, key) {
  const [tag, attrs, children] = node;
  const kids = Array.isArray(children) ? children.map((c, i) => renderNode(c, i)) : null;
  return React.createElement(tag, { key, ...camelAttrs(attrs || {}) }, kids);
}

export function Icon({ name, size = 20, strokeWidth = 1.75, label, className = '', style, ...rest }) {
  const reg =
    (typeof window !== 'undefined' && window.lucide && window.lucide.icons) || null;
  const node = reg ? reg[toPascal(name)] : null;
  const children = node && Array.isArray(node[2]) ? node[2] : [];

  const a11y = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': 'true', focusable: 'false' };

  return React.createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      className: ('mk-icon ' + className).trim(),
      style: { display: 'block', flex: 'none', ...style },
      ...a11y,
      ...rest,
    },
    children.map((c, i) => renderNode(c, i)),
  );
}
