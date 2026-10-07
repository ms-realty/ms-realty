# Planned viewing host handover

The current host can offer a future/open viewing to a named eligible colleague or withdraw
that offer. The booking remains with the current host until the named colleague personally
accepts its current arrangement. Managers cannot offer for the host or accept for a receiver.
Existing unavailable-owner coverage remains a separate path with the same receiving-person
checks. Neither path sends an email/calendar update or records participant attendance.

Migration 0020 adds an optional complete offer tuple (receiver, arrangement version, note and
time). Its constraint rejects incomplete/self/ahead-of-row offers; old rows remain empty.
Selection checks current active membership, two passkeys, absence through the travel interval,
Case read and appointment authority. Directory permission reads are batched; selection grants
no access. Commands recheck fresh host identity, authorization and exact row revision under
lock. A successful offer/withdrawal appends immutable appointment history and audit but changes
neither booked resources nor ICS sequence. The receiver's existing acceptance path rechecks
identity, access, full reservation consistency and conflicting resources, then atomically moves
only hosting and increments ICS sequence. A changed arrangement invalidates an old offer even
when a receiver submits the new row version. Successful acceptance clears the offer.

BG/RU/EN native and hydrated forms show the current host, pending colleague/note, explicit
review and receiver acceptance. Actor-bound receipts survive native navigation and reload;
reverification returns to the correct viewing. Client projections omit the private offer.

Local evidence at `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`:

- `host-offer-regressions-final.log`: 25 PostgreSQL checks across hosting, appointments and
  coverage; named receiver, cancellation, version invalidation, concurrent proposals, revoked
  access, credentials and travel-buffer absence included.
- `host-offer-browser.log`: initial fresh Linux build, 21 passed and nine hydrated failures.
  The new Axe check exposed duplicate navigation landmark names on the viewing page. The
  local viewing links now have their own localized label. `host-offer-browser-hydrated-final.log`:
  all nine affected BG/RU/EN journeys passed across Chromium desktop/mobile and WebKit mobile,
  including offer, withdrawal, re-offer, acceptance, immutable booking, reload receipts,
  320px overflow and scoped Axe. Both logs are retained; this is incremental validation.
- `host-offer-adjacent.log`: 17 schema/task-handover/directory checks passed. The complete
  899-file lint check passed.
- TypeScript passed after repairing a missing notice tone and receipt reference. The first
  DB run also found an incomplete synthetic absence fixture; its review timestamp was repaired.
  These failed logs are preserved, not counted as successful product checks.

BG WebKit and EN Chromium screenshots of the actual 320px forms were visually inspected.
Provider delivery, human language/design acceptance and full new-source CI remain separate.
No production migration, customer message or calendar invitation was performed.
