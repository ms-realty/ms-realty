/* @ds-bundle: {"format":4,"namespace":"MaklerRealtyDesignSystem_9b7f1e","components":[{"name":"Button","sourcePath":"components/actions/Button.jsx"},{"name":"IconButton","sourcePath":"components/actions/IconButton.jsx"},{"name":"DataTable","sourcePath":"components/data/DataTable.jsx"},{"name":"Stat","sourcePath":"components/data/Stat.jsx"},{"name":"Timeline","sourcePath":"components/data/Timeline.jsx"},{"name":"Accordion","sourcePath":"components/display/Accordion.jsx"},{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"PropertyCard","sourcePath":"components/display/PropertyCard.jsx"},{"name":"Rating","sourcePath":"components/display/Rating.jsx"},{"name":"Tag","sourcePath":"components/display/Tag.jsx"},{"name":"Alert","sourcePath":"components/feedback/Alert.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Skeleton","sourcePath":"components/feedback/Skeleton.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"RangeSlider","sourcePath":"components/forms/RangeSlider.jsx"},{"name":"SearchBar","sourcePath":"components/forms/SearchBar.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Icon","sourcePath":"components/general/Icon.jsx"},{"name":"LOGO_SRC","sourcePath":"components/general/Logo.jsx"},{"name":"LOGO_SRC_REVERSED","sourcePath":"components/general/Logo.jsx"},{"name":"LOGO_ASPECT","sourcePath":"components/general/Logo.jsx"},{"name":"Logo","sourcePath":"components/general/Logo.jsx"},{"name":"Breadcrumb","sourcePath":"components/navigation/Breadcrumb.jsx"},{"name":"LangSwitcher","sourcePath":"components/navigation/LangSwitcher.jsx"},{"name":"Pagination","sourcePath":"components/navigation/Pagination.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"},{"name":"AgentCard","sourcePath":"components/people/AgentCard.jsx"},{"name":"Avatar","sourcePath":"components/people/Avatar.jsx"},{"name":"AvatarGroup","sourcePath":"components/people/Avatar.jsx"}],"sourceHashes":{"components/actions/Button.jsx":"0bf4359d88be","components/actions/IconButton.jsx":"b9b4aeae0a37","components/data/DataTable.jsx":"84a8d315291f","components/data/Stat.jsx":"70cb5d9c5a79","components/data/Timeline.jsx":"b4120a8d636d","components/display/Accordion.jsx":"9bbb4ec29f16","components/display/Badge.jsx":"4e22ea2d402d","components/display/Card.jsx":"69c6364dda8a","components/display/PropertyCard.jsx":"10a531d6ade8","components/display/Rating.jsx":"a59125f590bf","components/display/Tag.jsx":"b00169aed26b","components/feedback/Alert.jsx":"3dd2521cde21","components/feedback/EmptyState.jsx":"943c1bc95716","components/feedback/Modal.jsx":"62a9c8f1b906","components/feedback/Skeleton.jsx":"412e207efcad","components/forms/Checkbox.jsx":"a84299acf23f","components/forms/Input.jsx":"baa8f96776c1","components/forms/Radio.jsx":"93ec791e8318","components/forms/RangeSlider.jsx":"cc94b0b8e248","components/forms/SearchBar.jsx":"69924bde7453","components/forms/Select.jsx":"9bef159a60ab","components/forms/Switch.jsx":"7beecdd0f0ec","components/forms/Textarea.jsx":"c29ad33f44e9","components/general/Icon.jsx":"19f024da0a6b","components/general/Logo.jsx":"a50480331c02","components/navigation/Breadcrumb.jsx":"10e226e51e56","components/navigation/LangSwitcher.jsx":"b86f16ca7774","components/navigation/Pagination.jsx":"3c854ceb21b7","components/navigation/Tabs.jsx":"7841855262bf","components/people/AgentCard.jsx":"3e405a8c29d7","components/people/Avatar.jsx":"a6e471abeac9","ui_kits/crm/Calendar.jsx":"c1b6357e6f33","ui_kits/crm/Contacts.jsx":"f5eb81697c09","ui_kits/crm/CrmKit.jsx":"8803bca785eb","ui_kits/crm/Dashboard.jsx":"80c935f99e1b","ui_kits/crm/LeadDetail.jsx":"722e5eb184e3","ui_kits/crm/Listings.jsx":"ab1087f52df2","ui_kits/crm/Messages.jsx":"c4391767c165","ui_kits/crm/Pipeline.jsx":"6073923b21e9","ui_kits/crm/Reports.jsx":"848861132600","ui_kits/crm/crm-data.js":"a1f8fea7a42e","ui_kits/website/ContactPanel.jsx":"896bfb66874e","ui_kits/website/HomePage.jsx":"29ba549c430e","ui_kits/website/ListingDetail.jsx":"2ae7db1af846","ui_kits/website/SearchResults.jsx":"a3429bd85dc8","ui_kits/website/SiteChrome.jsx":"de9737292c14","ui_kits/website/data.js":"9d25f475ed68"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MaklerRealtyDesignSystem_9b7f1e = window.MaklerRealtyDesignSystem_9b7f1e || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  color: var(--text-body);
}
.mk-card--elevated { border-color: transparent; box-shadow: var(--shadow-card); }
.mk-card--sunken { background: var(--surface-sunken); border-color: transparent; }
.mk-card--pad-sm { padding: var(--space-3); }
.mk-card--pad-md { padding: var(--space-5); }
.mk-card--pad-lg { padding: var(--space-8); }
.mk-card--interactive {
  cursor: pointer; text-decoration: none; display: block;
  transition: box-shadow var(--dur-base) var(--ease-standard),
              transform var(--dur-base) var(--ease-out),
              border-color var(--dur-fast) var(--ease-standard);
}
.mk-card--interactive:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-2px); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-card-css')) {
  const el = document.createElement('style');
  el.id = 'mk-card-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Card({
  as,
  padding = 'md',
  elevated = false,
  sunken = false,
  interactive = false,
  className = '',
  children,
  ...rest
}) {
  const Tag = as || 'div';
  const cls = ['mk-card', padding !== 'none' ? `mk-card--pad-${padding}` : '', elevated ? 'mk-card--elevated' : '', sunken ? 'mk-card--sunken' : '', interactive ? 'mk-card--interactive' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Skeleton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-skel {
  display: block; position: relative; overflow: hidden;
  background: var(--stone-100); border-radius: var(--radius-sm);
}
.mk-skel::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent);
  transform: translateX(-100%);
  animation: mk-skel-sweep 1.6s var(--ease-in-out) infinite;
}
.mk-skel--circle { border-radius: var(--radius-full); }
.mk-skel--photo { border-radius: var(--radius-image); background: var(--stone-200); }
.mk-skel-lines { display: flex; flex-direction: column; gap: var(--space-2); }
@keyframes mk-skel-sweep { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .mk-skel::after { animation: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-skel-css')) {
  const el = document.createElement('style');
  el.id = 'mk-skel-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Loading placeholder. variant:
 *  - "text"   → one or more text lines (use `lines`; last line is shorter)
 *  - "rect"   → a block (give width/height)
 *  - "circle" → avatar/icon circle (give size via width)
 *  - "photo"  → an image area (image radius, deeper tone)
 */
function Skeleton({
  variant = 'text',
  width,
  height,
  lines = 1,
  className = '',
  style,
  ...rest
}) {
  if (variant === 'text' && lines > 1) {
    return /*#__PURE__*/React.createElement("span", _extends({
      className: ['mk-skel-lines', className].filter(Boolean).join(' '),
      style: {
        width,
        ...style
      }
    }, rest), Array.from({
      length: lines
    }).map((_, i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      className: "mk-skel",
      style: {
        height: height || '0.75em',
        width: i === lines - 1 ? '62%' : '100%'
      }
    })));
  }
  const cls = ['mk-skel', variant === 'circle' ? 'mk-skel--circle' : '', variant === 'photo' ? 'mk-skel--photo' : '', className].filter(Boolean).join(' ');
  const dims = {
    width: width ?? (variant === 'circle' ? 40 : '100%'),
    height: height ?? (variant === 'circle' ? width || 40 : variant === 'text' ? '0.75em' : 96)
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    style: {
      ...dims,
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Skeleton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Skeleton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-radio { display: inline-flex; align-items: flex-start; gap: var(--space-2); font-family: var(--font-sans); font-size: var(--text-base); color: var(--text-body); cursor: pointer; -webkit-user-select: none; user-select: none; }
.mk-radio__native { position: absolute; opacity: 0; width: 0; height: 0; }
.mk-radio__dot {
  flex: none; width: 20px; height: 20px; margin-top: 1px;
  display: grid; place-items: center;
  background: var(--surface); border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-full);
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.mk-radio__dot::after {
  content: ""; width: 10px; height: 10px; border-radius: var(--radius-full);
  background: var(--brand); transform: scale(0);
  transition: transform var(--dur-fast) var(--ease-out);
}
.mk-radio:hover .mk-radio__dot { border-color: var(--stone-400); }
.mk-radio__native:checked + .mk-radio__dot { border-color: var(--brand); }
.mk-radio__native:checked + .mk-radio__dot::after { transform: scale(1); }
.mk-radio__native:focus-visible + .mk-radio__dot { box-shadow: var(--shadow-focus); }
.mk-radio__label { line-height: 1.35; padding-top: 1px; }
.mk-radio--disabled { opacity: 0.5; cursor: not-allowed; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-radio-css')) {
  const el = document.createElement('style');
  el.id = 'mk-radio-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Radio({
  label,
  disabled = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['mk-radio', disabled ? 'mk-radio--disabled' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    className: "mk-radio__native",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "mk-radio__dot"
  }), label && /*#__PURE__*/React.createElement("span", {
    className: "mk-radio__label"
  }, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/RangeSlider.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onChange,
  label,
  format = v => String(v),
  minGap,
  disabled = false,
  className = '',
  ...rest
}) {
  const gap = minGap != null ? minGap : step;
  const [inner, setInner] = React.useState(defaultValue || [min, max]);
  const [lo, hi] = value || inner;
  const set = next => {
    if (!value) setInner(next);
    if (onChange) onChange(next);
  };
  const setLo = v => set([Math.min(Number(v), hi - gap), hi]);
  const setHi = v => set([lo, Math.max(Number(v), lo + gap)]);
  const pct = v => (v - min) / (max - min) * 100;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-range', disabled ? 'mk-range--disabled' : '', className].filter(Boolean).join(' ')
  }, rest), label && /*#__PURE__*/React.createElement("span", {
    className: "mk-range__label"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "mk-range__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-range__rail"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mk-range__fill",
    style: {
      left: pct(lo) + '%',
      right: 100 - pct(hi) + '%'
    }
  }), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: min,
    max: max,
    step: step,
    value: lo,
    "aria-label": label ? `${label} — from` : 'From',
    onChange: e => setLo(e.target.value),
    disabled: disabled
  }), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: min,
    max: max,
    step: step,
    value: hi,
    "aria-label": label ? `${label} — to` : 'To',
    onChange: e => setHi(e.target.value),
    disabled: disabled
  })), /*#__PURE__*/React.createElement("div", {
    className: "mk-range__vals"
  }, /*#__PURE__*/React.createElement("b", null, format(lo)), /*#__PURE__*/React.createElement("b", null, format(hi))));
}
Object.assign(__ds_scope, { RangeSlider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RangeSlider.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-switch { display: inline-flex; align-items: center; gap: var(--space-3); font-family: var(--font-sans); font-size: var(--text-base); color: var(--text-body); cursor: pointer; -webkit-user-select: none; user-select: none; }
.mk-switch__native { position: absolute; opacity: 0; width: 0; height: 0; }
.mk-switch__track {
  flex: none; position: relative; width: 42px; height: 24px;
  background: var(--stone-300); border-radius: var(--radius-full);
  transition: background-color var(--dur-base) var(--ease-standard);
}
.mk-switch__thumb {
  position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
  background: #fff; border-radius: var(--radius-full); box-shadow: var(--shadow-sm);
  transition: transform var(--dur-base) var(--ease-out);
}
.mk-switch__native:checked + .mk-switch__track { background: var(--brand); }
.mk-switch__native:checked + .mk-switch__track .mk-switch__thumb { transform: translateX(18px); }
.mk-switch__native:focus-visible + .mk-switch__track { box-shadow: var(--shadow-focus); }
.mk-switch--sm .mk-switch__track { width: 36px; height: 20px; }
.mk-switch--sm .mk-switch__thumb { width: 16px; height: 16px; }
.mk-switch--sm .mk-switch__native:checked + .mk-switch__track .mk-switch__thumb { transform: translateX(16px); }
.mk-switch--disabled { opacity: 0.5; cursor: not-allowed; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-switch-css')) {
  const el = document.createElement('style');
  el.id = 'mk-switch-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Switch({
  label,
  size = 'md',
  disabled = false,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['mk-switch', `mk-switch--${size}`, disabled ? 'mk-switch--disabled' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    role: "switch",
    className: "mk-switch__native",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "mk-switch__track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-switch__thumb"
  })), label && /*#__PURE__*/React.createElement("span", {
    className: "mk-switch__label"
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-textarea { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-textarea__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-textarea__label .mk-req { color: var(--accent); margin-left: 2px; }
.mk-textarea__el {
  width: 100%; box-sizing: border-box;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-input); color: var(--text-strong);
  font: inherit; font-size: var(--text-base); line-height: var(--lh-normal);
  padding: var(--space-3); resize: vertical; min-height: 96px; outline: none;
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.mk-textarea__el::placeholder { color: var(--text-subtle); }
.mk-textarea__el:focus { border-color: var(--brand); box-shadow: var(--shadow-focus); }
.mk-textarea--error .mk-textarea__el { border-color: var(--danger-500); }
.mk-textarea--error .mk-textarea__el:focus { box-shadow: 0 0 0 3px rgba(178,58,44,0.28); }
.mk-textarea--disabled { opacity: 0.6; }
.mk-textarea--disabled .mk-textarea__el { background: var(--surface-sunken); cursor: not-allowed; resize: none; }
.mk-textarea__msg { font-size: var(--text-xs); color: var(--text-muted); display: flex; justify-content: space-between; gap: var(--space-3); }
.mk-textarea__msg--error { color: var(--danger-600); font-weight: var(--fw-medium); }
.mk-textarea__count { font-family: var(--font-mono); font-size: var(--text-2xs); color: var(--text-subtle); flex: none; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-textarea-css')) {
  const el = document.createElement('style');
  el.id = 'mk-textarea-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
let _uid = 0;
function Textarea({
  label,
  hint,
  error,
  rows = 4,
  maxLength,
  showCount = false,
  required = false,
  disabled = false,
  id,
  className = '',
  onChange,
  ...rest
}) {
  const [autoId] = React.useState(() => id || `mk-textarea-${++_uid}`);
  const [count, setCount] = React.useState(() => String(rest.value ?? rest.defaultValue ?? '').length);
  const cls = ['mk-textarea', error ? 'mk-textarea--error' : '', disabled ? 'mk-textarea--disabled' : '', className].filter(Boolean).join(' ');
  const handleChange = e => {
    if (showCount) setCount(e.target.value.length);
    if (onChange) onChange(e);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "mk-textarea__label",
    htmlFor: autoId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "mk-req"
  }, "*")), /*#__PURE__*/React.createElement("textarea", _extends({
    id: autoId,
    className: "mk-textarea__el",
    rows: rows,
    maxLength: maxLength,
    disabled: disabled,
    required: required,
    "aria-invalid": error ? true : undefined,
    onChange: handleChange
  }, rest)), (error || hint || showCount && maxLength) && /*#__PURE__*/React.createElement("span", {
    className: 'mk-textarea__msg' + (error ? ' mk-textarea__msg--error' : '')
  }, /*#__PURE__*/React.createElement("span", null, error || hint), showCount && maxLength && /*#__PURE__*/React.createElement("span", {
    className: "mk-textarea__count"
  }, count, "/", maxLength)));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/general/Icon.jsx
try { (() => {
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
  'stroke-opacity': 'strokeOpacity'
};
function camelAttrs(attrs) {
  const out = {};
  for (const k in attrs) out[KEBAB_TO_CAMEL[k] || k] = attrs[k];
  return out;
}
function toPascal(name) {
  return String(name).replace(/(?:^|[-_\s])([a-z0-9])/g, (_, c) => c.toUpperCase()).replace(/[-_\s]/g, '');
}
function renderNode(node, key) {
  const [tag, attrs, children] = node;
  const kids = Array.isArray(children) ? children.map((c, i) => renderNode(c, i)) : null;
  return React.createElement(tag, {
    key,
    ...camelAttrs(attrs || {})
  }, kids);
}
function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  label,
  className = '',
  style,
  ...rest
}) {
  const reg = typeof window !== 'undefined' && window.lucide && window.lucide.icons || null;
  const node = reg ? reg[toPascal(name)] : null;
  const children = node && Array.isArray(node[2]) ? node[2] : [];
  const a11y = label ? {
    role: 'img',
    'aria-label': label
  } : {
    'aria-hidden': 'true',
    focusable: 'false'
  };
  return React.createElement('svg', {
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
    style: {
      display: 'block',
      flex: 'none',
      ...style
    },
    ...a11y,
    ...rest
  }, children.map((c, i) => renderNode(c, i)));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/general/Icon.jsx", error: String((e && e.message) || e) }); }

// components/actions/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-btn {
  --_ring: var(--shadow-focus);
  display: inline-flex; align-items: center; justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-sans); font-weight: var(--fw-semibold);
  letter-spacing: 0.005em; line-height: 1;
  border-radius: var(--radius-button); border: 1px solid transparent;
  cursor: pointer; text-decoration: none; white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard),
              box-shadow var(--dur-fast) var(--ease-standard),
              transform var(--dur-fast) var(--ease-standard);
  -webkit-user-select: none; user-select: none;
}
.mk-btn:focus-visible { outline: none; box-shadow: var(--_ring); }
.mk-btn:not([data-disabled]):active { transform: translateY(0.5px) scale(0.99); }
.mk-btn[data-disabled] { cursor: not-allowed; opacity: 0.5; box-shadow: none; }
.mk-btn[data-loading] { cursor: progress; }

.mk-btn--sm { height: 34px; padding: 0 var(--space-3); font-size: var(--text-sm); border-radius: var(--radius-sm); }
.mk-btn--md { height: 42px; padding: 0 var(--space-4); font-size: var(--text-base); }
.mk-btn--lg { height: 52px; padding: 0 var(--space-6); font-size: var(--text-lg); border-radius: var(--radius-lg); }
.mk-btn--full { width: 100%; }

.mk-btn--primary { background: var(--brand); color: var(--text-on-brand); }
.mk-btn--primary:not([data-disabled]):hover { background: var(--brand-hover); }
.mk-btn--primary:not([data-disabled]):active { background: var(--brand-active); }

.mk-btn--accent { background: var(--accent); color: var(--text-on-accent); --_ring: var(--shadow-focus-accent); }
.mk-btn--accent:not([data-disabled]):hover { background: var(--accent-hover); }
.mk-btn--accent:not([data-disabled]):active { background: var(--accent-active); }

.mk-btn--secondary { background: var(--surface); color: var(--text-strong); border-color: var(--border-strong); box-shadow: var(--shadow-xs); }
.mk-btn--secondary:not([data-disabled]):hover { background: var(--surface-hover); border-color: var(--stone-400); }

.mk-btn--ghost { background: transparent; color: var(--text-body); }
.mk-btn--ghost:not([data-disabled]):hover { background: var(--surface-hover); }

.mk-btn--subtle { background: var(--brand-subtle); color: var(--brand); }
.mk-btn--subtle:not([data-disabled]):hover { background: var(--ink-100); }

.mk-btn__spin { animation: mk-btn-spin 0.7s linear infinite; }
@keyframes mk-btn-spin { to { transform: rotate(360deg); } }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-btn-css')) {
  const el = document.createElement('style');
  el.id = 'mk-btn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
const ICON_SIZE = {
  sm: 16,
  md: 18,
  lg: 20
};
function renderIcon(icon, size) {
  if (!icon) return null;
  return typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size
  }) : icon;
}
function Button({
  variant = 'primary',
  size = 'md',
  iconStart,
  iconEnd,
  fullWidth = false,
  loading = false,
  disabled = false,
  as,
  className = '',
  children,
  ...rest
}) {
  const Tag = as || 'button';
  const isDisabled = disabled || loading;
  const cls = ['mk-btn', `mk-btn--${variant}`, `mk-btn--${size}`, fullWidth ? 'mk-btn--full' : '', className].filter(Boolean).join(' ');
  const extra = {};
  if (Tag === 'button') extra.disabled = isDisabled;else if (isDisabled) extra['aria-disabled'] = true;
  const glyph = ICON_SIZE[size];
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls,
    "data-disabled": isDisabled ? '' : undefined,
    "data-loading": loading ? '' : undefined
  }, extra, rest), loading && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: glyph,
    className: "mk-btn__spin"
  }), !loading && renderIcon(iconStart, glyph), children != null && /*#__PURE__*/React.createElement("span", null, children), !loading && renderIcon(iconEnd, glyph));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/Button.jsx", error: String((e && e.message) || e) }); }

// components/actions/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-iconbtn {
  --_ring: var(--shadow-focus);
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--radius-md); border: 1px solid transparent;
  cursor: pointer; padding: 0; color: var(--text-body); background: transparent;
  transition: background-color var(--dur-fast) var(--ease-standard),
              border-color var(--dur-fast) var(--ease-standard),
              color var(--dur-fast) var(--ease-standard),
              box-shadow var(--dur-fast) var(--ease-standard),
              transform var(--dur-fast) var(--ease-standard);
}
.mk-iconbtn:focus-visible { outline: none; box-shadow: var(--_ring); }
.mk-iconbtn:not([data-disabled]):active { transform: scale(0.94); }
.mk-iconbtn[data-disabled] { cursor: not-allowed; opacity: 0.45; }
.mk-iconbtn--round { border-radius: var(--radius-full); }

.mk-iconbtn--sm { width: 34px; height: 34px; }
.mk-iconbtn--md { width: 42px; height: 42px; }
.mk-iconbtn--lg { width: 50px; height: 50px; }

.mk-iconbtn--ghost:not([data-disabled]):hover { background: var(--surface-hover); color: var(--text-strong); }

.mk-iconbtn--solid { background: var(--brand); color: var(--text-on-brand); }
.mk-iconbtn--solid:not([data-disabled]):hover { background: var(--brand-hover); }

.mk-iconbtn--outline { border-color: var(--border-strong); background: var(--surface); box-shadow: var(--shadow-xs); }
.mk-iconbtn--outline:not([data-disabled]):hover { background: var(--surface-hover); border-color: var(--stone-400); color: var(--text-strong); }

/* Glassy overlay button — for use over photography (e.g. save/share on a listing image) */
.mk-iconbtn--glass { background: rgba(255,255,255,0.82); color: var(--stone-800); backdrop-filter: blur(6px); box-shadow: var(--shadow-sm); }
.mk-iconbtn--glass:not([data-disabled]):hover { background: #fff; color: var(--text-strong); }
.mk-iconbtn[data-active="true"].mk-iconbtn--glass { color: var(--accent); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-iconbtn-css')) {
  const el = document.createElement('style');
  el.id = 'mk-iconbtn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
const ICON_SIZE = {
  sm: 18,
  md: 20,
  lg: 22
};
function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  round = false,
  active = false,
  disabled = false,
  className = '',
  ...rest
}) {
  const cls = ['mk-iconbtn', `mk-iconbtn--${variant}`, `mk-iconbtn--${size}`, round ? 'mk-iconbtn--round' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": label,
    "aria-pressed": active || undefined,
    "data-active": active ? 'true' : undefined,
    "data-disabled": disabled ? '' : undefined,
    disabled: disabled
  }, rest), typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: ICON_SIZE[size]
  }) : icon);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/actions/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/data/DataTable.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-tbl-wrap { overflow-x: auto; }
.mk-tbl {
  width: 100%; border-collapse: separate; border-spacing: 0;
  font-family: var(--font-sans); font-size: var(--text-sm); line-height: var(--lh-snug);
}
.mk-tbl th {
  text-align: left; padding: var(--space-3) var(--space-4);
  font-size: var(--text-2xs); font-weight: var(--fw-semibold);
  letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted);
  background: var(--stone-50); border-bottom: 1px solid var(--border);
  white-space: nowrap; user-select: none; -webkit-user-select: none;
}
.mk-tbl th[data-sortable] { cursor: pointer; }
.mk-tbl th[data-sortable]:hover { color: var(--text-strong); }
.mk-tbl th .mk-tbl__thin { display: inline-flex; align-items: center; gap: 4px; }
.mk-tbl td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); color: var(--text-body); vertical-align: middle; }
.mk-tbl--dense th { padding: var(--space-2) var(--space-3); }
.mk-tbl--dense td { padding: var(--space-2) var(--space-3); }
.mk-tbl tbody tr:last-child td { border-bottom: 0; }
.mk-tbl tbody tr[data-clickable] { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-standard); }
.mk-tbl tbody tr[data-clickable]:hover { background: var(--surface-hover); }

/* cell helpers */
.mk-tbl__primary { font-weight: var(--fw-semibold); color: var(--text-strong); }
.mk-tbl__muted { color: var(--text-muted); }
.mk-tbl__mono { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); }
.mk-tbl__price { font-family: var(--font-display); font-weight: var(--fw-semibold); font-size: var(--text-base); color: var(--price); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-tbl-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tbl-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Sortable data table. columns: [{ key, label, align, width, render(row),
 * sort(row), sortable }]. Promoted from the CRM kit's DataTable.
 */
function DataTable({
  columns = [],
  rows = [],
  onRowClick,
  dense = false,
  initialSort,
  empty,
  className = '',
  ...rest
}) {
  const [sort, setSort] = React.useState(initialSort || {
    key: null,
    dir: 1
  });
  const sorted = React.useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return rows;
    const get = col.sort || (r => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a),
        vb = get(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);
  const toggle = c => {
    if (c.sortable === false) return;
    setSort(s => s.key === c.key ? {
      key: c.key,
      dir: -s.dir
    } : {
      key: c.key,
      dir: 1
    });
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-tbl-wrap', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("table", {
    className: 'mk-tbl' + (dense ? ' mk-tbl--dense' : '')
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: c.align,
      width: c.width
    },
    "data-sortable": c.sortable === false ? undefined : '',
    "aria-sort": sort.key === c.key ? sort.dir === 1 ? 'ascending' : 'descending' : undefined,
    onClick: () => toggle(c)
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-tbl__thin"
  }, c.label, sort.key === c.key && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: sort.dir === 1 ? 'chevron-up' : 'chevron-down',
    size: 13
  })))))), /*#__PURE__*/React.createElement("tbody", null, sorted.length === 0 && empty != null ? /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    colSpan: columns.length
  }, empty)) : sorted.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.id ?? i,
    "data-clickable": onRowClick ? '' : undefined,
    onClick: onRowClick ? () => onRowClick(r) : undefined
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      textAlign: c.align
    }
  }, c.render ? c.render(r) : r[c.key])))))));
}
Object.assign(__ds_scope, { DataTable });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/DataTable.jsx", error: String((e && e.message) || e) }); }

// components/data/Stat.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONE = {
  ink: {
    fg: 'var(--ink-700)',
    bg: 'var(--ink-50)'
  },
  stone: {
    fg: 'var(--stone-700)',
    bg: 'var(--stone-100)'
  },
  brick: {
    fg: 'var(--brick-700)',
    bg: 'var(--brick-50)'
  },
  success: {
    fg: 'var(--success-600)',
    bg: 'var(--success-50)'
  },
  sea: {
    fg: 'var(--sea-700)',
    bg: 'var(--sea-50)'
  },
  sun: {
    fg: 'var(--sun-600)',
    bg: 'var(--sun-100)'
  }
};
const CSS = `
.mk-stat {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: var(--space-4) var(--space-5);
  display: flex; flex-direction: column; gap: var(--space-3);
  font-family: var(--font-sans); min-width: 0;
}
.mk-stat__top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.mk-stat__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-muted); }
.mk-stat__ic { width: 34px; height: 34px; border-radius: 9px; display: grid; place-items: center; flex: none; }
.mk-stat__val {
  font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-2xl); line-height: var(--lh-none);
  letter-spacing: var(--tracking-tight); color: var(--text-strong);
}
.mk-stat__foot { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); font-weight: var(--fw-medium); color: var(--text-subtle); }
.mk-stat__delta { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: var(--radius-pill); font-size: var(--text-2xs); font-weight: var(--fw-semibold); }
.mk-stat__delta--up   { color: var(--success-600); background: var(--success-50); }
.mk-stat__delta--flat { color: var(--text-muted);  background: var(--stone-100); }
.mk-stat__delta--down { color: var(--danger-500);  background: var(--danger-50); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-stat-css')) {
  const el = document.createElement('style');
  el.id = 'mk-stat-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Stat({
  label,
  value,
  icon,
  tone = 'ink',
  delta,
  trend,
  note,
  className = '',
  ...rest
}) {
  const t = TONE[tone] || TONE.ink;
  const arrow = trend === 'up' ? 'arrow-up-right' : trend === 'down' ? 'arrow-down-right' : 'minus';
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-stat', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "mk-stat__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-stat__label"
  }, label), icon && /*#__PURE__*/React.createElement("span", {
    className: "mk-stat__ic",
    style: {
      background: t.bg,
      color: t.fg
    }
  }, typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 19
  }) : icon)), /*#__PURE__*/React.createElement("div", {
    className: "mk-stat__val"
  }, value), (delta != null || note) && /*#__PURE__*/React.createElement("div", {
    className: "mk-stat__foot"
  }, delta != null && /*#__PURE__*/React.createElement("span", {
    className: 'mk-stat__delta mk-stat__delta--' + (trend || 'flat')
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: arrow,
    size: 12
  }), delta), note && /*#__PURE__*/React.createElement("span", null, note)));
}
Object.assign(__ds_scope, { Stat });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Stat.jsx", error: String((e && e.message) || e) }); }

// components/data/Timeline.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONE = {
  ink: {
    fg: 'var(--ink-700)',
    bg: 'var(--ink-50)'
  },
  stone: {
    fg: 'var(--stone-700)',
    bg: 'var(--stone-100)'
  },
  brick: {
    fg: 'var(--brick-700)',
    bg: 'var(--brick-50)'
  },
  success: {
    fg: 'var(--success-600)',
    bg: 'var(--success-50)'
  },
  sea: {
    fg: 'var(--sea-700)',
    bg: 'var(--sea-50)'
  },
  sun: {
    fg: 'var(--sun-600)',
    bg: 'var(--sun-100)'
  }
};
const CSS = `
.mk-tl { display: flex; flex-direction: column; font-family: var(--font-sans); }
.mk-tl__row { display: flex; gap: var(--space-3); padding: var(--space-3) 0; position: relative; }
.mk-tl__row:not(:last-child)::before {
  content: ""; position: absolute; left: 16px; top: 36px; bottom: calc(-1 * var(--space-3));
  width: 1.5px; background: var(--border);
}
.mk-tl__ic {
  width: 33px; height: 33px; border-radius: var(--radius-full);
  display: grid; place-items: center; flex: none; z-index: 1;
  background: var(--ink-50); color: var(--ink-700);
}
.mk-tl__body { padding-top: 2px; min-width: 0; }
.mk-tl__text { margin: 0; font-size: var(--text-sm); line-height: var(--lh-normal); color: var(--text-body); }
.mk-tl__text b, .mk-tl__text strong { font-weight: var(--fw-semibold); color: var(--text-strong); }
.mk-tl__meta { margin-top: 3px; font-size: var(--text-2xs); font-weight: var(--fw-medium); color: var(--text-subtle); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-tl-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tl-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Vertical activity feed. items: [{ icon, tone, text, meta }].
 * Promoted from the CRM kit's Timeline, decoupled from lead types —
 * pass icon/tone per item.
 */
function Timeline({
  items = [],
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-tl', className].filter(Boolean).join(' ')
  }, rest), items.map((it, i) => {
    const t = TONE[it.tone] || TONE.ink;
    return /*#__PURE__*/React.createElement("div", {
      className: "mk-tl__row",
      key: it.id ?? i
    }, /*#__PURE__*/React.createElement("span", {
      className: "mk-tl__ic",
      style: {
        background: t.bg,
        color: t.fg
      }
    }, typeof it.icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon || 'circle',
      size: 16
    }) : it.icon || /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "circle",
      size: 16
    })), /*#__PURE__*/React.createElement("div", {
      className: "mk-tl__body"
    }, /*#__PURE__*/React.createElement("p", {
      className: "mk-tl__text"
    }, it.text), it.meta && /*#__PURE__*/React.createElement("div", {
      className: "mk-tl__meta"
    }, it.meta)));
  }));
}
Object.assign(__ds_scope, { Timeline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Timeline.jsx", error: String((e && e.message) || e) }); }

// components/display/Accordion.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-acc { display: flex; flex-direction: column; font-family: var(--font-sans); }
.mk-acc--card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-card); box-shadow: var(--shadow-card);
  padding: 0 var(--space-5);
}
.mk-acc__item { border-bottom: 1px solid var(--border); }
.mk-acc__item:last-child { border-bottom: 0; }
.mk-acc__head {
  display: flex; align-items: center; gap: var(--space-3); width: 100%;
  padding: var(--space-4) 0; border: 0; background: transparent; cursor: pointer;
  font-family: inherit; font-size: var(--text-base); font-weight: var(--fw-semibold);
  color: var(--text-strong); text-align: left;
  transition: color var(--dur-fast) var(--ease-standard);
}
.mk-acc__head:hover { color: var(--ink-950); }
.mk-acc__head:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }
.mk-acc__icon { color: var(--text-muted); display: inline-flex; flex: none; }
.mk-acc__chev { margin-left: auto; color: var(--text-muted); display: inline-flex; flex: none; transition: transform var(--dur-base) var(--ease-out); }
.mk-acc__item[data-open] .mk-acc__chev { transform: rotate(180deg); }
.mk-acc__panel { display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-base) var(--ease-out); }
.mk-acc__item[data-open] .mk-acc__panel { grid-template-rows: 1fr; }
.mk-acc__inner { overflow: hidden; }
.mk-acc__content {
  padding: 0 0 var(--space-4); max-width: 68ch;
  font-size: var(--text-sm); line-height: var(--lh-relaxed); color: var(--text-body);
}
.mk-acc__content > :first-child { margin-top: 0; }
.mk-acc__content > :last-child { margin-bottom: 0; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-acc-css')) {
  const el = document.createElement('style');
  el.id = 'mk-acc-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Expandable rows — FAQs, buying-process steps, listing feature groups.
 * items: [{ id, title, icon?, content }].
 */
function Accordion({
  items = [],
  multiple = false,
  defaultOpen = [],
  card = false,
  className = '',
  ...rest
}) {
  const [open, setOpen] = React.useState(() => new Set(defaultOpen));
  const toggle = id => {
    setOpen(prev => {
      const next = new Set(multiple ? prev : []);
      if (prev.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  };
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-acc', card ? 'mk-acc--card' : '', className].filter(Boolean).join(' ')
  }, rest), items.map((it, i) => {
    const id = it.id ?? i;
    const isOpen = open.has(id);
    return /*#__PURE__*/React.createElement("div", {
      className: "mk-acc__item",
      key: id,
      "data-open": isOpen ? '' : undefined
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "mk-acc__head",
      "aria-expanded": isOpen,
      onClick: () => toggle(id)
    }, it.icon && /*#__PURE__*/React.createElement("span", {
      className: "mk-acc__icon"
    }, typeof it.icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 18
    }) : it.icon), it.title, /*#__PURE__*/React.createElement("span", {
      className: "mk-acc__chev"
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: "chevron-down",
      size: 17
    }))), /*#__PURE__*/React.createElement("div", {
      className: "mk-acc__panel",
      "aria-hidden": !isOpen
    }, /*#__PURE__*/React.createElement("div", {
      className: "mk-acc__inner"
    }, /*#__PURE__*/React.createElement("div", {
      className: "mk-acc__content"
    }, it.content))));
  }));
}
Object.assign(__ds_scope, { Accordion });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Accordion.jsx", error: String((e && e.message) || e) }); }

// components/display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--font-sans); font-weight: var(--fw-semibold);
  font-size: var(--text-2xs); line-height: 1; letter-spacing: var(--tracking-caps);
  text-transform: uppercase; white-space: nowrap;
  padding: 5px 9px; border-radius: var(--radius-full);
  border: 1px solid transparent;
}
.mk-badge--md { font-size: var(--text-xs); padding: 6px 11px; }
.mk-badge .mk-icon { margin-left: -1px; }
.mk-badge__dot { width: 6px; height: 6px; border-radius: var(--radius-full); background: currentColor; }

/* Tonal (default) — soft tint + colored text */
.mk-badge--for-sale { background: var(--for-sale-bg); color: var(--for-sale-fg); }
.mk-badge--for-rent { background: var(--for-rent-bg); color: var(--for-rent-fg); }
.mk-badge--new      { background: var(--new-bg);      color: var(--new-fg); }
.mk-badge--reduced  { background: var(--reduced-bg);  color: var(--reduced-fg); }
.mk-badge--featured { background: var(--ink-100);     color: var(--ink-800); }
.mk-badge--sold     { background: var(--stone-200);   color: var(--stone-700); }
.mk-badge--neutral  { background: var(--surface-sunken); color: var(--text-muted); }

/* Solid — filled, for overlaying photography */
.mk-badge--solid { color: #fff; border-color: transparent; }
.mk-badge--solid.mk-badge--for-sale { background: var(--for-sale-fg); }
.mk-badge--solid.mk-badge--for-rent { background: var(--for-rent-fg); }
.mk-badge--solid.mk-badge--new      { background: var(--new-fg); }
.mk-badge--solid.mk-badge--reduced  { background: var(--reduced-fg); }
.mk-badge--solid.mk-badge--featured { background: var(--ink-800); }
.mk-badge--solid.mk-badge--sold     { background: var(--stone-700); }
.mk-badge--solid.mk-badge--neutral  { background: var(--stone-700); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-badge-css')) {
  const el = document.createElement('style');
  el.id = 'mk-badge-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Badge({
  variant = 'neutral',
  size = 'sm',
  solid = false,
  dot = false,
  icon,
  className = '',
  children,
  ...rest
}) {
  const cls = ['mk-badge', `mk-badge--${variant}`, `mk-badge--${size}`, solid ? 'mk-badge--solid' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "mk-badge__dot"
  }), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'md' ? 13 : 12,
    strokeWidth: 2.25
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/PropertyCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-pcard {
  display: flex; flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  overflow: hidden;
  box-shadow: var(--shadow-card);
  font-family: var(--font-sans);
  color: var(--text-body);
  transition: box-shadow var(--dur-base) var(--ease-standard),
              transform var(--dur-base) var(--ease-out),
              border-color var(--dur-fast) var(--ease-standard);
}
.mk-pcard--interactive:hover { box-shadow: var(--shadow-card-hover); transform: translateY(-3px); }

