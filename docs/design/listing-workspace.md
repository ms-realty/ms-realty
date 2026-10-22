# Listing workspace composition

This is an implementation record for the staff listing directory, editor, photo gallery and publication review. Product authority remains [the UX specification](../ux-spec.md), [architecture](../architecture.md) and the repository context. Launch authority remains the production readiness data; visual verification does not replace a launch gate.

The surface uses Operate mode: a broker identifies a property, edits its working material, reviews the recorded version and publishes only through the authorized decision. The incumbent MS Realty typeface, semantic colors, spacing, controls and focus states come from `src/ui/tokens.css` and shared UI components. This scope does not introduce a new brand or a competing product model.

## Task hierarchy

The directory has one compact heading and create action, followed by search and an expandable filter panel. All, Needs action and Mine lead directly into scannable property rows. Search retains its native GET form and filters retain their labels when expanded.

The listing title is the editor heading. Reference, editorial state, settlement and recorded facts provide compact context. Listing, Photos and Review are the primary destinations; More contains documents, sources and languages. Text and Facts belong to the editing column. Ordinary fields precede required source inputs; missing prerequisites still prevent an invalid save. The contextual source/version hint is brief, and recovery notices remain visible when they actually apply.

The photo screen starts with the whole gallery. Upload details open on request. Selecting a photo opens a contextual preview, filmstrip and caption/description editor. From the tablet breakpoint the editor sits beside the preview; phones cap the preview height and offer enlargement of the same authorized derivative. The original download remains a separate, permission-checked action.

## Save, review and publish

Save photo details persists a private draft. Its receipt states whether details await review, were discarded, or already match the approved version. A saved pending draft has a direct Review saved photo details link to that photo's review panel. Photo review is named distinctly from the listing's publication review.

A review decision uses the saved version, current rights evidence, privacy checks and immutable processed bytes. Rejection or withdrawal does not claim that missing checks passed. Saving a draft does not change approved metadata or the active public manifest. A pending photo draft blocks preparing or activating a new publication until resolved. Public serving continues to use the existing approved snapshot under its current eligibility rules.

Publication review leads with the current blocker and the next task the operator is allowed to perform. Missing checks link to their evidence or exact decision; the candidate and content preview follow. A candidate awaiting approval uses warning styling. Each facts, language/version, seller, claims and publication decision retains its own actor, scope and version check.

## Gallery order and recovery

Multiple drag, tap or keyboard moves remain local until one review and one Save order action. While ordering, upload is suppressed so the order decision is the primary task. Review shows a compact current/proposed cover comparison and the complete proposed thumbnail order.

After a move, focus stays on the operated photo's control. At an endpoint it moves to the same photo, rather than silently switching direction. One polite announcement names that photo and its new position. Cancel writes nothing; reload restores the proposed order for review, and a stale version requires explicit recovery. The native position/review/save path remains complete without JavaScript.

## Evidence boundary

Synthetic browser fixtures verify the interface and transactional behavior. They do not certify real listing facts, media rights, human language approval, provider capacity, deployment, or owner acceptance. All new private interface catalog text remains draft and unreviewed until a human language decision is recorded.
