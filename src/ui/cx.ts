import { extendTailwindMerge } from "tailwind-merge";

// Teach the merger our semantic scales, including text sizes that otherwise look like colours.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        "title",
        "page",
        "heading",
        "section",
        "subheading",
        "price",
        "body",
        "compact",
        "operational",
        "dense",
        "caption",
      ],
      spacing: ["control", "input", "gutter", "gutter-medium", "gutter-wide"],
      container: ["page", "form", "reading", "rail", "filter-rail", "inspector"],
      radius: ["control", "panel", "card"],
      shadow: ["raised", "overlay"],
    },
  },
});

/** Later utilities override earlier utilities within the same responsive/state variant. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return merge(classes.filter(Boolean).join(" "));
}