.mk-pcard__media { position: relative; display: block; aspect-ratio: 4 / 3; text-decoration: none; }
.mk-pcard__media .mk-pcard__badges {
  position: absolute; top: 12px; left: 12px; z-index: 2;
  display: flex; gap: 6px; flex-wrap: wrap;
}
.mk-pcard__save { position: absolute; top: 10px; right: 10px; z-index: 2; }
.mk-pcard__count {
  position: absolute; bottom: 12px; right: 12px; z-index: 2;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 9px; border-radius: var(--radius-full);
  background: rgba(22,19,14,0.55); color: #fff;
  font-size: var(--text-xs); font-weight: var(--fw-medium);
  -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px);
}

.mk-pcard__body { display: flex; flex-direction: column; gap: 7px; padding: 16px 16px 14px; }
.mk-pcard__pricerow { display: flex; align-items: baseline; gap: 6px; }
.mk-pcard__price {
  font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-2xl); color: var(--price);
  letter-spacing: var(--tracking-tight); line-height: 1;
}
.mk-pcard__per { color: var(--text-muted); font-size: var(--text-sm); font-weight: var(--fw-medium); }
.mk-pcard__title {
  font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-lg); color: var(--text-strong);
  line-height: var(--lh-snug); margin: 0;
}
.mk-pcard__loc { display: flex; align-items: center; gap: 5px; color: var(--text-muted); font-size: var(--text-sm); }
.mk-pcard__loc .mk-icon { color: var(--text-muted); flex: none; }
.mk-pcard__specs {
  display: flex; align-items: center; gap: 16px;
  margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border);
  color: var(--text-body); font-size: var(--text-sm);
}
.mk-pcard__specs span { display: inline-flex; align-items: center; gap: 6px; }
.mk-pcard__specs .mk-icon { color: var(--text-muted); flex: none; }
.mk-pcard__ref { margin-left: auto; font-family: var(--font-mono); font-size: var(--text-2xs); color: var(--text-subtle); letter-spacing: 0.02em; }

/* Horizontal (search-result row) */
.mk-pcard--row { flex-direction: row; }
.mk-pcard--row .mk-pcard__media { aspect-ratio: auto; flex: none; width: 38%; min-width: 210px; max-width: 340px; min-height: 190px; }
.mk-pcard--row .mk-pcard__body { flex: 1; padding: 18px 20px; gap: 8px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-pcard-css')) {
  const el = document.createElement('style');
  el.id = 'mk-pcard-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * badges: array of { variant, label } (e.g. [{variant:'for-sale',label:'For sale'}])
 * specs:  { beds, baths, area } — area in m²
 */
function PropertyCard({
  href = '#',
  image,
  tone = 'sea',
  badges = [],
  price,
  per,
  title,
  location,
  beds,
  baths,
  area,
  photos,
  reference,
  saved = false,
  onSave,
  orientation = 'vertical',
  className = '',
  ...rest
}) {
  const [isSaved, setSaved] = React.useState(saved);
  React.useEffect(() => setSaved(saved), [saved]);
  const mediaStyle = image ? {
    backgroundImage: `url(${image})`
  } : undefined;
  const cls = ['mk-pcard', orientation === 'horizontal' ? 'mk-pcard--row' : '', 'mk-pcard--interactive', className].filter(Boolean).join(' ');
  const handleSave = e => {
    e.preventDefault();
    e.stopPropagation();
    setSaved(s => !s);
    onSave && onSave(!isSaved);
  };
  return /*#__PURE__*/React.createElement("article", _extends({
    className: cls
  }, rest), /*#__PURE__*/React.createElement("a", {
    className: `mk-pcard__media mk-photo mk-photo--${tone}`,
    href: href,
    style: mediaStyle,
    "aria-label": title
  }, badges.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "mk-pcard__badges"
  }, badges.map((b, i) => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: i,
    variant: b.variant,
    solid: true
  }, b.label))), /*#__PURE__*/React.createElement("div", {
    className: "mk-pcard__save"
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: isSaved ? 'heart' : 'heart',
    label: isSaved ? 'Saved' : 'Save',
    variant: "glass",
    round: true,
    active: isSaved,
    onClick: handleSave
  })), photos != null && /*#__PURE__*/React.createElement("span", {
    className: "mk-pcard__count"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "camera",
    size: 13
  }), " ", photos)), /*#__PURE__*/React.createElement("div", {
    className: "mk-pcard__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mk-pcard__pricerow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-pcard__price"
  }, price), per && /*#__PURE__*/React.createElement("span", {
    className: "mk-pcard__per"
  }, per)), title && /*#__PURE__*/React.createElement("h3", {
    className: "mk-pcard__title"
  }, title), location && /*#__PURE__*/React.createElement("div", {
    className: "mk-pcard__loc"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "map-pin",
    size: 14
  }), " ", location), (beds != null || baths != null || area != null) && /*#__PURE__*/React.createElement("div", {
    className: "mk-pcard__specs"
  }, beds != null && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "bed",
    size: 16
  }), " ", beds), baths != null && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "bath",
    size: 16
  }), " ", baths), area != null && /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "ruler",
    size: 16
  }), " ", area, " m\xB2"), reference && /*#__PURE__*/React.createElement("span", {
    className: "mk-pcard__ref"
  }, reference))));
}
Object.assign(__ds_scope, { PropertyCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/PropertyCard.jsx", error: String((e && e.message) || e) }); }

// components/display/Rating.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-rating { display: inline-flex; align-items: center; gap: 8px; font-family: var(--font-sans); }
.mk-rating__stars { display: inline-flex; gap: 2px; color: var(--rating); }
.mk-rating__star { position: relative; display: inline-flex; color: var(--stone-300); }
.mk-rating__star .mk-rating__fill { position: absolute; inset: 0; overflow: hidden; color: var(--rating); }
.mk-rating__val { font-weight: var(--fw-semibold); font-size: var(--text-sm); color: var(--text-strong); }
.mk-rating__count { font-size: var(--text-sm); color: var(--text-muted); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-rating-css')) {
  const el = document.createElement('style');
  el.id = 'mk-rating-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Star({
  fill,
  size
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "mk-rating__star"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "star",
    size: size,
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mk-rating__fill",
    style: {
      width: `${Math.round(fill * 100)}%`
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "star",
    size: size,
    fill: "currentColor",
    stroke: "none"
  })));
}
function Rating({
  value = 0,
  max = 5,
  size = 16,
  showValue = false,
  count,
  className = '',
  ...rest
}) {
  const stars = [];
  for (let i = 0; i < max; i++) {
    stars.push(/*#__PURE__*/React.createElement(Star, {
      key: i,
      size: size,
      fill: Math.max(0, Math.min(1, value - i))
    }));
  }
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['mk-rating', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "mk-rating__stars",
    "aria-label": `${value} out of ${max}`
  }, stars), showValue && /*#__PURE__*/React.createElement("span", {
    className: "mk-rating__val"
  }, value.toFixed(1)), count != null && /*#__PURE__*/React.createElement("span", {
    className: "mk-rating__count"
  }, "(", count, ")"));
}
Object.assign(__ds_scope, { Rating });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Rating.jsx", error: String((e && e.message) || e) }); }

// components/display/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-tag {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: var(--font-sans); font-weight: var(--fw-medium);
  font-size: var(--text-sm); line-height: 1; white-space: nowrap;
  padding: 7px 12px; border-radius: var(--radius-full);
  border: 1px solid transparent; color: var(--text-body);
}
.mk-tag--sm { font-size: var(--text-xs); padding: 5px 10px; gap: 5px; }
.mk-tag .mk-icon { color: var(--text-muted); flex: none; }

.mk-tag--neutral { background: var(--surface-sunken); }
.mk-tag--outline { background: var(--surface); border-color: var(--border); }
.mk-tag--brand   { background: var(--brand-subtle); color: var(--brand); }
.mk-tag--brand .mk-icon { color: var(--brand); }

.mk-tag--interactive { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard); }
.mk-tag--interactive:hover { background: var(--surface-hover); border-color: var(--border-strong); }

.mk-tag__x {
  display: inline-flex; margin: -2px -4px -2px 0; padding: 2px; border: none;
  background: transparent; color: var(--text-muted); cursor: pointer; border-radius: var(--radius-full);
}
.mk-tag__x:hover { color: var(--text-strong); background: rgba(0,0,0,0.05); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-tag-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tag-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Tag({
  variant = 'neutral',
  size = 'md',
  icon,
  onRemove,
  onClick,
  className = '',
  children,
  ...rest
}) {
  const interactive = !!onClick;
  const cls = ['mk-tag', `mk-tag--${variant}`, `mk-tag--${size}`, interactive ? 'mk-tag--interactive' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    onClick: onClick
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 13 : 15
  }), children, onRemove && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mk-tag__x",
    "aria-label": "Remove",
    onClick: e => {
      e.stopPropagation();
      onRemove(e);
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 13,
    strokeWidth: 2.25
  })));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Tag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Alert.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-alert {
  display: flex; gap: var(--space-3); align-items: flex-start;
  padding: var(--space-3) var(--space-4);
  border: 1px solid; border-radius: var(--radius-md);
  font-family: var(--font-sans); font-size: var(--text-sm); line-height: var(--lh-normal);
}
.mk-alert__icon { flex: none; display: inline-flex; margin-top: 1px; }
.mk-alert__body { flex: 1; min-width: 0; }
.mk-alert__title { font-weight: var(--fw-semibold); color: var(--text-strong); }
.mk-alert__title + .mk-alert__text { margin-top: 2px; }
.mk-alert__text { color: var(--text-body); }
.mk-alert__actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); }
.mk-alert__actions a, .mk-alert__actions button.mk-alert__link {
  font: inherit; font-weight: var(--fw-semibold); color: inherit;
  background: none; border: 0; padding: 0; cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
}
.mk-alert__close {
  flex: none; display: grid; place-items: center; width: 26px; height: 26px;
  margin: -3px -6px -3px 0; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.mk-alert__close:hover { background: rgba(22, 19, 14, 0.07); color: var(--text-strong); }
.mk-alert__close:focus-visible { outline: none; box-shadow: var(--shadow-focus); }

.mk-alert--info    { background: var(--ink-50);     border-color: var(--ink-200);     }
.mk-alert--info    .mk-alert__icon { color: var(--ink-600); }
.mk-alert--success { background: var(--success-50); border-color: rgba(47,125,87,.28); }
.mk-alert--success .mk-alert__icon { color: var(--success-600); }
.mk-alert--warning { background: var(--warning-50); border-color: rgba(192,132,34,.32); }
.mk-alert--warning .mk-alert__icon { color: var(--warning-600); }
.mk-alert--danger  { background: var(--danger-50);  border-color: rgba(196,46,68,.28); }
.mk-alert--danger  .mk-alert__icon { color: var(--danger-600); }
.mk-alert--danger  .mk-alert__title { color: var(--danger-600); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-alert-css')) {
  const el = document.createElement('style');
  el.id = 'mk-alert-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
const DEFAULT_ICON = {
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert'
};
function Alert({
  variant = 'info',
  title,
  icon,
  onDismiss,
  actions,
  className = '',
  children,
  ...rest
}) {
  const glyph = icon === false ? null : icon || DEFAULT_ICON[variant] || 'info';
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-alert', `mk-alert--${variant}`, className].filter(Boolean).join(' '),
    role: variant === 'danger' || variant === 'warning' ? 'alert' : 'status'
  }, rest), glyph && /*#__PURE__*/React.createElement("span", {
    className: "mk-alert__icon"
  }, typeof glyph === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: glyph,
    size: 18
  }) : glyph), /*#__PURE__*/React.createElement("div", {
    className: "mk-alert__body"
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "mk-alert__title"
  }, title), children != null && /*#__PURE__*/React.createElement("div", {
    className: "mk-alert__text"
  }, children), actions && /*#__PURE__*/React.createElement("div", {
    className: "mk-alert__actions"
  }, actions)), onDismiss && /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mk-alert__close",
    "aria-label": "Dismiss",
    onClick: onDismiss
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 15
  })));
}
Object.assign(__ds_scope, { Alert });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Alert.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-empty {
  display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: var(--space-10) var(--space-6);
  font-family: var(--font-sans);
}
.mk-empty--sm { padding: var(--space-6) var(--space-4); }
.mk-empty__icon {
  display: grid; place-items: center;
  width: 56px; height: 56px; border-radius: var(--radius-full);
  background: var(--surface-sunken); color: var(--stone-500);
  margin-bottom: var(--space-4);
}
.mk-empty--sm .mk-empty__icon { width: 44px; height: 44px; margin-bottom: var(--space-3); }
.mk-empty__title {
  margin: 0; font-family: var(--font-display); font-weight: var(--fw-semibold);
  font-size: var(--text-lg); letter-spacing: var(--tracking-tight); color: var(--text-strong);
}
.mk-empty__text {
  margin: var(--space-2) 0 0; max-width: 44ch;
  font-size: var(--text-sm); line-height: var(--lh-normal); color: var(--text-muted);
}
.mk-empty__actions { display: flex; gap: var(--space-3); margin-top: var(--space-5); flex-wrap: wrap; justify-content: center; }
.mk-empty--sm .mk-empty__actions { margin-top: var(--space-4); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-empty-css')) {
  const el = document.createElement('style');
  el.id = 'mk-empty-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function EmptyState({
  icon = 'search-x',
  title,
  size = 'md',
  actions,
  className = '',
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-empty', size === 'sm' ? 'mk-empty--sm' : '', className].filter(Boolean).join(' ')
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "mk-empty__icon"
  }, typeof icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === 'sm' ? 20 : 24
  }) : icon), title && /*#__PURE__*/React.createElement("h3", {
    className: "mk-empty__title"
  }, title), children != null && /*#__PURE__*/React.createElement("p", {
    className: "mk-empty__text"
  }, children), actions && /*#__PURE__*/React.createElement("div", {
    className: "mk-empty__actions"
  }, actions));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function Modal({
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
    const onKey = e => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "mk-modal-root",
    role: "presentation"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mk-modal__scrim",
    onClick: closeOnScrim && onClose ? onClose : undefined
  }), /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-modal', `mk-modal--${size}`, className].filter(Boolean).join(' '),
    role: "dialog",
    "aria-modal": "true",
    "aria-label": typeof title === 'string' ? title : undefined
  }, rest), (title || eyebrow || onClose) && /*#__PURE__*/React.createElement("div", {
    className: "mk-modal__head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "mk-modal__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("h2", {
    className: "mk-modal__title"
  }, title), subtitle && /*#__PURE__*/React.createElement("p", {
    className: "mk-modal__sub"
  }, subtitle)), onClose && /*#__PURE__*/React.createElement("span", {
    className: "mk-modal__close"
  }, /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "x",
    variant: "ghost",
    "aria-label": "Close",
    onClick: onClose
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mk-modal__body"
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    className: "mk-modal__foot"
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-check { display: inline-flex; align-items: flex-start; gap: var(--space-2); font-family: var(--font-sans); font-size: var(--text-base); color: var(--text-body); cursor: pointer; -webkit-user-select: none; user-select: none; }
.mk-check__native { position: absolute; opacity: 0; width: 0; height: 0; }
.mk-check__box {
  flex: none; width: 20px; height: 20px; margin-top: 1px;
  display: grid; place-items: center;
  background: var(--surface); border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-xs); color: #fff;
  transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.mk-check__box .mk-icon { opacity: 0; transform: scale(0.6); transition: opacity var(--dur-fast) var(--ease-standard), transform var(--dur-fast) var(--ease-out); }
.mk-check:hover .mk-check__box { border-color: var(--stone-400); }
.mk-check__native:checked + .mk-check__box { background: var(--brand); border-color: var(--brand); }
.mk-check__native:checked + .mk-check__box .mk-icon { opacity: 1; transform: scale(1); }
.mk-check__native:indeterminate + .mk-check__box { background: var(--brand); border-color: var(--brand); }
.mk-check__native:focus-visible + .mk-check__box { box-shadow: var(--shadow-focus); }
.mk-check__label { line-height: 1.35; padding-top: 1px; }
.mk-check--disabled { opacity: 0.5; cursor: not-allowed; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-check-css')) {
  const el = document.createElement('style');
  el.id = 'mk-check-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Checkbox({
  label,
  disabled = false,
  indeterminate = false,
  className = '',
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return /*#__PURE__*/React.createElement("label", {
    className: ['mk-check', disabled ? 'mk-check--disabled' : '', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    ref: ref,
    type: "checkbox",
    className: "mk-check__native",
    disabled: disabled
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "mk-check__box"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 14,
    strokeWidth: 3
  })), label && /*#__PURE__*/React.createElement("span", {
    className: "mk-check__label"
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-input { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-input__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-input__label .mk-req { color: var(--accent); margin-left: 2px; }
.mk-input__field {
  display: flex; align-items: center; gap: var(--space-2);
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-input); color: var(--text-body);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.mk-input__field:focus-within { border-color: var(--brand); box-shadow: var(--shadow-focus); }
.mk-input__field > .mk-icon { color: var(--text-muted); flex: none; }
.mk-input__el { flex: 1; min-width: 0; border: none; background: transparent; outline: none; color: var(--text-strong); font: inherit; }
.mk-input__el::placeholder { color: var(--text-subtle); }

.mk-input--sm .mk-input__field { height: 36px; padding: 0 var(--space-3); }
.mk-input--md .mk-input__field { height: 44px; padding: 0 var(--space-3); }
.mk-input--lg .mk-input__field { height: 52px; padding: 0 var(--space-4); font-size: var(--text-md); }

.mk-input--error .mk-input__field { border-color: var(--danger-500); }
.mk-input--error .mk-input__field:focus-within { box-shadow: 0 0 0 3px rgba(178,58,44,0.28); }

.mk-input--disabled { opacity: 0.6; }
.mk-input--disabled .mk-input__field { background: var(--surface-sunken); cursor: not-allowed; }

.mk-input__msg { font-size: var(--text-xs); color: var(--text-muted); }
.mk-input__msg--error { color: var(--danger-600); font-weight: var(--fw-medium); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-input-css')) {
  const el = document.createElement('style');
  el.id = 'mk-input-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
let _uid = 0;
function Input({
  label,
  hint,
  error,
  iconStart,
  iconEnd,
  size = 'md',
  required = false,
  disabled = false,
  id,
  className = '',
  ...rest
}) {
  const [autoId] = React.useState(() => id || `mk-input-${++_uid}`);
  const glyph = size === 'lg' ? 20 : 18;
  const cls = ['mk-input', `mk-input--${size}`, error ? 'mk-input--error' : '', disabled ? 'mk-input--disabled' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "mk-input__label",
    htmlFor: autoId
  }, label, required && /*#__PURE__*/React.createElement("span", {
    className: "mk-req"
  }, "*")), /*#__PURE__*/React.createElement("div", {
    className: "mk-input__field"
  }, iconStart && (typeof iconStart === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconStart,
    size: glyph
  }) : iconStart), /*#__PURE__*/React.createElement("input", _extends({
    id: autoId,
    className: "mk-input__el",
    disabled: disabled,
    required: required,
    "aria-invalid": error ? true : undefined
  }, rest)), iconEnd && (typeof iconEnd === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconEnd,
    size: glyph
  }) : iconEnd)), (error || hint) && /*#__PURE__*/React.createElement("span", {
    className: 'mk-input__msg' + (error ? ' mk-input__msg--error' : '')
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-search { font-family: var(--font-sans); display: flex; flex-direction: column; gap: var(--space-3); }
.mk-search__deals { display: inline-flex; gap: 4px; background: var(--surface-sunken); border: 1px solid var(--border); border-radius: var(--radius-full); padding: 4px; align-self: flex-start; }
.mk-search__deal { border: none; background: transparent; font: inherit; font-weight: var(--fw-medium); font-size: var(--text-sm); color: var(--text-muted); padding: 7px 16px; border-radius: var(--radius-full); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); }
.mk-search__deal:hover { color: var(--text-strong); }
.mk-search__deal[aria-selected="true"] { background: var(--surface); color: var(--brand); box-shadow: var(--shadow-xs); font-weight: var(--fw-semibold); }

.mk-search__bar { display: flex; align-items: center; gap: var(--space-1); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); padding: 8px; }
.mk-search__seg { display: flex; align-items: center; gap: var(--space-3); padding: 6px var(--space-4); min-width: 0; border-radius: var(--radius-lg); position: relative; }
.mk-search__seg:hover { background: var(--surface-hover); }
.mk-search__seg--grow { flex: 1 1 40%; }
.mk-search__seg > .mk-icon { color: var(--text-muted); flex: none; }
.mk-search__field { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.mk-search__field label { font-size: 11px; font-weight: var(--fw-semibold); letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-muted); }
.mk-search__field input, .mk-search__field select { border: none; background: transparent; outline: none; font: inherit; font-size: var(--text-md); font-weight: var(--fw-medium); color: var(--text-strong); padding: 0; min-width: 0; width: 100%; -webkit-appearance: none; appearance: none; cursor: pointer; }
.mk-search__field input { cursor: text; }
.mk-search__field input::placeholder { color: var(--text-subtle); font-weight: var(--fw-regular); }
.mk-search__seg select + .mk-icon { position: absolute; right: 10px; bottom: 10px; color: var(--text-muted); pointer-events: none; }
.mk-search__divider { width: 1px; align-self: stretch; margin: 10px 0; background: var(--border); flex: none; }
.mk-search__go { flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; cursor: pointer; background: var(--accent); color: #fff; font: inherit; font-weight: var(--fw-semibold); font-size: var(--text-md); height: 58px; padding: 0 24px; border-radius: var(--radius-lg); transition: background-color var(--dur-fast) var(--ease-standard); }
.mk-search__go:hover { background: var(--accent-hover); }
.mk-search__go:active { background: var(--accent-active); }

.mk-search--md .mk-search__bar { border-radius: var(--radius-lg); }
.mk-search--md .mk-search__seg { padding: 4px var(--space-3); }
.mk-search--md .mk-search__go { height: 46px; padding: 0 18px; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-search-css')) {
  const el = document.createElement('style');
  el.id = 'mk-search-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
const DEFAULT_DEALS = [{
  value: 'buy',
  label: 'Купува',
  icon: 'key'
}, {
  value: 'rent',
  label: 'Под наем',
  icon: 'calendar'
}, {
  value: 'holiday',
  label: 'Ваканционни',
  icon: 'sun'
}];
function SearchBar({
  deals = DEFAULT_DEALS,
  defaultDeal,
  showDeals = true,
  locationPlaceholder = 'Къде? напр. Сандански, Банско, Свети Влас',
  types = ['Всички', 'Апартамент', 'Къща', 'Вила', 'Студио', 'Парцел'],
  prices = ['Без лимит', '€50,000', '€100,000', '€200,000', '€350,000', '€500,000+'],
  size = 'lg',
  onSearch,
  className = '',
  ...rest
}) {
  const [deal, setDeal] = React.useState(defaultDeal || deals[0]?.value);
  const [state, setState] = React.useState({
    location: '',
    type: types[0],
    price: prices[0]
  });
  const upd = k => e => setState(s => ({
    ...s,
    [k]: e.target.value
  }));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-search', `mk-search--${size}`, className].filter(Boolean).join(' ')
  }, rest), showDeals && /*#__PURE__*/React.createElement("div", {
    className: "mk-search__deals",
    role: "tablist",
    "aria-label": "\u0422\u0438\u043F \u0441\u0434\u0435\u043B\u043A\u0430"
  }, deals.map(d => /*#__PURE__*/React.createElement("button", {
    key: d.value,
    type: "button",
    role: "tab",
    "aria-selected": deal === d.value,
    className: "mk-search__deal",
    onClick: () => setDeal(d.value)
  }, d.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: d.icon,
    size: 15
  }), d.label))), /*#__PURE__*/React.createElement("div", {
    className: "mk-search__bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mk-search__seg mk-search__seg--grow"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "map-pin",
    size: 20
  }), /*#__PURE__*/React.createElement("div", {
    className: "mk-search__field"
  }, /*#__PURE__*/React.createElement("label", null, "\u041B\u043E\u043A\u0430\u0446\u0438\u044F"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: state.location,
    onChange: upd('location'),
    placeholder: locationPlaceholder
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mk-search__divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mk-search__seg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mk-search__field"
  }, /*#__PURE__*/React.createElement("label", null, "\u0422\u0438\u043F"), /*#__PURE__*/React.createElement("select", {
    value: state.type,
    onChange: upd('type')
  }, types.map(t => /*#__PURE__*/React.createElement("option", {
    key: t
  }, t)))), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "mk-search__divider"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mk-search__seg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mk-search__field"
  }, /*#__PURE__*/React.createElement("label", null, "\u041C\u0430\u043A\u0441. \u0446\u0435\u043D\u0430"), /*#__PURE__*/React.createElement("select", {
    value: state.price,
    onChange: upd('price')
  }, prices.map(p => /*#__PURE__*/React.createElement("option", {
    key: p
  }, p)))), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mk-search__go",
    onClick: () => onSearch && onSearch({
      deal,
      ...state
    })
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 20,
    strokeWidth: 2.25
  }), size === 'lg' && /*#__PURE__*/React.createElement("span", null, "\u0422\u044A\u0440\u0441\u0438"))));
}
Object.assign(__ds_scope, { SearchBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchBar.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-select { display: flex; flex-direction: column; gap: var(--space-2); font-family: var(--font-sans); }
.mk-select__label { font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.mk-select__field {
  position: relative; display: flex; align-items: center;
  background: var(--surface); border: 1px solid var(--border-strong);
  border-radius: var(--radius-input);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.mk-select__field:focus-within { border-color: var(--brand); box-shadow: var(--shadow-focus); }
.mk-select__lead { color: var(--text-muted); display: flex; align-items: center; padding-left: var(--space-3); }
.mk-select__el {
  appearance: none; -webkit-appearance: none; -moz-appearance: none;
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  color: var(--text-strong); font: inherit; cursor: pointer;
  padding: 0 var(--space-8) 0 var(--space-3);
}
.mk-select__lead + .mk-select__el { padding-left: var(--space-2); }
.mk-select__chev { position: absolute; right: var(--space-3); color: var(--text-muted); pointer-events: none; }

.mk-select--sm .mk-select__el { height: 36px; }
.mk-select--md .mk-select__el { height: 44px; }
.mk-select--lg .mk-select__el { height: 52px; font-size: var(--text-md); }

.mk-select--placeholder .mk-select__el { color: var(--text-subtle); }
.mk-select--disabled { opacity: 0.6; }
.mk-select--disabled .mk-select__field { background: var(--surface-sunken); }
.mk-select--disabled .mk-select__el { cursor: not-allowed; }
.mk-select__msg { font-size: var(--text-xs); color: var(--text-muted); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-select-css')) {
  const el = document.createElement('style');
  el.id = 'mk-select-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
let _uid = 0;
function Select({
  label,
  hint,
  placeholder,
  iconStart,
  options,
  size = 'md',
  disabled = false,
  value,
  defaultValue,
  id,
  className = '',
  children,
  ...rest
}) {
  const [autoId] = React.useState(() => id || `mk-select-${++_uid}`);
  const isControlled = value !== undefined;
  const isEmpty = isControlled ? value === '' || value == null : defaultValue === undefined && placeholder;
  const cls = ['mk-select', `mk-select--${size}`, isEmpty ? 'mk-select--placeholder' : '', disabled ? 'mk-select--disabled' : '', className].filter(Boolean).join(' ');
  const glyph = size === 'lg' ? 20 : 18;
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "mk-select__label",
    htmlFor: autoId
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "mk-select__field"
  }, iconStart && /*#__PURE__*/React.createElement("span", {
    className: "mk-select__lead"
  }, typeof iconStart === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconStart,
    size: glyph
  }) : iconStart), /*#__PURE__*/React.createElement("select", _extends({
    id: autoId,
    className: "mk-select__el",
    disabled: disabled,
    value: value,
    defaultValue: defaultValue ?? (placeholder ? '' : undefined)
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder), options ? options.map(o => typeof o === 'string' ? /*#__PURE__*/React.createElement("option", {
    key: o,
    value: o
  }, o) : /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label)) : children), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 18,
    className: "mk-select__chev"
  })), hint && /*#__PURE__*/React.createElement("span", {
    className: "mk-select__msg"
  }, hint));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/general/Logo.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Logo — the MS Realty brand mark (red "MS" monogram + charcoal "REAL·TY",
 * with a "makler real estate" tagline). Brand reds/charcoal: Jasper #DB3E3E,
 * Apple Valley #ED8484, Bauhaus #3F3F3F.
 *
 * SOURCE: the live site's logo.png (172x88), fetched and EMBEDDED here as a
 * data URI so the mark is fully self-contained: it renders offline, survives
 * PPTX/PDF export, and needs no asset path — no hotlink, no cross-origin.
 *
 *   - variant="default"  full colour, for light surfaces (header, light bands)
 *   - variant="reversed" red MS kept + warm-white "REALTY", for dark surfaces
 *                         (Ink footer, photo hero). Pass a custom `src` to override.
 *
 * The originals also live at assets/logo-ms-realty.png and
 * assets/logo-ms-realty-reversed.png for download / hand-off.
 */
