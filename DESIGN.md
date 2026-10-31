---

name: "MS Realty"
description: "The existing MS Realty interface: grounded agency identity, readable facts and clear human actions."
colors:
action: "#214f3c"
action-hover: "#1a3f30"
action-pressed: "#133024"
selected: "#e4eee7"
canvas: "#f8f7f3"
surface: "#ffffff"
subtle: "#eef1ec"
text: "#192e27"
text-muted: "#52625a"
text-inverse: "#ffffff"
divider: "#d9dfd8"
border: "#687a6f"
focus: "#174ea6"
disabled: "#eceeea"
disabled-text: "#5c6962"
success: "#21603c"
success-soft: "#e5f0e8"
warning: "#775000"
warning-soft: "#fbf0d9"
error: "#a12a25"
error-hover: "#86221e"
error-pressed: "#6b1b18"
error-soft: "#fbeae8"
info: "#245a86"
info-soft: "#e6eef6"
assist: "#5b45a0"
assist-soft: "#f1edf9"
assist-line: "#5b45a0"
typography:
title:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "2rem"
fontWeight: 600
lineHeight: "2.5rem"
page:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "1.75rem"
fontWeight: 600
lineHeight: "2.25rem"
heading:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "1.375rem"
fontWeight: 600
lineHeight: "1.875rem"
subheading:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "1.125rem"
fontWeight: 600
lineHeight: "1.625rem"
price:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "1.375rem"
fontWeight: 700
lineHeight: "1.875rem"
body:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "1rem"
fontWeight: 400
lineHeight: "1.625rem"
compact:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "1rem"
fontWeight: 400
lineHeight: "1.5rem"
dense:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "0.875rem"
fontWeight: 400
lineHeight: "1.25rem"
caption:
fontFamily: "Noto Sans, Noto Sans Hebrew, Noto Sans Fallback, system-ui, sans-serif"
fontSize: "0.875rem"
fontWeight: 400
lineHeight: "1.25rem"
rounded:
control: "0.375rem"
panel: "0.5rem"
card: "0.5rem"
spacing:
base: "0.25rem"
control: "2.75rem"
input: "3.25rem"
gutter: "1.25rem"
gutter-medium: "1.5rem"
gutter-wide: "2rem"
components:
button-primary:
backgroundColor: "{colors.action}"
textColor: "{colors.text-inverse}"
rounded: "{rounded.control}"
padding: "0.5rem 1.25rem"
button-secondary:
backgroundColor: "{colors.surface}"
textColor: "{colors.action}"
rounded: "{rounded.control}"
padding: "0.5rem 1.25rem"
button-tertiary:
backgroundColor: "transparent"
textColor: "{colors.action}"
rounded: "{rounded.control}"
padding: "0.5rem 1.25rem"
button-destructive:
backgroundColor: "{colors.error}"
textColor: "{colors.text-inverse}"
rounded: "{rounded.control}"
padding: "0.5rem 1.25rem"
button-assist:
backgroundColor: "{colors.assist-soft}"
textColor: "{colors.assist}"
rounded: "{rounded.control}"
padding: "0.5rem 1.25rem"
input:
backgroundColor: "{colors.canvas}"
textColor: "{colors.text}"
typography: "{typography.body}"
rounded: "{rounded.control}"
padding: "0.75rem"
listing-nav-current:
textColor: "{colors.action}"
padding: "0.75rem"
chip-selected:
backgroundColor: "{colors.selected}"
textColor: "{colors.action}"
property-card:
backgroundColor: "{colors.surface}"
textColor: "{colors.text}"
rounded: "{rounded.panel}"
notice-warning:
backgroundColor: "{colors.warning-soft}"
textColor: "{colors.text}"
rounded: "{rounded.panel}"
padding: "1rem"
---

# Design System: MS Realty

## Overview

**Creative North Star: "The Agency Workspace"**

