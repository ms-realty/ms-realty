# Case directory and calendar source completion

The O04 case directory and O08 calendar now implement the deferred source workflows. Their
integration belongs to the source delivery of the stacked rebuild. Production readiness,
deployed parity and business acceptance remain governed by R00–R12 and the preserved launch
authority; merging these changes does not deploy the application.

## O04: find and continue authorized case work

The directory uses `queryCaseIndex` for All, Mine and Needs action. Filters cover purpose,
linked party, type, stage, disposition, accountable owner, next-action text and action state.
Exact authorized totals are independent of the current page. Cursor navigation retains the
selected scope and filters; a stale or mismatched cursor offers a first-page recovery.

Rows retain stable identity, safe party context, type, stage, disposition, owner and the
authorized next action. Restricted internal work remains restricted. Desktop table semantics
and complete narrow-screen summaries use the same read projection. Counts and filters never
expand the viewer's current record permissions.

Private text is applied through a native POST. AES-GCM encrypted, HttpOnly cookies bind the
retained criteria to the current session, account and locale; URLs contain only opaque context
IDs and safe enumerated controls. Two bounded contexts support Back or another tab. Expired,
displaced, foreign or tampered state stops the read and explains recovery. A legacy text-query
link offers explicit private application before reading or navigating, and never propagates
its text into new links. An explicit reset is required to broaden the selected collection.

## O08: inspect and navigate actual arrangements

The staff calendar provides agenda, day and week views, date and display-timezone selection,
previous/next/today controls, permitted-team or recorded-host scope, native paging and a
separate collection of requests awaiting a time. Every view retains a complete mobile agenda.
Empty, failed-read, invalid-input and refresh states remain distinct.

Period boundaries use real civil days in the chosen zone, including DST transitions.
Confirmed, proposed and resource-buffer intervals are filtered before pagination. Sorting uses
the earliest interval relevant to the selected period and day, so a historical confirmation
cannot push an earlier current commitment behind a later replacement proposal.

Current confirmation and proposed replacement remain separate. Resource reservations and
travel allowances come from recorded data. An overlap preview covers only permitted records
and is explicitly incomplete as an availability decision. Private access notes and resource
identifiers are not projected. Manual external-busy checks remain explicit. O09's ordinary
guarded confirmation, rescheduling, cancellation and notification actions retain authority.

The client appointment journey uses a separate relationship-scoped list, retaining all seven
public locales and client navigation. It does not enter the staff period/calendar reader.

## Listing and photo workflow continuity

The retained listing workspace includes saved private photo-text drafts and staged gallery
ordering. Draft text preserves approved metadata and the existing public manifest until a
person reviews the saved revision and publishes it. New publication is blocked while placed
photo text is awaiting review. Discard, conflict, unknown-result, receipt and native navigation
paths retain the guarded operation and record identity. The additive media draft migration is
part of the source package; this increment applies no production migration.

New case and calendar interface text lives in the BG/RU/EN staff JSON catalogs. Catalog
placement preserves the original text and does not grant human translation approval.

## Verification and remaining acceptance

Focused unit, component, route and real-PostgreSQL checks cover filter confidentiality,
session/locale isolation, tamper and expiry recovery, scoped paging, live permission changes,
DST bounds, buffer-only overlaps, chronological ordering and native localized controls.
Browser scenarios cover JavaScript-enabled and disabled paths, keyboard navigation, 320 px,
BG/RU/EN, accessibility, exact-record drill-down and unchanged appointment arrangements.

The existing browser regressions retain stable identity and navigation assertions while
following the title-first inquiry layout, the disclosed gallery and the expanded map's actual
controlled panel. A completed source delivery still requires the full hosted source, browser,
visual and container checks to pass for each integrated PR head.

Real owner/broker acceptance, current inventory and translation approval, complete zero-loss
migration, live provider outcomes, independently qualified recovery and production cutover
remain separate. This source increment supplies none of those approvals.

The release manifest template references the current draft policy revision. All unknown
inputs, empty trusted-key configuration and missing approvals remain blocked; template
alignment supplies no signed R00 authority or evidence-owner assignment.

Browser CI uses a pinned Ubuntu browser runner and installs the engine for each profile with
bounded dependency/setup steps. The required gate still includes desktop Chromium, mobile
Chromium, mobile WebKit, real scanner-backed journeys, isolated recovery, analytics isolation,
visual comparisons and the delivery container.