const LOGO_SRC = 'data:image/png;base64,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';
const LOGO_SRC_REVERSED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKwAAABYCAYAAABoMhzXAAAQAElEQVR4Aex9CZwU1bX+OVXdPT3d07MAw75LogIKiuKCIsaFPyTRGJVoTEzyTNySmMWnuERD3GI05sU9MS7xuYvJc0HN8xlFcVdcARURRgGBGZbZerpnuqvu//tudw0946BD64vo6/nVqXvvuWere786devWMDhSxE/jz372aOMvfpFqOvXUVCOo6bTTUs2nn55qIp1xRqqZdOaZqSZQ81lnpZpAzWefnQro9WOPTT112GGppw8//M9mzpyiYmDYa//934/beNZZrRvhbwN8kBpQXw/aAGK9YfbsFKk+XzYgxk5C3G/96Eep+Yhl/pFHHkSbJdq2R6AosKhIGS4rijLKUoyxpW2j3lmizn5Vtf2skxKxWNRHnxHZ86nFi4eCV9ThiuwF33Frn/Z8P4oLsnF5IlEFT+AbfqKQyxH4bJMsD204jzq+D1XUSsc2PQJFTRLAZvAjvu8LDRhcItsAgACsKMixTEFDICi2BEsdR+IVFVYOzR3E876McqsPZMmEhEK7065nDFz4qKJE3SAuBTEK3/MEwLX+GSP7ICyW4BXXgnPp+LyMAPG21bFSiSBAZssBD+AgUNkGaqw9gsNWcOrk58EUCYclXl4uAE8EfXsDWFSXrfnxstn9HGNGQ1cEdmmAMbFO34wRN0MOrAQtYwTZfpS82TrltsZxSfYzHQE7r8VGQGVOvKOKhJXLcKqATh5AgjpaKNQSwaJwRnkC1mY3YyYt/PrXy8HeqiMkMs54XgUcwyxgCxCyTpCCIbgZrD1mWh81gtODDEvGoO3tYlIp8ZNJyTY3i1NeXgex0rGNjwAxt/UhApBUCsDKOkEo4ANEbNqsxwqBw8cySwsUyKiqxCoqJC/7lVQ4PJCyvSVz/PFhyO4AEtrF+lMIRJzIsr7JJ9mbAkC1ffDNMp1Oiw4fLuExY6R83DiJ77CDTLnkkpU55dL5sxmB3nktCrCqmnvUwkcnUAJQgKcge5CHiqqKogwOgrs8EpEYlgUAcwUANzXo601ZX16+I/zuT/AxqxKUzKQEKHm2ngen9Ys4WNJvCLG889pr0n/2bO3zy1/qqF/9Sve6+mrVwYPbeuO7JPPZjkBRgCUwCAACgwBhGwCymY1tZl4CiTJss24vEyCinMlmJQzgxKJRsS9MIvvY/l6eYGOUAmIEoPWBNSpjsH5Qx00gdmmAOn0p/Prw6WUyNkbXKeqyexldSex/cwSKmzlkLAIEwBELEgACL0DAphEaJBFI7CcfHVaOOgQSS9dxJARSgAryU7EKpYr05sdVHQ3hMEFobw74pw/W6ZP2CVpSUGdJ4NplCIHbG0clmW1uBICV4mIiMIIMa0uYITjJJ4gJFpYEEksChYCx7TzAKmMxKXNdAfBGPXnYYfvDxMce9SefPBCg/xbtWRAGNw+AT/vk04eto48l/cOHMKZsR4eMxrp17ezZZu2vfmWWnXuuefr4441ZubL8Y52XBD7zESgOsACHBSfC52MZhRA8tkQfAWINAzA266EkcCyY0M+SFAmFJIQtLsiEsI7di/ofR47jVOOmGGv9wS5BqCjpk4TMK7Rt+bgxPPiDfbEyrIPnwmf6vffkrTVrZMx55+mU665THTYs9XG+S/2f/QhYXG11GApYYOIVRGAQKCQCRcADoMTW80BS8NjPkkALwBNFdg0BtOShf7/exOG3t49C0AkuJaCzeakBX4yFa1bLBzhZV6xdFUsALDkQGj4soG2QZQ2uQbEk6Y3PkswnG4FPUxtzX4Q5AJDgYOYCCqQLATgEK0FrgYM2H8fk4VEu5BGg1KdeAi9ejusK9kh3WjBz5kd+9TJz5oQAvEOoS3sBIAUgpA/a9wlOtFlXghbEOE2eb/UQE9tZlEVcfUnlMxyB4gALEARZkgAg8AhCWycISJQBsAkaPO6F2ZVgpR7lWBJcibIyu2MAgPUDaKd91FhsfOedGAKeQZu0QXsEI0vGABudNwTtENjk0ZeNj/EQzCAX22rDkGmXnX++efYnPzFmxQr+vgPVSrQNjwDmv4joMPHUIhAIFgLIIUABVAKTRD4BY4ECPgFm23k5ttkXxWM5Lx9yjdmNdrdEHaHQMGTuERaEiIH69ENbzLK2Dl/sZwYN+rlPSx5lCHDK02cMwG164gnZsGCB/PPkk0dvyW+Jv+2MQHGABeg46Xg824xmgQgAWcCgj0DGKtdmVYKGsvaSASYChnL2pQ1tZt84six5yLDjnjrkkISV7eEEu98g8GjD+uRjHv6sfdgij2tWlvRLm5QNdNgOiHy+kDnwHampEdPaOqwHlyXWNjYCxQGW4AQRbAQDH8cEDYmA4NqS/KAs5Fl+HmR8GSJwqrGOReYk+Me3t7buvqUxAsgPpj4zOrOllcvbom9LiMv2A8Bs0z4BbGOALNe6to06QY2bBF2+CF7+rL3SaZseAaeo6AAGZDvhhBNoFhQACuuWRzDgcQskCOUIMhIBRKCx9NBvwYIsWY6XLj6ikfEqEc/OoA8ddd/5ziDYH0/A0Yf1Cd0sfYEsHyW/ZrFOoh+7NICc9QufjIn6nX3QYTvLvg95LTE+egT+9b3FARbgtBOPyRbUfQDC428/oc3sxuUAQUCwEliUIWAtQZ665LGfcqzH8RJEEEkms+vdRx4Z6T4UZdnsdIAuARLKMTtTvzWZFGZMa4f+YR/AFsqRb33hBmOdegQw4yWgubalno2xu8NSe5scgeIBC3DYK8qXTW1tQkB2AgAgIUC4piTfAgdgYmmXCui3fGQ2Li0qsZlPAAG8u1etWzfE2i44OZnMbugL82YgGFG3/pKplAUwbdE3fdo6dGmX/qws/NEvZRR1EtvsszqIAyqlYxsfgaIAy2yFVZ8FDNaVEgIQGzZuFH72JCAsoABkAoGyQWn5BAYAwzr5BAzBE8MakpkRL3I7AJxd9mM/+PrXY54x+/jQzSKbMyPSbgfqzem0jcP6pU/Ypl2CkTwuEbDUEMrTvtWFDHn0zZJyBPk2Plel8DACRQHWTi7AwZLAJRDS2NNsB4CY0QgAEvtJBAtLAsTyARgCijwCiuDlJ94KrGX5uPZEpswR6YxNRXbHUmNooEvgsp4kWHGzKOwRiFwX0xf7bBsxKrbN+GWLdqlHn5THFhpf8nJgx0BQF0Xp2MZHoBMUWxMnAUpAsCQYCD62N7a22pcsgEtI5BOkBAjBQiIwbAYEmFi3fahHADy+fPFFDI/y/XeZMiUexAQQjseNUENgW5sAKO23YjkQZFyuTQO7LLEWFt4MPm4kAhigF5bsYxx8WWPJuMkPfJXKbXsEigMsAKYAGICUy1IAEAAl61tachkL/Z0gYB1EecuDLEHDOkFEwBCkqioVWMfyJgBvj0h7+2AOnZk0Kayq0wBuJ9ChLwKulWBEHARvkDl5A1COugC+CPqtTSwnWCdRhjos2aY8ZLLUIeETsGOOPNL9YObM3epmzDhm1YwZF9RNn3573UEH3f3ugQfOW3bAAQ8t3n//e17YZ5+rXpgy5ap5EyZMv2f8+N0e3GWXEXhhdAufDrT3eaRtNeaiAMtJJmgIQr4o5SdcUum0AdmJB+iEMrYPgLXgzoOGgCXAbIYDj33MkBFVyf+6YRgyUzhoawYOHAPZXQgugBZVT9BHX5KBLoAGN1iY4EagT7smhT8whbHRhwK0tMW4A3mWvFGYgduxtNhu8ODaTd/85ohV06eft/aFF15t6OhoCIXDC+Lh8F/LwuGzY5HI0fjAcWQiGv1qZXn5jNp4/PAR1dU/Hg6aNHTo/XsMGbJgh5qaJTuuWbN+v113ffX+8eMvnzt27DF37rDDl2/eYYe+WJvz/rRhdD8Zs7J806ZN1Rs3bqzqTuRv2LCB233d1eT4448Ps78nop2AT/05c+Y4hQamTZsWamxsrAlkKN9dhvLkUT+QY5387nQkbnDaCOR6U9K/qa+v6G6rMLampqY+vM5ApstFBMyPLQEOBQgIRgsCtqGEdaLfnEq1k09QETwEESbL/hMZAoiPdNsHHcrZWUSdskilEoZdK2eM/e0tyA+BHEkcA0sAKTNnG0DJvVMCGf0IA32wg4qQeBMwRtbt0gB6iE/IZ0ysG2zFlSUSMrC6WuKqV2c8ry4UCp3jOM5O8FuDOKOwHQJZm7RlCX4IeJLiukMikTLHiSYikdiARKJ6/IABO00ePPiUibW1tw6tqHg7qvrorV/60iW3jBmzK8S7HEdiottao6dH3Oy8SMh7IKCykDePRH405P8t2dJwTlvzur0JoMDAf1x6wUERN/MQZB7oTnld8DMPRcP+rWf8/MSRgR7LeffNnRV2Mv+IuN6DlkLe/af98ieHsK+Qzvj5SaOiEe+enB/a8m4q7A/qN9105dhoyLs3J4drcbPwbWleJFdnCbLxwm92Hvw/3BbVu5LJ+l0COywfvP+e36DPyoQ088Dlv/vNEPJJRQGWL0h5UOUmEhNIcGSAhI3JZIuizYmlDFiCiRdmR4KFTg1PkKEc+ewncR1bEewWeN5BD+2xR6V43i7QI3CsHYEeMytfuJghsXuwlI93goc+aYcytg6Q0ocS6Hlim0Dll62KHXeUwQArACZRz+tDENt++KAObQZgpd2gTtvsJ9EXs7iVxXWx5M1HmWrsLe+Iz74Do9GJuBn+HbL/0X25UFNT44gR/g7FFIB/34Bgiv9siDQFd/uBkDnPiDP/tF+efAZAHkG/iOMAhLoX6pTbAtn+/Txx+0DOHtB38TA7Bo3JmMC9SSoyVcQ/FrwuhydOlRg9SIR2LNGPdP9xjdsH8zpNrJxMkdw/e6JsUGeJa9Tx6NsexPYeKGearJ7OmFCXlpaN6DezUUdssGNM2+nnXrQGbXs49ryVJwBIOIGYAGGdE0RwImA31dGxBhO7LABqIMMS4BMP604CAxnM6jJbkm9fqHxf+OIVRjy+SHXc876hyLS0D5tCnwrgcTuLuxKw6aP9JEqhPu0wCzMmyrLNPsgI24hPsngxjIwaJZVjx0oUgA6h3cE9ZPimPGUUdQJP4QsTCbyIcKB4Y/Blzsohw9M25QSzT4CSGKfVgy7HwENpZXBNOJyxIiof+tHe/vJ4WETn3HjjNZxsEeO3S29/wsYLRG+44fIa1O0TDGXBoRNSm9bgJtjMMiHfQ8TYZM/zjPTs0xhMWV7mo4v7EPi1hSKOyldv+sufvkKeY7K/QemCeKRV/V9feeWVnT45D+zYKiI4BRPBkhPESTZowwg2keQDZJxXyKeMLQkAgCMvI8FEU58TSspCpgNUBgthEGQdZNBDQRNRB0awdoUDgiCN7bMOAEZVgdPsEwSo9QUe6/RJHcZFeRIBm21qkpoZM6TvnntKaM0a8VatwlyIJcrTBhwJ9Qla1juwbFgPvfdbW/+xoX//P3dMnny2N2bM7/2amhvFmHsJYMpbfcRPsIIv5Al+gpIx4Ho9sLocS5cuhepmMLETl3W7rzqWJKo/BsLxNsseS2HclMh4IsY4GcvZsI1yzAAAEABJREFUfFoN/6eIykmierLkyp9A8heZTKTz7y64EjoUKnFQ92OE74YO7MY0YuRjwai++UBEb0Tst6mRf4p00VkNeNwlonN9I/8QV68SkfdA9jAiCWwv/bC1qeEYUf1/lomTUf1zrHLAM6h2HkUBFgMGzOEaMEG0hEFCeL7lwfl7mKRHCZBOghxmRZhVSRAUgsHWATJmWdokD+s9IUE+HDLmYPX9ISDB7AjAC1VfUgA/lwUAwbKySGQh+czCBD5AgfGFecigXwhg3EDiIYv2mT5dKr/8ZUk/9phkGxsFj1SBQRy4Fowo4haSg1HnTfHuhg3y3OrVHXWOM3e7iy769g633nri0AsvvGjQNdecNujOO4+rOffc3zgjR14lqdQjjJ1jIbCjeeL1s06bts/3g8xhm8EJ9ycCCFoo8RaWSPR7kxRP9LsGY/omuJsPo8yQaHcFOhgb9v3KjD/FE7Wgftfmy6vjlf1vrK6u3oR+EREBEA4I6ijpm4SqMD4+ipWNgNBACEGr5zJaPeDdS/9w1Y8uuezqY42YyyC1WUd1UYfnnvD94046uqKq9vZ4vJbgvg0ynYeqHKZqLhcj0TxzrXrm1ny9sygKsASItQAgEgwAlxAo5AEgWfS/DjC2C/qtA4CSfZw8lnYC85NKGQKLNjjZTEH86oVnn5MIhSrIowz7qU+gtiLDkq++/9+jXLeV9U6CTwsUjAB5qhhuLEOq9tlH+iK7ttx7r3iNjWLBihg4U7xhGANjY7xcHy+ur5eVLS1JxPqLGU8+Oat63307J5xypMiUKa/2v+GGn0YPO+xvfjr9KP0xTugAFZg2CPHvIDhAJPuQMUdvmjSJLtCz+YBOdnNLxDc6sg0vWG3N9fskW9b/WMRsV9iPt8/V+fZmUOQYAxY8/o/fQu/iHDX8LqdvVzRWgm/5yIB72gbuawDkMdQBIJxzxz7pxrWjclWeER3lWP0YmjNnjk8yxuU0bpY2xqvJZr25c+eSb9gRS6QuQFl4I2LKtS94HB8O3nXx6tqX0O5ysLMLozcNTgiByklmXQFIVcW42liiZdnsW7jMtwTg4Rs6egQAtv0s2fagQ32SoE5Z9vERW44JZmBxfvlCplQAizIAqOBmkBQAq6qiIs+hnaIu7cAncIEY4Jdx2TZkI8OGydBTT5Xk/fdLdvVqcUKhnBzs4gazdcoyy7fD35vIrE0AuTrOb49cuvSajxuT6l/+8rroIYfch0z7KG8E4/A9SsSHfdgQXgvtI7I+NakUwt5ssba2FmyHE9nJxKV904jziBH9HwSHx6edyKB/lS/ufwWNbuUAI3KqEZ2dIzkd+j/GNhFDsKJlIf9rqARv3aswiJejvRYUHGM8J7RT0DAm7KNOQtHLI2R4PaZAmu2CpojqsJSq/kp6/NH31HNv6Kmr80J66twSDyDBOOAmwIQYVQsiAoQzgW2taM38+Y2uyDOWx34AkpNn9WCUm/6UZb+dyDzA0CXkxTDh9uULuhwpgtGCFnJ4qRO8cVNuE17eXmgvL/dom/3UFcREOyzJ81Oplwccd9x0Wblyr+TTT4sbjwtBKrDFdTNlGYOiTTsNyaQQrK7jvIKb5zr294b6zJ59lTNmzDJJp4W2eH18FbfZHgZ4HZsL1LoehZPLHmQb4RozeDySh2QoC1TM0YlE38VkOI4FBqsfRZtfmCCFuPZFEQHxeDNeWTtPxFh7ZIDCRmV/gBy7dWjZIxhU2/jYE6S7X4+H8e7Ok1iiH2+8B7sZ7FDj/zHWp8/73fi2WRRgqUkQESCcEANg2UlHpO2YePZjYF5Cfwf5JAKIJcGCPowR4oc8MydqAllcU34dDBuDolFR9NO+LVEnwLgcoD50XozG42vKk8kQ24J+ZkjaoX/68lIpSUya9FLFYYc9svavf/2eU1YmQb9AnkSQUp66jG0TdEK4HoDu8VnLljWwr7dUdfzxf+Yfl2O8BChj6DLA8Lm2o8OG29Vmd+ApX5Be6yojWYR1W6yy/1MFfAxDQUtkLQbtKqPyR6N6OdLYlXj83zp//nyGI+aDD2Lon9ipoTK2rbnhP8XoBPCsDEqImAMfeuhvA1kHwYeCUOvlgedXt4yKC+9Z1+AGvLhbV+PMQ2dd3Y3X2ewynp3cj6sAUAoZTgivJFgeEACceHQJ6k8CHPXsQymWkGnZ50GfZHlk4HqsLZZoE0RlKIN++mCd/FbYYBvrzuenv/56sj0UcgV6qrh0EmzbpQVKvmjVHnHEXLNixcBsXd3wrJO7XAKTNuBCFPZwp+DwhTFtbG8XNASzt4L9W0Phvfd+PbrLLlfxryLa8YFyBnEksLQpY2xY3GGrzv4RO3Rt+VDzV8fLfkNUCrMMcGAOhhJNo7BHcBm2IWJWxBP9f1qRqP1FRaLfz+OJfqfEqmr/iE4fJMm4i+yq2FljC2RkOAx8F34I4tzggI1jnOf5Y1AGB8TyVYV0vrrlAhPSpdNhJtpso6DP+Np9S8/gBssWiHSpFgbZpeOjGpxYgockmBCCjfJ2VNBmvf/8+cvw1v4WZSzYwLcRswRIyCPQWNIebbDOknzeolYX1871Lvkp6LWDkMHas8YspJ9QNmuvgf2Uo67109Eh0e22u79swoSn2h58cKamUjNpn08GAXiY2Rk7lSnPEnbFluhX1YJHIj19PEHHj0+d+kQWWVohjiwt1raqYIkEPBl1Pe9DnyIFPaDNhy9uec2g943I3zczWdMpycaGwq9lECE/RyJa1dLSsH+quX7fTmpp2K+taf1kEVyausykPX7mRX+XwzXyVTIwrj7KQj8dLS1rattaGo7qTq2tazvXvtApPAr1C/mCueCQS29/tkq40yhAxMkPiBNvCQK8OhT2yGaz/w0Zn9HiwiHi2yzGTvBt3YIVICY4EbydYFuHD5YWYFBQEJcDKAQ+3sZS4VXWSVwqEKz2YgAOymawlqzeddeFOmpUum3Jkh0zePkimC3BH+NhDLQPW4IbgKaE/76MPMfzxt09dmyw1rN9vTnB33Lt00cMbhjKW9DiWuwYgOFr18fruHHjDC4al4TOzkN5Kb5jzN/A2gQKjgHi6DeDRg/l9o6RB3zRhzsJ+54GGTvdVL8dxmX3QAf1+YjptE4ycmfQxxJ8m80jYny2N5NpUw3vjEu6ozuJcf/NyvGKbKXzBHOd9U9U4cBstQE72YiWiraOCiMKCE17qOo94OF7gC+UIxB49QQYSwKSgpDJgRlv6AQRKehj1oMyDiOt6KcNCC95Y8WKzr/namUUSwIaQwamrv1lmlGjlpOFnYGhqipKfTAM6jCIvGYIfuCFTCMcjH5Y51JfHOcIZOFR6NmqI7zvvovKBw++3gIWN4ZVzi9FEKdNtJZXeEJohU3Jt3fbc9oL4D8LKjjMoW0bNw7PMzRfBgXt82WtkKLojGZFkWXNNNR5+FioXlNRWfv7gHzN/BQdGVBw7Nzc3PBljJMBg0ODgoe6rvEL5ci0pL4mbSV3KtDBFeV4vTkX6n1I/iM7PyRdyABgCUKyfEwMrwoXJ/xKRR5p5HPPvYfJf4d19iFjoDAYK2PBEvCtHdgTAKkQrBDGkZNNwwe3nLBlZBRv8HPEYi1nAnoAscCXAGgCoEmoulrKt99+GQWy+MxDH5YAWmZUHx0kgV1mQdZZ1kQiMgigxdqzGgD/9U0jR3LCId27Q1U7ysaPX+yUlT3qVlX93Q+F/o6bpxEfIxp91acxVqEPWYIOeFzL5UhNB9qyZMkSlnyTbkY73yejJJyxmdIY+6UrxxfZcmmkSR3Dmy+Rt7Mxa6KPod55HHLItxvReAQU2Ek7ot9AGxMgBGKOr5IyxiVgKd+VHJ8ySADGU9mso2rwYgBLPR3GZnDqBdRlV6O7itOd0as2JpmTDjTh4PVAC4DjpJPQsgeCRjj+A3zxwkQBG74QFAQlCQxcHEShi7PAmIhCS1BFpqRlkqpKC4BGQKrnrYPePyHSeSBzCbX4dm+ZsBcqK2sNx+N15qWXqvyWlgqBDdqiX5awAXeokQ/CS5x4KPknQEckEtIHe7VYgx9d4brn/HnSJG4zWdO9OcXOOuuPA55++qD+Dz10eP9zzz1m51df7XNMXV2fH61cud8PV658stAGNtqNk3UvE6P74RbcFzRVXb0+kImlzZ3G8aeSD9oXWewr4oaYeaXDc+cX6FG3J5pqXP97ruffrkZzdlxzcGVl5YbAB0u86HiadU8utBfyvXvGT9p7JfwfCt9W16j/g1hl32fjlbV9PkSJ/hfSVnlaXwcM94fOvvA5zfH8X+vgwWn2dadYW+ZNyFhZyE+1vroLFbSLAqx9IXIcsW/bvm8zmjGYfICMQCiwLwD2w8iKYPuCDGNBQlkSQYx+oBO60CcPgrYNjhBctg2DbVgTIuux74NMWdkbYG0+oMuGMhZUAGoJ1dR06OTJa2X58lb4OJi2aU8V0EacBiVqkIZJtHEVOX+ol4XDsj0y9IBYTLKed1ZVU9Pldw8d2scKb+VJ998/DT+GtAVVU15T8168qt+L8erahaCXYrF+wZcs0f79WysqBrxGPmhhrKrf87FYX7scqqmpaSzQo25P9BL0X49WD1wO3Rdg46V4vP8rPcRiYtj7LLD3UrR6wLvLli1rh37g39rK69opQr2wRFNszPBjY6FP2hERDjGKrgeA3AaZ5/PytN99O6+LQlGA5SOXW0cEAAEVRMyISIUeHM9bBGAvJY/yzJK2ngcZdQlcD2BjH4k8yihkWOfOQBv6qW9UF87KPSopYok+eSEsAU6hLZQ5gI0eXeHz5qI+7LEPmdPeZApw8lrwuLZ2eCKw+QIXwVbUlyorZTsQboSTspHIPbePGrUzZf719GGPrc0Np/EXpoOe1tb6icnmhq8Fv6YX8D/NkrZbm9efUYxNxjppUs9PqhkzZpSZ+vqK3tjlPPdGrosMgUEGSwswAIFt5SlfZ5VUV13dCv5jlBP2gQgK+4jO1wlKylpA5nmUJZ8BJvGGb7Or42QAsi7LAeqFcKKsBSLq9qCdlStzoAVYA3ssXfRRhvGzTb8ApbDkU0DQT1v0PQzLg/E1NYKlwf7w8cAdo0YdQd3PmjCmJ0SjhmvSXCiejsXNfODixYvdHOPTPy9fvtxBEjm5GMtloezsJ554eFxPunPv/Ou0ZFRP7Pp1rSdJEc5Jzz0fxQUAmBURPBKsL5xcTGaPGvvPn59Fhl0AEBiClmAlcaeAOiQqksfSEgDDNvtUVfixAI9mcYxpToVCD1uZghMzIj6p5TiQV9QsGIcObZJJk5qdaHSeQcyIAYfJPZvgI5CjLK+B7cAvBIU6jLkfvrpNxFbVkFhsuKrecvvIkTfePWZMLdx8Kgf3TpPN9X8FPYPMeRnoD8mmhleSzev50qNtTfU/Rf2GZHPD9aBD8k43dHS4yWRT/cy2poafi6ijYjYtWLAgmmxaf34S+q1NDXds2rSpuq1p/WTo/SXZXP/3YK+UvwSTbGk4AW8jPJQAABAASURBVDJ3Ub61df0B8PtEsrnh1bbm9YeJiCab649LNjf8pa254ZYk/IwePdoXlcJtNgzvpDD6L03CX7J5/Y3Nzc19W1o2jEu21D9CXltL/aycTz1KfeenSewjtzU3XJJsXn8T/F2WTDYMVtGvq8ip8+bdM60NOyDwOQ/0Whuum1ldCn6KAiwnlTY4mSwVj1ZOLgFGIq8L4a0esnbdxX7UCT4RgIbENvmFOvRBPncHSOyDzIvfWbasmfUupCpMK7ho4Y+qit/UJPLssxHFK6oTDmdxZ8GVEbSFNxrtewQxFJCZpFMXMdl+9FkeStxwElaVHZBtx1VVRavC4R9g5+GF20aOPOqhMWP4UQ5Wij9cXyaKaO1XD5k1FT73c9R/2hjndBH5tjEro7465XhvuNSIeRqD9n3weXREtONYXNGxJiR34TIbxccHh0j2IFzM0AmT9toTCF4ZcbOzjCOT1Mgo2J9VUTHQrv/D+BEjhwDmT8ar+p2rnjkDL1k/UKMnYICOSDeuGy0qgzTk/MYX80/IHXPzzX8aBMfcIUCRO5547L+PZo3+RP2kK+2HO7452hh9RELm31Cm4/EMdmv0CeP4VzqOiRvVOtf3LlDRGpOVaaL6DyNy+9e+dsR8E/LOwkRdkzWR/SF38M3XXztJCn6KAiwMCsFEOwSqLQ2GExUf1P3QcHg1gnoTQXXqUY5ZjcChPeqw35awxRIZVfi7CVzDUl5V/4f87sRYGAf1bYn1Z6axUdKrVmHvUSQ0ePAKTLhVoz/KUYcMH4AUEO3bOnx39qGuEKIOCsE1yIBoVHbCEgE7CSPLVO/Y1NFx3Z0jRhR+fZKt/TEqLaLmWbypZ6GbxkvqsxLKrkO9paWlKuaovxzLmKNUdG9jNL9FZFwsX04WldXxeO0aVb8MNkLGdydiPFOvLnxuFmakEQCMGOOncc1P5+3DrIjrtkfgd6nBzdHaWj9AVVzPdQ82aiYY32zKuG5ERd7xs+a7aoTbaDBhQNLlR8XsBT+ZV19+5tuQazWC+Iy5Fzf9SMk631Q1EVnjwpQYzWrIZEPviZh+Wcc9nCUAbKfGQSNveE/ENcDVDLPuJmMMpybfJUUuCXB1eKkRZh5ay+A6DE2iZNGdvvT8880YxMe8fD91DOpaKIg2m5ThrLFu4CeN7J3GlhYuyMey4EPLAStnTxg2yLIq0PPxebRt6VJ7dyb22+85NxR6DjFgWCCX98UYGDeBqr4vBCqJMVCWcdo67VEHMmxHHUe+hJex8Vgm1JSVHYuvZPfePmLELx+fNo3LaRvCVp5UfA0HOk5HCHV1BEBzpWMfZNtvaVj/YnxnbiAjor4Y8zOMS/9US/1UT9xNghSmYjaImlhI/OcMnmO4YNgSAS9XSu4H125U1HU8pyyTCRPQCfX1FV9lKcaP/6phjDHOKeJ4Nxrj3ovLx/6oak67y3mdUS33RZ8xxsmqmnK4nRBL+bMR338Zo99NVrpfQhwdvuukcJv9yBipiidarkCsS8DPigDIYjp4Q8HBBkedJl/keVFxVZ0uY4rrla3+4ZqRE01F42PcUIEjCXhofugAuAmYjR7kCRACg/IkBCeYdGEfLtLeRbgKgY7wX8eyHwZfjWcyuDtR635gBGhHWcI+uxWZsO2VV+y/xkx8//t3m1Ao2+kTcqzTl40fbUyg8BroKxgUtmmLPNpnSR3GRr0+8LFz374E7zBVveyDurp5dw4bth11ekt5OUVJYpEvbbXM8TKvIbA1JuOf6Tj+AeA66cZ12yEeP17Z/oSncoMRPd71/fHi+GmD5YEYTfmq1yHWCZ7jPAIgZ2EUB7S7HL6Kei63x4zRK5Bd57hGzgWIXhBXFhqVF9V3LlTXm6xGRpuM4ZLADkOnmZBcByMuUPUnUX+4L/oEbKVTMXceliJ/wJw8Fm/Td8XIWsf4v0e6eMtRGZhsrfitr1pmfOcA18++LqJfbW1af6yIf44x/jEhMdcYX5e3+85bUvATzE0BK1d9edy4w18aN279i6CFoJfHjl2/cMcd178xYcJhRmQDpTjpRhXjYsQn4yPIYHsL3ctAnYcxRvg8oB0yYdfaYdtBH4HRhuyqqux+/oNBg7qsn8iUNtz4tiIYExFVtYB3AaamV17Z1bz44njBT78ZMx72OzpeRtVmUgRtfdEneYyFhEcvm9YW27YfsWDgu8gzNv5ebgjZdmRVlTDbYokwPes4j946ejR/Sdra6c0plmj9z1gyczFl27POzN9dfvnKr31t1iJ8NPh5ec2gulgye6ZxzfnprHtRvN0cN+WAme+3Z5yvqQ5LJxK189MZ98fl7XJjrKL9Mi4PYu3mNMm638v4oRP5u7MTJ+15d3lr9nzaD6iion99LOmfMfOQb9mPEBVV/W7RkP5QQvrdeGX/m2Dng3hF6kwA95y2tF6R9tzDd99r6mvtWfegwAZLyrWlzdn0hzh+mkj0e7OiqvY248q3nZDz3d32mnYt95Jjla0X4wHw/R/88OQ7M37kp5j538Yr0md1+KGzotgj9jV7YHtW741VDnjGV/8k2Pv+1K9MP483E/0EtEXAYrKigElfCPYFGG1p68ZE0efz0Qi+MNMIJpR1kp1gCHY/xi1ZshH9FjBBn5X1/Rw4wLRtlPaAzSz6uCRgkLgxHj5h4cIPAxbCiAdoNYJ4EYoBR0SVLRm79pZbviv46XPhhRfhY0JjpqPD+mOvwgdtkyAi5FGb9gISxMAbCP6F8uwPQO1CiU8Fyg4oL5eJ/fpJRSg0UjzvDryQnYTuXh2qo9LcQKdwnz59mubMmePbx2P//q3k6cCByYqKAevYx8lfiHHo27cvXz4N+wM+AMzPm0KZGD4CBJPNzf/APuXz5NMu/eTbEsMHCxLamCoR2gMg19TW1rbQBz8Vs5RuP+ynv3xMtpd6/MBBHTJ4jbyGuXPnelVVVRsTiYH1tB/EmEgMagj0E+ijPV4ndQspmKtCnq37jlNmo0aL2Y4jQ8KkYXGvtgt1YYWTBqRYIHCCodLjAdlnQe3MqrRF0LOkriVocfJJBE8zsiuXCpB5T31/Ebp7PgBOysO27Ye8LR18qVo/b97Mjscft/+Gadgpp1yumQw+G+ImAVgpRFn6s3WA096ALNHv0C7IQRZlv+JzLf0wu7LN0nUBW8gQ1FWRiEzEEqEyFKrAOFxz24gRZ1GuRJ/eCGwRsJi4h5BVjgKQDgUQLGECD4Xr+zLZbAUniEDlOhO8Xh2Rjo4HYbcBJNQlUAgYqwyAwJcQECy5r8r1q22LvJJOp+utXE8n6CJGPL3ynWjTLnlaVja+7vzzz2ZP9Oij7+//jW/c67e1LWIfeYyB18KYyGOdJeNjSbBSRghKABmv16IBgGHAJw+lgMebi/8rDjNtIhzGZZgLbxs+nH8UghIl+hRGwAL2xZ12evmFgMaNexnr1pcBlCOQO/hbOqfAjyVkxlMA1ocxE1PtBAfAwKRxcsGH6JaPHd96awMm+A3qWlnos7SAgFrAJ9jIa8m/9cPvc8euW8dYINXzgXhthg9KxkM7BFd65crhq0466TJq9r300l9X7r33M6at7XX7hEAM9EU9F3WWjAmvp8LB4bKEYCWP+rRJUlWwc+t326ZuHrT8a+LYr5UIsi9u+guwPDiKuiX65CPAOeH6bxdMyC54jPGt2hKWBF9GltkJLvhmagkTw3IPTHAM8ujKHZor7BngsuWWTgDJfZQnOGEHZowlCzCAgDsQePwLf1mbSwbIbkLf81uyt/mVKyeBGC1w2WId+hIKh3fe9OijB2664AJ8ERIZesstJyR23/2FjmRSCFI7CPBNHQQjCuCpqtA/2xgXFLAGUKJixWiXFTx1xPLQx7ghZXc8quNx2b6ykn0h9P/65tGjv0z5En2yEbBzxUEuNAOA8AWjDJNif+Oe/STKEJCsW8IkYTLsOpZt9iPtYJZsrcdTNpt9lI9dKw/9TtAiS1sQQ4v9SWRXymCduLEsm839Ti36uh9uWZmDOC2bcVOHxLhI5CEmwfpz59U33/yDTRddZEE7+LbbTqiZNu2KTCr1usFamQYMgEpZ1nmd1Ged8bC0hDgtgNlgnSWugwWJ630OKv3yt736Y7eiw/d3cD3vHMQVhErREhUxAhxbwYRcTII+t1YuxsBejEfZ/QDT46wHfFuq5mR8/2JM6MWQ6SS2QbdDbovHbsuWvYtZOxsCF9M2Mm6nvrUlYu235e07xpw3a9Wq1ZDv8Yi1tTXDp9WB3YtJELyYdnFxlk8/WGNerK770Ac33+ybl17qp6r+wOuv/9ngH/7wL+h/if/CFv4F+jZDQ7+zDnu2zj7YtP3kwaYtghPs2D5b4oaL4AYYhSzLf7IO3nduHzny4EC2VBY3Ahx/2XPx4jNJk1GSWN9j0aIHJ7/55pOTlyw5sztNfOONMydCNqBdUT+qru7M761adeax779f8DWm56B2eeuti3Z9660zSRPzJesBkfdN2PvO+++fecz77/9nz1Zy3C8tW9Y8HjGORwwB7cx6AW8c26Bx8DXu7bev0N12W5/TFqmaPfuqMX/84y9CAwY8lMWeLjazgX/ACwL2jOxJIGPtLVgiSeEyAYJ8EqHILWsoR6IsdfF0EH5c4D9Zpy76zoHZ0vEJRsAC9hPofyFU9aCDnho5f/5hfaZPvwS7Hs+ZDLZ78bi3SxQAltmWj3hmWF4wS4CPVQtWAlQoD1mWYOb6cHZUZUA8LjG+gBmzF17ApoNdOoocgRJg8wOnqh21V1wxe8wf/nBqbPjwe7Lp9EsELpYk9jFPkFKUQGX2ZJ3AhJ5wR4G8QDboYz9/z6IG61h8UKAdB+A/3PaXTkWNQAmw3YZNDzjgmcEPPnjkoKOPvkvKyp7MtLYK1vc5QhalODMvwUjwsmQWJXAJapKVwQngRLcR/gnRKDKstSMyGeAOxCBVOrZmBEqA3cJoVZx77u9HXXvtDyp33/3v/H0FghRAswCkSrBEsCDkUoBMUADSzoFFH4Edw1eykGLfVqT6tjFjEhAtHUWMQOe4FqH7hVfR3Xdf3v+22w4ffNxxBwGIHYo3f4KPF84USbASxGyTTxALQMk+8tgmny9q/PJFwGLZ4Ljt7RXsL9HWj0AJsL0Ys+hppz068ne/6+MkEv/w29uFgASAbUn1ALSq7AEnn1U5uC6aPMLY4lK1/W1uOPyRX+0oX6KeR4Bj2nPPF5R765gxlcVcmk6fnhy2YMGM8u22OySTSuWWBgAmgYuGNRksG7imJY/ZlWC2MAVg8/xNEo2mrELptNUj8IUF7MujR5/4xtixJ76apztGjjzxzhEjTnOy2VO3epQKFAbed98D5SNH8r9F4mdX20PQEpxsEKAsVVXs4ALUWAYIP9sSxADtelmyxH5Ik9LPVo+AHdOt1vocKPiOcy3Acy2y27UAzLVhVbYvcXz/IzJs7y5s4IMPLsIOwh2wDwzyTOzmSgKTNRLXsCRa5fYWQJ0Bf9mRYr+FGkcKAAAF6klEQVRmk12irRyBLyxgAVTue9rhAEgkjkcywYNPzrvcPGRIX9vxCU6xmTNP9LCepW0S/dEc6yTWSZaPLMv/SARf0TaI6lPgFYpQrES9HIEvLGCRzXKAxaMZAJFK7IPaizVmcsh1u/xfVL0cqy5ifefMaQb4Grlu5Y3QpRMAxY0h6MehorhZWrNZP+v772go93expPRT1AjYOSxKcxtX6kxhfg5O/EWUMICkIuV4jvPXJj/xFYSGDn3K8De94IP+eJPQKOsCHuskbn+lfT+DSJ4eOGzYGvJKVNwIfGEBiwvjn6rsHJWIqiSwec9/FYCM9605IhDp7C6q4iYS9p/bUNmClBWQgoJDVe2//O3IZhtd132Yfwkn6CuVWz8Cn3jStt7lv0QjDNBsCjwhswnaUllWJty8B3/P1gEDxqL8JEdoXWtrn04DyKgBaFlaQkbnAK9Np7MtmcyCcCbzYqd8qVLUCHA8i1LcxpU8PIbXCLJbEKeHSgLtqnCYr+gV4yORE6aJhMAu9lC3oWGwYm1McFojACj8CpYctqmq0u77/sZUalnG8/4wa9Wq0v6rHZniT07xqtu0Jt55tCUADgHFf0zITFsbiXDHIBRynMO+OXToFFwFky+KrTuMWRmKNDbuJAAsNemDRGMs6Yv//GZDe3t9Qzr9HytWr97iP/Ohfol6NwJfVMByhyDMDf1gGAgiEn9zagCybFh1YJXqxRcNHrw9ZIgzFL0+9J8Hfn/PUDQ6gjb5shUYIFBpxcUp7XmbPmhtvWpDJHIz1sxBF3pKR7Ej8EUFLB7GUoM0S+DmCI9rgouPbP4iytBo1I277qQhodCNlw4Zwr9b0OuxmDNtWnzkunV3CfI0bRKsLElEJUvwmla0tNzU1Nh4+SnLlrUXO0Elva4j0OtJ6qq2zbfUw9IRS4IuOwVB1PztqUrsGIyIxcIDy8omD3Hd+/80ZMhZF+U+KABrgeSHS4A1+q21ax/Efmo/2LcCAUjZpjI+v7asTqXuWN7SctGshoZWK1Q6fSoj8EUFrLcwHD7S97z7kO02YKTw1DbCTX6+iCk28gmyKPLwoEjE3S4e77dDPD5nQjT62Nzhw0+/Zvjw0Vfk/+4r9HWOiPP217/eb9EeexwBsC4MRyJTYRPaIjCMau5QNPEWt2lVOn3HWy0tc763ejV95zpL509lBL4AgO15HE5aunT1d5Yu/U5bS8uZ2MTnH/Hln5S0wgHIAEbbjgHAeBlzh5eV7bx9RcWF+yQST02LRhcs2mmn+5aMH//A0RMmvKArVrwebmm5NVxWNpagpyL1SaxjID3cBGvfbWu7+c3W1nO+vWIF/74ru0r0KY4AxvlTtLaNmVoi0jFl1arrj3777X1WNjX9wGQyd5uOjkW46I1IjZkgXIKOa1tmXtdxXLyQDQLthhcn/lHdmdiZ2hXr4UFYBpRRtlAP+7pZ2Gtp8byXF7e0XLo4lZpz7LvvbvnPKgXKpbKoEcBYF6X3eVIyb4u0HPrBB3dOevfdo24wZre2jRsPNsnkb002+ywe4+sBQq51gVnUcGU8G2MUpfIHLEX2RIFnvgFXJAugNmFr7O3WbPb+unT6Vy+vX39My9KlV5ywfHmTFSyd/ldG4P8CYAsHzlyJN/Y916xZOLGu7tcT3n573/Pq6nba0Nx8UhYvSX4m83w2m12e9f16AHY9tsVWo1zhGLMMA7UMWXmR+v7j6Wz2xjXt7acvbm4++sZ1647dd8mSK49ZteqdWWL/3G2hv1L9Ux4BzMOnbPHzZc6bm0yu/crKlTfusnz5dycsXbrPaZs27fznpqaxDyaTO93V0THx7tbWXe/NZHa9X3Xi7S0tu5+1aNFB4xcvPnHPJUuum7ls2Su/z/2ROpt2P1+X/vmM9v86YAtnjaDLPgIAXo23+9Pr6tbOWbp0/Zy6usbZb7/dctrrrydRT8/NZVHKFuqW6v+iEdimAfsvGoOSm8/RCJQA+zmarFKoIiXAllDwuRqBEmA/V9NVCrYE2BIGPlcj8P8BAAD//0OpQmQAAAAGSURBVAMAs9JqvoRjduIAAAAASUVORK5CYII=';

