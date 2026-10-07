// Shared native control styles; safe to import from server and client components.
import { cx } from "./cx";

// UI06 Input (Figma 6:74), also drawn for selects in every P, C and O form: 52 px with 16/26
// text on the canvas fill. The 44 px `control` token stays the touch-target minimum. 11 px
// block padding keeps the text where the drawn 12 px puts it and lets the 2 px error border
// fit inside the 52 px. A native select keeps room for the base.css chevron.
export const controlClass = cx(
  "min-h-input w-full rounded-control border border-border bg-canvas px-3 py-2.75 text-body text-text [&:is(select)]:pe-11",
  "placeholder:text-text-muted transition-colors duration-(--duration-fast)",
  "data-hovered:border-text",
  "group-data-invalid:border-2 group-data-invalid:border-error",
  "group-data-readonly:border-dashed group-data-readonly:bg-subtle",
  "group-data-disabled:cursor-not-allowed group-data-disabled:border-disabled-text group-data-disabled:bg-disabled group-data-disabled:text-disabled-text",
  "forced-colors:group-data-disabled:border-[GrayText] forced-colors:group-data-disabled:text-[GrayText]",
);

/** Label, hint, control and error, 8 px apart (UI06). */
export const fieldClass = "group flex min-w-0 w-full flex-col gap-2";

/** A field's label: 14/20 semibold ("MSR / dense · semibold" in UI06 and UI07). */
export const labelClass = "text-dense font-semibold text-text";
