// MS Realty operator design system — resolved tokens.
// Ramps come from makler-realty-design-system/project/tokens/*.css.
//
// What actually changed against the inherited ramps, which the Foundations sheet
// used to summarise as "three roles are new steps":
//   one NEW value      --warning-700 #8A5F18, because 600 on warning-50 is 4.21:1
//   one role RE-POINTED --border-control to --stone-500, an existing step
//   one role WITHDRAWN  --text-ghost is stone-400 at 2.40:1, non-text only
//   one alpha RAISED    --sb-label .38 -> .54, because .38 composited to 3.59:1
//
// The scales below are exported because the Foundations sheet documents them and
// lint.mjs checks the sheet against them. A claim about the system that is not
// rendered from the system is a claim that drifts.

// Layout spacing: gutters, gaps, and panel and row padding.
export const SPACING_STEPS = Object.freeze([4, 8, 12, 16, 20, 24, 32]);

// The four measurements the sheet publishes as canonical. Every one is a step.
export const CANONICAL_SPACING = Object.freeze({
  rowPadding: [8, 12],
  panelPadding: [12, 16],
  pageGutter: 24,
  columnGap: 20,
});

// Icons are drawn on a 24px grid and used at two densities: beside a word, and
// as the single figure in an empty state. The bands describe what the canvas
// actually does — 509 calls, none outside these two ranges — rather than an
// aspiration three quarters of the drawings miss.
export const ICON_BANDS = Object.freeze({
  inline: [11, 22],
  illustration: [26, 30],
});

export const TOKENS = `
    :root {
      /* Stone — warm neutral */
      --stone-50:#FAF7F1; --stone-100:#F2ECE1; --stone-200:#E6DCCB; --stone-300:#D3C4AC;
      --stone-400:#B7A585; --stone-500:#948263; --stone-600:#73644A; --stone-700:#574B38;
      --stone-800:#3A3227; --stone-900:#241F18; --stone-950:#16130E;
      /* Ink — brand charcoal */
      --ink-50:#F4F4F3; --ink-100:#E6E6E5; --ink-200:#C9C9C7; --ink-300:#A6A6A4;
      --ink-400:#7A7A78; --ink-500:#545453; --ink-600:#3F3F3F; --ink-700:#2E2E2E;
      --ink-800:#222222; --ink-900:#181818; --ink-950:#0E0E0E;
      /* Brick — the logo red, accent only */
      --brick-50:#FCEBEB; --brick-300:#ED8484; --brick-400:#E45D5D; --brick-500:#DB3E3E;
      --brick-600:#C42D2D; --brick-700:#A32323; --brick-800:#7F1B1B;
      /* Sea, Sun — supporting */
      --sea-50:#ECF3F2; --sea-100:#D2E3E1; --sea-200:#A6C7C4; --sea-600:#204B49; --sea-700:#183B39;
      --sun-100:#FBEECF; --sun-500:#D2952A; --sun-600:#AE7420;
      /* Status */
      --success-50:#E7F3EC; --success-500:#2F7D57; --success-600:#256345;
      --warning-50:#FBF1DD; --warning-600:#9A6A1B;
      --warning-700:#8A5F18;   /* NEW — 600 on warning-50 is 4.21:1, below the 4.5 floor. 700 is 5.02:1. */
      --danger-50:#F9E7EA; --danger-500:#C42E44; --danger-600:#9E2334;

      /* Semantic roles */
      --canvas:var(--stone-50);
      --surface:#FFFFFF;
      --sunken:var(--stone-100);
      --border:var(--stone-200);          /* dividers and hairlines — not a control boundary */
      --border-control:var(--stone-500);  /* NEW role — 3.73:1, clears 1.4.11 for input and button edges */
      --text-strong:var(--stone-900);     /* 16.35:1 on surface */
      --text-body:var(--stone-800);       /* 11.79:1 on canvas */
      --text-muted:var(--stone-600);      /* 5.75:1 on surface, 4.89:1 on sunken */
      --text-ghost:var(--stone-400);      /* NON-TEXT ONLY — 2.40:1. Dashed edges, disabled glyphs. */
      --brand:var(--ink-800); --accent:var(--brick-600);
      --sb-bg:var(--ink-900); --sb-edge:var(--ink-950);
      --sb-text:rgba(255,255,255,.74);    /* 10.07:1 composited on --sb-bg */
      --sb-label:rgba(255,255,255,.54);   /* 5.93:1 composited on --sb-bg — .38 was 3.59:1 */

      --font-sans:'Commissioner',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
      --font-display:'Source Serif 4','Iowan Old Style',Georgia,'Times New Roman',serif;
      --font-mono:'IBM Plex Mono',ui-monospace,'SF Mono',Menlo,monospace;

      --r-xs:4px; --r-sm:6px; --r-md:8px; --r-lg:14px; --r-xl:20px; --r-full:999px;
      --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px;
      --e-1:0 1px 2px rgba(22,19,14,.06);
      --e-2:0 1px 2px rgba(22,19,14,.06),0 2px 6px rgba(22,19,14,.06);
      --e-3:0 6px 10px rgba(22,19,14,.06),0 16px 32px rgba(22,19,14,.12);
      --ring:0 0 0 3px rgba(219,62,62,.45);
    }
`;