/** Native aspect ratio of the mark (172 x 88). */
const LOGO_ASPECT = 172 / 88;
function Logo({
  src,
  variant = 'default',
  height = 40,
  alt = 'MS Realty',
  className = '',
  style,
  ...rest
}) {
  const resolved = src || (variant === 'reversed' ? LOGO_SRC_REVERSED : LOGO_SRC);
  return /*#__PURE__*/React.createElement("img", _extends({
    src: resolved,
    alt: alt,
    width: Math.round(height * LOGO_ASPECT),
    height: height,
    className: ('mk-logo ' + className).trim(),
    style: {
      height,
      width: 'auto',
      display: 'block',
      objectFit: 'contain',
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { LOGO_SRC, LOGO_SRC_REVERSED, LOGO_ASPECT, Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/general/Logo.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Breadcrumb.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; font-family: var(--font-sans); font-size: var(--text-sm); color: var(--text-muted); }
.mk-crumbs__item { display: inline-flex; align-items: center; }
.mk-crumbs a { color: var(--text-muted); text-decoration: none; transition: color var(--dur-fast) var(--ease-standard); }
.mk-crumbs a:hover { color: var(--text-strong); text-decoration: underline; text-underline-offset: 2px; }
.mk-crumbs__sep { color: var(--text-subtle); display: inline-flex; margin: 0 2px; }
.mk-crumbs__current { color: var(--text-strong); font-weight: var(--fw-medium); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-crumbs-css')) {
  const el = document.createElement('style');
  el.id = 'mk-crumbs-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Breadcrumb({
  items = [],
  separator = 'chevron-right',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: ['mk-crumbs', className].filter(Boolean).join(' '),
    "aria-label": "Breadcrumb"
  }, rest), items.map((it, i) => {
    const last = i === items.length - 1;
    return /*#__PURE__*/React.createElement("span", {
      className: "mk-crumbs__item",
      key: i
    }, last || !it.href ? /*#__PURE__*/React.createElement("span", {
      className: "mk-crumbs__current",
      "aria-current": last ? 'page' : undefined
    }, it.label) : /*#__PURE__*/React.createElement("a", {
      href: it.href
    }, it.label), !last && /*#__PURE__*/React.createElement("span", {
      className: "mk-crumbs__sep"
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: separator,
      size: 14
    })));
  }));
}
Object.assign(__ds_scope, { Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Breadcrumb.jsx", error: String((e && e.message) || e) }); }

// components/navigation/LangSwitcher.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const DEFAULT_LANGS = [{
  code: 'BG',
  label: 'Български',
  dir: 'ltr'
}, {
  code: 'EN',
  label: 'English',
  dir: 'ltr'
}, {
  code: 'DE',
  label: 'Deutsch',
  dir: 'ltr'
}, {
  code: 'NL',
  label: 'Nederlands',
  dir: 'ltr'
}, {
  code: 'RU',
  label: 'Русский',
  dir: 'ltr'
}, {
  code: 'EL',
  label: 'Ελληνικά',
  dir: 'ltr'
}, {
  code: 'HE',
  label: 'עברית',
  dir: 'rtl'
}];
const CSS = `
.mk-lang { position: relative; display: inline-block; font-family: var(--font-sans); }
.mk-lang__btn {
  display: inline-flex; align-items: center; gap: var(--space-2);
  height: 36px; padding: 0 var(--space-3);
  border: 1px solid transparent; border-radius: var(--radius-button);
  background: transparent; color: var(--text-body); cursor: pointer;
  font-family: inherit; font-size: var(--text-sm); font-weight: var(--fw-semibold);
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.mk-lang__btn:hover { background: var(--surface-hover); color: var(--text-strong); }
.mk-lang__btn:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.mk-lang__btn .mk-lang__chev { transition: transform var(--dur-fast) var(--ease-out); color: var(--text-muted); display: inline-flex; }
.mk-lang[data-open] .mk-lang__chev { transform: rotate(180deg); }

.mk-lang--on-dark .mk-lang__btn { color: rgba(255,255,255,0.85); }
.mk-lang--on-dark .mk-lang__btn:hover { background: rgba(255,255,255,0.09); color: #fff; }

.mk-lang__menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 60;
  min-width: 176px; padding: var(--space-1);
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-md); box-shadow: var(--shadow-popover);
  animation: mk-lang-in var(--dur-fast) var(--ease-out) both;
}
.mk-lang__item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%;
  padding: 8px 10px; border: 0; border-radius: var(--radius-sm);
  background: transparent; cursor: pointer; text-align: left;
  font-family: inherit; font-size: var(--text-sm); font-weight: var(--fw-medium); color: var(--text-body);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.mk-lang__item:hover { background: var(--surface-hover); }
.mk-lang__item[aria-current="true"] { color: var(--text-strong); font-weight: var(--fw-semibold); }
.mk-lang__label { min-width: 0; }
.mk-lang__code {
  display: inline-grid; place-items: center; min-width: 26px; height: 20px; padding: 0 5px;
  border-radius: var(--radius-xs); background: var(--stone-200); color: var(--stone-700);
  font-size: 10px; font-weight: var(--fw-bold); letter-spacing: 0.05em;
}
.mk-lang__item[aria-current="true"] .mk-lang__code { background: var(--ink-800); color: #fff; }
.mk-lang__check { margin-left: auto; color: var(--ink-700); display: inline-flex; }

@keyframes mk-lang-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .mk-lang__menu { animation: none; } }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-lang-css')) {
  const el = document.createElement('style');
  el.id = 'mk-lang-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}

/**
 * Language switcher for approved public website locales.
 * Globe + current code trigger, popover menu with native-name labels.
 */
function LangSwitcher({
  value = 'BG',
  onChange,
  languages = DEFAULT_LANGS,
  onDark = false,
  className = '',
  ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = e => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = e => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return /*#__PURE__*/React.createElement("div", _extends({
    ref: rootRef,
    className: ['mk-lang', onDark ? 'mk-lang--on-dark' : '', className].filter(Boolean).join(' '),
    "data-open": open ? '' : undefined
  }, rest), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mk-lang__btn",
    "aria-haspopup": "listbox",
    "aria-expanded": open,
    onClick: () => setOpen(o => !o)
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "globe",
    size: 16
  }), value, /*#__PURE__*/React.createElement("span", {
    className: "mk-lang__chev"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 14
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "mk-lang__menu",
    role: "listbox",
    "aria-label": "Language"
  }, languages.map(l => /*#__PURE__*/React.createElement("button", {
    key: l.code,
    type: "button",
    role: "option",
    "aria-selected": value === l.code,
    "aria-current": value === l.code,
    className: "mk-lang__item",
    onClick: () => {
      setOpen(false);
      if (onChange) onChange(l.code);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-lang__code"
  }, l.code), /*#__PURE__*/React.createElement("span", {
    className: "mk-lang__label",
    dir: l.dir || 'auto'
  }, l.label), value === l.code && /*#__PURE__*/React.createElement("span", {
    className: "mk-lang__check"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 15
  }))))));
}
Object.assign(__ds_scope, { LangSwitcher });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/LangSwitcher.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Pagination.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-pager { display: inline-flex; align-items: center; gap: 4px; font-family: var(--font-sans); }
.mk-pager__page {
  min-width: 40px; height: 40px; padding: 0 8px;
  border: 1px solid transparent; background: transparent;
  border-radius: var(--radius-md); color: var(--text-body);
  font: inherit; font-weight: var(--fw-medium); font-size: var(--text-sm);
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.mk-pager__page:hover { background: var(--surface-hover); color: var(--text-strong); }
.mk-pager__page[aria-current="page"] { background: var(--brand); color: var(--text-on-brand); }
.mk-pager__ellipsis { min-width: 28px; text-align: center; color: var(--text-subtle); user-select: none; }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-pager-css')) {
  const el = document.createElement('style');
  el.id = 'mk-pager-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function range(a, b) {
  const r = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}
function pages(page, total, siblings = 1) {
  const total_shown = siblings * 2 + 5;
  if (total <= total_shown) return range(1, total);
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, total);
  const showLeftDots = left > 2;
  const showRightDots = right < total - 1;
  if (!showLeftDots && showRightDots) return [...range(1, siblings * 2 + 3), '…', total];
  if (showLeftDots && !showRightDots) return [1, '…', ...range(total - (siblings * 2 + 2), total)];
  return [1, '…', ...range(left, right), '…', total];
}
function Pagination({
  page = 1,
  totalPages = 1,
  siblings = 1,
  onChange,
  className = '',
  ...rest
}) {
  const go = p => {
    if (p >= 1 && p <= totalPages && p !== page && onChange) onChange(p);
  };
  const items = pages(page, totalPages, siblings);
  return /*#__PURE__*/React.createElement("nav", _extends({
    className: ['mk-pager', className].filter(Boolean).join(' '),
    "aria-label": "Pagination"
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "chevron-left",
    label: "Previous page",
    variant: "ghost",
    disabled: page <= 1,
    onClick: () => go(page - 1)
  }), items.map((p, i) => p === '…' ? /*#__PURE__*/React.createElement("span", {
    key: `e${i}`,
    className: "mk-pager__ellipsis"
  }, "\u2026") : /*#__PURE__*/React.createElement("button", {
    key: p,
    type: "button",
    className: "mk-pager__page",
    "aria-current": p === page ? 'page' : undefined,
    onClick: () => go(p)
  }, p)), /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "chevron-right",
    label: "Next page",
    variant: "ghost",
    disabled: page >= totalPages,
    onClick: () => go(page + 1)
  }));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.mk-tabs { display: flex; align-items: center; gap: var(--space-1); font-family: var(--font-sans); }
.mk-tab {
  display: inline-flex; align-items: center; gap: var(--space-2);
  border: 0; background: transparent; cursor: pointer;
  font-family: inherit; font-size: var(--text-sm); font-weight: var(--fw-semibold);
  color: var(--text-muted); white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
}
.mk-tab:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }
.mk-tab__count {
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--radius-pill);
  background: var(--stone-100); color: var(--text-muted);
  font-size: var(--text-2xs); font-weight: var(--fw-semibold); line-height: 18px; text-align: center;
}
.mk-tab[aria-selected="true"] .mk-tab__count { background: var(--ink-100); color: var(--ink-800); }

/* underline (default) */
.mk-tabs--underline { gap: var(--space-5); box-shadow: inset 0 -1px 0 var(--border); }
.mk-tabs--underline .mk-tab { padding: var(--space-3) 2px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.mk-tabs--underline .mk-tab:hover { color: var(--text-strong); }
.mk-tabs--underline .mk-tab[aria-selected="true"] { color: var(--text-strong); border-bottom-color: var(--ink-800); }

/* segmented pills */
.mk-tabs--segmented { display: inline-flex; padding: 3px; gap: 2px; background: var(--stone-100); border-radius: var(--radius-button); box-shadow: none; }
.mk-tabs--segmented .mk-tab { padding: 7px 13px; border-radius: var(--radius-sm); }
.mk-tabs--segmented .mk-tab:hover { color: var(--text-strong); }
.mk-tabs--segmented .mk-tab[aria-selected="true"] { background: var(--surface); color: var(--text-strong); box-shadow: var(--shadow-xs); }

.mk-tabs--sm.mk-tabs--underline .mk-tab { padding: var(--space-2) 2px; font-size: var(--text-xs); }
.mk-tabs--sm.mk-tabs--segmented .mk-tab { padding: 5px 10px; font-size: var(--text-xs); }
`;
if (typeof document !== 'undefined' && !document.getElementById('mk-tabs-css')) {
  const el = document.createElement('style');
  el.id = 'mk-tabs-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Tabs({
  items = [],
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    className: ['mk-tabs', `mk-tabs--${variant}`, size === 'sm' ? 'mk-tabs--sm' : '', className].filter(Boolean).join(' ')
  }, rest), items.map(it => /*#__PURE__*/React.createElement("button", {
    key: it.key,
    type: "button",
    role: "tab",
    className: "mk-tab",
    "aria-selected": value === it.key,
    onClick: () => onChange && onChange(it.key)
  }, it.icon && (typeof it.icon === 'string' ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: it.icon,
    size: 16
  }) : it.icon), it.label, it.count != null && /*#__PURE__*/React.createElement("span", {
    className: "mk-tab__count"
  }, it.count))));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/people/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONE = {
  ink: {
    fg: 'var(--ink-700)',
    bg: 'var(--ink-100)',
    solid: 'var(--ink-700)'
  },
  stone: {
    fg: 'var(--stone-700)',
    bg: 'var(--stone-200)',
    solid: 'var(--stone-500)'
  },
  brick: {
    fg: 'var(--brick-700)',
    bg: 'var(--brick-100)',
    solid: 'var(--brick-600)'
  },
  sea: {
    fg: 'var(--sea-700)',
    bg: 'var(--sea-100)',
    solid: 'var(--sea-600)'
  },
  sun: {
    fg: 'var(--sun-600)',
    bg: 'var(--sun-100)',
    solid: 'var(--sun-500)'
  }
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
  return String(name || '').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
}
function Avatar({
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
  const text = src ? '' : initials || initialsOf(name);
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['mk-avatar', className].filter(Boolean).join(' '),
    role: "img",
    "aria-label": name || undefined,
    style: {
      width: size,
      height: size,
      fontSize: Math.round(size * 0.36),
      background: src ? undefined : solid ? t.solid : t.bg,
      color: solid ? '#fff' : t.fg,
      backgroundImage: src ? `url(${src})` : undefined,
      ...style
    }
  }, rest), text);
}
function AvatarGroup({
  children,
  className = '',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['mk-avatar-group', className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { Avatar, AvatarGroup });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/people/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/people/AgentCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function AgentCard({
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
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['mk-agent', row ? 'mk-agent--row' : '', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "mk-agent__id"
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: name,
    src: src,
    tone: tone,
    size: row ? 44 : 52
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "mk-agent__name"
  }, name), (role || office) && /*#__PURE__*/React.createElement("p", {
    className: "mk-agent__role"
  }, [role, office].filter(Boolean).join(' · ')))), !row && (phone || langs.length > 0) && /*#__PURE__*/React.createElement("div", {
    className: "mk-agent__meta"
  }, phone && /*#__PURE__*/React.createElement("span", {
    className: "mk-agent__meta-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-icon-slot"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "phone",
    size: 15
  })), phone), langs.length > 0 && /*#__PURE__*/React.createElement("span", {
    className: "mk-agent__meta-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mk-icon-slot"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "languages",
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    className: "mk-agent__langs"
  }, langs.map(l => /*#__PURE__*/React.createElement("span", {
    className: "mk-agent__lang",
    key: l
  }, l))))), children, (onCall || onMessage) && /*#__PURE__*/React.createElement("div", {
    className: "mk-agent__actions"
  }, onCall && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "accent",
    size: row ? 'sm' : 'md',
    iconStart: "phone",
    fullWidth: !row,
    onClick: onCall
  }, callLabel), onMessage && /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "secondary",
    size: row ? 'sm' : 'md',
    iconStart: "mail",
    fullWidth: !row,
    onClick: onMessage
  }, messageLabel)));
}
Object.assign(__ds_scope, { AgentCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/people/AgentCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Calendar.jsx
try { (() => {
/* Calendar — week viewings scheduler (09:00–19:00). */
function Calendar() {
  const D = window.CRM_DATA;
  const {
    WEEK,
    VIEWINGS,
    VIEW_STATUS,
    CRM_AGENTS
  } = D;
  const {
    PageHeader,
    Avatar,
    Segmented
  } = window;
  const {
    Button,
    IconButton,
    Icon
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const HOURS = [];
  for (let h = 9; h <= 19; h++) HOURS.push(h);
  const ROW = 62;
  const toneVar = t => window.CrmTONE[t]?.solid || 'var(--ink-700)';
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap",
    style: {
      maxWidth: 1400
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u041E\u0433\u043B\u0435\u0434\u0438",
    subtitle: "\u0421\u0435\u0434\u043C\u0438\u0446\u0430 6\u201312 \u044E\u043B\u0438 2026 \xB7 9 \u043D\u0430\u0441\u0440\u043E\u0447\u0435\u043D\u0438 \u043E\u0433\u043B\u0435\u0434\u0430"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      marginRight: 4
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-left",
    variant: "ghost",
    "aria-label": "\u041F\u0440\u0435\u0434\u0438\u0448\u043D\u0430"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm"
  }, "\u0422\u0430\u0437\u0438 \u0441\u0435\u0434\u043C\u0438\u0446\u0430"), /*#__PURE__*/React.createElement(IconButton, {
    icon: "chevron-right",
    variant: "ghost",
    "aria-label": "\u0421\u043B\u0435\u0434\u0432\u0430\u0449\u0430"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "calendar-plus"
  }, "\u041D\u0430\u0441\u0440\u043E\u0447\u0438 \u043E\u0433\u043B\u0435\u0434")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 16,
      marginBottom: 14,
      flexWrap: 'wrap'
    }
  }, Object.values(CRM_AGENTS).map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      fontSize: 12.5,
      color: 'var(--text-muted)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 10,
      height: 10,
      borderRadius: 3,
      background: toneVar(a.tone)
    }
  }), a.name))), /*#__PURE__*/React.createElement("div", {
    className: "crm-panel",
    style: {
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '56px repeat(7,1fr)',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement("div", null), WEEK.map((d, i) => {
    const [name, num] = d.split(' ');
    const isToday = i === 0;
    return /*#__PURE__*/React.createElement("div", {
      key: d,
      style: {
        padding: '11px 0',
        textAlign: 'center',
        borderLeft: '1px solid var(--border)',
        background: isToday ? 'var(--brick-50)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: '600 10.5px/1 var(--font-sans)',
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: isToday ? 'var(--brick-700)' : 'var(--text-muted)'
      }
    }, name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 18,
        color: isToday ? 'var(--brick-700)' : 'var(--text-strong)',
        marginTop: 3
      }
    }, num));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '56px repeat(7,1fr)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", null, HOURS.map(h => /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      height: ROW,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -7,
      right: 8,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      color: 'var(--text-subtle)'
    }
  }, String(h).padStart(2, '0'), ":00")))), WEEK.map((d, di) => /*#__PURE__*/React.createElement("div", {
    key: d,
    style: {
      borderLeft: '1px solid var(--border)',
      position: 'relative',
      height: HOURS.length * ROW,
      background: di === 0 ? 'rgba(206,55,51,.03)' : 'transparent'
    }
  }, HOURS.map((h, hi) => hi > 0 && /*#__PURE__*/React.createElement("div", {
    key: h,
    style: {
      position: 'absolute',
      top: hi * ROW,
      left: 0,
      right: 0,
      borderTop: '1px solid var(--border)'
    }
  })), VIEWINGS.filter(v => v.day === di).map((v, i) => {
    const ag = CRM_AGENTS[v.agent];
    const st = VIEW_STATUS[v.status];
    const cancelled = v.status === 'cancelled';
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        position: 'absolute',
        top: (v.start - 9) * ROW + 3,
        height: v.dur * ROW - 6,
        left: 4,
        right: 4,
        borderRadius: 8,
        padding: '7px 8px',
        overflow: 'hidden',
        cursor: 'pointer',
        background: cancelled ? 'var(--stone-100)' : 'color-mix(in srgb,' + toneVar(ag.tone) + ' 13%, #fff)',
        borderLeft: '3px solid ' + (cancelled ? 'var(--stone-400)' : toneVar(ag.tone)),
        boxShadow: 'var(--shadow-xs,0 1px 2px rgba(20,19,14,.06))',
        opacity: cancelled ? .7 : 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        font: '600 11px/1.2 var(--font-sans)',
        color: 'var(--text-strong)',
        textDecoration: cancelled ? 'line-through' : 'none'
      }
    }, v.lead), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10.5,
        color: 'var(--text-muted)',
        marginTop: 2
      },
      className: "crm-mono"
    }, v.listing), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 10,
        color: st.tone,
        marginTop: 3,
        fontWeight: 600
      }
    }, String(v.start).padStart(2, '0'), ":00 \xB7 ", st.label));
  })))))));
}
window.Calendar = Calendar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Calendar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Contacts.jsx
try { (() => {
/* Contacts — directory table with type filter. */
function Contacts() {
  const D = window.CRM_DATA;
  const {
    CONTACTS,
    CONTACT_TYPE,
    CRM_AGENTS,
    LANGS
  } = D;
  const {
    PageHeader,
    Panel,
    DataTable,
    Avatar,
    StatusPill,
    Lang,
    Segmented
  } = window;
  const {
    Button,
    Icon
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [type, setType] = React.useState('all');
  const rows = type === 'all' ? CONTACTS : CONTACTS.filter(c => c.type === type);
  const counts = Object.keys(CONTACT_TYPE).reduce((a, k) => (a[k] = CONTACTS.filter(c => c.type === k).length, a), {});
  const columns = [{
    key: 'name',
    label: 'Име',
    render: r => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 11
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      tone: CONTACT_TYPE[r.type].tone,
      initials: r.name.split(' ').map(w => w[0]).slice(0, 2).join(''),
      size: 32
    }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "crm-tbl__primary"
    }, r.name), /*#__PURE__*/React.createElement("div", {
      className: "crm-tbl__muted crm-mono"
    }, r.id)))
  }, {
    key: 'type',
    label: 'Тип',
    sort: r => r.type,
    render: r => /*#__PURE__*/React.createElement(StatusPill, {
      tone: CONTACT_TYPE[r.type].tone,
      label: CONTACT_TYPE[r.type].label
    })
  }, {
    key: 'lang',
    label: 'Език',
    render: r => /*#__PURE__*/React.createElement(Lang, {
      code: r.lang
    })
  }, {
    key: 'location',
    label: 'Локация',
    render: r => /*#__PURE__*/React.createElement("span", {
      className: "crm-tbl__muted"
    }, r.location)
  }, {
    key: 'phone',
    label: 'Телефон',
    render: r => /*#__PURE__*/React.createElement("span", {
      className: "crm-mono"
    }, r.phone)
  }, {
    key: 'props',
    label: 'Имоти',
    align: 'center',
    render: r => r.props ? /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600
      }
    }, r.props) : /*#__PURE__*/React.createElement("span", {
      className: "crm-tbl__muted"
    }, "\u2014")
  }, {
    key: 'agent',
    label: 'Брокер',
    sort: r => CRM_AGENTS[r.agent].name,
    render: r => {
      const a = CRM_AGENTS[r.agent];
      return /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 7
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        tone: a.tone,
        initials: a.initials,
        size: 24
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12.5
        }
      }, a.name.split(' ')[0]));
    }
  }, {
    key: 'last',
    label: 'Контакт',
    render: r => /*#__PURE__*/React.createElement("span", {
      className: "crm-tbl__muted"
    }, r.last.slice(5))
  }, {
    key: 'act',
    label: '',
    sortable: false,
    align: 'right',
    render: () => /*#__PURE__*/React.createElement(Icon, {
      name: "chevron-right",
      size: 16,
      style: {
        color: 'var(--text-subtle)'
      }
    })
  }];
  const filters = [{
    value: 'all',
    label: 'Всички · ' + CONTACTS.length
  }].concat(Object.entries(CONTACT_TYPE).map(([k, v]) => ({
    value: k,
    label: v.label + ' · ' + counts[k]
  })));
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438",
    subtitle: CONTACTS.length + ' контакта · купувачи, продавачи, наематели и наемодатели'
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "upload"
  }, "\u0418\u043C\u043F\u043E\u0440\u0442"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "plus"
  }, "\u041D\u043E\u0432 \u043A\u043E\u043D\u0442\u0430\u043A\u0442")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: type,
    onChange: setType,
    options: filters
  })), /*#__PURE__*/React.createElement(Panel, null, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: rows,
    onRow: () => {}
  })))));
}
window.Contacts = Contacts;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Contacts.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/CrmKit.jsx
try { (() => {
/* MS Realty — Agent CRM kit: chrome (Sidebar, Topbar) + shared primitives
   (Avatar, StatTile, DataTable, StatusPill, Timeline, TaskList, KanbanCard,
   Segmented, PageHeader). Composed from the DS bundle; kit-local styles.
   Dark Ink sidebar + light Stone content — the brand charcoal as app chrome. */

const DS = window.MaklerRealtyDesignSystem_9b7f1e;
const {
  Button,
  IconButton,
  Icon,
  Badge,
  Card,
  Tag,
  Input
} = DS;

/* tone → CSS var (surface / text pairs for pills, dots, avatars) */
const TONE = {
  ink: {
    fg: 'var(--ink-700)',
    bg: 'var(--ink-50)',
    solid: 'var(--ink-800)'
  },
  brick: {
    fg: 'var(--brick-700)',
    bg: 'var(--brick-50)',
    solid: 'var(--brick-600)'
  },
  sea: {
    fg: 'var(--sea-700)',
    bg: 'var(--sea-50)',
    solid: 'var(--sea-600)'
  },
  sun: {
    fg: 'var(--sun-600)',
    bg: 'var(--sun-100)',
    solid: 'var(--sun-500)'
  },
  success: {
    fg: 'var(--success-600)',
    bg: 'var(--success-50)',
    solid: 'var(--success-500)'
  },
  sand: {
    fg: 'var(--stone-700)',
    bg: 'var(--stone-100)',
    solid: 'var(--stone-500)'
  },
  pine: {
    fg: 'var(--sea-700)',
    bg: 'var(--sea-50)',
    solid: 'var(--sea-600)'
  },
  sunset: {
    fg: 'var(--sun-600)',
    bg: 'var(--sun-100)',
    solid: 'var(--sun-500)'
  }
};
const crmCss = `
.crm-app { display:grid; grid-template-columns:244px 1fr; min-height:100vh; background:var(--canvas); color:var(--text-body); font-family:var(--font-sans); }
.crm-app *,.crm-app *::before,.crm-app *::after { box-sizing:border-box; }

/* ---- Sidebar ---- */
.crm-sb { position:sticky; top:0; align-self:start; height:100vh; background:var(--ink-900); color:var(--stone-50); display:flex; flex-direction:column; border-right:1px solid var(--ink-950); }
.crm-sb__brand { padding:20px 20px 14px; }
.crm-sb__nav { flex:1 1 auto; overflow-y:auto; padding:6px 12px; display:flex; flex-direction:column; gap:2px; }
.crm-sb__group { margin:14px 8px 6px; font:600 10px/1 var(--font-sans); letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.38); }
.crm-nav { display:flex; align-items:center; gap:11px; padding:9px 12px; border-radius:var(--radius-button); color:rgba(255,255,255,.72); font:500 13.5px/1 var(--font-sans); cursor:pointer; border:0; background:transparent; width:100%; text-align:left; position:relative; transition:background .14s var(--ease-out), color .14s var(--ease-out); }
.crm-nav:hover { background:rgba(255,255,255,.06); color:#fff; }
.crm-nav--on { background:rgba(255,255,255,.09); color:#fff; }
.crm-nav--on::before { content:''; position:absolute; left:-12px; top:8px; bottom:8px; width:3px; border-radius:0 3px 3px 0; background:var(--brick-500); }
.crm-nav--on svg { color:var(--brick-400); }
.crm-nav__badge { margin-left:auto; min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:var(--brick-600); color:#fff; font:600 11px/20px var(--font-sans); text-align:center; }
.crm-sb__me { margin:12px; padding:12px; border-radius:var(--radius-card); background:rgba(255,255,255,.05); display:flex; align-items:center; gap:10px; }
.crm-sb__me b { display:block; font:600 13px/1.3 var(--font-sans); color:#fff; }
.crm-sb__me span { font:400 11.5px/1.3 var(--font-sans); color:rgba(255,255,255,.5); }

/* ---- Main / topbar ---- */
.crm-main { display:flex; flex-direction:column; min-width:0; min-height:100vh; }
.crm-top { position:sticky; top:0; z-index:20; height:64px; flex:0 0 64px; background:rgba(255,255,255,.86); backdrop-filter:saturate(1.4) blur(10px); border-bottom:1px solid var(--border); display:flex; align-items:center; gap:16px; padding:0 26px; }
.crm-top__title { font-family:var(--font-display); font-weight:600; font-size:20px; letter-spacing:-.01em; color:var(--text-strong); }
.crm-top__sub { font:400 12.5px/1 var(--font-sans); color:var(--text-muted); margin-top:3px; }
.crm-top__search { margin-left:auto; display:flex; align-items:center; gap:8px; height:38px; width:260px; padding:0 12px; border:1px solid var(--border-strong); border-radius:var(--radius-button); background:var(--surface); color:var(--text-muted); }
.crm-top__search input { border:0; outline:0; background:transparent; font:400 13.5px/1 var(--font-sans); color:var(--text-body); width:100%; }
.crm-scroll { flex:1 1 auto; overflow-y:auto; padding:26px; }
.crm-wrap { max-width:1240px; margin:0 auto; }

/* ---- Page header ---- */
.crm-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
.crm-ph h1 { margin:0; font-family:var(--font-display); font-weight:600; font-size:26px; letter-spacing:-.015em; color:var(--text-strong); }
.crm-ph p { margin:5px 0 0; font:400 13.5px/1.4 var(--font-sans); color:var(--text-muted); }
.crm-ph__actions { display:flex; gap:10px; align-items:center; }

/* ---- Avatar ---- */
.crm-av { display:inline-flex; align-items:center; justify-content:center; border-radius:999px; font-family:var(--font-sans); font-weight:600; color:#fff; flex:0 0 auto; letter-spacing:.01em; }

/* ---- Stat tile ---- */
.crm-stat { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); padding:16px 18px; display:flex; flex-direction:column; gap:10px; box-shadow:var(--shadow-card); }
.crm-stat__top { display:flex; align-items:center; justify-content:space-between; }
.crm-stat__ic { width:34px; height:34px; border-radius:9px; display:grid; place-items:center; }
.crm-stat__label { font:500 12.5px/1 var(--font-sans); color:var(--text-muted); }
.crm-stat__val { font-family:var(--font-display); font-weight:600; font-size:30px; line-height:1; letter-spacing:-.02em; color:var(--text-strong); }
.crm-stat__foot { display:flex; align-items:center; gap:7px; font:500 12px/1 var(--font-sans); color:var(--text-subtle); }
.crm-delta { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:999px; font:600 11.5px/1 var(--font-sans); }
.crm-delta--up { color:var(--success-600); background:var(--success-50); }
.crm-delta--flat { color:var(--text-muted); background:var(--stone-100); }
.crm-delta--down { color:var(--danger-500); background:var(--danger-50); }

/* ---- Panel ---- */
.crm-panel { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); box-shadow:var(--shadow-card); }
.crm-panel__hd { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:15px 18px; border-bottom:1px solid var(--border); }
.crm-panel__hd h3 { margin:0; font-family:var(--font-display); font-weight:600; font-size:16px; color:var(--text-strong); letter-spacing:-.01em; }
.crm-panel__hd a { font:600 12.5px/1 var(--font-sans); color:var(--text-link); text-decoration:none; cursor:pointer; }

/* ---- Data table ---- */
.crm-tbl { width:100%; border-collapse:separate; border-spacing:0; font:400 13px/1.4 var(--font-sans); }
.crm-tbl th { text-align:left; font:600 11px/1 var(--font-sans); letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); padding:12px 14px; border-bottom:1px solid var(--border); background:var(--stone-50); white-space:nowrap; cursor:pointer; user-select:none; }
.crm-tbl th:first-child { border-top-left-radius:var(--radius-card); }
.crm-tbl th .th-in { display:inline-flex; align-items:center; gap:4px; }
.crm-tbl td { padding:11px 14px; border-bottom:1px solid var(--border); color:var(--text-body); vertical-align:middle; }
.crm-tbl tbody tr { cursor:pointer; transition:background .12s var(--ease-out); }
.crm-tbl tbody tr:hover { background:var(--surface-hover); }
.crm-tbl tbody tr:last-child td { border-bottom:0; }
.crm-tbl__primary { font-weight:600; color:var(--text-strong); }
.crm-tbl__muted { color:var(--text-muted); }
.crm-mono { font-family:var(--font-mono); font-size:12px; color:var(--text-muted); }
.crm-price { font-family:var(--font-display); font-weight:600; color:var(--price); font-size:14px; }

/* ---- Status pill ---- */
.crm-pill { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:999px; font:600 11.5px/1 var(--font-sans); white-space:nowrap; }
.crm-pill__dot { width:6px; height:6px; border-radius:999px; }

/* ---- Segmented ---- */
.crm-seg { display:inline-flex; padding:3px; gap:2px; background:var(--stone-100); border-radius:var(--radius-button); }
.crm-seg button { border:0; background:transparent; padding:6px 13px; border-radius:6px; font:600 12.5px/1 var(--font-sans); color:var(--text-muted); cursor:pointer; transition:all .14s var(--ease-out); }
.crm-seg button:hover { color:var(--text-strong); }
.crm-seg button[data-on="1"] { background:var(--surface); color:var(--text-strong); box-shadow:var(--shadow-xs, 0 1px 2px rgba(20,19,14,.08)); }

/* ---- Timeline ---- */
.crm-tl { display:flex; flex-direction:column; }
.crm-tl__row { display:flex; gap:12px; padding:11px 0; position:relative; }
.crm-tl__row:not(:last-child)::before { content:''; position:absolute; left:16px; top:34px; bottom:-11px; width:1.5px; background:var(--border); }
.crm-tl__ic { width:33px; height:33px; border-radius:999px; display:grid; place-items:center; flex:0 0 auto; z-index:1; }
.crm-tl__body { padding-top:2px; }
.crm-tl__body p { margin:0; font:400 13px/1.45 var(--font-sans); color:var(--text-body); }
.crm-tl__meta { margin-top:3px; font:500 11.5px/1 var(--font-sans); color:var(--text-subtle); display:flex; align-items:center; gap:6px; }

/* ---- Task list ---- */
.crm-task { display:flex; align-items:flex-start; gap:11px; padding:11px 0; border-bottom:1px solid var(--border); }
.crm-task:last-child { border-bottom:0; }
.crm-task__box { width:19px; height:19px; border-radius:5px; border:1.5px solid var(--border-strong); background:var(--surface); flex:0 0 auto; margin-top:1px; cursor:pointer; display:grid; place-items:center; transition:all .14s var(--ease-out); }
.crm-task__box[data-done="1"] { background:var(--success-500); border-color:var(--success-500); color:#fff; }
.crm-task__txt { font:500 13px/1.4 var(--font-sans); color:var(--text-strong); }
.crm-task__txt[data-done="1"] { text-decoration:line-through; color:var(--text-subtle); font-weight:400; }
.crm-task__meta { margin-top:3px; font:500 11.5px/1 var(--font-sans); color:var(--text-muted); display:flex; gap:8px; align-items:center; }
.crm-prio { width:7px; height:7px; border-radius:999px; flex:0 0 auto; }

/* ---- Kanban ---- */
.crm-kb { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(268px,1fr); gap:16px; align-items:start; overflow-x:auto; padding-bottom:8px; }
.crm-kb__col { background:var(--stone-100); border-radius:var(--radius-card); display:flex; flex-direction:column; min-height:200px; }
.crm-kb__hd { display:flex; align-items:center; gap:8px; padding:13px 14px 10px; }
.crm-kb__hd b { font:600 13px/1 var(--font-sans); color:var(--text-strong); }
.crm-kb__count { min-width:20px; height:20px; padding:0 6px; border-radius:999px; background:var(--stone-300); color:var(--stone-800); font:600 11px/20px var(--font-sans); text-align:center; }
.crm-kb__hint { padding:0 14px 10px; font:400 11.5px/1.3 var(--font-sans); color:var(--text-subtle); }
.crm-kb__list { display:flex; flex-direction:column; gap:9px; padding:0 10px 12px; }
.crm-card { background:var(--surface); border:1px solid var(--border); border-radius:11px; padding:12px; cursor:grab; box-shadow:var(--shadow-xs, 0 1px 2px rgba(20,19,14,.06)); transition:box-shadow .14s var(--ease-out), transform .14s var(--ease-out); }
.crm-card:hover { box-shadow:var(--shadow-card-hover); transform:translateY(-2px); }
.crm-card__top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.crm-card__name { font:600 13.5px/1.2 var(--font-sans); color:var(--text-strong); }
.crm-card__interest { font:400 12px/1.4 var(--font-sans); color:var(--text-muted); margin-bottom:10px; }
.crm-card__foot { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.crm-card__budget { font-family:var(--font-display); font-weight:600; font-size:13.5px; color:var(--text-strong); }
.crm-card__chips { display:flex; align-items:center; gap:6px; }

/* temp dot */
.crm-temp { display:inline-flex; align-items:center; gap:5px; font:600 10.5px/1 var(--font-sans); letter-spacing:.06em; text-transform:uppercase; padding:3px 7px; border-radius:999px; }
.crm-temp--hot { color:var(--brick-700); background:var(--brick-50); }
.crm-temp--warm { color:var(--sun-600); background:var(--sun-100); }
.crm-temp--cold { color:var(--sea-700); background:var(--sea-50); }

.crm-lang { display:inline-grid; place-items:center; min-width:22px; height:18px; padding:0 5px; border-radius:4px; background:var(--stone-200); color:var(--stone-700); font:700 9.5px/1 var(--font-sans); letter-spacing:.04em; }

/* utility grid */
.crm-grid { display:grid; gap:16px; }

/* Messages-inbox styles are co-located in Messages.jsx (self-injected). */
@media (max-width:760px){ .crm-app { grid-template-columns:1fr; } .crm-sb { display:none; } }
`;

/* ---------- primitives ---------- */
function Avatar({
  tone = 'sand',
  initials = '',
  size = 34
}) {
  const bg = (TONE[tone] || TONE.sand).solid;
  return React.createElement('span', {
    className: 'crm-av',
    style: {
      width: size,
      height: size,
      background: bg,
      fontSize: Math.round(size * 0.38)
    }
  }, initials);
}
function StatusPill({
  tone = 'ink',
  label,
  dot = true
}) {
  const t = TONE[tone] || TONE.ink;
  return /*#__PURE__*/React.createElement("span", {
    className: "crm-pill",
    style: {
      color: t.fg,
      background: t.bg
    }
  }, dot && /*#__PURE__*/React.createElement("span", {
    className: "crm-pill__dot",
    style: {
      background: t.solid
    }
  }), label);
}
function Temp({
  level
}) {
  const map = {
    hot: 'Горещ',
    warm: 'Топъл',
    cold: 'Хладен'
  };
  return /*#__PURE__*/React.createElement("span", {
    className: 'crm-temp crm-temp--' + level
  }, map[level] || level);
}
function Lang({
  code
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "crm-lang"
  }, code);
}
function Segmented({
  options,
  value,
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-seg"
  }, options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    "data-on": value === o.value ? 1 : 0,
    onClick: () => onChange(o.value)
  }, o.label)));
}
function StatTile({
  icon,
  label,
  value,
  delta,
  trend,
  note,
  tone = 'ink'
}) {
  const t = TONE[tone] || TONE.ink;
  const arrow = trend === 'up' ? 'arrow-up-right' : trend === 'down' ? 'arrow-down-right' : 'minus';
  const sign = delta > 0 ? '+' + delta : String(delta);
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-stat"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-stat__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "crm-stat__label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "crm-stat__ic",
    style: {
      background: t.bg,
      color: t.solid
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 19
  }))), /*#__PURE__*/React.createElement("div", {
    className: "crm-stat__val"
  }, value), /*#__PURE__*/React.createElement("div", {
    className: "crm-stat__foot"
  }, delta !== undefined && /*#__PURE__*/React.createElement("span", {
    className: 'crm-delta crm-delta--' + trend
  }, /*#__PURE__*/React.createElement(Icon, {
    name: arrow,
    size: 12
  }), trend === 'up' ? sign + '%' : trend === 'flat' ? '—' : sign), /*#__PURE__*/React.createElement("span", null, note)));
}
function PageHeader({
  title,
  subtitle,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-ph"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, title), subtitle && /*#__PURE__*/React.createElement("p", null, subtitle)), children && /*#__PURE__*/React.createElement("div", {
    className: "crm-ph__actions"
  }, children));
}
function Panel({
  title,
  action,
  onAction,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("section", {
    className: "crm-panel",
    style: style
  }, title && /*#__PURE__*/React.createElement("div", {
    className: "crm-panel__hd"
  }, /*#__PURE__*/React.createElement("h3", null, title), action && /*#__PURE__*/React.createElement("a", {
    onClick: onAction
  }, action)), children);
}

/* Generic sortable table.
   columns: [{key,label,align,width,render(row),sort(row)}], rows, onRow(row) */
function DataTable({
  columns,
  rows,
  onRow
}) {
  const [sort, setSort] = React.useState({
    key: null,
    dir: 1
  });
  const sorted = React.useMemo(() => {
    if (!sort.key) return rows;
    const col = columns.find(c => c.key === sort.key);
    const get = col.sort || (r => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a),
        vb = get(b);
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
  }, [rows, sort, columns]);
  const toggle = k => setSort(s => s.key === k ? {
    key: k,
    dir: -s.dir
  } : {
    key: k,
    dir: 1
  });
  return /*#__PURE__*/React.createElement("table", {
    className: "crm-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, columns.map(c => /*#__PURE__*/React.createElement("th", {
    key: c.key,
    style: {
      textAlign: c.align,
      width: c.width
    },
    onClick: () => c.sortable !== false && toggle(c.key)
  }, /*#__PURE__*/React.createElement("span", {
    className: "th-in"
  }, c.label, sort.key === c.key && /*#__PURE__*/React.createElement(Icon, {
    name: sort.dir === 1 ? 'chevron-up' : 'chevron-down',
    size: 13
  })))))), /*#__PURE__*/React.createElement("tbody", null, sorted.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r.id || i,
    onClick: () => onRow && onRow(r)
  }, columns.map(c => /*#__PURE__*/React.createElement("td", {
    key: c.key,
    style: {
      textAlign: c.align
    }
  }, c.render ? c.render(r) : r[c.key]))))));
}
function Timeline({
  items,
  iconMap
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-tl"
  }, items.map((it, i) => {
    const cfg = iconMap[it.type] || {
      icon: 'circle',
      tone: 'ink'
    };
    const t = TONE[cfg.tone] || TONE.ink;
    return /*#__PURE__*/React.createElement("div", {
      className: "crm-tl__row",
      key: i
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-tl__ic",
      style: {
        background: t.bg,
        color: t.solid
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: cfg.icon,
      size: 16
    })), /*#__PURE__*/React.createElement("div", {
      className: "crm-tl__body"
    }, /*#__PURE__*/React.createElement("p", null, it.text), /*#__PURE__*/React.createElement("div", {
      className: "crm-tl__meta"
    }, it.agentName || it.agent, /*#__PURE__*/React.createElement("span", null, "\xB7"), it.time)));
  }));
}
function TaskList({
  tasks
}) {
  const [state, setState] = React.useState(() => Object.fromEntries(tasks.map(t => [t.id, t.done])));
  const prio = {
    high: 'var(--brick-500)',
    med: 'var(--sun-500)',
    low: 'var(--stone-400)'
  };
  return /*#__PURE__*/React.createElement("div", null, tasks.map(t => {
    const done = state[t.id];
    return /*#__PURE__*/React.createElement("div", {
      className: "crm-task",
      key: t.id
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-task__box",
      "data-done": done ? 1 : 0,
      onClick: () => setState(s => ({
        ...s,
        [t.id]: !s[t.id]
      }))
    }, done && /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 13
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-task__txt",
      "data-done": done ? 1 : 0
    }, t.text), /*#__PURE__*/React.createElement("div", {
      className: "crm-task__meta"
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-prio",
      style: {
        background: prio[t.priority]
      }
    }), t.due, t.lead && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", null, "\xB7"), t.lead))));
  }));
}
function KanbanCard({
  lead,
  agent,
  onOpen
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-card",
    onClick: () => onOpen && onOpen(lead)
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-card__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "crm-card__name"
  }, lead.name), /*#__PURE__*/React.createElement(Temp, {
    level: lead.temp
  })), /*#__PURE__*/React.createElement("div", {
    className: "crm-card__interest"
  }, lead.interest), /*#__PURE__*/React.createElement("div", {
    className: "crm-card__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "crm-card__budget"
  }, lead.deal === 'rent' ? window.CRM_DATA.eur(lead.budget) + '/мес' : window.CRM_DATA.eur(lead.budget)), /*#__PURE__*/React.createElement("div", {
    className: "crm-card__chips"
  }, /*#__PURE__*/React.createElement(Lang, {
    code: lead.lang
  }), agent && /*#__PURE__*/React.createElement(Avatar, {
    tone: agent.tone,
    initials: agent.initials,
    size: 24
  }))));
}