The incumbent interface is a restrained working surface for a human-led agency. A warm canvas, white surfaces, dark green text and deliberate green actions leave property photography and useful facts in the foreground. Operational pages use compact rows, ordinary fields and clear section links; visual emphasis follows the person's next task.

This is a scan of the implemented system, not a new brand direction or a visual acceptance verdict. [design/tokens.json](design/tokens.json) owns the tokens and generates [src/ui/tokens.css](src/ui/tokens.css); this file records the reused subset. Product authority remains [CONTEXT.md](CONTEXT.md), [architecture](docs/architecture.md) and [the UX specification](docs/ux-spec.md). The listing-specific composition and evidence limits live in [the listing workspace record](docs/design/listing-workspace.md).

**Key Characteristics:**

- Readable property context before supporting detail.
- A single multilingual sans-serif family with semantic type roles.
- Quiet surfaces and dividers, with stronger boundaries around controls.
- Native task paths, visible focus and explicit human decision states.

## Colors

The palette combines a muted forest-green action family with warm, low-contrast surfaces and dark, legible text. Frontmatter values preserve the generated CSS values and semantic names.

### Primary

- **Agency green — action:** the filled primary button, deliberate selection, current navigation and workflow links. Hover and pressed states deepen the same green.
- **Selected green tint — selected:** selection and pressed secondary controls; pair it with a border, label or shape change.

### Neutral

- **Warm canvas — canvas:** the page and field background.
- **White surface — surface:** bounded cards, secondary controls and overlays.
- **Quiet sage — subtle:** supporting groups, empty media, hover and navigation surfaces.
- **Deep green text — text:** essential facts and primary labels. **Muted green-grey — text-muted:** secondary context, hints and references.
- **Soft divider — divider:** row and section separation. **Control boundary — border:** recognizable interactive edges.
- **Disabled pair — disabled / disabled-text:** an explicit disabled state, with a reason where the action would otherwise be expected.

### Semantic states

Success, warning, error and information use their named foreground and soft-background pairs. Purple assist colors identify Butler's draft assistance. Blue focus remains independent of the agency green. State always has words, and the shared status components add a distinguishing icon or shape.

**The Semantic Role Rule.** Use the existing role for its existing purpose. The primary action color does not replace warning, approval, assistance or keyboard-focus meaning.

## Typography

**Display and body font:** self-hosted Noto Sans, with Noto Sans Hebrew, the metric-matched Noto Sans Fallback and system fallbacks. Hebrew content promotes Noto Sans Hebrew to the front of the stack. There is no separate display or decorative identifier face.

The hierarchy uses discrete semantic roles rather than a geometric scale. Title and page roles establish page hierarchy; heading and subheading organize sections. Body is the field-value and reading role. Compact supports controls, dense supports staff context and semibold field labels, and caption supports hints and references. The section role in CSS shares the heading size and line height. Price uses bold tabular figures.

Shared buttons apply semibold to the compact role. Field labels apply semibold to dense; field errors use medium caption. Headings wrap rather than occupy fixed-height boxes. Tables, time and data elements use tabular figures; mixed-direction references use bidirectional isolation. Reading measures stay bounded by the reading container instead of stretching across the page.

## Layout

Spacing starts from the shared base unit. The recurring rhythm uses small gaps within a field, larger gaps between related fields, and clear separation between tasks. Primary controls have a minimum control-sized hit area; inputs use the larger input height. These are minimums that permit text wrapping.

Global layout breakpoints are small (40rem), large (64rem) and extra-large (90rem). Compact pages use the gutter token; the listing routes increase to the wide gutter at the small breakpoint. Shared container tokens bound the page (90rem), form (40rem), reading measure (42.5rem) and optional rails. A route may use a documented local layout by fit; the selected-photo split at 48rem belongs to the listing surface record, not a new global breakpoint.

