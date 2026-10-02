# Today: overdue key returns

The staff Today page now shows a live, oldest-first queue of overdue checked-out key sets.
It uses the custody register's existing global `key.manage` authority: holding a key or having
a record/locale-scoped grant does not reveal the register. Current grants are resolved again
on every request. The queue adds one bounded query to Today's existing authorization context;
unauthorized users make no custody query and see no custody section.

Each row preserves the key reference, property reference, actual recorded holder and agreed
return deadline. Unavailable or offboarded holders stay visible through the coverage indicator.
The deadline is rendered in Europe/Sofia, matching the custody form. Thirty oldest records are
shown, with an explicit overflow notice and a link to the paginated overdue register. Empty
queues remain distinct from denied access and database failure.

A reminder is a current read of the obligation, not a mutation, receipt or notification delivery.
It does not extend the deadline, reassign custody, dismiss the obligation or claim physical
return. The existing reviewed return command removes it; a separately reviewed deadline
amendment changes when it appears. No scheduled mail/push service was added or activated.

Evidence: `/Users/ivan/Code/.artifacts/ms-realty/recovery/20260930/`.

- `key-reminder-regressions.log`: 16 PostgreSQL checks passed across reminder, Today and custody
  suites. New cases cover exact due boundaries, non-outstanding states, held/revoked/scoped and
  expired authority, removed holders, physical return, deadline amendment, read-only behavior,
  deterministic ordering, overflow and bounded query growth.
- `key-reminder-browser.log`: fresh Linux build; 36 joined reminder/custody/work scenarios passed.
  The reminder journey uses 320px, BG/RU/EN, Chromium and WebKit, and JavaScript on/off. It checks
  actual timezone rendering, goes from Today to recorded physical return, verifies the database,
  returns to Today, and verifies that the holder has no registry access. Nine hydrated journeys
  passed scoped axe A/AA checks.
- `key-reminder-types-v2.log` and `key-reminder-lint.log`: TypeScript and lint passed (891 files).
  The initial test-label type error is retained in `key-reminder-types.log`.
- Mobile screenshots from run `62c1c42b26894031a47a7a15aa3942f6` were inspected. They revealed a
  duplicated timezone label; the final copy shows it once. A fresh Linux build then passed the
  Russian native WebKit journey in `key-reminder-browser-final.log`.

This is local synthetic software evidence, not notification delivery, independent accessibility
acceptance or release qualification. R08 load latency and the other outstanding release gates
remain open. Launch authority and deployment state are unchanged.