/* ---------- chrome ---------- */
const NAV = [{
  group: 'Работа'
}, {
  key: 'dashboard',
  label: 'Табло',
  icon: 'layout-dashboard'
}, {
  key: 'pipeline',
  label: 'Лийдове',
  icon: 'kanban-square',
  badge: 12
}, {
  key: 'messages',
  label: 'Съобщения',
  icon: 'messages-square',
  badge: 7
}, {
  key: 'calendar',
  label: 'Огледи',
  icon: 'calendar-days',
  badge: 9
}, {
  key: 'contacts',
  label: 'Контакти',
  icon: 'contact'
}, {
  group: 'Портфолио'
}, {
  key: 'listings',
  label: 'Имоти',
  icon: 'building-2'
}, {
  key: 'reports',
  label: 'Справки',
  icon: 'bar-chart-3'
}];
function Sidebar({
  route,
  onNavigate
}) {
  const {
    CRM_AGENTS,
    ME
  } = window.CRM_DATA;
  const me = CRM_AGENTS[ME];
  return /*#__PURE__*/React.createElement("aside", {
    className: "crm-sb"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-sb__brand"
  }, /*#__PURE__*/React.createElement(DS.Logo, {
    variant: "reversed",
    height: 30
  })), /*#__PURE__*/React.createElement("nav", {
    className: "crm-sb__nav"
  }, NAV.map((n, i) => n.group ? /*#__PURE__*/React.createElement("div", {
    className: "crm-sb__group",
    key: 'g' + i
  }, n.group) : /*#__PURE__*/React.createElement("button", {
    key: n.key,
    className: 'crm-nav' + (route === n.key ? ' crm-nav--on' : ''),
    onClick: () => onNavigate(n.key)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n.icon,
    size: 18
  }), n.label, n.badge && /*#__PURE__*/React.createElement("span", {
    className: "crm-nav__badge"
  }, n.badge)))), /*#__PURE__*/React.createElement("div", {
    className: "crm-sb__me"
  }, /*#__PURE__*/React.createElement(Avatar, {
    tone: me.tone,
    initials: me.initials,
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("b", null, me.name), /*#__PURE__*/React.createElement("span", null, me.role, " \xB7 ", me.office))));
}
function Topbar({
  title,
  subtitle,
  actions
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "crm-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "crm-top__title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "crm-top__sub"
  }, subtitle)), /*#__PURE__*/React.createElement("label", {
    className: "crm-top__search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 16
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "\u0422\u044A\u0440\u0441\u0438 \u043B\u0438\u0439\u0434, \u0438\u043C\u043E\u0442, \u043A\u043E\u043D\u0442\u0430\u043A\u0442\u2026"
  })), /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    variant: "ghost",
    "aria-label": "\u0418\u0437\u0432\u0435\u0441\u0442\u0438\u044F"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "plus",
    variant: "solid",
    "aria-label": "\u0414\u043E\u0431\u0430\u0432\u0438"
  }), actions);
}

/* inject styles once */
(function () {
  if (!document.getElementById('crm-kit-css')) {
    const s = document.createElement('style');
    s.id = 'crm-kit-css';
    s.textContent = crmCss;
    document.head.appendChild(s);
  }
})();
Object.assign(window, {
  CrmTONE: TONE,
  Avatar,
  StatusPill,
  Temp,
  Lang,
  Segmented,
  StatTile,
  PageHeader,
  Panel,
  DataTable,
  Timeline,
  TaskList,
  KanbanCard,
  Sidebar,
  Topbar
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/CrmKit.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Dashboard.jsx
try { (() => {
/* Dashboard — KPIs, today's viewings, new leads, tasks, activity. */
const {
  StatTile,
  PageHeader,
  Panel,
  Timeline,
  TaskList,
  Avatar,
  StatusPill,
  Temp,
  Lang,
  Segmented
} = window;
function Dashboard({
  onOpenLead,
  onNavigate
}) {
  const D = window.CRM_DATA;
  const {
    KPIS,
    VIEWINGS,
    VIEW_STATUS,
    LEADS,
    CRM_AGENTS,
    ACTIVITY,
    ACT_ICON,
    TASKS,
    STOCK,
    eur
  } = D;
  const DSc = window.MaklerRealtyDesignSystem_9b7f1e;
  const {
    Button,
    Icon
  } = DSc;
  const today = VIEWINGS.filter(v => v.day === 0 || v.day === 1);
  const newLeads = LEADS.filter(l => l.stage === 'new');
  const withNames = ACTIVITY.map(a => ({
    ...a,
    agentName: CRM_AGENTS[a.agent]?.name
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u0414\u043E\u0431\u0440\u043E \u0443\u0442\u0440\u043E, \u0415\u043B\u0435\u043D\u0430",
    subtitle: "\u0421\u044A\u0431\u043E\u0442\u0430, 4 \u044E\u043B\u0438 2026 \xB7 \u043E\u0444\u0438\u0441 \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438"
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: "me",
    onChange: () => {},
    options: [{
      value: 'me',
      label: 'Моите'
    }, {
      value: 'team',
      label: 'Екип'
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "plus"
  }, "\u041D\u043E\u0432 \u043B\u0438\u0439\u0434")), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid",
    style: {
      gridTemplateColumns: 'repeat(auto-fit,minmax(168px,1fr))',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    icon: "users",
    tone: "sea",
    label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0438 \u043B\u0438\u0439\u0434\u043E\u0432\u0435",
    value: "12",
    delta: 3,
    trend: "up",
    note: "\u0442\u0430\u0437\u0438 \u0441\u0435\u0434\u043C\u0438\u0446\u0430"
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "calendar-check",
    tone: "sun",
    label: "\u041E\u0433\u043B\u0435\u0434\u0438 \xB7 \u0441\u0435\u0434\u043C\u0438\u0446\u0430",
    value: "9",
    delta: 2,
    trend: "up",
    note: "\u043D\u0430\u0441\u0440\u043E\u0447\u0435\u043D\u0438"
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "file-text",
    tone: "brick",
    label: "\u0410\u043A\u0442\u0438\u0432\u043D\u0438 \u043E\u0444\u0435\u0440\u0442\u0438",
    value: "4",
    delta: 0,
    trend: "flat",
    note: "\u20AC700K \u0432 \u0438\u0433\u0440\u0430"
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "handshake",
    tone: "success",
    label: "\u0421\u0434\u0435\u043B\u043A\u0438 \xB7 \u043C\u0435\u0441\u0435\u0446",
    value: "2",
    delta: 1,
    trend: "up",
    note: "\u0441\u043F\u0435\u0447\u0435\u043B\u0435\u043D\u0438"
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "trending-up",
    tone: "ink",
    label: "\u041A\u043E\u043C\u0438\u0441\u0438\u043E\u043D\u0430 \xB7 \u043C\u0435\u0441\u0435\u0446",
    value: "\u20AC14,900",
    delta: 18,
    trend: "up",
    note: "\u0441\u043F\u0440\u044F\u043C\u043E \u043C\u0430\u0439"
  })), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid",
    style: {
      gridTemplateColumns: '1.6fr 1fr',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-grid"
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "\u0414\u043D\u0435\u0448\u043D\u0438 \u043E\u0433\u043B\u0435\u0434\u0438",
    action: "\u0412\u0438\u0436 \u043A\u0430\u043B\u0435\u043D\u0434\u0430\u0440\u0430 \u2192",
    onAction: () => onNavigate('calendar')
  }, /*#__PURE__*/React.createElement("div", null, today.map((v, i) => {
    const ag = CRM_AGENTS[v.agent];
    const st = VIEW_STATUS[v.status];
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '13px 18px',
        borderBottom: i < today.length - 1 ? '1px solid var(--border)' : 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--text-strong)',
        width: 92,
        flex: '0 0 auto'
      }
    }, D.WEEK[v.day].split(' ')[0], " ", String(v.start).padStart(2, '0'), ":00"), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 13.5,
        color: 'var(--text-strong)'
      }
    }, v.lead), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)'
      }
    }, v.listing, " \xB7 ", v.listing === 'MS-svlas' ? 'Свети Влас' : 'оглед на място')), /*#__PURE__*/React.createElement("span", {
      className: "crm-pill",
      style: {
        color: st.tone,
        background: 'color-mix(in srgb,' + st.tone + ' 12%, transparent)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-pill__dot",
      style: {
        background: st.tone
      }
    }), st.label), /*#__PURE__*/React.createElement(Avatar, {
      tone: ag.tone,
      initials: ag.initials,
      size: 28
    }));
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "\u041D\u043E\u0432\u0438 \u043B\u0438\u0439\u0434\u043E\u0432\u0435",
    action: "\u041E\u0442\u0432\u043E\u0440\u0438 \u0444\u0443\u043D\u0438\u044F\u0442\u0430 \u2192",
    onAction: () => onNavigate('pipeline')
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 10px 10px'
    }
  }, newLeads.map(l => {
    const ag = CRM_AGENTS[l.agent];
    return /*#__PURE__*/React.createElement("div", {
      key: l.id,
      onClick: () => onOpenLead(l),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 8px',
        borderRadius: 10,
        cursor: 'pointer'
      },
      onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-hover)',
      onMouseLeave: e => e.currentTarget.style.background = 'transparent'
    }, /*#__PURE__*/React.createElement(Avatar, {
      tone: ag.tone,
      initials: l.name.split(' ').map(w => w[0]).slice(0, 2).join(''),
      size: 34
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 7
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        fontSize: 13.5,
        color: 'var(--text-strong)'
      }
    }, l.name), /*#__PURE__*/React.createElement(Lang, {
      code: l.lang
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)'
      }
    }, l.interest)), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 13.5,
        color: 'var(--text-strong)'
      }
    }, l.deal === 'rent' ? eur(l.budget) + '/мес' : eur(l.budget)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11.5,
        color: 'var(--text-subtle)'
      }
    }, l.lastAct)), /*#__PURE__*/React.createElement(Temp, {
      level: l.temp
    }));
  })))), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid"
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "\u0417\u0430\u0434\u0430\u0447\u0438 \u0437\u0430 \u0434\u043D\u0435\u0441",
    action: "\u0412\u0441\u0438\u0447\u043A\u0438"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 18px 12px'
    }
  }, /*#__PURE__*/React.createElement(TaskList, {
    tasks: TASKS
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0430 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '6px 18px 14px'
    }
  }, /*#__PURE__*/React.createElement(Timeline, {
    items: withNames,
    iconMap: ACT_ICON
  })))))));
}
window.Dashboard = Dashboard;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Dashboard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/LeadDetail.jsx
try { (() => {
/* Lead detail — facts, stage stepper, matched listings, notes/activity, tasks. */
function LeadDetail({
  lead,
  onBack,
  onOpenListing
}) {
  const D = window.CRM_DATA;
  const {
    CRM_AGENTS,
    STAGES,
    STOCK,
    STOCK_STATUS,
    ACT_ICON,
    LANGS,
    SOURCES,
    eur
  } = D;
  const {
    Avatar,
    Temp,
    Lang,
    StatusPill,
    Panel,
    Timeline,
    TaskList
  } = window;
  const {
    Button,
    IconButton,
    Icon,
    Badge
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const ag = CRM_AGENTS[lead.agent];
  const src = SOURCES[lead.source];
  const matched = (lead.matched || []).map(id => STOCK.find(s => s.id === id)).filter(Boolean);
  const stageIdx = STAGES.findIndex(s => s.key === lead.stage);
  const feed = [lead.offer && {
    type: 'offer',
    agentName: ag.name,
    text: 'Подадена оферта ' + eur(lead.offer) + (lead.matched ? ' за ' + STOCK.find(s => s.id === lead.matched[0])?.ref : ''),
    time: lead.lastAct
  }, {
    type: 'viewing',
    agentName: ag.name,
    text: 'Оглед на ' + (matched[0]?.ref || 'имот') + ' — клиентът остана впечатлен',
    time: 'преди 2 дни'
  }, {
    type: 'call',
    agentName: ag.name,
    text: 'Изходящо обаждане (8 мин) — уточнени критерии за търсене',
    time: 'преди 3 дни'
  }, {
    type: 'note',
    agentName: ag.name,
    text: 'Бюджет до ' + eur(lead.budget) + '. Интерес: ' + lead.interest.toLowerCase() + '.',
    time: lead.created
  }, {
    type: 'lead',
    agentName: ag.name,
    text: 'Лийд създаден от ' + src.label,
    time: lead.created
  }].filter(Boolean);
  const leadTasks = D.TASKS.filter(t => t.lead === lead.name);
  const Fact = ({
    icon,
    label,
    children
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 11,
      padding: '10px 0',
      borderBottom: '1px solid var(--border)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 17,
    style: {
      color: 'var(--text-subtle)',
      flex: '0 0 auto',
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '600 10.5px/1 var(--font-sans)',
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: 4
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 500,
      color: 'var(--text-strong)'
    }
  }, children)));
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap"
  }, /*#__PURE__*/React.createElement("button", {
    className: "crm-nav",
    style: {
      width: 'auto',
      color: 'var(--text-muted)',
      padding: '6px 10px 6px 0',
      marginBottom: 8
    },
    onClick: onBack
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrow-left",
    size: 16
  }), " \u041E\u0431\u0440\u0430\u0442\u043D\u043E \u043A\u044A\u043C \u043B\u0438\u0439\u0434\u043E\u0432\u0435\u0442\u0435"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      marginBottom: 22,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    tone: ag.tone,
    initials: lead.name.split(' ').map(w => w[0]).slice(0, 2).join(''),
    size: 54
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      margin: 0,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 25,
      letterSpacing: '-.015em',
      color: 'var(--text-strong)'
    }
  }, lead.name), /*#__PURE__*/React.createElement(Temp, {
    level: lead.temp
  }), /*#__PURE__*/React.createElement(Lang, {
    code: lead.lang
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 5,
      fontSize: 13.5,
      color: 'var(--text-muted)',
      display: 'flex',
      gap: 14,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "crm-mono"
  }, lead.id), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: src.icon,
    size: 13,
    style: {
      verticalAlign: '-2px'
    }
  }), " ", src.label), /*#__PURE__*/React.createElement("span", null, lead.deal === 'rent' ? 'Търси под наем' : 'Купувач'))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "phone"
  }, "\u041E\u0431\u0430\u0434\u0438 \u0441\u0435"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "mail"
  }, "\u0418\u043C\u0435\u0439\u043B"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "calendar-plus"
  }, "\u041D\u0430\u0441\u0440\u043E\u0447\u0438 \u043E\u0433\u043B\u0435\u0434"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      marginBottom: 22
    }
  }, STAGES.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: s.key,
    style: {
      flex: 1,
      padding: '10px 14px',
      borderRadius: 10,
      background: i <= stageIdx ? 'var(--ink-800)' : 'var(--stone-100)',
      color: i <= stageIdx ? '#fff' : 'var(--text-muted)',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '600 10.5px/1 var(--font-sans)',
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      opacity: i <= stageIdx ? .7 : 1
    }
  }, "\u0415\u0442\u0430\u043F ", i + 1), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      fontSize: 13.5,
      marginTop: 4,
      display: 'flex',
      alignItems: 'center',
      gap: 6
    }
  }, i < stageIdx && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 14
  }), s.label)))), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid",
    style: {
      gridTemplateColumns: '1fr 340px',
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-grid"
  }, /*#__PURE__*/React.createElement(Panel, {
    title: 'Свързани имоти · ' + matched.length
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 8
    }
  }, matched.map((m, i) => {
    const ss = STOCK_STATUS[m.status];
    return /*#__PURE__*/React.createElement("div", {
      key: m.id,
      onClick: () => onOpenListing && onOpenListing('listings'),
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 10px',
        borderRadius: 10,
        cursor: 'pointer'
      },
      onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-hover)',
      onMouseLeave: e => e.currentTarget.style.background = 'transparent'
    }, /*#__PURE__*/React.createElement("div", {
      className: 'mk-photo mk-photo--' + (m.location.includes('Влас') ? 'sea' : m.location.includes('Банско') ? 'pine' : 'sand'),
      style: {
        width: 64,
        height: 48,
        borderRadius: 8,
        flex: '0 0 auto'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 13.5,
        color: 'var(--text-strong)'
      }
    }, m.title), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12.5,
        color: 'var(--text-muted)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-mono"
    }, m.ref), " \xB7 ", m.location, " \xB7 ", m.area, " m\xB2")), /*#__PURE__*/React.createElement("div", {
      style: {
        textAlign: 'right'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-price"
    }, m.deal === 'rent' ? eur(m.price) + '/мес' : eur(m.price)), /*#__PURE__*/React.createElement(Badge, {
      variant: ss.badge,
      size: "sm"
    }, ss.label)));
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "\u0411\u0435\u043B\u0435\u0436\u043A\u0438 \u0438 \u0430\u043A\u0442\u0438\u0432\u043D\u043E\u0441\u0442",
    action: "+ \u0414\u043E\u0431\u0430\u0432\u0438 \u0431\u0435\u043B\u0435\u0436\u043A\u0430"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 18px 14px'
    }
  }, /*#__PURE__*/React.createElement(Timeline, {
    items: feed,
    iconMap: ACT_ICON
  })))), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid"
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "\u0414\u0430\u043D\u043D\u0438 \u0437\u0430 \u043A\u043E\u043D\u0442\u0430\u043A\u0442"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 18px 14px'
    }
  }, /*#__PURE__*/React.createElement(Fact, {
    icon: "phone",
    label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D"
  }, lead.phone), /*#__PURE__*/React.createElement(Fact, {
    icon: "mail",
    label: "\u0418\u043C\u0435\u0439\u043B"
  }, lead.email), /*#__PURE__*/React.createElement(Fact, {
    icon: "languages",
    label: "\u0415\u0437\u0438\u043A"
  }, LANGS[lead.lang]), /*#__PURE__*/React.createElement(Fact, {
    icon: "map-pin",
    label: "\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u043D\u0430 \u0438\u043D\u0442\u0435\u0440\u0435\u0441"
  }, lead.location), /*#__PURE__*/React.createElement(Fact, {
    icon: "wallet",
    label: "\u0411\u044E\u0434\u0436\u0435\u0442"
  }, lead.deal === 'rent' ? eur(lead.budget) + '/мес' : eur(lead.budget)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 11,
      padding: '10px 0 2px'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "user-round",
    size: 17,
    style: {
      color: 'var(--text-subtle)',
      marginTop: 1
    }
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      font: '600 10.5px/1 var(--font-sans)',
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      marginBottom: 6
    }
  }, "\u041E\u0442\u0433\u043E\u0432\u043E\u0440\u0435\u043D \u0431\u0440\u043E\u043A\u0435\u0440"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    tone: ag.tone,
    initials: ag.initials,
    size: 26
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13.5,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, ag.name)))))), /*#__PURE__*/React.createElement(Panel, {
    title: 'Задачи · ' + leadTasks.length
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '4px 18px 12px'
    }
  }, leadTasks.length ? /*#__PURE__*/React.createElement(TaskList, {
    tasks: leadTasks
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '14px 0',
      fontSize: 13,
      color: 'var(--text-subtle)'
    }
  }, "\u041D\u044F\u043C\u0430 \u043E\u0442\u0432\u043E\u0440\u0435\u043D\u0438 \u0437\u0430\u0434\u0430\u0447\u0438.")))))));
}
window.LeadDetail = LeadDetail;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/LeadDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Listings.jsx
try { (() => {
/* Listings — the agency's managed stock, with statuses & performance. */
function Listings() {
  const D = window.CRM_DATA;
  const {
    STOCK,
    STOCK_STATUS,
    CRM_AGENTS,
    eur
  } = D;
  const {
    PageHeader,
    Panel,
    DataTable,
    Avatar,
    Segmented
  } = window;
  const {
    Button,
    Badge,
    Icon
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [status, setStatus] = React.useState('all');
  const rows = status === 'all' ? STOCK : STOCK.filter(s => s.status === status);
  const counts = Object.keys(STOCK_STATUS).reduce((a, k) => (a[k] = STOCK.filter(s => s.status === k).length, a), {});
  const tone = loc => loc.includes('Влас') ? 'sea' : loc.includes('Банско') ? 'pine' : loc.includes('Гърция') ? 'sunset' : 'sand';
  const columns = [{
    key: 'title',
    label: 'Имот',
    render: r => /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: 'mk-photo mk-photo--' + tone(r.location),
      style: {
        width: 52,
        height: 40,
        borderRadius: 7,
        flex: '0 0 auto'
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-tbl__primary"
    }, r.title), /*#__PURE__*/React.createElement("div", {
      className: "crm-tbl__muted"
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-mono"
    }, r.ref), " \xB7 ", r.type, " \xB7 ", r.area, " m\xB2")))
  }, {
    key: 'location',
    label: 'Локация',
    render: r => /*#__PURE__*/React.createElement("span", {
      className: "crm-tbl__muted"
    }, r.location)
  }, {
    key: 'price',
    label: 'Цена',
    align: 'right',
    sort: r => r.price,
    render: r => /*#__PURE__*/React.createElement("span", {
      className: "crm-price"
    }, r.deal === 'rent' ? eur(r.price) + '/мес' : eur(r.price))
  }, {
    key: 'status',
    label: 'Статус',
    sort: r => r.status,
    render: r => /*#__PURE__*/React.createElement(Badge, {
      variant: STOCK_STATUS[r.status].badge,
      size: "sm"
    }, STOCK_STATUS[r.status].label)
  }, {
    key: 'views',
    label: 'Показвания',
    align: 'right',
    sort: r => r.views,
    render: r => /*#__PURE__*/React.createElement("span", null, r.views.toLocaleString('en-US'))
  }, {
    key: 'enquiries',
    label: 'Запитвания',
    align: 'right',
    sort: r => r.enquiries,
    render: r => /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontWeight: r.enquiries > 20 ? 600 : 400,
        color: r.enquiries > 20 ? 'var(--brick-700)' : 'inherit'
      }
    }, r.enquiries > 20 && /*#__PURE__*/React.createElement(Icon, {
      name: "flame",
      size: 13
    }), r.enquiries)
  }, {
    key: 'agent',
    label: 'Брокер',
    sort: r => CRM_AGENTS[r.agent].name,
    render: r => {
      const a = CRM_AGENTS[r.agent];
      return /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 7
        }
      }, /*#__PURE__*/React.createElement(Avatar, {
        tone: a.tone,
        initials: a.initials,
        size: 24
      }), /*#__PURE__*/React.createElement("span", {
        style: {
          fontSize: 12.5
        }
      }, a.name.split(' ')[0]));
    }
  }, {
    key: 'listed',
    label: 'Публикувана',
    sort: r => r.listed,
    render: r => /*#__PURE__*/React.createElement("span", {
      className: "crm-tbl__muted"
    }, r.listed.slice(5))
  }];
  const filters = [{
    value: 'all',
    label: 'Всички · ' + STOCK.length
  }].concat(Object.entries(STOCK_STATUS).map(([k, v]) => ({
    value: k,
    label: v.label + ' · ' + counts[k]
  })));
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u0418\u043C\u043E\u0442\u0438",
    subtitle: STOCK.length + ' обекта в портфолиото · ' + counts.active + ' активни, ' + counts.reserved + ' резервирани'
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "download"
  }, "\u0415\u043A\u0441\u043F\u043E\u0440\u0442"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "plus"
  }, "\u041D\u043E\u0432 \u0438\u043C\u043E\u0442")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: status,
    onChange: setStatus,
    options: filters
  })), /*#__PURE__*/React.createElement(Panel, null, /*#__PURE__*/React.createElement("div", {
    style: {
      overflowX: 'auto'
    }
  }, /*#__PURE__*/React.createElement(DataTable, {
    columns: columns,
    rows: rows,
    onRow: () => {}
  })))));
}
window.Listings = Listings;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Listings.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Messages.jsx
try { (() => {
/* Messages — multichannel inbox: conversation list + thread + composer.
   Screen-specific CSS is self-injected here (co-located with the screen). */
(function () {
  if (document.getElementById('crm-msg-css')) return;
  const s = document.createElement('style');
  s.id = 'crm-msg-css';
  s.textContent = `
.crm-msg { flex:1 1 auto; display:grid; grid-template-columns:340px 1fr; min-height:0; border-top:1px solid var(--border); }
.crm-msg__list { display:flex; flex-direction:column; min-height:0; border-right:1px solid var(--border); background:var(--surface); }
.crm-msg__filters { padding:14px 16px; border-bottom:1px solid var(--border); }
.crm-msg__scroll { flex:1 1 auto; overflow-y:auto; }
.crm-conv { display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left; border:0; background:transparent; padding:13px 16px; cursor:pointer; border-bottom:1px solid var(--border); position:relative; transition:background .12s var(--ease-out); }
.crm-conv:hover { background:var(--surface-hover); }
.crm-conv--on { background:var(--brick-50); }
.crm-conv--on::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--brick-500); }
.crm-conv__ch { position:absolute; right:-3px; bottom:-3px; width:18px; height:18px; border-radius:999px; display:grid; place-items:center; color:#fff; border:2px solid var(--surface); }
.crm-conv__on { position:absolute; right:-1px; top:-1px; width:11px; height:11px; border-radius:999px; background:var(--success-500); border:2px solid var(--surface); }
.crm-conv__top { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
.crm-conv__name { font:600 13.5px/1.2 var(--font-sans); color:var(--text-strong); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.crm-conv__time { font:400 11px/1 var(--font-sans); color:var(--text-subtle); flex:0 0 auto; }
.crm-conv__row { display:flex; align-items:center; gap:8px; margin:3px 0 4px; }
.crm-conv__prev { font:400 12.5px/1.35 var(--font-sans); color:var(--text-muted); flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.crm-conv__badge { flex:0 0 auto; min-width:18px; height:18px; padding:0 6px; border-radius:999px; background:var(--brick-600); color:#fff; font:600 10.5px/18px var(--font-sans); text-align:center; }
.crm-conv__meta { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--text-subtle); }
.crm-conv--on .crm-conv__prev { color:var(--text-body); }
.crm-msg__thread { display:flex; flex-direction:column; min-height:0; background:var(--stone-50); }
.crm-thd__hd { display:flex; align-items:center; gap:12px; padding:14px 20px; background:var(--surface); border-bottom:1px solid var(--border); flex:0 0 auto; }
.crm-thd__body { flex:1 1 auto; overflow-y:auto; padding:20px 26px; display:flex; flex-direction:column; gap:3px; }
.crm-thd__day { align-self:center; font:600 11px/1 var(--font-sans); color:var(--text-subtle); background:var(--stone-200); padding:5px 12px; border-radius:999px; margin:2px 0 14px; }
.crm-bub__wrap { display:flex; margin:3px 0; }
.crm-bub__wrap.out { justify-content:flex-end; }
.crm-bub { max-width:62%; padding:10px 13px; border-radius:14px; font:400 13.5px/1.5 var(--font-sans); position:relative; box-shadow:var(--shadow-xs,0 1px 2px rgba(20,19,14,.05)); }
.crm-bub--in { background:var(--surface); color:var(--text-body); border-bottom-left-radius:4px; border:1px solid var(--border); }
.crm-bub--out { background:var(--ink-800); color:var(--stone-50); border-bottom-right-radius:4px; }
.crm-bub__t { display:block; margin-top:5px; font:500 10.5px/1 var(--font-sans); opacity:.6; text-align:right; }
.crm-bub__orig { margin-top:7px; padding-top:7px; border-top:1px solid color-mix(in srgb,currentColor 18%,transparent); }
.crm-bub__orig button { display:inline-flex; align-items:center; gap:5px; border:0; background:transparent; cursor:pointer; font:600 11px/1 var(--font-sans); color:inherit; opacity:.7; padding:0; }
.crm-bub__orig button:hover { opacity:1; }
.crm-bub__origtxt { margin-top:6px; font:400 12.5px/1.45 var(--font-sans); opacity:.72; font-style:italic; }
.crm-thd__composer { flex:0 0 auto; background:var(--surface); border-top:1px solid var(--border); padding:12px 20px 14px; }
.crm-thd__quick { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
.crm-chip { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border-strong); background:var(--surface); border-radius:999px; padding:6px 12px; font:500 12px/1 var(--font-sans); color:var(--text-body); cursor:pointer; transition:all .12s var(--ease-out); }
.crm-chip:hover { border-color:var(--brick-400); color:var(--brick-700); background:var(--brick-50); }
.crm-thd__input { display:flex; align-items:center; gap:8px; border:1px solid var(--border-strong); border-radius:var(--radius-button); padding:5px 6px 5px 8px; background:var(--surface); }
.crm-thd__input input { flex:1; border:0; outline:0; background:transparent; font:400 13.5px/1 var(--font-sans); color:var(--text-body); padding:8px 4px; }
`;
  document.head.appendChild(s);
})();
function Messages({
  onOpenLead
}) {
  const D = window.CRM_DATA;
  const {
    CONVERSATIONS,
    CHANNELS,
    CRM_AGENTS,
    LEADS,
    LANGS
  } = D;
  const {
    PageHeader,
    Avatar,
    Lang,
    Segmented
  } = window;
  const {
    Button,
    IconButton,
    Icon
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [activeId, setActiveId] = React.useState(CONVERSATIONS[0].id);
  const [filter, setFilter] = React.useState('all');
  const [showOrig, setShowOrig] = React.useState({});
  const totalUnread = CONVERSATIONS.reduce((s, c) => s + c.unread, 0);
  const list = React.useMemo(() => {
    let l = filter === 'unread' ? CONVERSATIONS.filter(c => c.unread > 0) : filter === 'mine' ? CONVERSATIONS.filter(c => c.agent === D.ME) : CONVERSATIONS;
    return [...l].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [filter]);
  const active = CONVERSATIONS.find(c => c.id === activeId);
  const initials = n => n.split(' ').map(w => w[0]).slice(0, 2).join('');
  const chTone = k => window.CrmTONE[CHANNELS[k].tone];
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll",
    style: {
      padding: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '26px 26px 16px'
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u0421\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u044F",
    subtitle: CONVERSATIONS.length + ' разговора · ' + totalUnread + ' непрочетени'
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "check-check"
  }, "\u041C\u0430\u0440\u043A\u0438\u0440\u0430\u0439 \u043F\u0440\u043E\u0447\u0435\u0442\u0435\u043D\u0438"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "pencil"
  }, "\u041D\u043E\u0432\u043E \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435"))), /*#__PURE__*/React.createElement("div", {
    className: "crm-msg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-msg__list"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-msg__filters"
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: filter,
    onChange: setFilter,
    options: [{
      value: 'all',
      label: 'Всички'
    }, {
      value: 'unread',
      label: 'Непрочетени · ' + totalUnread
    }, {
      value: 'mine',
      label: 'Моите'
    }]
  })), /*#__PURE__*/React.createElement("div", {
    className: "crm-msg__scroll"
  }, list.map(c => {
    const ag = CRM_AGENTS[c.agent];
    const ch = CHANNELS[c.channel];
    const on = c.id === activeId;
    return /*#__PURE__*/React.createElement("button", {
      key: c.id,
      className: 'crm-conv' + (on ? ' crm-conv--on' : ''),
      onClick: () => setActiveId(c.id)
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative',
        flex: '0 0 auto'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      tone: ag.tone,
      initials: initials(c.name),
      size: 42
    }), /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__ch",
      style: {
        background: chTone(c.channel).solid
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: ch.icon,
      size: 11
    })), c.online && /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__on"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-conv__top"
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__name"
    }, c.pinned && /*#__PURE__*/React.createElement(Icon, {
      name: "pin",
      size: 12,
      style: {
        color: 'var(--text-subtle)',
        marginRight: 4,
        verticalAlign: '-1px'
      }
    }), c.name), /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__time"
    }, c.last)), /*#__PURE__*/React.createElement("div", {
      className: "crm-conv__row"
    }, /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__prev"
    }, c.preview), c.unread > 0 && /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__badge"
    }, c.unread)), /*#__PURE__*/React.createElement("div", {
      className: "crm-conv__meta"
    }, /*#__PURE__*/React.createElement(Lang, {
      code: c.lang
    }), " ", /*#__PURE__*/React.createElement("span", {
      className: "crm-mono"
    }, c.lead))));
  }))), active && (() => {
    const ag = CRM_AGENTS[active.agent];
    const ch = CHANNELS[active.channel];
    const lead = LEADS.find(l => l.id === active.lead);
    return /*#__PURE__*/React.createElement("div", {
      className: "crm-msg__thread"
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-thd__hd"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      tone: ag.tone,
      initials: initials(active.name),
      size: 40
    }), active.online && /*#__PURE__*/React.createElement("span", {
      className: "crm-conv__on"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("b", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 15.5,
        color: 'var(--text-strong)'
      }
    }, active.name), /*#__PURE__*/React.createElement(Lang, {
      code: active.lang
    }), /*#__PURE__*/React.createElement("span", {
      className: "crm-pill",
      style: {
        color: chTone(active.channel).fg,
        background: chTone(active.channel).bg
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: ch.icon,
      size: 12
    }), ch.label)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--text-muted)',
        marginTop: 2
      }
    }, active.online ? 'Онлайн сега' : 'Активен ' + active.last, " \xB7 ", LANGS[active.lang])), /*#__PURE__*/React.createElement(IconButton, {
      icon: "phone",
      variant: "ghost",
      "aria-label": "\u041E\u0431\u0430\u0434\u0438 \u0441\u0435"
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "calendar-plus",
      variant: "ghost",
      "aria-label": "\u041D\u0430\u0441\u0440\u043E\u0447\u0438 \u043E\u0433\u043B\u0435\u0434"
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      size: "sm",
      iconEnd: "arrow-right",
      onClick: () => lead && onOpenLead(lead)
    }, "\u041E\u0442\u0432\u043E\u0440\u0438 \u043B\u0438\u0439\u0434\u0430")), /*#__PURE__*/React.createElement("div", {
      className: "crm-thd__body"
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-thd__day"
    }, "\u0414\u043D\u0435\u0441"), active.messages.map((m, i) => {
      const isOut = m.dir === 'out';
      const showO = showOrig[active.id + i];
      return /*#__PURE__*/React.createElement("div", {
        key: i,
        className: 'crm-bub__wrap ' + (isOut ? 'out' : 'in')
      }, /*#__PURE__*/React.createElement("div", {
        className: 'crm-bub ' + (isOut ? 'crm-bub--out' : 'crm-bub--in')
      }, /*#__PURE__*/React.createElement("div", null, m.text), m.orig && /*#__PURE__*/React.createElement("div", {
        className: "crm-bub__orig"
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => setShowOrig(s => ({
          ...s,
          [active.id + i]: !s[active.id + i]
        }))
      }, /*#__PURE__*/React.createElement(Icon, {
        name: "languages",
        size: 12
      }), showO ? 'Скрий оригинала' : 'Виж оригинала (' + active.lang + ')'), showO && /*#__PURE__*/React.createElement("div", {
        className: "crm-bub__origtxt"
      }, m.orig)), /*#__PURE__*/React.createElement("span", {
        className: "crm-bub__t"
      }, m.t, isOut && /*#__PURE__*/React.createElement(Icon, {
        name: "check-check",
        size: 13,
        style: {
          marginLeft: 3,
          verticalAlign: '-2px'
        }
      }))));
    })), /*#__PURE__*/React.createElement("div", {
      className: "crm-thd__composer"
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-thd__quick"
    }, /*#__PURE__*/React.createElement("button", {
      className: "crm-chip"
    }, "\u0421\u0432\u043E\u0431\u043E\u0434\u0435\u043D \u0435 \u2705"), /*#__PURE__*/React.createElement("button", {
      className: "crm-chip"
    }, "\u0429\u0435 \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u044F \u043E\u0433\u043B\u0435\u0434"), /*#__PURE__*/React.createElement("button", {
      className: "crm-chip"
    }, "\u0418\u0437\u043F\u0440\u0430\u0449\u0430\u043C \u0434\u0435\u0442\u0430\u0439\u043B\u0438"), /*#__PURE__*/React.createElement("button", {
      className: "crm-chip",
      style: {
        marginLeft: 'auto'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "sparkles",
      size: 13
    }), " \u041F\u0440\u0435\u0432\u0435\u0434\u0438 \u043E\u0442\u0433\u043E\u0432\u043E\u0440\u0430")), /*#__PURE__*/React.createElement("div", {
      className: "crm-thd__input"
    }, /*#__PURE__*/React.createElement(IconButton, {
      icon: "paperclip",
      variant: "ghost",
      "aria-label": "\u041F\u0440\u0438\u043A\u0430\u0447\u0438"
    }), /*#__PURE__*/React.createElement("input", {
      placeholder: 'Отговори на ' + active.name.split(' ')[0] + '…'
    }), /*#__PURE__*/React.createElement(IconButton, {
      icon: "smile",
      variant: "ghost",
      "aria-label": "\u0415\u043C\u043E\u0434\u0436\u0438"
    }), /*#__PURE__*/React.createElement(Button, {
      variant: "primary",
      size: "sm",
      iconEnd: "send"
    }, "\u0418\u0437\u043F\u0440\u0430\u0442\u0438"))));
  })()));
}
window.Messages = Messages;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Messages.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Pipeline.jsx
try { (() => {
/* Pipeline — kanban board of leads by stage. */
function Pipeline({
  onOpenLead
}) {
  const D = window.CRM_DATA;
  const {
    STAGES,
    LEADS,
    CRM_AGENTS,
    eur
  } = D;
  const {
    PageHeader,
    KanbanCard,
    Segmented
  } = window;
  const {
    Button,
    Icon
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const [deal, setDeal] = React.useState('all');
  const leads = deal === 'all' ? LEADS : LEADS.filter(l => l.deal === deal);
  const byStage = k => leads.filter(l => l.stage === k);
  const stageValue = k => byStage(k).reduce((s, l) => s + (l.deal === 'rent' ? 0 : l.budget), 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap",
    style: {
      maxWidth: 1400
    }
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u041B\u0438\u0439\u0434\u043E\u0432\u0435",
    subtitle: leads.length + ' активни лийда · €' + (stageValue('new') + stageValue('viewing') + stageValue('offer')).toLocaleString('en-US') + ' потенциал'
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: deal,
    onChange: setDeal,
    options: [{
      value: 'all',
      label: 'Всички'
    }, {
      value: 'sale',
      label: 'Продажба'
    }, {
      value: 'rent',
      label: 'Наем'
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "sliders-horizontal"
  }, "\u0424\u0438\u043B\u0442\u0440\u0438"), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm",
    iconStart: "plus"
  }, "\u041D\u043E\u0432 \u043B\u0438\u0439\u0434")), /*#__PURE__*/React.createElement("div", {
    className: "crm-kb"
  }, STAGES.map(st => {
    const items = byStage(st.key);
    const val = stageValue(st.key);
    return /*#__PURE__*/React.createElement("div", {
      className: "crm-kb__col",
      key: st.key
    }, /*#__PURE__*/React.createElement("div", {
      className: "crm-kb__hd"
    }, /*#__PURE__*/React.createElement("b", null, st.label), /*#__PURE__*/React.createElement("span", {
      className: "crm-kb__count"
    }, items.length), val > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        marginLeft: 'auto',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 12.5,
        color: 'var(--text-muted)'
      }
    }, "\u20AC", val.toLocaleString('en-US'))), /*#__PURE__*/React.createElement("div", {
      className: "crm-kb__hint"
    }, st.hint), /*#__PURE__*/React.createElement("div", {
      className: "crm-kb__list"
    }, items.map(l => /*#__PURE__*/React.createElement(KanbanCard, {
      key: l.id,
      lead: l,
      agent: CRM_AGENTS[l.agent],
      onOpen: onOpenLead
    })), /*#__PURE__*/React.createElement("button", {
      className: "crm-nav",
      style: {
        color: 'var(--text-subtle)',
        justifyContent: 'center',
        border: '1px dashed var(--border-strong)',
        background: 'transparent',
        borderRadius: 11,
        padding: '9px'
      },
      onMouseEnter: e => e.currentTarget.style.color = 'var(--text-body)',
      onMouseLeave: e => e.currentTarget.style.color = 'var(--text-subtle)'
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 15
    }), " \u0414\u043E\u0431\u0430\u0432\u0438")));
  }))));
}
window.Pipeline = Pipeline;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Pipeline.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/Reports.jsx
try { (() => {
/* Reports — funnel, lead sources, monthly deals, agent leaderboard. */
function Reports() {
  const D = window.CRM_DATA;
  const {
    REPORTS,
    CRM_AGENTS,
    eur
  } = D;
  const {
    PageHeader,
    Panel,
    StatTile,
    Avatar,
    Segmented
  } = window;
  const {
    Button,
    Icon
  } = window.MaklerRealtyDesignSystem_9b7f1e;
  const tv = t => window.CrmTONE[t]?.solid || 'var(--ink-700)';
  const maxRev = Math.max(...REPORTS.months.map(m => m.revenue));
  const maxFun = REPORTS.funnel[0].value;
  const maxAg = Math.max(...REPORTS.byAgent.map(a => a.volume));
  return /*#__PURE__*/React.createElement("div", {
    className: "crm-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "crm-wrap"
  }, /*#__PURE__*/React.createElement(PageHeader, {
    title: "\u0421\u043F\u0440\u0430\u0432\u043A\u0438",
    subtitle: "\u0420\u0435\u0437\u0443\u043B\u0442\u0430\u0442\u0438 \u043D\u0430 \u0435\u043A\u0438\u043F\u0430 \xB7 \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0438 7 \u043C\u0435\u0441\u0435\u0446\u0430"
  }, /*#__PURE__*/React.createElement(Segmented, {
    value: "q",
    onChange: () => {},
    options: [{
      value: 'm',
      label: 'Месец'
    }, {
      value: 'q',
      label: 'Тримесечие'
    }, {
      value: 'y',
      label: 'Година'
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    iconStart: "download"
  }, "\u0415\u043A\u0441\u043F\u043E\u0440\u0442")), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid",
    style: {
      gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(StatTile, {
    icon: "handshake",
    tone: "success",
    label: "\u0421\u0434\u0435\u043B\u043A\u0438 \xB7 \u0442\u0440\u0438\u043C\u0435\u0441\u0435\u0447\u0438\u0435",
    value: "13",
    delta: 24,
    trend: "up",
    note: "\u0441\u043F\u0440\u044F\u043C\u043E \u043F\u0440\u0435\u0434\u0445."
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "banknote",
    tone: "ink",
    label: "\u041E\u0431\u043E\u0440\u043E\u0442",
    value: "\u20AC3.26M",
    delta: 12,
    trend: "up",
    note: "\u043E\u0431\u0435\u043C \u0441\u0434\u0435\u043B\u043A\u0438"
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "percent",
    tone: "brick",
    label: "\u041A\u043E\u043D\u0432\u0435\u0440\u0441\u0438\u044F",
    value: "12.5%",
    delta: 2,
    trend: "up",
    note: "\u0437\u0430\u043F\u0438\u0442\u0432\u0430\u043D\u0435 \u2192 \u0441\u0434\u0435\u043B\u043A\u0430"
  }), /*#__PURE__*/React.createElement(StatTile, {
    icon: "clock",
    tone: "sun",
    label: "\u0421\u0440. \u0432\u0440\u0435\u043C\u0435 \u0434\u043E \u0441\u0434\u0435\u043B\u043A\u0430",
    value: "38 \u0434\u043D\u0438",
    delta: -4,
    trend: "down",
    note: "\u043F\u043E-\u0431\u044A\u0440\u0437\u043E"
  })), /*#__PURE__*/React.createElement("div", {
    className: "crm-grid",
    style: {
      gridTemplateColumns: '1fr 1fr',
      alignItems: 'start',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement(Panel, {
    title: "\u0424\u0443\u043D\u0438\u044F \u043D\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0431\u0438\u0442\u0435",
    "data-om-raster": true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, REPORTS.funnel.map((f, i) => {
    const pct = Math.round(f.value / maxFun * 100);
    const conv = i > 0 ? Math.round(f.value / REPORTS.funnel[i - 1].value * 100) : 100;
    return /*#__PURE__*/React.createElement("div", {
      key: f.stage
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 5,
        fontSize: 12.5
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 600,
        color: 'var(--text-strong)'
      }
    }, f.stage), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-muted)'
      }
    }, f.value, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-subtle)',
        marginLeft: 8
      }
    }, conv, "%"))), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 30,
        borderRadius: 7,
        background: 'var(--stone-100)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: pct + '%',
        height: '100%',
        borderRadius: 7,
        background: 'color-mix(in srgb, var(--ink-800) ' + (55 + i * 12) + '%, var(--brick-500))'
      }
    })));
  }))), /*#__PURE__*/React.createElement(Panel, {
    title: "\u0418\u0437\u0442\u043E\u0447\u043D\u0438\u0446\u0438 \u043D\u0430 \u043B\u0438\u0439\u0434\u043E\u0432\u0435",
    "data-om-raster": true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '18px 20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 13
    }
  }, REPORTS.sources.map(s => /*#__PURE__*/React.createElement("div", {
    key: s.label,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 78,
      fontSize: 12.5,
      color: 'var(--text-body)',
      flex: '0 0 auto'
    }
  }, s.label), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 12,
      borderRadius: 999,
      background: 'var(--stone-100)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: s.value + '%',
      height: '100%',
      borderRadius: 999,
      background: tv(s.tone)
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      textAlign: 'right',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, s.value, "%")))))), /*#__PURE__*/React.createElement(Panel, {
    title: "\u0421\u0434\u0435\u043B\u043A\u0438 \u0438 \u043A\u043E\u043C\u0438\u0441\u0438\u043E\u043D\u0430 \u043F\u043E \u043C\u0435\u0441\u0435\u0446\u0438",
    style: {
      marginBottom: 16
    },
    "data-om-raster": true
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '22px 22px 18px',
      display: 'flex',
      alignItems: 'flex-end',
      gap: 18,
      height: 220
    }
  }, REPORTS.months.map((m, i) => {
    const h = Math.round(m.revenue / maxRev * 150);
    const last = i === REPORTS.months.length - 1;
    return /*#__PURE__*/React.createElement("div", {
      key: m.m,
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 12.5,
        color: last ? 'var(--brick-700)' : 'var(--text-strong)'
      }
    }, eur(m.revenue).replace(',000', 'K').replace('€', '€')), /*#__PURE__*/React.createElement("div", {
      style: {
        width: '100%',
        maxWidth: 46,
        height: h,
        borderRadius: '7px 7px 0 0',
        background: last ? 'var(--brick-500)' : 'var(--ink-700)',
        position: 'relative'
      },
      title: m.deals + ' сделки'
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        position: 'absolute',
        top: 6,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700
      }
    }, m.deals)), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--text-muted)'
      }
    }, m.m));
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 22px 16px',
      fontSize: 11.5,
      color: 'var(--text-subtle)',
      display: 'flex',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      width: 9,
      height: 9,
      borderRadius: 2,
      background: 'var(--ink-700)',
      marginRight: 5
    }
  }), "\u043A\u043E\u043C\u0438\u0441\u0438\u043E\u043D\u0430 (\u20AC)"), /*#__PURE__*/React.createElement("span", null, "\u0447\u0438\u0441\u043B\u043E\u0442\u043E \u0432 \u0441\u0442\u044A\u043B\u0431\u0430 = \u0431\u0440\u043E\u0439 \u0441\u0434\u0435\u043B\u043A\u0438"))), /*#__PURE__*/React.createElement(Panel, {
    title: "\u041A\u043B\u0430\u0441\u0430\u0446\u0438\u044F \u043D\u0430 \u0431\u0440\u043E\u043A\u0435\u0440\u0438\u0442\u0435"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '8px 10px 12px'
    }
  }, REPORTS.byAgent.map((a, i) => {
    const ag = CRM_AGENTS[a.agent];
    return /*#__PURE__*/React.createElement("div", {
      key: a.agent,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '11px 12px',
        borderRadius: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        width: 22,
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 16,
        color: i === 0 ? 'var(--brick-600)' : 'var(--text-subtle)'
      }
    }, i + 1), /*#__PURE__*/React.createElement(Avatar, {
      tone: ag.tone,
      initials: ag.initials,
      size: 36
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: '0 0 150px'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 13.5,
        color: 'var(--text-strong)'
      }
    }, ag.name), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 12,
        color: 'var(--text-muted)'
      }
    }, ag.office, " \xB7 ", a.deals, " \u0441\u0434\u0435\u043B\u043A\u0438")), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        height: 10,
        borderRadius: 999,
        background: 'var(--stone-100)',
        overflow: 'hidden'
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        width: Math.round(a.volume / maxAg * 100) + '%',
        height: '100%',
        borderRadius: 999,
        background: tv(ag.tone)
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 14,
        color: 'var(--text-strong)',
        width: 96,
        textAlign: 'right'
      }
    }, eur(a.volume)));
  })))));
}
window.Reports = Reports;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/Reports.jsx", error: String((e && e.message) || e) }); }

