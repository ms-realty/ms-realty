# Listing workspace composition

This is an implementation record for the staff listing directory, editor, photo gallery and publication review. Product authority remains [the UX specification](../ux-spec.md), [architecture](../architecture.md) and the repository context. Launch authority remains the production readiness data; visual verification does not replace a launch gate.

The surface uses Operate mode: a broker identifies a property, edits its working material, reviews the recorded version and publishes only through the authorized decision. The incumbent MS Realty typeface, semantic colors, spacing, controls and focus states come from `src/ui/tokens.css` and shared UI components. This scope does not introduce a new brand or a competing product model.

## Task hierarchy

The directory has one compact heading and create action, followed by search and an expandable filter panel. All, Needs action and Mine lead directly into scannable property rows. Search retains its native GET form and filters retain their labels when expanded.

The listing title is the editor heading. Reference, editorial state, settlement and recorded facts provide compact context. Listing, Photos and Review are the primary destinations; More contains documents, sources and languages. Text and Facts belong to the editing column. Ordinary fields precede required source inputs; missing prerequisites still prevent an invalid save. The contextual source/version hint is brief, and recovery notices remain visible when they actually apply.

The photo screen starts with the whole gallery. Upload details open on request, or directly when the gallery is empty. Selecting a photo opens a contextual preview, filmstrip and caption/description editor. Below 48rem the preview is capped at 20dvh so the editing task follows promptly. From the local 48rem breakpoint the editor sits beside the preview in a 19–24rem column, and the preview cap increases to 60dvh. This is a surface-specific split, not a new global token. Enlargement opens the same authorized derivative in a new tab with that behavior announced in its accessible name. The original download remains a separate, permission-checked action.

Gallery status labels flow below the thumbnail in a wrapping row. Position and cover badges remain over the image, so a multiline pending-review label cannot collide with them. The same tile structure applies to the compact proposed-order review.

The directory and main editing routes start with one column. At the small breakpoint, fact pairs and supporting groups may share a row. The listing context sits beside the editor from the large breakpoint; publication review places its source/context beside the blocker and decision flow. The directory adds aligned facts and next-action columns at the extra-large breakpoint. These changes preserve identity, task order and the manual path; they do not shrink essential text to fit.

## Save, review and publish

Save photo details persists a private draft. Its receipt states whether details await review, were discarded, or already match the approved version. A saved pending draft has a direct Review saved photo details link to that photo's review panel. Photo review is named distinctly from the listing's publication review.

A review decision uses the saved version, current rights evidence, privacy checks and immutable processed bytes. Rejection or withdrawal does not claim that missing checks passed. Saving a draft does not change approved metadata or the active public manifest. A pending photo draft blocks preparing or activating a new publication until resolved. Public serving continues to use the existing approved snapshot under its current eligibility rules.

Publication review leads with the current blocker and the next task the operator is allowed to perform. Missing checks link to their evidence or exact decision; the candidate and content preview follow. A candidate awaiting approval uses warning styling. Each facts, language/version, seller, claims and publication decision retains its own actor, scope and version check.

## Gallery order and recovery

Multiple drag, tap or keyboard moves remain local until one review and one Save order action. While ordering, upload is suppressed so the order decision is the primary task. Review shows a compact current/proposed cover comparison and the complete proposed thumbnail order.

After a move, focus stays on the operated photo's control. At an endpoint it moves to the same photo, rather than silently switching direction. One atomic, polite announcement names that photo and its new position. Entering order review focuses the review heading. Cancel writes nothing; reload restores the proposed order for review, and a stale version requires explicit recovery. The native position/review/save path remains complete without JavaScript. Draft edit guards keep unsaved text and an explicit choice to stay or discard; a save acknowledges the recorded operation before navigation can continue.

## Evidence boundary

Synthetic browser fixtures verify the interface and transactional behavior. They do not certify real listing facts, media rights, human language approval, provider capacity, deployment, or owner acceptance. All new private interface catalog text remains draft and unreviewed until a human language decision is recorded.

The source-derived record includes `fa24f1e20b3945cc81ad647a02b0d3298948a28e`, which moves gallery status below each image, and the preceding upload suppression, 16px media-page gap, 48rem split and 20dvh phone preview corrections. The inherited system is recorded in root `DESIGN.md` and `.impeccable/design.json`; neither adds product or launch authority.

All 18 final `listings-current-*` screenshots were recaptured after the interactive browser connection recovered. Gallery and order-review desktop/phone captures were refreshed again for the status-placement correction; the other captures cover unchanged, source-equivalent surfaces. Their inventory, source equivalence and scope are recorded in `listings-design-review-packet.json`.

The final source has a passing production build (`4JF_mkrtFzHjJHAL3fm0K`) and six staged-arrow/tablet browser checks across Chromium desktop/mobile and WebKit mobile, including status geometry. `listings-order-status-browser-exit.json` binds run `e201d382de6543ff8e98ac3a13604a43` to the source and build. Retained evidence at `e1b9efdbf7a802ff3554fbcd4933cbcf372769cc` covers 156 journey checks with 18 scoped skips and four isolated route-error recovery cases; the packet records the unchanged-path equivalence for that broader scope.

The second and final independent Verdict Pass scored the status-placement finding resolved, with a clear remaining list and disposition `ship`. Across the two verdict passes, all eight original findings are scored resolved; this verdict's scope is those listed corrections. Live service/provider proof, real listing/media rights, human language approval, owner acceptance, G1 and launch gates retain their own evidence requirements. The sidecar's sample labels are explanatory component specimens; they do not constitute human language approval.