Operational content starts as one primary column. Wider layouts add meaningful comparison or context beside it. Navigation and action rows wrap; long values stay inside a minimum-zero content track. Default to page scrolling, retaining a deliberate horizontal filmstrip or data scroll only where the task requires it. Keep logical start/end spacing and directional icons so RTL composition retains its reading order.

## Elevation & Depth

Depth comes mainly from canvas/surface contrast, subdued fills and dividers. The reused raised shadow supports property cards; the overlay shadow separates popovers and other floating choices. Their exact values are retained in the sidecar. Listing rows and normal editing groups remain flat, and borders appear where grouping or control recognition needs them.

Transitions use the fast and base durations with the shared ease-out curve. They clarify hover, press and selection; they do not delay task completion. The global reduced-motion rule removes meaningful animation and transition duration.

## Shapes

Controls use the control radius. Panels, multiline writing surfaces and cards use the slightly softer panel/card radii. Filter chips use a pill silhouette; approval stamps and inline delivery states keep their distinct shapes. Do not turn every status into a pill.

Image windows use consistent proportions where scanning benefits from them. An inspection preview preserves the whole image with contain behavior; gallery thumbnails and property cards use their bounded cover windows. Image failures preserve the allocated window and show the existing no-photo treatment.

## Components

### Buttons

Primary, secondary, tertiary, destructive and assist variants share the same shape, semibold compact label, minimum hit area and fast color transition. Secondary has a visible control border; tertiary is transparent at rest; assist is tinted rather than filled with purple. Destructive actions use the error family. Pending controls signal waiting, and disabled controls use their dedicated color pair. Native elements and React Aria controls share the same styling and equivalent hover, pressed and disabled states.

### Inputs / Fields

A field contains its label, optional hint, control and error in a stable reading order. The value sits on canvas with a visible border; textareas use the panel radius, larger padding and a minimum writing height. Read-only fields use a dashed edge and subdued fill. Invalid fields pair the error border with text and the shared error-summary path. Keep native selects and their forced-colors fallback.

**The Visible Focus Rule.** Preserve the global focus-visible outline (3px, offset 2px), including inverse and forced-colors variants. An error, selection border or hover fill does not replace keyboard focus.

### Navigation

Current section links use green text and an underline-like bottom border. Other links use muted text and a subdued hover fill. Use native links, current-page semantics and native disclosures for supporting destinations. The listing workspace's three primary destinations and More disclosure are surface composition, recorded in its focused document.

### Chips and status

Filter chips remain operable and removable, with a distinct selected, assist, uncertain or add treatment. Availability uses a soft badge, approval a bordered stamp and delivery plain inline status. Draft assistance uses a dashed purple treatment. Words carry the state; color and icons reinforce it.

### Cards / Containers

The property card uses a white surface, divider border, panel radius and raised shadow. Its title is the main link, with Save and Compare as separate controls. Facts and reference remain readable beneath the image. Working lists use flat divided rows instead of placing every record in a raised card. Notices use semantic fill, border, icon and one follow-up action where supplied.

### Listing task patterns

Preserve listing identity and stable reference while changing tasks. Gallery, selected-photo editing, photo review, staged ordering and listing publication retain distinct headings, state labels and recovery paths. Use [the listing workspace record](docs/design/listing-workspace.md) for the implemented responsive hierarchy, draft/review/publication sequence and focus behavior.

## Do's and Don'ts

### Do

- **Do** use the source semantic tokens and shared controls before adding local styling.
- **Do** make essential facts, the current state and the next permitted action readable in the primary task flow.
- **Do** preserve labeled native controls, visible focus, keyboard alternatives and recovery state.
- **Do** retain full-image inspection alongside bounded scanning thumbnails.

### Don't

- **Don't** introduce a different dashboard theme, decorative gradients or a competing display font.
- **Don't** use color alone for errors, selection, assistance or approval.
- **Don't** stretch fields or reading text merely to fill a wide viewport.
- **Don't** use invented property imagery or let a visual treatment imply approval or publication.