// ui_kits/crm/crm-data.js
try { (() => {
/* MS Realty — Agent CRM sample data (Bulgarian, agent-facing).
   Back-office content for the MS Realty team: leads pipeline, contacts,
   the agency's stock, viewings, tasks and activity. Sandanski-first,
   plus Bansko (ski), Melnik, the coast (Sveti Vlas) and Greece.
   Money is € with thousands separators; rent shows /мес. */

const eur = n => '€' + Number(n).toLocaleString('en-US');

/* ---- Agents (the team) ---- */
const CRM_AGENTS = {
  elena: {
    id: 'elena',
    name: 'Елена Петрова',
    role: 'Старши брокер',
    office: 'Сандански',
    initials: 'ЕП',
    tone: 'sand',
    phone: '+359 879 69 68 70'
  },
  dimitar: {
    id: 'dimitar',
    name: 'Димитър Колев',
    role: 'Брокер',
    office: 'Банско',
    initials: 'ДК',
    tone: 'pine',
    phone: '+359 88 903 1140'
  },
  mila: {
    id: 'mila',
    name: 'Мила Георгиева',
    role: 'Брокер',
    office: 'Свети Влас',
    initials: 'МГ',
    tone: 'sea',
    phone: '+359 88 421 7788'
  },
  radoslav: {
    id: 'radoslav',
    name: 'Радослав Иванов',
    role: 'Управител',
    office: 'Сандански',
    initials: 'РИ',
    tone: 'sunset',
    phone: '+359 879 69 68 71'
  }
};
const ME = 'elena';

/* Language flags shown on multilingual leads */
const LANGS = {
  BG: 'Български',
  EN: 'English',
  DE: 'Deutsch',
  NL: 'Nederlands',
  RU: 'Русский'
};

/* ---- Pipeline stages (kanban order) ---- */
const STAGES = [{
  key: 'new',
  label: 'Нови',
  hint: 'Необработени запитвания'
}, {
  key: 'viewing',
  label: 'Оглед насрочен',
  hint: 'Уговорен оглед'
}, {
  key: 'offer',
  label: 'Оферта',
  hint: 'Преговори по цена'
}, {
  key: 'won',
  label: 'Спечелени',
  hint: 'Сделка / капаро'
}];

/* Lead source → icon */
const SOURCES = {
  website: {
    label: 'Уебсайт',
    icon: 'globe'
  },
  phone: {
    label: 'Обаждане',
    icon: 'phone'
  },
  facebook: {
    label: 'Facebook',
    icon: 'thumbs-up'
  },
  referral: {
    label: 'Препоръка',
    icon: 'users'
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: 'message-circle'
  },
  walkin: {
    label: 'На място',
    icon: 'door-open'
  }
};

/* temperature: hot / warm / cold */
const LEADS = [{
  id: 'L-2087',
  name: 'Andreas Hofmann',
  stage: 'offer',
  temp: 'hot',
  lang: 'DE',
  deal: 'sale',
  source: 'website',
  budget: 180000,
  interest: 'Двустаен · Сандански, център',
  location: 'Сандански',
  agent: 'elena',
  phone: '+49 176 220 118',
  email: 'a.hofmann@mail.de',
  created: '2026-06-18',
  lastAct: 'преди 2 часа',
  matched: ['ms-987', 'ms-944'],
  tasks: 2,
  notes: 5,
  offer: 172000
}, {
  id: 'L-2091',
  name: 'Willem de Vries',
  stage: 'viewing',
  temp: 'hot',
  lang: 'NL',
  deal: 'sale',
  source: 'referral',
  budget: 250000,
  interest: 'Тристаен с изглед Пирин',
  location: 'Сандански',
  agent: 'elena',
  phone: '+31 6 1188 4420',
  email: 'w.devries@post.nl',
  created: '2026-06-25',
  lastAct: 'вчера',
  matched: ['ms-778', 'ms-944'],
  tasks: 1,
  notes: 3
}, {
  id: 'L-2096',
  name: 'Мария Стоянова',
  stage: 'new',
  temp: 'warm',
  lang: 'BG',
  deal: 'rent',
  source: 'phone',
  budget: 500,
  interest: 'Двустаен под наем, до парка',
  location: 'Сандански',
  agent: 'elena',
  phone: '+359 88 512 7710',
  email: 'm.stoyanova@abv.bg',
  created: '2026-07-03',
  lastAct: 'преди 1 час',
  matched: ['ms-957'],
  tasks: 1,
  notes: 1
}, {
  id: 'L-2072',
  name: 'James Whitfield',
  stage: 'won',
  temp: 'hot',
  lang: 'EN',
  deal: 'sale',
  source: 'website',
  budget: 340000,
  interest: 'Къща с двор, полите на Пирин',
  location: 'Сандански',
  agent: 'elena',
  phone: '+44 7700 900 812',
  email: 'j.whitfield@uk.co',
  created: '2026-05-30',
  lastAct: 'преди 3 дни',
  matched: ['ms-939'],
  tasks: 0,
  notes: 8,
  offer: 331000
}, {
  id: 'L-2099',
  name: 'Ирина Соколова',
  stage: 'new',
  temp: 'warm',
  lang: 'RU',
  deal: 'sale',
  source: 'facebook',
  budget: 200000,
  interest: 'Апартамент в спа комплекс',
  location: 'Сандански',
  agent: 'radoslav',
  phone: '+7 921 554 0090',
  email: 'i.sokolova@mail.ru',
  created: '2026-07-04',
  lastAct: 'преди 20 мин',
  matched: ['ms-778'],
  tasks: 0,
  notes: 0
}, {
  id: 'L-2065',
  name: 'Familie Bakker',
  stage: 'viewing',
  temp: 'warm',
  lang: 'NL',
  deal: 'sale',
  source: 'website',
  budget: 90000,
  interest: 'Ски студио, Банско',
  location: 'Банско',
  agent: 'dimitar',
  phone: '+31 6 2044 7781',
  email: 'bakker@post.nl',
  created: '2026-06-20',
  lastAct: 'преди 4 часа',
  matched: ['ms-937'],
  tasks: 3,
  notes: 4
}, {
  id: 'L-2081',
  name: 'Georgios Pappas',
  stage: 'offer',
  temp: 'warm',
  lang: 'EN',
  deal: 'sale',
  source: 'referral',
  budget: 150000,
  interest: 'Апартамент до плажа, Гърция',
  location: 'Офринио, Гърция',
  agent: 'mila',
  phone: '+30 694 55 20 118',
  email: 'g.pappas@greece.gr',
  created: '2026-06-12',
  lastAct: 'вчера',
  matched: ['ms-893'],
  tasks: 1,
  notes: 6,
  offer: 132000
}, {
  id: 'L-2094',
  name: 'Петър Динев',
  stage: 'new',
  temp: 'cold',
  lang: 'BG',
  deal: 'sale',
  source: 'walkin',
  budget: 86000,
  interest: 'Вила за уикенд, Пирин',
  location: 'Илинденци',
  agent: 'dimitar',
  phone: '+359 87 664 2093',
  email: 'p.dinev@abv.bg',
  created: '2026-07-02',
  lastAct: 'преди 2 дни',
  matched: ['ms-956'],
  tasks: 0,
  notes: 1
}, {
  id: 'L-2088',
  name: 'Sophie Laurent',
  stage: 'viewing',
  temp: 'warm',
  lang: 'EN',
  deal: 'sale',
  source: 'website',
  budget: 190000,
  interest: 'Море, Свети Влас',
  location: 'Свети Влас',
  agent: 'mila',
  phone: '+33 6 44 91 20 55',
  email: 's.laurent@fr.fr',
  created: '2026-06-28',
  lastAct: 'преди 6 часа',
  matched: ['ms-svlas'],
  tasks: 2,
  notes: 2
}, {
  id: 'L-2058',
  name: 'Klaus Berger',
  stage: 'won',
  temp: 'hot',
  lang: 'DE',
  deal: 'sale',
  source: 'referral',
  budget: 170000,
  interest: 'Панорамен двустаен',
  location: 'Сандански',
  agent: 'elena',
  phone: '+49 151 220 7788',
  email: 'k.berger@de.de',
  created: '2026-05-22',
  lastAct: 'преди 5 дни',
  matched: ['ms-944'],
  tasks: 0,
  notes: 7,
  offer: 162000
}, {
  id: 'L-2101',
  name: 'Emma Johansson',
  stage: 'new',
  temp: 'warm',
  lang: 'EN',
  deal: 'rent',
  source: 'whatsapp',
  budget: 450,
  interest: 'Дългосрочен наем, обзаведен',
  location: 'Сандански',
  agent: 'elena',
  phone: '+46 70 118 4420',
  email: 'e.johansson@se.se',
  created: '2026-07-04',
  lastAct: 'преди 45 мин',
  matched: ['ms-957'],
  tasks: 0,
  notes: 0
}, {
  id: 'L-2069',
  name: 'Николай Тодоров',
  stage: 'offer',
  temp: 'hot',
  lang: 'BG',
  deal: 'sale',
  source: 'phone',
  budget: 250000,
  interest: 'Апартамент в Парк Хотел Пирин',
  location: 'Сандански',
  agent: 'radoslav',
  phone: '+359 88 774 1120',
  email: 'n.todorov@gmail.com',
  created: '2026-06-15',
  lastAct: 'вчера',
  matched: ['ms-778'],
  tasks: 1,
  notes: 4,
  offer: 240000
}];

/* ---- Stock the agency manages ---- */
const STOCK = [{
  ref: 'MS-987',
  id: 'ms-987',
  title: 'Двустаен в идеалния център',
  location: 'Сандански',
  deal: 'sale',
  price: 130000,
  status: 'active',
  type: 'Двустаен',
  area: 55,
  beds: 1,
  agent: 'elena',
  views: 1840,
  enquiries: 12,
  listed: '2026-06-10'
}, {
  ref: 'MS-944',
  id: 'ms-944',
  title: 'Панорамен двустаен с гараж',
  location: 'Сандански',
  deal: 'sale',
  price: 165000,
  status: 'reserved',
  type: 'Двустаен',
  area: 117,
  beds: 1,
  agent: 'elena',
  views: 2210,
  enquiries: 21,
  listed: '2026-05-28'
}, {
  ref: 'MS-778',
  id: 'ms-778',
  title: 'Тристаен, Парк Хотел Пирин',
  location: 'Сандански',
  deal: 'sale',
  price: 250000,
  status: 'active',
  type: 'Тристаен',
  area: 93,
  beds: 2,
  agent: 'radoslav',
  views: 1560,
  enquiries: 9,
  listed: '2026-06-02'
}, {
  ref: 'MS-939',
  id: 'ms-939',
  title: 'Луксозна къща с двор',
  location: 'Сандански',
  deal: 'sale',
  price: 339000,
  status: 'sold',
  type: 'Къща',
  area: 220,
  beds: 4,
  agent: 'elena',
  views: 3120,
  enquiries: 28,
  listed: '2026-04-18'
}, {
  ref: 'MS-937',
  id: 'ms-937',
  title: 'Обзаведено студио, Сапфир',
  location: 'Банско',
  deal: 'sale',
  price: 37500,
  status: 'active',
  type: 'Студио',
  area: 30,
  beds: 1,
  agent: 'dimitar',
  views: 4400,
  enquiries: 41,
  listed: '2026-03-30'
}, {
  ref: 'MS-956',
  id: 'ms-956',
  title: 'Каменна вила в Пирин',
  location: 'Илинденци',
  deal: 'sale',
  price: 86000,
  status: 'active',
  type: 'Вила',
  area: 51,
  beds: 2,
  agent: 'dimitar',
  views: 980,
  enquiries: 6,
  listed: '2026-06-22'
}, {
  ref: 'MS-957',
  id: 'ms-957',
  title: 'Двустаен под наем до парка',
  location: 'Сандански',
  deal: 'rent',
  price: 400,
  status: 'active',
  type: 'Двустаен',
  area: 65,
  beds: 1,
  agent: 'elena',
  views: 1210,
  enquiries: 14,
  listed: '2026-06-26'
}, {
  ref: 'MS-2043',
  id: 'ms-svlas',
  title: 'Апартамент с изглед море',
  location: 'Свети Влас',
  deal: 'sale',
  price: 189000,
  status: 'active',
  type: 'Двустаен',
  area: 68,
  beds: 2,
  agent: 'mila',
  views: 2680,
  enquiries: 33,
  listed: '2026-06-05'
}, {
  ref: 'MS-893',
  id: 'ms-893',
  title: 'Тристаен в Паралия Офринио',
  location: 'Офринио, Гърция',
  deal: 'sale',
  price: 139000,
  status: 'reserved',
  type: 'Тристаен',
  area: 42,
  beds: 2,
  agent: 'mila',
  views: 1440,
  enquiries: 11,
  listed: '2026-05-14'
}, {
  ref: 'MS-1002',
  id: 'ms-1002',
  title: 'Едностаен, ново строителство',
  location: 'Сандански',
  deal: 'sale',
  price: 62000,
  status: 'draft',
  type: 'Едностаен',
  area: 38,
  beds: 0,
  agent: 'radoslav',
  views: 0,
  enquiries: 0,
  listed: '2026-07-01'
}];
const STOCK_STATUS = {
  active: {
    label: 'Активна',
    badge: 'for-sale'
  },
  reserved: {
    label: 'Резервирана',
    badge: 'reduced'
  },
  sold: {
    label: 'Продадена',
    badge: 'sold'
  },
  draft: {
    label: 'Чернова',
    badge: 'neutral'
  }
};

/* ---- This week's viewings (Mon–Sun, 09:00–19:00 scheduler) ---- */
const WEEK = ['Пон 06', 'Вт 07', 'Ср 08', 'Чет 09', 'Пет 10', 'Съб 11', 'Нед 12'];
const VIEWINGS = [{
  day: 0,
  start: 10,
  dur: 1,
  listing: 'MS-987',
  lead: 'Andreas Hofmann',
  agent: 'elena',
  status: 'confirmed'
}, {
  day: 0,
  start: 15,
  dur: 1,
  listing: 'MS-778',
  lead: 'Николай Тодоров',
  agent: 'radoslav',
  status: 'confirmed'
}, {
  day: 1,
  start: 11,
  dur: 1,
  listing: 'MS-937',
  lead: 'Familie Bakker',
  agent: 'dimitar',
  status: 'pending'
}, {
  day: 2,
  start: 9,
  dur: 1,
  listing: 'MS-944',
  lead: 'Willem de Vries',
  agent: 'elena',
  status: 'confirmed'
}, {
  day: 2,
  start: 14,
  dur: 2,
  listing: 'MS-svlas',
  lead: 'Sophie Laurent',
  agent: 'mila',
  status: 'confirmed'
}, {
  day: 3,
  start: 12,
  dur: 1,
  listing: 'MS-957',
  lead: 'Emma Johansson',
  agent: 'elena',
  status: 'pending'
}, {
  day: 4,
  start: 10,
  dur: 1,
  listing: 'MS-778',
  lead: 'Ирина Соколова',
  agent: 'radoslav',
  status: 'confirmed'
}, {
  day: 4,
  start: 16,
  dur: 1,
  listing: 'MS-893',
  lead: 'Georgios Pappas',
  agent: 'mila',
  status: 'cancelled'
}, {
  day: 5,
  start: 11,
  dur: 2,
  listing: 'MS-939',
  lead: 'James Whitfield',
  agent: 'elena',
  status: 'confirmed'
}];
const VIEW_STATUS = {
  confirmed: {
    label: 'Потвърден',
    tone: '#1F8A5B'
  },
  pending: {
    label: 'Чака',
    tone: '#C08422'
  },
  cancelled: {
    label: 'Отменен',
    tone: '#B0A79A'
  }
};

/* ---- Contacts directory ---- */
const CONTACTS = [{
  id: 'C-101',
  name: 'Andreas Hofmann',
  type: 'buyer',
  lang: 'DE',
  location: 'München',
  phone: '+49 176 220 118',
  email: 'a.hofmann@mail.de',
  agent: 'elena',
  props: 0,
  last: '2026-07-04'
}, {
  id: 'C-102',
  name: 'Стефан Маринов',
  type: 'seller',
  lang: 'BG',
  location: 'Сандански',
  phone: '+359 88 220 4471',
  email: 's.marinov@abv.bg',
  agent: 'elena',
  props: 2,
  last: '2026-07-03'
}, {
  id: 'C-103',
  name: 'Willem de Vries',
  type: 'buyer',
  lang: 'NL',
  location: 'Utrecht',
  phone: '+31 6 1188 4420',
  email: 'w.devries@post.nl',
  agent: 'elena',
  props: 0,
  last: '2026-07-02'
}, {
  id: 'C-104',
  name: 'Мария Стоянова',
  type: 'tenant',
  lang: 'BG',
  location: 'Сандански',
  phone: '+359 88 512 7710',
  email: 'm.stoyanova@abv.bg',
  agent: 'elena',
  props: 0,
  last: '2026-07-03'
}, {
  id: 'C-105',
  name: 'Йорданка Петкова',
  type: 'landlord',
  lang: 'BG',
  location: 'Сандански',
  phone: '+359 88 991 3320',
  email: 'y.petkova@abv.bg',
  agent: 'elena',
  props: 1,
  last: '2026-06-29'
}, {
  id: 'C-106',
  name: 'James Whitfield',
  type: 'buyer',
  lang: 'EN',
  location: 'Manchester',
  phone: '+44 7700 900 812',
  email: 'j.whitfield@uk.co',
  agent: 'elena',
  props: 0,
  last: '2026-07-01'
}, {
  id: 'C-107',
  name: 'Familie Bakker',
  type: 'buyer',
  lang: 'NL',
  location: 'Rotterdam',
  phone: '+31 6 2044 7781',
  email: 'bakker@post.nl',
  agent: 'dimitar',
  props: 0,
  last: '2026-07-04'
}, {
  id: 'C-108',
  name: 'Georgios Pappas',
  type: 'buyer',
  lang: 'EN',
  location: 'Kavala',
  phone: '+30 694 55 20 118',
  email: 'g.pappas@greece.gr',
  agent: 'mila',
  props: 0,
  last: '2026-07-03'
}, {
  id: 'C-109',
  name: 'Ирина Соколова',
  type: 'buyer',
  lang: 'RU',
  location: 'Санкт-Петербург',
  phone: '+7 921 554 0090',
  email: 'i.sokolova@mail.ru',
  agent: 'radoslav',
  props: 0,
  last: '2026-07-04'
}, {
  id: 'C-110',
  name: 'Христо Ангелов',
  type: 'seller',
  lang: 'BG',
  location: 'Банско',
  phone: '+359 88 447 2210',
  email: 'h.angelov@abv.bg',
  agent: 'dimitar',
  props: 1,
  last: '2026-06-27'
}];
const CONTACT_TYPE = {
  buyer: {
    label: 'Купувач',
    icon: 'search',
    tone: 'sea'
  },
  seller: {
    label: 'Продавач',
    icon: 'home',
    tone: 'brick'
  },
  tenant: {
    label: 'Наемател',
    icon: 'key',
    tone: 'sun'
  },
  landlord: {
    label: 'Наемодател',
    icon: 'building-2',
    tone: 'ink'
  }
};

/* ---- Activity feed (recent, newest first) ---- */
const ACTIVITY = [{
  type: 'offer',
  agent: 'elena',
  text: 'Andreas Hofmann подаде оферта €172,000 за MS-987',
  time: 'преди 2 часа'
}, {
  type: 'lead',
  agent: 'radoslav',
  text: 'Нов лийд: Ирина Соколова (RU) от Facebook',
  time: 'преди 20 мин'
}, {
  type: 'viewing',
  agent: 'mila',
  text: 'Оглед потвърден: Sophie Laurent · MS-2043 · пет 14:00',
  time: 'преди 6 часа'
}, {
  type: 'note',
  agent: 'elena',
  text: 'Бележка към Willem de Vries: търси изглед към Пирин',
  time: 'вчера'
}, {
  type: 'won',
  agent: 'elena',
  text: 'Сделка спечелена: James Whitfield · MS-939 · капаро внесено',
  time: 'вчера'
}, {
  type: 'call',
  agent: 'dimitar',
  text: 'Обаждане до Familie Bakker (12 мин) — потвърден оглед',
  time: 'преди 4 часа'
}, {
  type: 'lead',
  agent: 'elena',
  text: 'Нов лийд: Emma Johansson (EN) от WhatsApp',
  time: 'преди 45 мин'
}];
const ACT_ICON = {
  offer: {
    icon: 'file-text',
    tone: 'brick'
  },
  lead: {
    icon: 'user-plus',
    tone: 'sea'
  },
  viewing: {
    icon: 'calendar',
    tone: 'sun'
  },
  note: {
    icon: 'sticky-note',
    tone: 'ink'
  },
  won: {
    icon: 'party-popper',
    tone: 'success'
  },
  call: {
    icon: 'phone',
    tone: 'sea'
  },
  email: {
    icon: 'mail',
    tone: 'sea'
  }
};

/* ---- Tasks (today / upcoming) ---- */
const TASKS = [{
  id: 't1',
  text: 'Изпрати договор на James Whitfield (MS-939)',
  due: 'Днес · 14:00',
  priority: 'high',
  done: false,
  lead: 'James Whitfield'
}, {
  id: 't2',
  text: 'Обади се на Andreas за насрещна оферта',
  due: 'Днес · 16:30',
  priority: 'high',
  done: false,
  lead: 'Andreas Hofmann'
}, {
  id: 't3',
  text: 'Подготви снимки за MS-1002',
  due: 'Утре · 10:00',
  priority: 'med',
  done: false,
  lead: null
}, {
  id: 't4',
  text: 'Потвърди оглед с Emma Johansson',
  due: 'Утре · 12:00',
  priority: 'med',
  done: false,
  lead: 'Emma Johansson'
}, {
  id: 't5',
  text: 'Актуализирай цената на MS-937 (−5%)',
  due: 'Чет · 09:00',
  priority: 'low',
  done: false,
  lead: null
}, {
  id: 't6',
  text: 'Изпрати оценка на Стефан Маринов',
  due: 'Вчера',
  priority: 'med',
  done: true,
  lead: 'Стефан Маринов'
}];

/* ---- KPIs for the dashboard ---- */
const KPIS = [{
  key: 'leads',
  label: 'Активни лийдове',
  value: 12,
  delta: +3,
  trend: 'up',
  icon: 'users',
  note: 'тази седмица'
}, {
  key: 'viewings',
  label: 'Огледи · седмица',
  value: 9,
  delta: +2,
  trend: 'up',
  icon: 'calendar-check',
  note: 'насрочени'
}, {
  key: 'offers',
  label: 'Активни оферти',
  value: 4,
  delta: 0,
  trend: 'flat',
  icon: 'file-text',
  note: '€700,000 в игра'
}, {
  key: 'deals',
  label: 'Сделки · месец',
  value: 2,
  delta: +1,
  trend: 'up',
  icon: 'handshake',
  note: 'спечелени'
}, {
  key: 'revenue',
  label: 'Комисиона · месец',
  value: '€14,900',
  delta: +18,
  trend: 'up',
  icon: 'trending-up',
  note: '+18% спрямо май',
  wide: true
}];

/* ---- Reports data ---- */
const REPORTS = {
  funnel: [{
    stage: 'Запитвания',
    value: 48
  }, {
    stage: 'Огледи',
    value: 26
  }, {
    stage: 'Оферти',
    value: 11
  }, {
    stage: 'Сделки',
    value: 6
  }],
  sources: [{
    label: 'Уебсайт',
    value: 41,
    tone: 'ink'
  }, {
    label: 'Препоръка',
    value: 22,
    tone: 'brick'
  }, {
    label: 'Facebook',
    value: 18,
    tone: 'sea'
  }, {
    label: 'Обаждане',
    value: 12,
    tone: 'sun'
  }, {
    label: 'WhatsApp',
    value: 7,
    tone: 'success'
  }],
  months: [{
    m: 'Яну',
    deals: 3,
    revenue: 9200
  }, {
    m: 'Фев',
    deals: 2,
    revenue: 6800
  }, {
    m: 'Мар',
    deals: 4,
    revenue: 13100
  }, {
    m: 'Апр',
    deals: 3,
    revenue: 10400
  }, {
    m: 'Май',
    deals: 5,
    revenue: 12600
  }, {
    m: 'Юни',
    deals: 6,
    revenue: 16800
  }, {
    m: 'Юли',
    deals: 2,
    revenue: 14900
  }],
  byAgent: [{
    agent: 'elena',
    deals: 8,
    volume: 1240000
  }, {
    agent: 'radoslav',
    deals: 5,
    volume: 890000
  }, {
    agent: 'mila',
    deals: 4,
    volume: 720000
  }, {
    agent: 'dimitar',
    deals: 3,
    volume: 410000
  }]
};

/* ---- Messages inbox (multichannel threads with leads/contacts) ---- */
const CHANNELS = {
  whatsapp: {
    label: 'WhatsApp',
    icon: 'message-circle',
    tone: 'success'
  },
  email: {
    label: 'Имейл',
    icon: 'mail',
    tone: 'sea'
  },
  website: {
    label: 'Сайт',
    icon: 'globe',
    tone: 'ink'
  },
  sms: {
    label: 'SMS',
    icon: 'smartphone',
    tone: 'sun'
  }
};

/* Each conversation: messages newest-last; dir 'in' (from client) / 'out' (agent). */
const CONVERSATIONS = [{
  id: 'CV-01',
  name: 'Andreas Hofmann',
  lead: 'L-2087',
  lang: 'DE',
  channel: 'whatsapp',
  agent: 'elena',
  unread: 2,
  pinned: true,
  last: 'преди 12 мин',
  online: true,
  preview: 'Können wir den Preis auf 170.000 € besprechen?',
  messages: [{
    dir: 'in',
    t: '09:14',
    text: 'Guten Morgen Elena! Das Apartment MS-987 gefällt uns sehr.'
  }, {
    dir: 'out',
    t: '09:20',
    text: 'Добро утро! Радвам се. Собственикът е отворен за разговор. Какво имате предвид?',
    orig: 'Guten Morgen! Freut mich. Der Eigentümer ist gesprächsbereit.'
  }, {
    dir: 'in',
    t: '09:36',
    text: 'Wir bieten 168.000 €. Ist ein Notartermin nächste Woche möglich?'
  }, {
    dir: 'out',
    t: '10:02',
    text: 'Ще предам офертата днес. Нотариус — да, четвъртък е свободен.',
    orig: 'Ich leite das Angebot heute weiter. Notar am Donnerstag möglich.'
  }, {
    dir: 'in',
    t: '10:31',
    text: 'Können wir den Preis auf 170.000 € besprechen?'
  }]
}, {
  id: 'CV-02',
  name: 'Мария Стоянова',
  lead: 'L-2096',
  lang: 'BG',
  channel: 'website',
  agent: 'elena',
  unread: 1,
  pinned: false,
  last: 'преди 1 час',
  online: false,
  preview: 'Свободен ли е двустайният до парка за оглед в събота?',
  messages: [{
    dir: 'in',
    t: '08:40',
    text: 'Здравейте! Видях двустаен под наем до парка (MS-957).'
  }, {
    dir: 'in',
    t: '08:41',
    text: 'Свободен ли е двустайният до парка за оглед в събота?'
  }]
}, {
  id: 'CV-03',
  name: 'Willem de Vries',
  lead: 'L-2091',
  lang: 'NL',
  channel: 'email',
  agent: 'elena',
  unread: 0,
  pinned: false,
  last: 'вчера',
  online: false,
  preview: 'Bedankt voor de rondleiding — we denken erover na.',
  messages: [{
    dir: 'out',
    t: 'Пон 16:10',
    text: 'Здравейте, потвърждавам огледа за MS-944 в сряда 09:00.',
    orig: 'Bevestiging bezichtiging MS-944, woensdag 09:00.'
  }, {
    dir: 'in',
    t: 'Ср 11:30',
    text: 'Bedankt voor de rondleiding — we denken erover na.'
  }]
}, {
  id: 'CV-04',
  name: 'Emma Johansson',
  lead: 'L-2101',
  lang: 'EN',
  channel: 'whatsapp',
  agent: 'elena',
  unread: 3,
  pinned: false,
  last: 'преди 45 мин',
  online: true,
  preview: 'Is the furnished flat still available for long term?',
  messages: [{
    dir: 'in',
    t: '11:02',
    text: 'Hi! Saw your listing for a furnished 2-room.'
  }, {
    dir: 'in',
    t: '11:03',
    text: 'Is the furnished flat still available for long term?'
  }, {
    dir: 'in',
    t: '11:05',
    text: 'And is it pet friendly? 🐕'
  }]
}, {
  id: 'CV-05',
  name: 'Николай Тодоров',
  lead: 'L-2069',
  lang: 'BG',
  channel: 'sms',
  agent: 'radoslav',
  unread: 0,
  pinned: false,
  last: 'преди 3 часа',
  online: false,
  preview: 'Разбрано, чакам обаждането ви следобед.',
  messages: [{
    dir: 'out',
    t: '13:20',
    text: 'Ще ви звънна за насрещната оферта по MS-778 около 16:00.'
  }, {
    dir: 'in',
    t: '13:44',
    text: 'Разбрано, чакам обаждането ви следобед.'
  }]
}, {
  id: 'CV-06',
  name: 'Sophie Laurent',
  lead: 'L-2088',
  lang: 'EN',
  channel: 'email',
  agent: 'mila',
  unread: 0,
  pinned: false,
  last: 'вчера',
  online: false,
  preview: 'Perfect, Friday at 14:00 works for the sea-view viewing.',
  messages: [{
    dir: 'in',
    t: 'Чет 18:22',
    text: 'Perfect, Friday at 14:00 works for the sea-view viewing.'
  }]
}, {
  id: 'CV-07',
  name: 'Ирина Соколова',
  lead: 'L-2099',
  lang: 'RU',
  channel: 'website',
  agent: 'radoslav',
  unread: 1,
  pinned: false,
  last: 'преди 20 мин',
  online: true,
  preview: 'Здравствуйте! Интересует апартамент в спа-комплексе.',
  messages: [{
    dir: 'in',
    t: '11:40',
    text: 'Здравствуйте! Интересует апартамент в спа-комплексе.'
  }]
}];
window.CRM_DATA = {
  eur,
  CRM_AGENTS,
  ME,
  LANGS,
  STAGES,
  SOURCES,
  LEADS,
  STOCK,
  STOCK_STATUS,
  WEEK,
  VIEWINGS,
  VIEW_STATUS,
  CONTACTS,
  CONTACT_TYPE,
  ACTIVITY,
  ACT_ICON,
  TASKS,
  KPIS,
  REPORTS,
  CHANNELS,
  CONVERSATIONS
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/crm/crm-data.js", error: String((e && e.message) || e) }); }

// ui_kits/website/ContactPanel.jsx
try { (() => {
/* Contact: EnquiryForm (shared), ContactPanel (modal), ContactPage (route). */
const CT_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const {
  Input: CTInput,
  Select: CTSelect,
  Checkbox: CTCheckbox,
  Button: CTButton,
  IconButton: CTIconButton,
  Icon: CTIcon,
  Card: CTCard
} = CT_DS;
const ctCss = `
.ct-scrim { position:fixed; inset:0; z-index:80; background:var(--overlay); display:flex; align-items:center; justify-content:center; padding:24px; }
.ct-modal { width:100%; max-width:500px; background:var(--surface); border-radius:var(--radius-modal); box-shadow:var(--shadow-modal); overflow:hidden; }
@media (prefers-reduced-motion:no-preference){ .ct-scrim{ animation:ct-fade var(--dur-base) var(--ease-out); } .ct-modal{ animation:ct-pop var(--dur-slow) var(--ease-out); } }
@keyframes ct-fade{ from{ opacity:0 } to{ opacity:1 } }
@keyframes ct-pop{ from{ opacity:0; transform:translateY(14px) scale(.98) } to{ opacity:1; transform:none } }
.ct-modal__hd { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:22px 22px 0; }
.ct-modal__hd h2 { font-size:var(--text-2xl); }
.ct-modal__hd p { color:var(--text-muted); margin-top:5px; font-size:var(--text-base); }
.ct-ctx { display:flex; align-items:center; gap:12px; margin:16px 22px 0; padding:12px; background:var(--surface-sunken); border-radius:var(--radius-md); }
.ct-ctx__ph { width:46px; height:46px; border-radius:var(--radius-sm); flex:none; }
.ct-ctx b { display:block; font-size:var(--text-sm); color:var(--text-strong); font-weight:var(--fw-semibold); }
.ct-ctx span { font-size:var(--text-xs); color:var(--text-muted); }
.ct-ctx__price { margin-left:auto; font-family:var(--font-display); font-weight:600; color:var(--price); font-size:var(--text-lg); }

.ct-form { padding:20px 22px 24px; display:flex; flex-direction:column; gap:14px; }
.ct-form__row { display:flex; gap:12px; }
.ct-form__row > * { flex:1; }
.ct-ta { display:flex; flex-direction:column; gap:var(--space-2); font-family:var(--font-sans); }
.ct-ta label { font-size:var(--text-sm); font-weight:var(--fw-medium); color:var(--text-strong); }
.ct-ta textarea { border:1px solid var(--border-strong); border-radius:var(--radius-input); background:var(--surface); padding:12px; font:inherit; color:var(--text-strong); resize:vertical; min-height:88px; outline:none; transition:border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard); }
.ct-ta textarea:focus { border-color:var(--brand); box-shadow:var(--shadow-focus); }
.ct-ta textarea::placeholder { color:var(--text-subtle); }

.ct-done { padding:44px 30px; text-align:center; display:flex; flex-direction:column; align-items:center; gap:14px; }
.ct-done__ic { width:64px; height:64px; border-radius:var(--radius-full); background:var(--success-50); color:var(--success-500); display:grid; place-items:center; }
.ct-done h2 { font-size:var(--text-2xl); }
.ct-done p { color:var(--text-muted); max-width:36ch; line-height:1.6; }

.ct-page { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y-sm) var(--gutter) 64px; }
.ct-page__head { max-width:60ch; margin-bottom:36px; }
.ct-page__head h1 { font-size:var(--display-sm); line-height:1.1; }
.ct-page__head p { color:var(--text-muted); font-size:var(--text-lg); margin-top:12px; }
.ct-page__cols { display:grid; grid-template-columns:1fr 480px; gap:44px; align-items:start; }
.ct-offices { display:flex; flex-direction:column; gap:16px; }
.ct-office { display:flex; gap:16px; }
.ct-office__ph { width:96px; height:96px; border-radius:var(--radius-lg); flex:none; }
.ct-office h3 { font-size:var(--text-lg); }
.ct-office__meta { display:flex; flex-direction:column; gap:5px; margin-top:7px; color:var(--text-body); font-size:var(--text-base); }
.ct-office__meta span { display:flex; align-items:center; gap:8px; }
.ct-office__meta .mk-icon { color:var(--text-muted); flex:none; }
@media (max-width:1080px){ .ct-page__cols{ grid-template-columns:1fr; } }
`;
if (!document.getElementById('mk-ct-css')) {
  const s = document.createElement('style');
  s.id = 'mk-ct-css';
  s.textContent = ctCss;
  document.head.appendChild(s);
}
function EnquiryForm({
  submitLabel = 'Изпрати запитване',
  onDone
}) {
  return /*#__PURE__*/React.createElement("form", {
    className: "ct-form",
    onSubmit: e => {
      e.preventDefault();
      onDone && onDone();
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ct-form__row"
  }, /*#__PURE__*/React.createElement(CTInput, {
    label: "\u0418\u043C\u0435",
    placeholder: "\u0418\u0432\u0430\u043D",
    required: true
  }), /*#__PURE__*/React.createElement(CTInput, {
    label: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F",
    placeholder: "\u041F\u0435\u0442\u0440\u043E\u0432",
    required: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "ct-form__row"
  }, /*#__PURE__*/React.createElement(CTInput, {
    label: "\u0418\u043C\u0435\u0439\u043B",
    type: "email",
    iconStart: "mail",
    placeholder: "you@email.com",
    required: true
  }), /*#__PURE__*/React.createElement(CTInput, {
    label: "\u0422\u0435\u043B\u0435\u0444\u043E\u043D",
    type: "tel",
    iconStart: "phone",
    placeholder: "+359 \u2026"
  })), /*#__PURE__*/React.createElement(CTSelect, {
    label: "\u041F\u0440\u0435\u0434\u043F\u043E\u0447\u0438\u0442\u0430\u043D \u043E\u0433\u043B\u0435\u0434",
    iconStart: "calendar",
    options: ['Възможно най-скоро', 'Този уикенд', 'До 2 седмици', 'Купувам от разстояние']
  }), /*#__PURE__*/React.createElement("div", {
    className: "ct-ta"
  }, /*#__PURE__*/React.createElement("label", {
    htmlFor: "ct-msg"
  }, "\u0421\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435"), /*#__PURE__*/React.createElement("textarea", {
    id: "ct-msg",
    placeholder: "\u041A\u0430\u0436\u0435\u0442\u0435 \u043D\u0438 \u043A\u0430\u043A\u0432\u043E \u0442\u044A\u0440\u0441\u0438\u0442\u0435 \u2014 \u0434\u0430\u0442\u0438, \u0431\u044E\u0434\u0436\u0435\u0442, \u0437\u0430\u0434\u044A\u043B\u0436\u0438\u0442\u0435\u043B\u043D\u0438 \u0438\u0437\u0438\u0441\u043A\u0432\u0430\u043D\u0438\u044F\u2026"
  })), /*#__PURE__*/React.createElement(CTCheckbox, {
    defaultChecked: true,
    label: "\u0418\u0437\u043F\u0440\u0430\u0449\u0430\u0439\u0442\u0435 \u043C\u0438 \u043F\u043E\u0434\u043E\u0431\u043D\u0438 \u043D\u043E\u0432\u0438 \u043E\u0444\u0435\u0440\u0442\u0438 \u0432 \u0440\u0430\u0439\u043E\u043D\u0430"
  }), /*#__PURE__*/React.createElement(CTButton, {
    type: "submit",
    variant: "accent",
    size: "lg",
    fullWidth: true,
    iconStart: "send"
  }, submitLabel));
}
function ContactPanel({
  open,
  onClose,
  listing,
  money
}) {
  const [done, setDone] = React.useState(false);
  React.useEffect(() => {
    if (open) setDone(false);
  }, [open]);
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "ct-scrim",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "ct-modal",
    onClick: e => e.stopPropagation(),
    role: "dialog",
    "aria-modal": "true"
  }, done ? /*#__PURE__*/React.createElement("div", {
    className: "ct-done"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ct-done__ic"
  }, /*#__PURE__*/React.createElement(CTIcon, {
    name: "check",
    size: 30,
    strokeWidth: 2.5
  })), /*#__PURE__*/React.createElement("h2", null, "\u0417\u0430\u043F\u0438\u0442\u0432\u0430\u043D\u0435\u0442\u043E \u0435 \u0438\u0437\u043F\u0440\u0430\u0442\u0435\u043D\u043E"), /*#__PURE__*/React.createElement("p", null, "\u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u0438\u043C \u2014 \u043D\u0430\u0448\u0438\u044F\u0442 ", listing ? 'брокер за този имот' : 'екип', " \u0449\u0435 \u0432\u0438 \u0432\u044A\u0440\u043D\u0435 \u043E\u0431\u0430\u0436\u0434\u0430\u043D\u0435 \u0434\u043E \u0447\u0430\u0441, \u043D\u0430 \u0432\u0430\u0448\u0438\u044F \u0435\u0437\u0438\u043A."), /*#__PURE__*/React.createElement(CTButton, {
    variant: "primary",
    onClick: onClose
  }, "\u0417\u0430\u0442\u0432\u043E\u0440\u0438")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ct-modal__hd"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "\u0417\u0430\u043F\u0430\u0437\u0438 \u043E\u0433\u043B\u0435\u0434"), /*#__PURE__*/React.createElement("p", null, "\u0411\u0435\u0437\u043F\u043B\u0430\u0442\u043D\u043E \u0438 \u0431\u0435\u0437 \u0430\u043D\u0433\u0430\u0436\u0438\u043C\u0435\u043D\u0442. \u0429\u0435 \u043F\u043E\u0442\u0432\u044A\u0440\u0434\u0438\u043C \u0447\u0430\u0441\u0430 \u043F\u043E \u0442\u0435\u043B\u0435\u0444\u043E\u043D\u0430.")), /*#__PURE__*/React.createElement(CTIconButton, {
    icon: "x",
    label: "\u0417\u0430\u0442\u0432\u043E\u0440\u0438",
    variant: "ghost",
    onClick: onClose
  })), listing && /*#__PURE__*/React.createElement("div", {
    className: "ct-ctx"
  }, /*#__PURE__*/React.createElement("div", {
    className: `ct-ctx__ph mk-photo mk-photo--${listing.tone}`
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, listing.title), /*#__PURE__*/React.createElement("span", null, listing.location, " \xB7 \u0420\u0435\u0444. ", listing.ref)), /*#__PURE__*/React.createElement("div", {
    className: "ct-ctx__price"
  }, money(listing.price), listing.per || '')), /*#__PURE__*/React.createElement(EnquiryForm, {
    submitLabel: "\u0417\u0430\u044F\u0432\u0438 \u043E\u0433\u043B\u0435\u0434",
    onDone: () => setDone(true)
  }))));
}
function ContactPage() {
  const [done, setDone] = React.useState(false);
  const offices = [{
    name: 'Морски офис — Свети Влас',
    tone: 'sea',
    addr: 'Морски квартал, Свети Влас 8256',
    phone: '+359 88 421 7788',
    hours: 'Пон–Съб · 9:00–18:00'
  }, {
    name: 'Струмски офис — Сандански',
    tone: 'sand',
    addr: 'ул. Македония 21, Сандански 2800',
    phone: '+359 88 660 2093',
    hours: 'Пон–Пет · 9:00–17:30'
  }, {
    name: 'Пирински офис — Банско',
    tone: 'pine',
    addr: 'ул. Пирин 4, Банско 2770',
    phone: '+359 88 903 1140',
    hours: 'Зимен сезон · всеки ден'
  }];
  return /*#__PURE__*/React.createElement("main", {
    className: "ct-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ct-page__head"
  }, /*#__PURE__*/React.createElement("h1", null, "\u0421\u0432\u044A\u0440\u0436\u0435\u0442\u0435 \u0441\u0435 \u0441 \u043C\u0435\u0441\u0442\u0435\u043D \u0431\u0440\u043E\u043A\u0435\u0440"), /*#__PURE__*/React.createElement("p", null, "\u0422\u0440\u0438 \u043E\u0444\u0438\u0441\u0430 \u0432 \u0411\u044A\u043B\u0433\u0430\u0440\u0438\u044F \u0438 \u0435\u043A\u0438\u043F, \u043A\u043E\u0439\u0442\u043E \u0440\u0430\u0431\u043E\u0442\u0438 \u043D\u0430 \u0431\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438, \u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438, \u043D\u0435\u043C\u0441\u043A\u0438, \u043D\u0438\u0434\u0435\u0440\u043B\u0430\u043D\u0434\u0441\u043A\u0438 \u0438 \u0440\u0443\u0441\u043A\u0438. \u041A\u0430\u0436\u0435\u0442\u0435 \u043D\u0438 \u043A\u0430\u043A\u0432\u043E \u0442\u044A\u0440\u0441\u0438\u0442\u0435 \u0438 \u043D\u0438\u0435 \u043F\u043E\u0435\u043C\u0430\u043C\u0435 \u043D\u0435\u0449\u0430\u0442\u0430 \u043E\u0442\u0442\u0430\u043C.")), /*#__PURE__*/React.createElement("div", {
    className: "ct-page__cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ct-offices"
  }, offices.map(o => /*#__PURE__*/React.createElement("div", {
    className: "ct-office",
    key: o.name
  }, /*#__PURE__*/React.createElement("div", {
    className: `ct-office__ph mk-photo mk-photo--${o.tone}`
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, o.name), /*#__PURE__*/React.createElement("div", {
    className: "ct-office__meta"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(CTIcon, {
    name: "map-pin",
    size: 16
  }), " ", o.addr), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(CTIcon, {
    name: "phone",
    size: 16
  }), " ", o.phone), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(CTIcon, {
    name: "clock",
    size: 16
  }), " ", o.hours)))))), /*#__PURE__*/React.createElement(CTCard, {
    elevated: true,
    padding: "lg"
  }, done ? /*#__PURE__*/React.createElement("div", {
    className: "ct-done",
    style: {
      padding: '20px 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ct-done__ic"
  }, /*#__PURE__*/React.createElement(CTIcon, {
    name: "check",
    size: 30,
    strokeWidth: 2.5
  })), /*#__PURE__*/React.createElement("h2", null, "\u0421\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435\u0442\u043E \u0435 \u0438\u0437\u043F\u0440\u0430\u0442\u0435\u043D\u043E"), /*#__PURE__*/React.createElement("p", null, "\u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u0438\u043C, \u0447\u0435 \u0441\u0435 \u0441\u0432\u044A\u0440\u0437\u0430\u0445\u0442\u0435 \u2014 \u0449\u0435 \u043E\u0442\u0433\u043E\u0432\u043E\u0440\u0438\u043C \u0434\u043E \u0447\u0430\u0441 \u0432 \u0440\u0430\u0431\u043E\u0442\u043D\u043E \u0432\u0440\u0435\u043C\u0435.")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontSize: 'var(--text-xl)',
      marginBottom: 4
    }
  }, "\u0418\u0437\u043F\u0440\u0430\u0442\u0435\u0442\u0435 \u043D\u0438 \u0441\u044A\u043E\u0431\u0449\u0435\u043D\u0438\u0435"), /*#__PURE__*/React.createElement(EnquiryForm, {
    onDone: () => setDone(true)
  })))));
}
Object.assign(window, {
  EnquiryForm,
  ContactPanel,
  ContactPage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ContactPanel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/HomePage.jsx
try { (() => {
/* Home page: hero search, resort browse, featured listings, value props, sell CTA. */
const HP_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const {
  SearchBar: HPSearchBar,
  PropertyCard: HPCard,
  Button: HPButton,
  Icon: HPIcon,
  Badge: HPBadge
} = HP_DS;
const {
  LISTINGS: HP_LISTINGS,
  RESORTS: HP_RESORTS,
  money: hpMoney
} = window.MK_DATA;
const homeCss = `
.hp-hero { position:relative; min-height:600px; display:flex; align-items:center; }
.hp-hero__bg { position:absolute; inset:0; }
.hp-hero__bg::before { content:""; position:absolute; inset:0; background:linear-gradient(90deg, rgba(7,20,19,.62) 0%, rgba(7,20,19,.30) 46%, rgba(7,20,19,0) 74%); z-index:1; }
.hp-hero__in { position:relative; z-index:2; max-width:var(--container-2xl); margin:0 auto; padding:0 var(--gutter); width:100%; }
.hp-hero__copy { max-width:640px; color:#fff; margin-bottom:26px; }
.hp-hero__eyebrow { display:inline-flex; align-items:center; gap:7px; font-size:var(--text-sm); font-weight:var(--fw-semibold); letter-spacing:.1em; text-transform:uppercase; color:var(--stone-200); margin-bottom:16px; }
.hp-hero h1 { font-size:var(--display-lg); color:#fff; line-height:1.04; margin-bottom:16px; }
.hp-hero p { font-size:var(--text-xl); color:rgba(255,255,255,.9); line-height:1.5; font-weight:var(--fw-regular); }
.hp-hero__search { max-width:940px; }

.hp-sec { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y) var(--gutter); }
.hp-sec__head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:28px; }
.hp-sec__head h2 { font-size:var(--text-3xl); }
.hp-sec__head p { color:var(--text-muted); margin-top:6px; font-size:var(--text-md); }

.hp-resorts { display:grid; grid-template-columns:repeat(3,1fr); gap:18px; }
.hp-resort { position:relative; height:200px; border-radius:var(--radius-lg); overflow:hidden; text-decoration:none; box-shadow:var(--shadow-sm); transition:transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-standard); }
.hp-resort:hover { transform:translateY(-3px); box-shadow:var(--shadow-lg); }
.hp-resort__t { position:absolute; inset:auto 0 0 0; padding:18px 18px 16px; z-index:2; color:#fff; }
.hp-resort__t h3 { color:#fff; font-size:var(--text-xl); }
.hp-resort__t span { font-size:var(--text-sm); color:rgba(255,255,255,.85); }
.hp-resort__c { position:absolute; top:12px; right:12px; z-index:2; background:rgba(255,255,255,.9); color:var(--brand); font-size:var(--text-xs); font-weight:var(--fw-semibold); padding:5px 10px; border-radius:var(--radius-full); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); }

.hp-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
.hp-grid .mk-pcard { cursor:pointer; }

.hp-values { background:var(--surface-sunken); }
.hp-values__in { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y-sm) var(--gutter); display:grid; grid-template-columns:repeat(3,1fr); gap:36px; }
.hp-value { display:flex; flex-direction:column; gap:10px; }
.hp-value__ic { width:48px; height:48px; border-radius:var(--radius-md); background:var(--brand-subtle); color:var(--brand); display:grid; place-items:center; }
.hp-value h3 { font-size:var(--text-xl); }
.hp-value p { color:var(--text-body); line-height:1.6; }

.hp-sell { position:relative; overflow:hidden; background:var(--surface-inverse); }
.hp-sell__in { max-width:var(--container-2xl); margin:0 auto; padding:var(--section-y-sm) var(--gutter); display:flex; align-items:center; justify-content:space-between; gap:30px; position:relative; z-index:2; }
.hp-sell__glow { position:absolute; inset:0; background:radial-gradient(60% 120% at 88% 30%, rgba(206,55,51,.4), transparent 60%); z-index:1; }
.hp-sell h2 { color:#fff; font-size:var(--text-3xl); max-width:20ch; }
.hp-sell p { color:var(--stone-300); margin-top:8px; font-size:var(--text-lg); max-width:46ch; }
@media (max-width:1080px){ .hp-resorts{ grid-template-columns:repeat(2,1fr);} .hp-grid{ grid-template-columns:repeat(2,1fr);} .hp-values__in{ grid-template-columns:1fr;} }
`;
if (!document.getElementById('mk-home-css')) {
  const s = document.createElement('style');
  s.id = 'mk-home-css';
  s.textContent = homeCss;
  document.head.appendChild(s);
}
function ResortCard({
  r,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("a", {
    className: `hp-resort mk-photo mk-photo--${r.tone}`,
    onClick: e => {
      e.preventDefault();
      onNavigate('results');
    },
    href: "#"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hp-resort__c"
  }, r.count, " \u0438\u043C\u043E\u0442\u0430"), /*#__PURE__*/React.createElement("div", {
    className: "hp-resort__t"
  }, /*#__PURE__*/React.createElement("h3", null, r.name), /*#__PURE__*/React.createElement("span", null, r.region)));
}
function HomePage({
  onNavigate,
  onOpenListing,
  onSearch
}) {
  const featured = HP_LISTINGS.slice(0, 4);
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("section", {
    className: "hp-hero"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-hero__bg mk-photo mk-photo--pine"
  }), /*#__PURE__*/React.createElement("div", {
    className: "hp-hero__in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-hero__copy"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hp-hero__eyebrow"
  }, /*#__PURE__*/React.createElement(HPIcon, {
    name: "compass",
    size: 15
  }), " \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438 \xB7 \u041F\u0438\u0440\u0438\u043D \xB7 \u0427\u0435\u0440\u043D\u043E\u043C\u043E\u0440\u0438\u0435"), /*#__PURE__*/React.createElement("h1", null, "\u041D\u0430\u043C\u0435\u0440\u0435\u0442\u0435 \u0441\u0432\u043E\u044F \u0434\u043E\u043C \u0432 \u041F\u0438\u0440\u0438\u043D \u0438 \u043F\u043E \u043C\u043E\u0440\u0435\u0442\u043E."), /*#__PURE__*/React.createElement("p", null, "\u0418\u043C\u043E\u0442\u0438 \u0437\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0431\u0430 \u0438 \u043D\u0430\u0435\u043C \u0432 \u0441\u043F\u0430 \u043A\u0443\u0440\u043E\u0440\u0442\u0430 \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438, \u0441\u043A\u0438 \u043A\u0443\u0440\u043E\u0440\u0442\u0430 \u0411\u0430\u043D\u0441\u043A\u043E, \u0411\u043B\u0430\u0433\u043E\u0435\u0432\u0433\u0440\u0430\u0434\u0441\u043A\u043E \u0438 \u043F\u043E \u0427\u0435\u0440\u043D\u043E\u043C\u043E\u0440\u0438\u0435\u0442\u043E.")), /*#__PURE__*/React.createElement("div", {
    className: "hp-hero__search"
  }, /*#__PURE__*/React.createElement(HPSearchBar, {
    size: "lg",
    onSearch: q => onSearch(q)
  })))), /*#__PURE__*/React.createElement("section", {
    className: "hp-sec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-sec__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "\u0420\u0430\u0437\u0433\u043B\u0435\u0434\u0430\u0439\u0442\u0435 \u043F\u043E \u043A\u0443\u0440\u043E\u0440\u0442"), /*#__PURE__*/React.createElement("p", null, "\u0428\u0435\u0441\u0442 \u0440\u0435\u0433\u0438\u043E\u043D\u0430, \u043A\u043E\u0438\u0442\u043E \u043C\u0435\u0441\u0442\u043D\u0438\u0442\u0435 \u043D\u0438 \u043E\u0444\u0438\u0441\u0438 \u043F\u043E\u0437\u043D\u0430\u0432\u0430\u0442 \u0434\u043E \u0432\u0441\u044F\u043A\u0430 \u0443\u043B\u0438\u0446\u0430.")), /*#__PURE__*/React.createElement(HPButton, {
    variant: "secondary",
    iconEnd: "arrow-right",
    onClick: () => onNavigate('resorts')
  }, "\u0412\u0441\u0438\u0447\u043A\u0438 \u043B\u043E\u043A\u0430\u0446\u0438\u0438")), /*#__PURE__*/React.createElement("div", {
    className: "hp-resorts"
  }, HP_RESORTS.map(r => /*#__PURE__*/React.createElement(ResortCard, {
    key: r.slug,
    r: r,
    onNavigate: onNavigate
  })))), /*#__PURE__*/React.createElement("section", {
    className: "hp-sec",
    style: {
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-sec__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "\u0418\u0437\u0431\u0440\u0430\u043D\u0438 \u0438\u043C\u043E\u0442\u0438"), /*#__PURE__*/React.createElement("p", null, "\u041F\u043E\u0434\u0431\u0440\u0430\u043D\u0438 \u0438\u043C\u043E\u0442\u0438, \u043D\u043E\u0432\u0438 \u043D\u0430 \u043F\u0430\u0437\u0430\u0440\u0430 \u0442\u0430\u0437\u0438 \u0441\u0435\u0434\u043C\u0438\u0446\u0430.")), /*#__PURE__*/React.createElement(HPButton, {
    variant: "secondary",
    iconEnd: "arrow-right",
    onClick: () => onNavigate('results')
  }, "\u0412\u0438\u0436 \u0432\u0441\u0438\u0447\u043A\u0438 \u043E\u0431\u044F\u0432\u0438")), /*#__PURE__*/React.createElement("div", {
    className: "hp-grid"
  }, featured.map(l => /*#__PURE__*/React.createElement(HPCard, {
    key: l.id,
    tone: l.tone,
    badges: l.badges,
    price: l.per ? hpMoney(l.price) : hpMoney(l.price),
    per: l.per,
    title: l.title,
    location: l.location,
    beds: l.beds,
    baths: l.baths,
    area: l.area,
    photos: l.photos,
    reference: l.ref,
    onClick: e => {
      e.preventDefault();
      onOpenListing(l.id);
    }
  })))), /*#__PURE__*/React.createElement("section", {
    className: "hp-values"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-values__in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-value"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-value__ic"
  }, /*#__PURE__*/React.createElement(HPIcon, {
    name: "languages",
    size: 24
  })), /*#__PURE__*/React.createElement("h3", null, "\u0413\u043E\u0432\u043E\u0440\u0438\u043C \u0432\u0430\u0448\u0438\u044F \u0435\u0437\u0438\u043A"), /*#__PURE__*/React.createElement("p", null, "\u0412\u0441\u044F\u043A\u0430 \u043E\u0431\u044F\u0432\u0430 \u0438 \u0432\u0441\u0435\u043A\u0438 \u043D\u0430\u0448 \u0431\u0440\u043E\u043A\u0435\u0440 \u0433\u043E\u0432\u043E\u0440\u044F\u0442 \u043D\u0430 \u0431\u044A\u043B\u0433\u0430\u0440\u0441\u043A\u0438, \u0430\u043D\u0433\u043B\u0438\u0439\u0441\u043A\u0438, \u043D\u0435\u043C\u0441\u043A\u0438, \u043D\u0438\u0434\u0435\u0440\u043B\u0430\u043D\u0434\u0441\u043A\u0438 \u0438 \u0440\u0443\u0441\u043A\u0438 \u2014 \u043D\u0438\u0449\u043E \u043D\u0435 \u0441\u0435 \u0433\u0443\u0431\u0438 \u043C\u0435\u0436\u0434\u0443 \u043E\u0433\u043B\u0435\u0434\u0430 \u0438 \u043A\u043B\u044E\u0447\u043E\u0432\u0435\u0442\u0435.")), /*#__PURE__*/React.createElement("div", {
    className: "hp-value"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-value__ic"
  }, /*#__PURE__*/React.createElement(HPIcon, {
    name: "map-pin",
    size: 24
  })), /*#__PURE__*/React.createElement("h3", null, "\u041C\u0435\u0441\u0442\u043D\u0438 \u043E\u0444\u0438\u0441\u0438, \u0438\u0441\u0442\u0438\u043D\u0441\u043A\u0438 \u043A\u043B\u044E\u0447\u043E\u0432\u0435"), /*#__PURE__*/React.createElement("p", null, "\u0415\u043A\u0438\u043F\u0438 \u043D\u0430 \u043C\u044F\u0441\u0442\u043E \u0432 \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438, \u0421\u0432\u0435\u0442\u0438 \u0412\u043B\u0430\u0441 \u0438 \u0411\u0430\u043D\u0441\u043A\u043E, \u043A\u043E\u0438\u0442\u043E \u043C\u043E\u0433\u0430\u0442 \u0434\u0430 \u043E\u0442\u0432\u043E\u0440\u044F\u0442 \u0432\u0440\u0430\u0442\u0430\u0442\u0430 \u043E\u0449\u0435 \u0434\u043D\u0435\u0441 \u0441\u043B\u0435\u0434\u043E\u0431\u0435\u0434.")), /*#__PURE__*/React.createElement("div", {
    className: "hp-value"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-value__ic"
  }, /*#__PURE__*/React.createElement(HPIcon, {
    name: "file-check",
    size: 24
  })), /*#__PURE__*/React.createElement("h3", null, "\u0413\u0440\u0438\u0436\u0438\u043C \u0441\u0435 \u0437\u0430 \u0441\u0434\u0435\u043B\u043A\u0430\u0442\u0430"), /*#__PURE__*/React.createElement("p", null, "\u0410\u0434\u0432\u043E\u043A\u0430\u0442\u0438, \u043D\u043E\u0442\u0430\u0440\u0438\u0443\u0441, \u043F\u0440\u0435\u0432\u043E\u0434 \u0438 \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0441\u043B\u0435\u0434 \u043F\u043E\u043A\u0443\u043F\u043A\u0430\u0442\u0430 \u2014 \u043E\u0440\u0433\u0430\u043D\u0438\u0437\u0438\u0440\u0430\u043D\u0438 \u043E\u0442 \u043A\u0440\u0430\u0439 \u0434\u043E \u043A\u0440\u0430\u0439 \u0437\u0430 \u043A\u0443\u043F\u0443\u0432\u0430\u0447\u0438 \u043E\u0442 \u0447\u0443\u0436\u0431\u0438\u043D\u0430.")))), /*#__PURE__*/React.createElement("section", {
    className: "hp-sell"
  }, /*#__PURE__*/React.createElement("div", {
    className: "hp-sell__glow"
  }), /*#__PURE__*/React.createElement("div", {
    className: "hp-sell__in"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", null, "\u041C\u0438\u0441\u043B\u0438\u0442\u0435 \u0434\u0430 \u043F\u0440\u043E\u0434\u0430\u0434\u0435\u0442\u0435 \u0438\u043C\u043E\u0442 \u0432 \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438 \u0438\u043B\u0438 \u041F\u0438\u0440\u0438\u043D?"), /*#__PURE__*/React.createElement("p", null, "\u0411\u0435\u0437\u043F\u043B\u0430\u0442\u043D\u0430 \u043E\u0446\u0435\u043D\u043A\u0430 \u0438 \u043F\u0440\u043E\u0444\u0435\u0441\u0438\u043E\u043D\u0430\u043B\u043D\u0438 \u0441\u043D\u0438\u043C\u043A\u0438 \u043E\u0442 \u0435\u043A\u0438\u043F, \u043A\u043E\u0439\u0442\u043E \u043F\u0440\u0435\u0434\u043B\u0430\u0433\u0430 \u043D\u0430 \u043A\u0443\u043F\u0443\u0432\u0430\u0447\u0438 \u0432 \u043D\u044F\u043A\u043E\u043B\u043A\u043E \u0434\u044A\u0440\u0436\u0430\u0432\u0438.")), /*#__PURE__*/React.createElement(HPButton, {
    variant: "accent",
    size: "lg",
    iconStart: "phone",
    onClick: () => onNavigate('contact')
  }, "\u0417\u0430\u044F\u0432\u0435\u0442\u0435 \u043E\u0446\u0435\u043D\u043A\u0430"))));
}
Object.assign(window, {
  HomePage
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/HomePage.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/ListingDetail.jsx
try { (() => {
/* Listing detail: breadcrumb, gallery, specs, description, features, agent aside, similar. */
const LD_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const {
  Breadcrumb: LDCrumb,
  Badge: LDBadge,
  Tag: LDTag,
  Button: LDButton,
  IconButton: LDIconButton,
  PropertyCard: LDCard,
  Icon: LDIcon,
  Rating: LDRating,
  Card: LDPanel
} = LD_DS;
const {
  LISTINGS: LD_LISTINGS,
  AGENTS: LD_AGENTS,
  money: ldMoney
} = window.MK_DATA;
const ldCss = `
.ld { max-width:var(--container-2xl); margin:0 auto; padding:20px var(--gutter) 64px; }
.ld-top { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; margin:14px 0 18px; }
.ld-top h1 { font-size:var(--text-3xl); line-height:1.1; }
.ld-top__loc { display:flex; align-items:center; gap:6px; color:var(--text-muted); margin-top:8px; font-size:var(--text-md); }
.ld-top__loc .mk-icon { color:var(--text-muted); }
.ld-top__acts { display:flex; gap:8px; flex:none; }

.ld-gallery { display:grid; grid-template-columns:1.9fr 1fr; grid-template-rows:1fr 1fr; gap:12px; height:470px; margin-bottom:12px; }
.ld-g { position:relative; border-radius:var(--radius-lg); overflow:hidden; }
.ld-g--main { grid-row:1 / span 2; }
.ld-g__badges { position:absolute; top:14px; left:14px; z-index:2; display:flex; gap:6px; }
.ld-g__save { position:absolute; top:12px; right:12px; z-index:2; display:flex; gap:8px; }
.ld-g__more { position:absolute; inset:0; z-index:2; display:flex; align-items:center; justify-content:center; gap:8px; background:rgba(7,20,19,.5); color:#fff; font-weight:var(--fw-semibold); border:none; cursor:pointer; font-size:var(--text-md); -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }

.ld-cols { display:grid; grid-template-columns:1fr 372px; gap:40px; align-items:start; margin-top:22px; }
.ld-specs { display:flex; gap:8px; background:var(--surface-sunken); border-radius:var(--radius-lg); padding:6px; margin-bottom:28px; }
.ld-spec { flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; padding:16px 8px; }
.ld-spec .mk-icon { color:var(--brand); }
.ld-spec b { font-size:var(--text-lg); color:var(--text-strong); font-weight:var(--fw-semibold); }
.ld-spec span { font-size:var(--text-xs); color:var(--text-muted); letter-spacing:.04em; text-transform:uppercase; }
.ld-sec { margin-bottom:32px; }
.ld-sec h2 { font-size:var(--text-xl); margin-bottom:14px; }
.ld-sec p { font-size:var(--text-md); line-height:1.7; color:var(--text-body); max-width:64ch; }
.ld-feats { display:flex; flex-wrap:wrap; gap:9px; }
.ld-nearby { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:12px 28px; max-width:640px; }
.ld-nearby li { display:flex; align-items:center; gap:10px; font-size:var(--text-md); color:var(--text-body); padding:10px 0; border-bottom:1px solid var(--border); }
.ld-nearby .mk-icon { color:var(--text-muted); flex:none; }

.ld-aside { position:sticky; top:92px; }
.ld-price { font-family:var(--font-display); font-weight:var(--fw-semibold); font-size:var(--text-4xl); color:var(--price); letter-spacing:var(--tracking-tight); line-height:1; }
.ld-price span { font-family:var(--font-sans); font-size:var(--text-md); color:var(--text-muted); font-weight:var(--fw-medium); }
.ld-agent { display:flex; align-items:center; gap:12px; margin:20px 0; padding-top:18px; border-top:1px solid var(--border); }
.ld-agent__av { width:52px; height:52px; border-radius:var(--radius-full); flex:none; }
.ld-agent b { display:block; font-size:var(--text-md); color:var(--text-strong); font-weight:var(--fw-semibold); }
.ld-agent span { font-size:var(--text-sm); color:var(--text-muted); }
.ld-aside__btns { display:flex; flex-direction:column; gap:10px; }
.ld-aside__ref { display:flex; align-items:center; justify-content:space-between; margin-top:16px; font-family:var(--font-mono); font-size:var(--text-xs); color:var(--text-subtle); }
.ld-trust { display:flex; align-items:center; gap:8px; margin-top:14px; font-size:var(--text-sm); color:var(--text-muted); }
.ld-trust .mk-icon { color:var(--success-500); }

.ld-similar { max-width:var(--container-2xl); margin:0 auto; padding:0 var(--gutter) 64px; }
.ld-similar h2 { font-size:var(--text-2xl); margin-bottom:22px; }
.ld-similar__grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; }
.ld-similar__grid .mk-pcard { cursor:pointer; }
@media (max-width:1080px){ .ld-cols{ grid-template-columns:1fr; } .ld-aside{ position:static; } .ld-similar__grid{ grid-template-columns:repeat(2,1fr);} }
`;
if (!document.getElementById('mk-ld-css')) {
  const s = document.createElement('style');
  s.id = 'mk-ld-css';
  s.textContent = ldCss;
  document.head.appendChild(s);
}
const THUMB_TONES = ['sand', 'sky', 'pine', 'sunset'];
function ListingDetail({
  listing,
  onNavigate,
  onOpenListing,
  onBook
}) {
  const [saved, setSaved] = React.useState(false);
  const agent = LD_AGENTS[listing.agent];
  const similar = LD_LISTINGS.filter(l => l.id !== listing.id).slice(0, 4);
  const thumbTone = i => THUMB_TONES[i % THUMB_TONES.length];
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("div", {
    className: "ld"
  }, /*#__PURE__*/React.createElement(LDCrumb, {
    items: [{
      label: 'Начало',
      href: '#'
    }, {
      label: listing.deal === 'rent' ? 'Под наем' : 'Продажба',
      href: '#'
    }, {
      label: listing.region,
      href: '#'
    }, {
      label: listing.location
    }]
  }), /*#__PURE__*/React.createElement("div", {
    className: "ld-top"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h1", null, listing.title), /*#__PURE__*/React.createElement("div", {
    className: "ld-top__loc"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "map-pin",
    size: 17
  }), " ", listing.location, " \xB7 ", listing.region)), /*#__PURE__*/React.createElement("div", {
    className: "ld-top__acts"
  }, /*#__PURE__*/React.createElement(LDButton, {
    variant: "secondary",
    iconStart: "share-2"
  }, "\u0421\u043F\u043E\u0434\u0435\u043B\u0438"), /*#__PURE__*/React.createElement(LDButton, {
    variant: saved ? 'subtle' : 'secondary',
    iconStart: "heart",
    onClick: () => setSaved(s => !s)
  }, saved ? 'Запазено' : 'Запази'))), /*#__PURE__*/React.createElement("div", {
    className: "ld-gallery"
  }, /*#__PURE__*/React.createElement("div", {
    className: `ld-g ld-g--main mk-photo mk-photo--${listing.tone}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "ld-g__badges"
  }, listing.badges.map((b, i) => /*#__PURE__*/React.createElement(LDBadge, {
    key: i,
    variant: b.variant,
    solid: true
  }, b.label))), /*#__PURE__*/React.createElement("div", {
    className: "ld-g__save"
  }, /*#__PURE__*/React.createElement(LDIconButton, {
    icon: "share-2",
    label: "Share",
    variant: "glass",
    round: true
  }), /*#__PURE__*/React.createElement(LDIconButton, {
    icon: "heart",
    label: "Save",
    variant: "glass",
    round: true,
    active: saved,
    onClick: () => setSaved(s => !s)
  }))), /*#__PURE__*/React.createElement("div", {
    className: `ld-g mk-photo mk-photo--${thumbTone(0)}`
  }), /*#__PURE__*/React.createElement("div", {
    className: `ld-g mk-photo mk-photo--${thumbTone(1)}`
  }, /*#__PURE__*/React.createElement("button", {
    className: "ld-g__more",
    onClick: () => {}
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "camera",
    size: 18
  }), " \u0412\u0438\u0436 \u0432\u0441\u0438\u0447\u043A\u0438 ", listing.photos, " \u0441\u043D\u0438\u043C\u043A\u0438"))), /*#__PURE__*/React.createElement("div", {
    className: "ld-cols"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ld-specs"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ld-spec"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "bed",
    size: 22
  }), /*#__PURE__*/React.createElement("b", null, listing.beds), /*#__PURE__*/React.createElement("span", null, "\u0421\u043F\u0430\u043B\u043D\u0438")), /*#__PURE__*/React.createElement("div", {
    className: "ld-spec"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "bath",
    size: 22
  }), /*#__PURE__*/React.createElement("b", null, listing.baths), /*#__PURE__*/React.createElement("span", null, "\u0411\u0430\u043D\u0438")), /*#__PURE__*/React.createElement("div", {
    className: "ld-spec"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "ruler",
    size: 22
  }), /*#__PURE__*/React.createElement("b", null, listing.area), /*#__PURE__*/React.createElement("span", null, "\u043A\u0432.\u043C")), /*#__PURE__*/React.createElement("div", {
    className: "ld-spec"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "building-2",
    size: 22
  }), /*#__PURE__*/React.createElement("b", null, listing.floor), /*#__PURE__*/React.createElement("span", null, "\u0415\u0442\u0430\u0436")), /*#__PURE__*/React.createElement("div", {
    className: "ld-spec"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "calendar",
    size: 22
  }), /*#__PURE__*/React.createElement("b", null, listing.year), /*#__PURE__*/React.createElement("span", null, "\u0421\u0442\u0440\u043E\u0435\u0436"))), /*#__PURE__*/React.createElement("div", {
    className: "ld-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "\u0417\u0430 \u0438\u043C\u043E\u0442\u0430"), /*#__PURE__*/React.createElement("p", null, listing.desc)), /*#__PURE__*/React.createElement("div", {
    className: "ld-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "\u0425\u0430\u0440\u0430\u043A\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043A\u0438"), /*#__PURE__*/React.createElement("div", {
    className: "ld-feats"
  }, listing.features.map(f => /*#__PURE__*/React.createElement(LDTag, {
    key: f,
    variant: "neutral",
    icon: "check"
  }, f)))), /*#__PURE__*/React.createElement("div", {
    className: "ld-sec"
  }, /*#__PURE__*/React.createElement("h2", null, "\u0412 \u0440\u0430\u0439\u043E\u043D\u0430"), /*#__PURE__*/React.createElement("ul", {
    className: "ld-nearby"
  }, listing.nearby.map(n => /*#__PURE__*/React.createElement("li", {
    key: n
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "map-pin",
    size: 16
  }), " ", n))))), /*#__PURE__*/React.createElement("aside", {
    className: "ld-aside"
  }, /*#__PURE__*/React.createElement(LDPanel, {
    elevated: true,
    padding: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ld-price"
  }, ldMoney(listing.price), listing.per && /*#__PURE__*/React.createElement("span", null, listing.per)), !listing.per && /*#__PURE__*/React.createElement(LDRating, {
    value: listing.rating,
    showValue: true,
    count: listing.reviews
  }), /*#__PURE__*/React.createElement("div", {
    className: "ld-agent"
  }, /*#__PURE__*/React.createElement("div", {
    className: `ld-agent__av mk-photo mk-photo--${agent.tone}`
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("b", null, agent.name), /*#__PURE__*/React.createElement("span", null, agent.office))), /*#__PURE__*/React.createElement("div", {
    className: "ld-aside__btns"
  }, /*#__PURE__*/React.createElement(LDButton, {
    variant: "accent",
    size: "lg",
    iconStart: "calendar",
    fullWidth: true,
    onClick: onBook
  }, "\u0417\u0430\u043F\u0430\u0437\u0438 \u043E\u0433\u043B\u0435\u0434"), /*#__PURE__*/React.createElement(LDButton, {
    variant: "secondary",
    size: "lg",
    iconStart: "phone",
    fullWidth: true,
    onClick: onBook
  }, "\u0417\u0430\u044F\u0432\u0438 \u043E\u0431\u0430\u0436\u0434\u0430\u043D\u0435")), /*#__PURE__*/React.createElement("div", {
    className: "ld-trust"
  }, /*#__PURE__*/React.createElement(LDIcon, {
    name: "shield-check",
    size: 16
  }), " \u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u0430 \u043E\u0431\u044F\u0432\u0430 \xB7 \u0431\u0440\u043E\u043A\u0435\u0440\u044A\u0442 \u043E\u0442\u0433\u043E\u0432\u0430\u0440\u044F \u0434\u043E ~1 \u0447\u0430\u0441"), /*#__PURE__*/React.createElement("div", {
    className: "ld-aside__ref"
  }, /*#__PURE__*/React.createElement("span", null, "\u0420\u0435\u0444. ", listing.ref), /*#__PURE__*/React.createElement("span", null, agent.phone)))))), /*#__PURE__*/React.createElement("div", {
    className: "ld-similar"
  }, /*#__PURE__*/React.createElement("h2", null, "\u041F\u043E\u0434\u043E\u0431\u043D\u0438 \u0438\u043C\u043E\u0442\u0438 \u043D\u0430\u0431\u043B\u0438\u0437\u043E"), /*#__PURE__*/React.createElement("div", {
    className: "ld-similar__grid"
  }, similar.map(l => /*#__PURE__*/React.createElement(LDCard, {
    key: l.id,
    tone: l.tone,
    badges: l.badges,
    price: ldMoney(l.price),
    per: l.per,
    title: l.title,
    location: l.location,
    beds: l.beds,
    baths: l.baths,
    area: l.area,
    photos: l.photos,
    reference: l.ref,
    onClick: e => {
      e.preventDefault();
      onOpenListing(l.id);
    }
  })))));
}
Object.assign(window, {
  ListingDetail
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/ListingDetail.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SearchResults.jsx
try { (() => {
/* Search results: sticky search bar, filter sidebar, listing rows, pagination. */
const SR_DS = window.MaklerRealtyDesignSystem_9b7f1e;
const {
  SearchBar: SRSearchBar,
  PropertyCard: SRCard,
  Button: SRButton,
  Select: SRSelect,
  Checkbox: SRCheckbox,
  Radio: SRRadio,
  Tag: SRTag,
  Icon: SRIcon,
  Pagination: SRPagination,
  IconButton: SRIconButton
} = SR_DS;
const {
  LISTINGS: SR_LISTINGS,
  money: srMoney
} = window.MK_DATA;
const srCss = `
.sr-subbar { position:sticky; top:72px; z-index:30; background:var(--surface); border-bottom:1px solid var(--border); box-shadow:var(--shadow-xs); }
.sr-subbar__in { max-width:var(--container-2xl); margin:0 auto; padding:14px var(--gutter); }
.sr-body { max-width:var(--container-2xl); margin:0 auto; padding:24px var(--gutter) 64px; display:grid; grid-template-columns:300px 1fr; gap:28px; align-items:start; }
.sr-filters { position:sticky; top:158px; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); padding:20px; box-shadow:var(--shadow-xs); }
.sr-filters h3 { font-family:var(--font-sans); font-size:var(--text-base); font-weight:var(--fw-semibold); color:var(--text-strong); }
.sr-fg { padding:16px 0; border-bottom:1px solid var(--border); }
.sr-fg:last-of-type { border-bottom:none; }
.sr-fg > label.hdr { display:block; font-size:var(--text-xs); font-weight:var(--fw-semibold); letter-spacing:.08em; text-transform:uppercase; color:var(--text-muted); margin-bottom:11px; }
.sr-fg__col { display:flex; flex-direction:column; gap:10px; }
.sr-fg__row { display:flex; gap:10px; }
.sr-beds { display:flex; gap:6px; }
.sr-beds button { flex:1; height:38px; border:1px solid var(--border-strong); background:var(--surface); border-radius:var(--radius-sm); font:inherit; font-size:var(--text-sm); font-weight:var(--fw-medium); color:var(--text-body); cursor:pointer; transition:all var(--dur-fast) var(--ease-standard); }
.sr-beds button[aria-pressed="true"] { background:var(--brand); border-color:var(--brand); color:#fff; }

.sr-results__head { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; }
.sr-results__head h1 { font-size:var(--text-2xl); }
.sr-results__head h1 small { display:block; font-family:var(--font-sans); font-size:var(--text-sm); font-weight:var(--fw-regular); color:var(--text-muted); letter-spacing:0; margin-top:3px; }
.sr-results__tools { display:flex; align-items:center; gap:12px; flex:none; }
.sr-active { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 20px; }
.sr-list { display:flex; flex-direction:column; gap:18px; }
.sr-list .mk-pcard { cursor:pointer; }
.sr-pager { display:flex; justify-content:center; margin-top:34px; }
@media (max-width:1080px){ .sr-body{ grid-template-columns:1fr; } .sr-filters{ position:static; } }
`;
if (!document.getElementById('mk-sr-css')) {
  const s = document.createElement('style');
  s.id = 'mk-sr-css';
  s.textContent = srCss;
  document.head.appendChild(s);
}
function SearchResults({
  onNavigate,
  onOpenListing,
  query
}) {
  const [beds, setBeds] = React.useState('Всички');
  const [sort, setSort] = React.useState('Най-подходящи');
  const [page, setPage] = React.useState(1);
  const [chips, setChips] = React.useState(['Изглед море', 'Обзаведен']);
  const loc = query && query.location || 'Черноморие';
  return /*#__PURE__*/React.createElement("main", null, /*#__PURE__*/React.createElement("div", {
    className: "sr-subbar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sr-subbar__in"
  }, /*#__PURE__*/React.createElement(SRSearchBar, {
    size: "md",
    defaultDeal: query && query.deal,
    locationPlaceholder: loc,
    onSearch: () => setPage(1)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sr-body"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "sr-filters"
  }, /*#__PURE__*/React.createElement("h3", null, "\u0424\u0438\u043B\u0442\u0440\u0438"), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg"
  }, /*#__PURE__*/React.createElement("label", {
    className: "hdr"
  }, "\u0421\u0434\u0435\u043B\u043A\u0430"), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg__col"
  }, /*#__PURE__*/React.createElement(SRRadio, {
    name: "deal",
    label: "\u041F\u0440\u043E\u0434\u0430\u0436\u0431\u0430",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(SRRadio, {
    name: "deal",
    label: "\u041F\u043E\u0434 \u043D\u0430\u0435\u043C"
  }), /*#__PURE__*/React.createElement(SRRadio, {
    name: "deal",
    label: "\u041D\u043E\u0432\u043E \u0441\u0442\u0440\u043E\u0438\u0442\u0435\u043B\u0441\u0442\u0432\u043E"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg"
  }, /*#__PURE__*/React.createElement("label", {
    className: "hdr"
  }, "\u0426\u0435\u043D\u043E\u0432\u0438 \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D (\u20AC)"), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg__row"
  }, /*#__PURE__*/React.createElement(SRSelect, {
    size: "sm",
    defaultValue: "\u0411\u0435\u0437 \u043C\u0438\u043D.",
    options: ['Без мин.', '25,000', '50,000', '100,000', '200,000']
  }), /*#__PURE__*/React.createElement(SRSelect, {
    size: "sm",
    defaultValue: "\u0411\u0435\u0437 \u043C\u0430\u043A\u0441.",
    options: ['Без макс.', '100,000', '250,000', '500,000', '1,000,000']
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg"
  }, /*#__PURE__*/React.createElement("label", {
    className: "hdr"
  }, "\u0421\u043F\u0430\u043B\u043D\u0438"), /*#__PURE__*/React.createElement("div", {
    className: "sr-beds"
  }, ['Всички', '1', '2', '3', '4+'].map(b => /*#__PURE__*/React.createElement("button", {
    key: b,
    "aria-pressed": beds === b,
    onClick: () => setBeds(b)
  }, b)))), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg"
  }, /*#__PURE__*/React.createElement("label", {
    className: "hdr"
  }, "\u0422\u0438\u043F \u0438\u043C\u043E\u0442"), /*#__PURE__*/React.createElement(SRSelect, {
    size: "sm",
    iconStart: "house",
    defaultValue: "\u0412\u0441\u0438\u0447\u043A\u0438",
    options: ['Всички', 'Апартамент', 'Къща', 'Вила', 'Студио', 'Парцел']
  })), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg"
  }, /*#__PURE__*/React.createElement("label", {
    className: "hdr"
  }, "\u0417\u0430\u0434\u044A\u043B\u0436\u0438\u0442\u0435\u043B\u043D\u043E"), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg__col"
  }, /*#__PURE__*/React.createElement(SRCheckbox, {
    label: "\u0418\u0437\u0433\u043B\u0435\u0434 \u043C\u043E\u0440\u0435",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(SRCheckbox, {
    label: "\u0411\u0430\u0441\u0435\u0439\u043D"
  }), /*#__PURE__*/React.createElement(SRCheckbox, {
    label: "\u041E\u0431\u0437\u0430\u0432\u0435\u0434\u0435\u043D",
    defaultChecked: true
  }), /*#__PURE__*/React.createElement(SRCheckbox, {
    label: "\u041F\u0430\u0440\u043A\u0438\u043D\u0433"
  }), /*#__PURE__*/React.createElement(SRCheckbox, {
    label: "\u0411\u0430\u043B\u043A\u043E\u043D / \u0442\u0435\u0440\u0430\u0441\u0430"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sr-fg__row",
    style: {
      paddingTop: 16
    }
  }, /*#__PURE__*/React.createElement(SRButton, {
    variant: "primary",
    fullWidth: true
  }, "\u041F\u0440\u0438\u043B\u043E\u0436\u0438 \u0444\u0438\u043B\u0442\u0440\u0438\u0442\u0435"))), /*#__PURE__*/React.createElement("section", {
    className: "sr-results"
  }, /*#__PURE__*/React.createElement("div", {
    className: "sr-results__head"
  }, /*#__PURE__*/React.createElement("h1", null, "\u0418\u043C\u043E\u0442\u0438 \u0437\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0431\u0430", /*#__PURE__*/React.createElement("small", null, SR_LISTINGS.length * 27, " \u0438\u043C\u043E\u0442\u0430 \u0431\u043B\u0438\u0437\u043E \u0434\u043E ", loc)), /*#__PURE__*/React.createElement("div", {
    className: "sr-results__tools"
  }, /*#__PURE__*/React.createElement(SRSelect, {
    size: "sm",
    value: sort,
    onChange: e => setSort(e.target.value),
    options: ['Най-подходящи', 'Най-нови', 'Цена: ниска към висока', 'Цена: висока към ниска']
  }), /*#__PURE__*/React.createElement(SRIconButton, {
    icon: "map",
    label: "\u041A\u0430\u0440\u0442\u0430",
    variant: "outline"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sr-active"
  }, chips.map(c => /*#__PURE__*/React.createElement(SRTag, {
    key: c,
    variant: "outline",
    onRemove: () => setChips(chips.filter(x => x !== c))
  }, c)), chips.length > 0 && /*#__PURE__*/React.createElement(SRTag, {
    onClick: () => setChips([])
  }, "\u0418\u0437\u0447\u0438\u0441\u0442\u0438")), /*#__PURE__*/React.createElement("div", {
    className: "sr-list"
  }, SR_LISTINGS.map(l => /*#__PURE__*/React.createElement(SRCard, {
    key: l.id,
    orientation: "horizontal",
    tone: l.tone,
    badges: l.badges,
    price: srMoney(l.price),
    per: l.per,
    title: l.title,
    location: l.location,
    beds: l.beds,
    baths: l.baths,
    area: l.area,
    photos: l.photos,
    reference: l.ref,
    onClick: e => {
      e.preventDefault();
      onOpenListing(l.id);
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "sr-pager"
  }, /*#__PURE__*/React.createElement(SRPagination, {
    page: page,
    totalPages: 27,
    onChange: setPage
  })))));
}
Object.assign(window, {
  SearchResults
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SearchResults.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/SiteChrome.jsx
try { (() => {
/* Site chrome: Wordmark, Header (top nav) and Footer. */
const DS = window.MaklerRealtyDesignSystem_9b7f1e;
const {
  Button,
  IconButton,
  Icon,
  Logo
} = DS;
const chromeCss = `
.mk-wordmark { display:inline-flex; align-items:baseline; gap:8px; font-family:var(--font-display); font-weight:600; letter-spacing:-0.01em; color:var(--brand); text-decoration:none; line-height:1; }
.mk-wordmark small { font-family:var(--font-sans); font-weight:600; letter-spacing:.26em; text-transform:uppercase; color:var(--accent); transform:translateY(-1px); }
.mk-wordmark--dark { color:#fff; } .mk-wordmark--dark small { color:var(--stone-400); }

.site-hd { position:sticky; top:0; z-index:40; background:rgba(255,255,255,.92); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); border-bottom:1px solid var(--border); }
.site-hd__in { max-width:var(--container-2xl); margin:0 auto; padding:0 var(--gutter); height:72px; display:flex; align-items:center; gap:28px; }
.site-hd__nav { display:flex; align-items:center; gap:4px; margin-left:8px; }
.site-hd__nav a { font-size:var(--text-base); font-weight:var(--fw-medium); color:var(--text-body); text-decoration:none; padding:9px 12px; border-radius:var(--radius-sm); transition:background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard); cursor:pointer; }
.site-hd__nav a:hover { background:var(--surface-hover); color:var(--text-strong); }
.site-hd__nav a[data-active="true"] { color:var(--brand); }
.site-hd__right { margin-left:auto; display:flex; align-items:center; gap:10px; }
.site-hd__lang { display:inline-flex; align-items:center; gap:4px; background:var(--surface-sunken); border-radius:var(--radius-full); padding:3px; }
.site-hd__lang button { border:none; background:transparent; font:inherit; font-size:var(--text-xs); font-weight:var(--fw-semibold); letter-spacing:.04em; color:var(--text-muted); padding:5px 9px; border-radius:var(--radius-full); cursor:pointer; }
.site-hd__lang button[aria-pressed="true"] { background:var(--surface); color:var(--brand); box-shadow:var(--shadow-xs); }

.site-ft { background:var(--surface-inverse); color:var(--stone-200); }
.site-ft__in { max-width:var(--container-2xl); margin:0 auto; padding:56px var(--gutter) 32px; display:grid; grid-template-columns:1.4fr 1fr 1fr 1fr; gap:40px; }
.site-ft h4 { font-family:var(--font-sans); font-size:var(--text-xs); font-weight:var(--fw-semibold); letter-spacing:.14em; text-transform:uppercase; color:var(--stone-400); margin:0 0 16px; }
.site-ft ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:11px; }
.site-ft a { color:var(--stone-200); text-decoration:none; font-size:var(--text-base); }
.site-ft a:hover { color:#fff; text-decoration:underline; text-underline-offset:2px; }
.site-ft__intro { color:var(--stone-300); font-size:var(--text-base); line-height:1.6; max-width:34ch; margin:16px 0 20px; }
.site-ft__contact { display:flex; flex-direction:column; gap:9px; }
.site-ft__contact span { display:flex; align-items:center; gap:9px; font-size:var(--text-base); }
.site-ft__contact .mk-icon { color:var(--stone-400); flex:none; }
.site-ft__bar { border-top:1px solid var(--border-inverse); }
.site-ft__bar-in { max-width:var(--container-2xl); margin:0 auto; padding:20px var(--gutter); display:flex; align-items:center; justify-content:space-between; gap:16px; font-size:var(--text-sm); color:var(--stone-400); }
.site-ft__bar-in nav { display:flex; gap:20px; }
@media (max-width:900px){ .site-ft__in{ grid-template-columns:1fr 1fr; } }
`;
if (!document.getElementById('mk-chrome-css')) {
  const s = document.createElement('style');
  s.id = 'mk-chrome-css';
  s.textContent = chromeCss;
  document.head.appendChild(s);
}
function Wordmark({
  dark = false,
  size = 22,
  onClick
}) {
  return /*#__PURE__*/React.createElement("a", {
    className: 'mk-wordmark' + (dark ? ' mk-wordmark--dark' : ''),
    style: {
      fontSize: size
    },
    onClick: onClick,
    href: "#"
  }, "MS", /*#__PURE__*/React.createElement("small", {
    style: {
      fontSize: Math.round(size * 0.5)
    }
  }, "Realty"));
}
const NAV = [{
  key: 'results',
  label: 'Купува'
}, {
  key: 'results',
  label: 'Под наем'
}, {
  key: 'resorts',
  label: 'Курорти'
}, {
  key: 'results',
  label: 'Ново строителство'
}, {
  key: 'contact',
  label: 'Контакти'
}];
function Header({
  onNavigate,
  active
}) {
  const [lang, setLang] = React.useState('BG');
  return /*#__PURE__*/React.createElement("header", {
    className: "site-hd"
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-hd__in"
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('home');
    },
    "aria-label": "MS Realty \u2014 \u043D\u0430\u0447\u0430\u043B\u043E",
    style: {
      display: 'inline-flex',
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    height: 40
  })), /*#__PURE__*/React.createElement("nav", {
    className: "site-hd__nav"
  }, NAV.map((n, i) => /*#__PURE__*/React.createElement("a", {
    key: i,
    "data-active": active === n.key || undefined,
    onClick: e => {
      e.preventDefault();
      onNavigate(n.key);
    }
  }, n.label))), /*#__PURE__*/React.createElement("div", {
    className: "site-hd__right"
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-hd__lang",
    role: "group",
    "aria-label": "\u0415\u0437\u0438\u043A"
  }, ['BG', 'EN', 'DE', 'NL', 'RU'].map(l => /*#__PURE__*/React.createElement("button", {
    key: l,
    "aria-pressed": lang === l,
    onClick: () => setLang(l)
  }, l))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconStart: "heart"
  }, "\u0417\u0430\u043F\u0430\u0437\u0435\u043D\u0438"), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "sm",
    iconStart: "phone",
    as: "a",
    href: "tel:+359879696870"
  }, "\u041E\u0431\u0430\u0434\u0438 \u0441\u0435 \u043D\u0430 \u0431\u0440\u043E\u043A\u0435\u0440"))));
}
function Footer({
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("footer", {
    className: "site-ft"
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-ft__in"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("a", {
    href: "#",
    onClick: e => {
      e.preventDefault();
      onNavigate('home');
    },
    "aria-label": "MS Realty \u2014 \u043D\u0430\u0447\u0430\u043B\u043E",
    style: {
      display: 'inline-flex'
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    variant: "reversed",
    height: 30
  })), /*#__PURE__*/React.createElement("p", {
    className: "site-ft__intro"
  }, "\u0418\u043C\u043E\u0442\u0438 \u0437\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0431\u0430 \u0438 \u043F\u043E\u0434 \u043D\u0430\u0435\u043C \u0432 \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438 \u0438 \u041F\u0438\u0440\u0438\u043D, \u043F\u043E \u0427\u0435\u0440\u043D\u043E\u043C\u043E\u0440\u0438\u0435\u0442\u043E \u0438 \u0432 \u0441\u044A\u0441\u0435\u0434\u043D\u0430 \u0413\u044A\u0440\u0446\u0438\u044F \u2014 \u0441 \u043C\u0435\u0441\u0442\u043D\u0438 \u043E\u0444\u0438\u0441\u0438 \u0438 \u0431\u0440\u043E\u043A\u0435\u0440\u0438, \u043A\u043E\u0438\u0442\u043E \u0433\u043E\u0432\u043E\u0440\u044F\u0442 \u0432\u0430\u0448\u0438\u044F \u0435\u0437\u0438\u043A."), /*#__PURE__*/React.createElement("div", {
    className: "site-ft__contact"
  }, /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "phone",
    size: 16
  }), " +359 879 69 68 70"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "mail",
    size: 16
  }), " office@makler-realty.com"), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 16
  }), " \u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438 \xB7 \u0411\u0430\u043D\u0441\u043A\u043E \xB7 \u0421\u0432\u0435\u0442\u0438 \u0412\u043B\u0430\u0441"))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "\u0420\u0430\u0437\u0433\u043B\u0435\u0434\u0430\u0439\u0442\u0435"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u0418\u043C\u043E\u0442\u0438 \u0437\u0430 \u043F\u0440\u043E\u0434\u0430\u0436\u0431\u0430")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u0418\u043C\u043E\u0442\u0438 \u043F\u043E\u0434 \u043D\u0430\u0435\u043C")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('resorts')
  }, "\u041D\u043E\u0432\u043E \u0441\u0442\u0440\u043E\u0438\u0442\u0435\u043B\u0441\u0442\u0432\u043E")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('resorts')
  }, "\u041A\u0443\u0440\u043E\u0440\u0442\u0438 \u0438 \u0440\u0435\u0433\u0438\u043E\u043D\u0438")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('home')
  }, "\u0420\u044A\u043A\u043E\u0432\u043E\u0434\u0441\u0442\u0432\u043E \u0437\u0430 \u043A\u0443\u043F\u0443\u0432\u0430\u0447\u0430")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "\u041B\u043E\u043A\u0430\u0446\u0438\u0438"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u0421\u0432\u0435\u0442\u0438 \u0412\u043B\u0430\u0441")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u0421\u043B\u044A\u043D\u0447\u0435\u0432 \u0431\u0440\u044F\u0433")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u0411\u0430\u043D\u0441\u043A\u043E")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u0421\u0430\u043D\u0434\u0430\u043D\u0441\u043A\u0438")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('results')
  }, "\u041D\u0430\u0444\u043F\u043B\u0438\u043E, \u0413\u044A\u0440\u0446\u0438\u044F")))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", null, "\u041A\u043E\u043C\u043F\u0430\u043D\u0438\u044F"), /*#__PURE__*/React.createElement("ul", null, /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('contact')
  }, "\u0417\u0430 \u043D\u0430\u0441")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('contact')
  }, "\u041D\u0430\u0448\u0438\u0442\u0435 \u043E\u0444\u0438\u0441\u0438")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('contact')
  }, "\u041F\u0440\u043E\u0434\u0430\u0439\u0442\u0435 \u0441 \u043D\u0430\u0441")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('contact')
  }, "\u041A\u0430\u0440\u0438\u0435\u0440\u0438")), /*#__PURE__*/React.createElement("li", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('contact')
  }, "\u041A\u043E\u043D\u0442\u0430\u043A\u0442\u0438"))))), /*#__PURE__*/React.createElement("div", {
    className: "site-ft__bar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "site-ft__bar-in"
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 MS Realty \u0415\u041E\u041E\u0414. \u0412\u0441\u0438\u0447\u043A\u0438 \u043F\u0440\u0430\u0432\u0430 \u0437\u0430\u043F\u0430\u0437\u0435\u043D\u0438."), /*#__PURE__*/React.createElement("nav", null, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('home')
  }, "\u041F\u043E\u0432\u0435\u0440\u0438\u0442\u0435\u043B\u043D\u043E\u0441\u0442"), /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('home')
  }, "\u0423\u0441\u043B\u043E\u0432\u0438\u044F"), /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate('home')
  }, "\u0411\u0438\u0441\u043A\u0432\u0438\u0442\u043A\u0438")))));
}
Object.assign(window, {
  Wordmark,
  Header,
  Footer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/SiteChrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/website/data.js
try { (() => {
/* MS Realty — sample content for the website UI kit (Bulgarian copy).
   Based on the real portfolio at makler-realty.com: MS Realty is a
   Sandanski-based agency. The bulk of stock is in Sandanski (a SPA town in
   the Struma valley, at the foot of Pirin — NO sea), plus Bansko (ski) and
   the coast (Sveti Vlas / Greece). `.mk-photo` tones stand in for real photos. */

const AGENTS = {
  elena: {
    name: 'Елена Петрова',
    office: 'Централен офис · Сандански',
    phone: '+359 879 69 68 70',
    tone: 'sand'
  },
  dimitar: {
    name: 'Димитър Колев',
    office: 'Пирински офис · Банско',
    phone: '+359 88 903 1140',
    tone: 'pine'
  },
  mila: {
    name: 'Мила Георгиева',
    office: 'Морски офис · Свети Влас',
    phone: '+359 88 421 7788',
    tone: 'sea'
  }
};
const money = n => '€' + n.toLocaleString('en-US');
const LISTINGS = [{
  id: 'ms-987',
  ref: 'MS-987',
  deal: 'sale',
  tone: 'sand',
  title: 'Двустаен в идеалния център на Сандански',
  location: 'Сандански',
  region: 'Струмска долина',
  price: 130000,
  beds: 1,
  baths: 1,
  area: 55,
  floor: '3 / 5',
  year: 2019,
  photos: 22,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }, {
    variant: 'new',
    label: 'Ново'
  }],
  features: ['Обзаведен', 'Гараж', 'Климатик', 'До спа парка', 'Асансьор'],
  nearby: ['Минерален спа парк — 5 мин пеша', 'Пешеходна зона — 3 мин', 'Пирин — 15 мин', 'Границата с Гърция — 20 мин'],
  agent: 'elena',
  rating: 4.8,
  reviews: 34,
  desc: 'Напълно обзаведен двустаен апартамент в самия център на Сандански — най-топлия град в България. На минути от минералния спа парк и пешеходната зона, готов за нанасяне.'
}, {
  id: 'ms-944',
  ref: 'MS-944',
  deal: 'sale',
  tone: 'sand',
  title: 'Панорамен двустаен с гараж, паркова зона',
  location: 'Сандански',
  region: 'Струмска долина',
  price: 165000,
  beds: 1,
  baths: 1,
  area: 117,
  floor: '2 / 4',
  year: 2021,
  photos: 26,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }, {
    variant: 'featured',
    label: 'Топ оферта'
  }],
  features: ['Гараж', 'Панорамен изглед', 'Изглед към Пирин', 'Обзаведен', 'Балкон', 'Асансьор'],
  nearby: ['Спа парк — 8 мин', 'Център — 10 мин', 'Пирински пътеки — 15 мин', 'Мелник — 20 мин'],
  agent: 'elena',
  rating: 4.9,
  reviews: 18,
  desc: 'Просторен двустаен апартамент с гараж в тиха паркова зона на Сандански. Панорамен изглед към Пирин, продава се напълно обзаведен.'
}, {
  id: 'ms-778',
  ref: 'MS-778',
  deal: 'sale',
  tone: 'sand',
  title: 'Тристаен в комплекс Парк Хотел Пирин',
  location: 'Сандански',
  region: 'Струмска долина',
  price: 250000,
  beds: 2,
  baths: 2,
  area: 93,
  floor: '4 / 6',
  year: 2016,
  photos: 30,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }],
  features: ['СПА и минерален басейн', 'Изглед към Пирин', 'Обзаведен', 'Балкон', 'Рецепция', 'Паркинг'],
  nearby: ['СПА център — на място', 'Градски парк — 2 мин', 'Център — 10 мин', 'Границата с Гърция — 20 мин'],
  agent: 'elena',
  rating: 5.0,
  reviews: 12,
  desc: 'Обзаведен тристаен апартамент в комплекс Парк Хотел Пирин с целогодишен достъп до минерални басейни и спа. Силен имот за отдаване през спа сезона.'
}, {
  id: 'ms-939',
  ref: 'MS-939',
  deal: 'sale',
  tone: 'pine',
  title: 'Луксозна къща в Сандански',
  location: 'Сандански',
  region: 'Струмска долина',
  price: 339000,
  beds: 4,
  baths: 3,
  area: 220,
  floor: 'Самостоятелна',
  year: 2014,
  photos: 38,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }, {
    variant: 'featured',
    label: 'Топ оферта'
  }],
  features: ['Двор', 'Гараж', 'Изглед към Пирин', 'Камина', 'Барбекю', 'Собствено парно'],
  nearby: ['Център — 7 мин', 'Спа комплекс — 10 мин', 'Мелник — 20 мин', 'Границата с Гърция — 20 мин'],
  agent: 'elena',
  rating: 4.9,
  reviews: 9,
  desc: 'Съвременна четиристайна къща в полите на Пирин над Сандански, с двор, гараж и открит изглед към планината. Продава се с обзавеждане и барбекю зона.'
}, {
  id: 'ms-937',
  ref: 'MS-937',
  deal: 'sale',
  tone: 'pine',
  title: 'Обзаведено студио, Сапфир Резиденс',
  location: 'Банско',
  region: 'Пирин планина',
  price: 37500,
  beds: 1,
  baths: 1,
  area: 30,
  floor: '3 / 5',
  year: 2010,
  photos: 16,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }, {
    variant: 'reduced',
    label: 'Намалена'
  }],
  features: ['СПА и басейн', 'Ски мазе', 'Обзаведено', 'Изглед към планина', 'Асансьор'],
  nearby: ['Кабинков лифт — 700 м', 'Център — 10 мин пеша', 'Ресторанти — 5 мин', 'София — 2ч30'],
  agent: 'dimitar',
  rating: 4.6,
  reviews: 41,
  desc: 'Компактно обзаведено студио в поддържан ски комплекс Сапфир Резиденс, на кратка разходка от кабинковия лифт в Банско. Отличен имот за наем през зимата.'
}, {
  id: 'ms-956',
  ref: 'MS-956',
  deal: 'sale',
  tone: 'pine',
  title: 'Каменна вила в Пирин над Илинденци',
  location: 'Илинденци, Струмяни',
  region: 'Пирин планина',
  price: 86000,
  beds: 2,
  baths: 1,
  area: 51,
  floor: 'Самостоятелна',
  year: 2008,
  photos: 20,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }],
  features: ['Двор', 'Изглед към планина', 'Камина', 'Кладенец', 'Тишина', 'Барбекю'],
  nearby: ['Илинденци — 3 км', 'Мелник — 25 мин', 'Сандански — 30 мин', 'Границата с Гърция — 40 мин'],
  agent: 'dimitar',
  rating: 4.7,
  reviews: 15,
  desc: 'Каменна вила сред природата на Пирин над село Илинденци — тишина, чист въздух и открит планински изглед. Идеална за уикенд убежище.'
}, {
  id: 'ms-957',
  ref: 'MS-957',
  deal: 'rent',
  tone: 'sand',
  title: 'Двустаен под наем до парка на Сандански',
  location: 'Сандански',
  region: 'Струмска долина',
  price: 400,
  per: '/мес',
  beds: 1,
  baths: 1,
  area: 65,
  floor: '2 / 5',
  year: 2017,
  photos: 14,
  badges: [{
    variant: 'for-rent',
    label: 'Под наем'
  }],
  features: ['Обзаведен', 'Климатик', 'Балкон', 'До спа парка', 'Асансьор'],
  nearby: ['Градски парк — 3 мин', 'Пешеходна зона — 5 мин', 'Автогара — 10 мин', 'Границата с Гърция — 20 мин'],
  agent: 'elena',
  rating: 4.7,
  reviews: 11,
  desc: 'Просторен и светъл двустаен апартамент под наем до градския парк на Сандански. Обзаведен, свободен за дългосрочен наем.'
}, {
  id: 'ms-svlas',
  ref: 'MS-2043',
  deal: 'sale',
  tone: 'sea',
  title: 'Апартамент с изглед море, Свети Влас',
  location: 'Свети Влас',
  region: 'Черноморие',
  price: 189000,
  beds: 2,
  baths: 1,
  area: 68,
  floor: '4 / 8',
  year: 2018,
  photos: 24,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }, {
    variant: 'new',
    label: 'Ново'
  }],
  features: ['Изглед море', 'Балкон', 'Общ басейн', 'Обзаведен', 'Асансьор', 'Паркинг'],
  nearby: ['Плаж — 300 м', 'Марина — 500 м', 'Несебър — 10 мин', 'Летище Бургас — 35 мин'],
  agent: 'mila',
  rating: 4.8,
  reviews: 63,
  desc: 'Светъл двустаен апартамент на няколко крачки от морето в Свети Влас. Южен балкон с изглед към залива, продава се обзаведен и готов за летния сезон.'
}, {
  id: 'ms-893',
  ref: 'MS-893',
  deal: 'sale',
  tone: 'sunset',
  title: 'Тристаен в Паралия Офринио, Гърция',
  location: 'Офринио, Гърция',
  region: 'Егейско крайбрежие',
  price: 139000,
  beds: 2,
  baths: 1,
  area: 42,
  floor: '1 / 3',
  year: 2012,
  photos: 18,
  badges: [{
    variant: 'for-sale',
    label: 'Продажба'
  }],
  features: ['Близо до плажа', 'Балкон', 'Обзаведен', 'Климатик', 'Паркинг'],
  nearby: ['Плаж — 200 м', 'Кавала — 25 мин', 'Солун — 1ч', 'Границата — 1ч20'],
  agent: 'mila',
  rating: 4.5,
  reviews: 22,
  desc: 'Тристаен апартамент на 200 метра от плажа в Паралия Офринио, Северна Гърция. Удобен за клиенти от Сандански — на час от Солун.'
}];
const RESORTS = [{
  slug: 'sandanski',
  name: 'Сандански',
  region: 'СПА курорт · Струмска долина',
  count: 142,
  tone: 'sand'
}, {
  slug: 'bansko',
  name: 'Банско',
  region: 'Ски курорт · Пирин планина',
  count: 88,
  tone: 'pine'
}, {
  slug: 'melnik',
  name: 'Мелник',
  region: 'Вино и история · Струма',
  count: 24,
  tone: 'sunset'
}, {
  slug: 'st-vlas',
  name: 'Свети Влас',
  region: 'Морски курорт · Черноморие',
  count: 57,
  tone: 'sea'
}, {
  slug: 'nafplio',
  name: 'Нафплио',
  region: 'Морски курорт · Гърция',
  count: 19,
  tone: 'sunset'
}, {
  slug: 'petrich',
  name: 'Петрич',
  region: 'Струмска долина',
  count: 46,
  tone: 'sand'
}];
window.MK_DATA = {
  LISTINGS,
  RESORTS,
  AGENTS,
  money
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/website/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.DataTable = __ds_scope.DataTable;

__ds_ns.Stat = __ds_scope.Stat;

__ds_ns.Timeline = __ds_scope.Timeline;

__ds_ns.Accordion = __ds_scope.Accordion;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.PropertyCard = __ds_scope.PropertyCard;

__ds_ns.Rating = __ds_scope.Rating;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.Alert = __ds_scope.Alert;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Skeleton = __ds_scope.Skeleton;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.RangeSlider = __ds_scope.RangeSlider;

__ds_ns.SearchBar = __ds_scope.SearchBar;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.LOGO_SRC = __ds_scope.LOGO_SRC;

__ds_ns.LOGO_SRC_REVERSED = __ds_scope.LOGO_SRC_REVERSED;

__ds_ns.LOGO_ASPECT = __ds_scope.LOGO_ASPECT;

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.LangSwitcher = __ds_scope.LangSwitcher;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.AgentCard = __ds_scope.AgentCard;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.AvatarGroup = __ds_scope.AvatarGroup;

})();
