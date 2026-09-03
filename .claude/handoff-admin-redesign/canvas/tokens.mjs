// MS Realty design system — resolved tokens.
//
// The world is Sandanski's own: a thermal bath house. Glazed tile for the
// ground, grout lines for the rules, deep spring water for the public field,
// warm marble for the words, and the logo's brick held to one action. Nothing
// here is "warm cream paper with a serif and a red accent" — that is the look
// every generated interface lands on, and it is the look this replaces.
//
// One idea runs through every screen: every fact carries its witness. The
// witness line (who verified it, when) is the signature element, drawn once
// in shell.mjs and used wherever a fact is shown.
//
// The scales below are exported because the Foundations sheet renders them and
// lint.mjs checks the sheet and every artboard against them. A claim about the
// system that is not rendered from the system is a claim that drifts.

// Layout spacing: gutters, gaps, and panel and row padding. Public pages add
// the three section steps.
export const SPACING_STEPS = Object.freeze([4, 8, 12, 16, 20, 24, 32, 48, 64, 96]);

// The measurements the sheet publishes as canonical. Every one is a step.
export const CANONICAL_SPACING = Object.freeze({
  rowPadding: [12, 12],
  panelPadding: [16, 20],
  pageGutter: 24,
  columnGap: 20,
  sectionGap: 32,
  publicSection: 96,
});

// A row is a touch target. One number does both jobs.
export const ROW_MODULE = 44;

// Three radii, not six. Tile has near-square edges; only a pill is round.
export const RADII = Object.freeze({ edge: 2, panel: 6, pill: 999 });

// Two elevations: at rest a thing sits on the tile and is separated by a grout
// line; only a thing that floats (menu, dialog, toast) casts a shadow.
export const ELEVATIONS = Object.freeze(["rest", "float"]);

// One ratio. Minor third from 13. Operate screens use two sizes: body and
// heading. Public pages add the display steps.
export const TYPE_RATIO = 1.2;
export const TYPE_SCALE = Object.freeze([11, 13, 16, 19, 22, 27, 32, 39, 47, 56]);

// Icons are drawn on a 24px grid and used at two densities.
export const ICON_BANDS = Object.freeze({
  inline: [11, 22],
  illustration: [26, 30],
});

export const TOKENS = `
    :root {
      /* Tile — the ground. Glazed white with a warm-grey glaze; cooler than paper. */
      --tile:#F6F5F1; --tile-glaze:#FFFFFF; --tile-deep:#ECEAE4; --tile-shadow:#E2DFD7;
      --joint:#D9D5CC;                    /* grout: dividers and rules, never a control edge */
      /* Marble — the words. Warm dark neutrals. */
      --marble-950:#16130E; --marble-900:#241F18; --marble-800:#3A3227; --marble-700:#574B38;
      --marble-600:#73644A; --marble-500:#948263; --marble-400:#B7A585; --marble-300:#D3C4AC;
      /* Ink — brand charcoal, the logo's REALTY. */
      --ink-950:#0E0E0E; --ink-900:#181818; --ink-800:#222222; --ink-700:#2E2E2E; --ink-600:#3F3F3F;
      --ink-500:#545453; --ink-400:#7A7A78; --ink-300:#A6A6A4; --ink-200:#C9C9C7; --ink-100:#E6E6E5; --ink-50:#F4F4F3;
      /* Spring — the water. The public field; never an accent in the workspace. */
      --spring-950:#0A2321; --spring-900:#0F2F2D; --spring-800:#163E3B; --spring-700:#1F4F4B;
      --spring-600:#2A6560; --spring-200:#A9CBC6; --spring-100:#D8E8E5; --spring-50:#EEF4F2;
      /* Brick — the logo's MS. One action per screen. */
      --brick-50:#FCEBEB; --brick-100:#F9D4D4; --brick-300:#ED8484; --brick-400:#E45D5D; --brick-500:#DB3E3E;
      --brick-600:#C42D2D; --brick-700:#A32323; --brick-800:#7F1B1B;
      /* Status. Each verified against its own 50 and against tile-glaze. */
      --success-50:#E7F3EC; --success-500:#2F7D57; --success-600:#256345;
      --warning-50:#FBF1DD; --warning-700:#8A5F18;   /* 5.02:1 on warning-50 */
      --danger-50:#F9E7EA; --danger-500:#C42E44; --danger-600:#9E2334;

      /* Semantic roles */
      --canvas:var(--tile);
      --surface:var(--tile-glaze);
      --sunken:var(--tile-deep);
      --border:var(--joint);
      --border-control:var(--marble-500);  /* 3.73:1 on surface — clears 1.4.11 for input and button edges */
      --text-strong:var(--marble-900);     /* 16.35:1 on surface */
      --text-body:var(--marble-800);       /* 11.79:1 on canvas */
      --text-muted:var(--marble-600);      /* 5.75:1 on surface, 4.89:1 on sunken */
      --text-ghost:var(--marble-400);      /* NON-TEXT ONLY — 2.40:1. Dashed edges, disabled glyphs. */
      --brand:var(--ink-800); --accent:var(--brick-600);
      --field:var(--spring-800); --field-deep:var(--spring-900); --field-text:var(--tile);
      --field-muted:var(--spring-200);     /* 8.9:1 on spring-800 */
      --sb-bg:var(--tile-deep); --sb-edge:var(--joint);
      --sb-text:var(--marble-800); --sb-label:var(--marble-600); --sb-on:var(--ink-900);

      /* Compatibility aliases: production stylesheets and older artboards name these. */
      --stone-50:var(--tile); --stone-100:var(--tile-deep); --stone-200:var(--joint);
      --stone-300:var(--marble-300); --stone-400:var(--marble-400); --stone-500:var(--marble-500);
      --stone-600:var(--marble-600); --stone-700:var(--marble-700); --stone-800:var(--marble-800);
      --stone-900:var(--marble-900); --stone-950:var(--marble-950);
      --sea-50:var(--spring-50); --sea-100:var(--spring-100); --sea-200:var(--spring-200);
      --sea-600:var(--spring-700); --sea-700:var(--spring-800);
      --sun-100:#FBEECF; --sun-500:#D2952A; --sun-600:#AE7420;
      --warning-600:var(--warning-700);

      --font-sans:'Commissioner',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;
      --font-display:'Sofia Sans Semi Condensed','Commissioner',system-ui,Arial,sans-serif;
      --font-mono:ui-monospace,'SF Mono',Menlo,monospace;   /* code only — never a costume for figures */

      --r-edge:2px; --r-panel:6px; --r-pill:999px;
      /* aliases kept for older artboards; every one resolves to the three above */
      --r-xs:var(--r-edge); --r-sm:var(--r-edge); --r-md:var(--r-panel); --r-lg:var(--r-panel);
      --r-xl:var(--r-panel); --r-full:var(--r-pill);
      --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:20px; --s-6:24px; --s-8:32px;
      --row:44px;
      --e-rest:none;
      --e-float:0 1px 2px rgba(22,19,14,.08),0 12px 28px rgba(22,19,14,.14);
      --e-1:var(--e-rest); --e-2:var(--e-rest); --e-3:var(--e-float);
      --ring:0 0 0 3px rgba(31,79,75,.45);   /* spring, not brick: focus is not an action */
    }
    ::selection { background:var(--spring-100); color:var(--marble-900); }
`;
