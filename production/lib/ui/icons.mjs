import { h } from "../react-static-html.mjs";
import { ICON_DATA } from "./icon-data.mjs";

// Mirrors makler-realty-design-system/project/components/general/Icon.jsx so the
// harvested .mk-icon CSS applies to server-rendered markup. Vector data comes
// from lucide-static at build time (see scripts/build-design-assets.mjs).
export function Icon({ name, size = 20, strokeWidth = 1.75, label, className = "" }) {
  const nodes = ICON_DATA[name];
  if (!nodes) throw new Error(`Unknown icon "${name}" — add it to ICON_NAMES in build-design-assets.mjs`);
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": "true", focusable: "false" };
  return h(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      className: `mk-icon ${className}`.trim(),
      ...a11y,
    },
    ...nodes.map(([tag, attrs], index) => h(tag, { key: index, ...attrs })),
  );
}
