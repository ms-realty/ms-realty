# ADR 0014 — Service notices about a person's own Deal

Status: accepted (owner decision). Implements the e-mail half of architecture §6.4 ("send ICS
invitations through authorized service email with stable UID and increasing SEQUENCE") and the
notice side of §6.5 and F15.

## Context

A client learned that a viewing was proposed, confirmed, moved or cancelled, that a proposal was
waiting for an answer or had ended, that a document was requested, or that the broker wrote, only
by signing in. Appointments and proposals queued no e-mail. The broker likewise did not hear when
a client answered. The only automatic e-mails were sign-in links, search-alert digests and the
staging inquiry notice; Deal e-mail (`case.reviewed-email.v1`) is written and approved by a
person for each send.

## Decision

Changes a person is waiting for reach them by e-mail at once, from pre-approved templates, in
their language, without a person pressing send. They are service messages about the recipient's
own Deal, not marketing.

- **One family, one template.** `deal.notice.v1` (`src/server/notifications/`). Each notice says
  what changed in one or two sentences and links to the private area. It carries no price, terms,
  address, access detail, free text (reasons, message bodies, document titles) or document. The
  e-mail is a notice; the client or staff area stays the source of truth. Wording lives in
  `copy.ts` (client: bg en ru de nl el he; staff: bg en ru) and is pinned by unit tests; a
  wording change is a template change and bumps the version.
- **Events.** To clients: viewing proposed (confirm it or say another time suits better), viewing
  confirmed and viewing moved (both with the `.ics` file: the appointment's stable UID and its
  current SEQUENCE; method REQUEST), viewing cancelled (method CANCEL when it had been
  confirmed), proposal ready, proposal withdrawn or expired (only if the client could answer it),
  document requested, message from the broker, and `deal.step_done` for the deal path. To the
  Deal's accountable broker: client confirmed the viewing time, cancelled it, asked for another
  time, accepted, declined or countered a proposal, uploaded a requested document, wrote a
  message. Nobody is told about their own step.
- **One entry point.** `notifyDealUpdate(tx, { caseId, event, eventKey, subject, actor, … })`
  runs in the business transaction. `notifyDealStepDone(tx, { caseId, stepKey, label, … })` is
  the typed entry for the deal path; its label must exist in the source locale and falls back to
  it for other locales.
- **Same delivery path.** Each notice is an `email_send` row on the external-action ledger
  (subject type `deal_notice`), dispatched by the existing outbox and worker through the
  configured provider. Provider acceptance is recorded as `acknowledged`, delivery only from a
  provider report. A `deal_notices.dispatch` job sends promptly after a change; the minute
  `outbox.sweep` is the backstop.
- **Idempotent per event.** The logical send id is
  `deal.notice.v1:<event>:<eventKey>:<recipient>`; it is also the provider idempotency key. A
  retried event finds its row and sends nothing new.
- **On by default for Deal participants.** Nothing in the normal journey creates the explicit
  "emails about my deals" choice (`service_updates`): invitation acceptance records only the
  participation, and e-mail link sign-in only verifies the address. So service notices about a
  client's own Deal are on once the client's sign-in e-mail is verified and they take part in the
  Deal; invitation acceptance records that basis (`deal_notices.basis_recorded`), not a consent.
  An active, current choice (`eligibleCaseRecipient`: terms current) decides the address when
  one exists; otherwise the verified sign-in address is used. Participation must be live and the
  account active. The client switches notices off in preferences (`dealNotices: false` on the
  party's contact preferences, recorded as `preferences.deal_notices.off`); a withdrawn or paused
  choice with no active one also stops them. The language is the party's preferred language,
  then the account's, then the consent locale. The broker receives them at their staff sign-in
  address in their staff language while the staff account and membership are active. Otherwise
  the ledger records a cancelled row with the reason (`no_verified_email`,
  `notices_switched_off`, `access_revoked`, `staff_inactive`) and no address.
- **Deal path.** A client-visible path step marked done sends `deal.step_done` with the step's
  dealPath catalog label in the recipient's language; `completeDealFromPath` sends
  `deal.completed`. Skipping, reopening or re-dating a step sends nothing; doing a reopened step
  again is a new event.
- **Inquiry acknowledgement.** A website inquiry with an e-mail contact is acknowledged at once
  (`inquiry.acknowledgement.v1`, its own switch `inquiry.acknowledged`), in the site language:
  the reference, the listing reference and title when it is about a published listing, that a
  broker will reply, and a link to the receipt page. The basis is the visitor's own request, so
  the recipient is its own kind (`inquirer`) with its own send-time rule: the inquiry and its
  typed contact are unchanged, it is not held as suspected automation and the party is not
  restricted. No reply-time promise (the operating policy records `publicPromise: null`), no
  price, address or free text, nothing for a phone-only contact, one send per inquiry. The
  staging coverage notice goes to a reviewed staff inbox and is not duplicated.
- **Rechecked at send time.** Before any provider call the worker re-resolves the recipient, the
  broker's ownership of the Deal and, for calendar notices, that the appointment's SEQUENCE is
  unchanged; a stale or ineligible notice is cancelled with a `deal_notice_*` reason. A later
  change sends its own notice, so a superseded invitation is never sent.
- **Client confirmation of a time.** A client can now confirm the proposed or confirmed time of
  their viewing (`confirmAppointmentTime`). It records the answer and tells the broker; it is not
  a booking confirmation and changes no appointment state (confirmation stays staff work with its
  resource checks).
- **Tenant switch.** `serviceNotifications` in `src/config/tenant.ts` switches the whole family or
  single events off for a brand; all are on for this brand. A switched-off event records nothing,
  and queued notices of a switched-off event are cancelled at send time.

- **What the person reads.** The subject is the change itself, with the day for viewings
  ("Your viewing on Friday, 15 January 2027 is confirmed"), followed by the reference in
  brackets. The button names the page it opens by that page's own title ("Open property
  viewing", "Open proposal terms", "Open document requests", "Open the conversation"). The HTML
  part uses the brand tokens and Noto Sans with system fallbacks, one accent (the 44 px button),
  `lang` and `dir` per locale, and reads at 320 px; the plain-text part carries the same content.

## Consequences

- Plain-text transports (the Cloudflare relay) receive the notice without HTML and with the
  calendar as a link to the client area's calendar file instead of an attachment.
- A client who also receives a human-approved Deal e-mail with the same viewing calendar gets the
  same UID and SEQUENCE twice; calendar clients treat that as one event.
- The staff Today queue gains no new item type: client reschedule requests already appear as
  open viewings there.
- Not covered: SMS or push, marketing, digests, Butler-written content, public chat, and any
  change to consent rules. Wording in non-source locales is a draft until a named reviewer
  approves it, as for every other catalog.
