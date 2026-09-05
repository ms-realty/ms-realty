# Review protocol for a canvas batch

You are reviewing artboards against REDESIGN-BRIEF.md and the executable system in tokens.mjs and shell.mjs. The output is a verdict with evidence, not a transcript of what you noticed.

## Step 0 — the three facts (already settled; do not re-ask)
1. Job: the workspace exists so a broker sees the next task and the seal it waits for; the public site exists so a buyer trusts a number and acts. Who fails if wrong: the buyer who acts on a stale fact; the broker who publishes something no one approved.
2. Frequency: workspace rows, fields and nav appear constantly (Vignelli governs: system, consistency); the public first viewport and empty states appear once (Rand governs: the one idea).
3. Fixed: the logo, the three admin locales and seven public locales, WCAG 2.2 AA, every approval boundary, Sandanski never a sea destination, no photographs supplied. Open: composition within the world.

## Step 1 — look at it the way it will be met
Open each preview at http://localhost:4877/<Name>.html in the browser (1440 wide for desktop, 390 for phone). Record what you actually did: real size, longest content, every state, grayscale (desaturate mentally or via CSS filter), the thumbnail test (zoom to 25%), in sequence with its sibling artboards.

## Step 2 — the measurable checks (a failure here is a BLOCKER)
- Contrast: compute it. Body text ≥ 4.5:1, large text ≥ 3:1, control boundaries and bar fills ≥ 3:1 (WCAG 2.2 AA, no rounding). Use the palette in tokens.mjs; composite alpha by hand.
- Colour is never the only signal (1.4.1): every status has a shape or a word.
- Touch targets ≥ 44px on phone frames; rows 44px.
- `node lint.mjs` prints no finding for the artboard.
- Radii ∈ {0, 2, 6, pill}; elevations ∈ {rest, float}; spacing values ∈ SPACING_STEPS; type sizes ∈ TYPE_SCALE.

## Step 3 — the four gates, in order, one line of evidence each
1. Rams — should this exist? Duplicates something, promises what it cannot do, adds what nobody needed?
2. Rand — what is the one idea? Is the witness placed at the decision, or sprayed everywhere, or missing?
3. Vignelli — is there a system and does it hold? Count greys, radii, spacing values, type sizes. A value no rule produced is a DEFECT.
4. Kare — does a real person get it? Needs a caption, legend, tooltip? Two things differ only in detail at 16px?

## Step 4 — classify EVERY finding
BLOCKER (fails a published threshold or comprehension) · DEFECT (contradicts the artifact's own system) · WEAKNESS (works but generic, forgettable, no idea) · PREFERENCE (you would have done it differently — never blocks). If you cannot name the gate it fails AND the condition that clears it, it is a PREFERENCE.

## Step 5 — one verdict per artboard: SHIP, FIX or RETHINK
State the clearing condition, not the prescription. Say what works, specifically, so the author knows what to protect. Address the artifact, never the author.

## Product-truth checks (any failure is a BLOCKER)
- A control that would ask Hermes to publish, send, mark indexable, change a price or change a redirect.
- A one-click approve/waive/withdraw/snooze/assign without a reason and a named confirmation.
- A fabricated photograph or a coastal scene; the word sea/beach/coast/seaside near Sandanski.
- An eyebrow/kicker label; emoji as icon; monospace for figures; a card inside a card; a card shadow.
- Copy that is not sentence case, not British English, has an exclamation mark, or would not survive seven locales.

## Report format
```
ARTBOARD <Name> — VERDICT: FIX — 1 blocker, 2 defects
Reviewed: <what you actually did>
BLOCKER  <gate/measure>  <finding>. Clears when: <condition>.
DEFECT   <gate>          <finding>. Clears when: <condition>.
WEAKNESS <gate>          <finding>.
PREFERENCE               <finding>. Non-blocking.
Works: <what to protect>
```
Coverage line at the end: single reviewer, desk review in a browser; not a substitute for a 3-evaluator pass.
