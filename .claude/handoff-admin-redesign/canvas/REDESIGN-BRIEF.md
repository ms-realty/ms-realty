# MS Realty redesign — the contract every artboard is built against

Everything in `tokens.mjs` and `shell.mjs` is executable truth; this file says why, and what a screen owes.

## The one idea
**Every fact carries its witness.** A property portal shows facts. This product shows, beside each fact, who verified it and when. In the workspace the witness is what a task is waiting for; on the public site it is why a buyer trusts the number. The component is `.wit` (signed: filled square, name, date) and `.wit--none` (unverified: outlined square). Use it at the decision — beside the price, the facts block, the publish state, the row that needs approval — not on every pixel. In dense lists it collapses to the square and initials.

## The world
Sandanski's thermal bath house. Glazed tile is the ground (`--tile`, `--tile-glaze`, `--tile-deep`), grout lines are the rules (`--joint`), warm marble is the words, the logo's brick is the one action, deep spring water is the public field (`.band`). Not paper, not cream, not a serif headline, not a dark sidebar, not cards with shadows: that is the look every generated interface lands on, and it is what this replaces.

## Modes
- Workspace (`/admin`): **Operate**. Scanability first. Brand lives in the rail, the seal, the grout.
- Public home, search, listing, seller, contact: **Persuade** — the first viewport is a full-width spring band with one sentence, one search or one action, and one photograph slot.
- Location pages: **Read**.

## Rules that are checked by `node lint.mjs`
- Radii: exactly three — `var(--r-edge)` 2px for controls and inputs, `var(--r-panel)` 6px for panels/dialogs/menus, `var(--r-pill)` for pills and avatars. `0` is allowed. Any other literal fails lint.
- Every `var(--x)` must resolve. The old names (`--stone-*`, `--sea-*`, `--r-md`, `--e-2`…) are aliases and still resolve; prefer the new names in new code.
- Every chart bar clears 3:1 against its track.
- No class in a screen file may redeclare a BASE class bare (`.pill { }`); scoped refinements (`.kc .pill { }`) are fine.

## Rules that are checked by the reviewer
- Two elevations: rest (grout line, no shadow) and float (`--e-float`, only for menus, dialogs, toasts). No card shadows.
- No panel inside a panel. One frame per thing. `.panel .panel` is neutralised in BASE; do not rely on it — restructure.
- Rows are 44px (`--row`), one line of identity, actions do not wrap.
- Two type sizes per Operate screen: 13 body, 16 heading; one 22 page title. Public display uses `.display` (Sofia Sans Semi Condensed 800) at 39/47/56 only.
- Figures use tabular numerals in Commissioner. `--font-mono` is for code only (webhook payloads, JSON). Never as a costume for references, prices or dates.
- No eyebrow/kicker above a heading. No uppercase tracked labels. Sentence case everywhere.
- One primary action per screen, brick. Everything else ink or ghost.
- Emoji and dingbats are never icons. Icons come from `icon(name, size)` (see `icons.mjs`) at 16/18/20 inline or 28 in an empty state.
- Copy: British English, sentence case, no exclamation marks, "you"/"we". Must survive BG/EN/DE/NL/RU/EL/HE — no idioms, no puns. Money `€245,000` no decimals; `m²`.
- Sandanski is never a sea, beach, coast or seaside destination. Photo tone names: spring, marble, pine, vine, lime, dusk — never sea/sand/sunset.
- Never draw a control that asks Hermes to publish, send a message, mark a translation indexable, change a price or change a redirect. Hermes drafts (`.assist`) and the human approves.
- Approving media, completing a document item, withdrawing consent, waiving a condition, snoozing/assigning a lead: each needs a reason/note and a named human confirmation drawn in the form. No one-click versions.
- Every state: default, hover, focus, disabled, loading, empty, error, partial, too-much-data. A state with no design is a defect.
- Real content: longest names, seven-digit prices, the Bulgarian and Hebrew strings, the empty list.
- Hebrew is a full right-to-left build: mirrored layout, icon placement, reading order.
- Photography: there are no supplied photographs. A photo slot is a `.photo` block with a visibly marked label `[PHOTOGRAPH — Sandanski town park, to be supplied]`. Never fabricate a picture of a real place.

## Class API of BASE (use these; extend with scoped classes in your file)
app sb sb-brand sb-nav sb-group sb-link sb-link--on sb-badge sb-badge--warn sb-me sb-av sb-me-text main top top-search top-health top-health--ok top-health--warn top-av scroll subnav subnav__i subnav__i--on btn btn--primary btn--accent btn--danger btn--ghost btn--sm btn--lg ph ph-actions seg panel panel-hd sect pill pill--danger pill--warn pill--ok pill--sea pill--ink pill--sand pill--ai mono muted price av wit wit--none toolbar find t2 foot box fields field in in--empty in--area in--focus in--error hint hint--error full toggle savebar sw note note--warn note--ai note--info kv empty tl-row tabs crumbs prog skel lblrow assist assist--icon assist-menu drafted drafted-bar kvline toast band display subtle

## Process for a worker
1. Edit only the build files assigned to you. Never touch `tokens.mjs`, `shell.mjs`, `lint.mjs`, `icons.mjs`, `canvas.json`, `build/canvas.mjs`, `measured.json`, or another worker's files.
2. Run your build file(s) with `node <file>` after every change, then `node lint.mjs`; your artboards must produce zero findings.
3. Keep the artboard's frame width. If its content is taller than the height recorded in `build/canvas.mjs`, report the new rendered height (measure: open `preview/<Name>.html` after `node preview.mjs`, or reason from the vertical rhythm with 5% slack) — the director updates `measured.json`.
4. Report what you built, what you verified, and any rule you could not satisfy and why. Never report a rule as satisfied that you did not check.
