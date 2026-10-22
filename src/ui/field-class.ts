// Shared native control styles; safe to import from server and client components.
import { cx } from "./cx";

// Fill, border, value text and states that every field shares (UI06 Input, UI07 Textarea). An
// invalid field keeps its 1 px border in the error colour (UI06 Error 6:68); the message under
// it and the error summary say what is wrong, so colour is never the only signal.
const surfaceClass = cx(
  "w-full border border-border bg-canvas text-body text-text",
  "placeholder:text-text-muted transition-colors duration-(--duration-fast)",
  "data-hovered:border-text",
  "group-data-invalid:border-error",
  "group-data-readonly:border-dashed group-data-readonly:bg-subtle",
  "group-data-disabled:cursor-not-allowed group-data-disabled:border-disabled-text group-data-disabled:bg-disabled group-data-disabled:text-disabled-text",
  "forced-colors:group-data-disabled:border-[GrayText] forced-colors:group-data-disabled:text-[GrayText]",
);

// UI06 Input (Figma 6:74), also drawn for selects in every P, C and O form: 12 px padding
// around 16/26 text and a 1 px border make 52 px on the canvas fill. The 44 px `control` token
// stays the touch-target minimum. Native selects reserve room for the base.css UI08 chevron;
// O12's scoped rule restores the 12 px inset of its UI06 instances.
export const controlClass = cx(
  surfaceClass,
  "min-h-input rounded-control px-3 py-3 [&:is(select)]:pe-11",
);

// UI07 Textarea (Figma 6:85): a writing surface with 16 px padding and the 8 px panel radius,
// at least 144 px tall. Four rows fit inside that, so only a longer `rows` makes it taller.
export const textareaClass = cx(surfaceClass, "min-h-36 resize-y rounded-panel p-4");

// A UI06 field whose value wraps instead of running out of sight (O16PUB scope, 642:12654 /
// 642:12748): 52 px for one line, 26 px more for each wrapped line (78 px for two). Without
// `field-sizing` the textarea's rows apply.
export const wrapControlClass = cx(
  surfaceClass,
  "field-sizing-content min-h-input resize-none rounded-control px-3 py-3",
);

/** Label, hint, control and error, 8 px apart (UI06). */
export const fieldClass = "group flex min-w-0 w-full flex-col gap-2";

/** A field's label: 14/20 semibold ("MSR / dense · semibold" in UI06 and UI07). */
export const labelClass = "text-dense font-semibold text-text";

/** A field's error under the control: 14/20 medium ("MSR / caption · medium", 6:67). */
export const errorClass = "text-caption font-medium text-error";
