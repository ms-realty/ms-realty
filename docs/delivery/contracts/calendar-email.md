# Reviewed appointment calendar email

Status: bounded implementation verified locally on 2026-09-29; provider activation remains disabled.
Architecture §6.4 / AT32 / F22 requires stable UID and committed SEQUENCE for calendar
invitations, replacements and cancellations. Provider acceptance cannot establish attendance.

Extend the existing human-reviewed Case email with one generated calendar attachment. The
recipient must be both an eligible service-email Case participant and an appointment
participant. Freeze appointment ID/version, UID, sequence, committed start/end and state in
the draft. Review shows those values and the exact generated ICS before queueing. Recheck
the appointment under lock before provider handoff; any version/participant change cancels
the old queued snapshot. Unknown transport outcomes retain the existing no-replay rule.

Only application-generated ICS is supported here, not arbitrary uploaded attachments.
Confirmed and reschedule-requested appointments retain the committed interval; unconfirmed
proposals cannot masquerade as confirmations. A cancellation uses the same UID and newer
committed sequence. Use REQUEST/CANCEL with organizer and this single recipient, without
private access notes, full property addresses or other participants' contact details.
Replies and calendar RSVP material remain untrusted inbound triage; they cannot change
attendance or appointment state automatically. Live Gmail/Outlook/iOS/provider behavior is
still a separate release qualification requirement.

Primary sources checked for implementation:
- https://www.rfc-editor.org/rfc/rfc5546.html (iTIP REQUEST/CANCEL)
- https://resend.com/docs/api-reference/emails/send-email (base64 attachment payload)

Implemented acceptance: immutable generated attachment snapshot; current participant and
appointment permission; exact ICS review; approval and dispatch revision checks; one-recipient
REQUEST/CANCEL with stable UID/committed SEQUENCE; calendar version changes cancel stale
queued sends; established organizer cannot silently change. Native staff forms and the
appointment-to-Case-mail link expose the workflow. Plain email remains compatible.

Evidence: 37 targeted tests in five files and 12 Linux browser scenarios across desktop/mobile
Chromium and mobile WebKit. The browser flow checks preview and durable queue receipt;
provider tests inspect the actual mocked HTTP payload and decoded base64 bytes. No real
provider call or external calendar-client acceptance is claimed. Logs/screenshots are under
`/Users/ivan/Code/.artifacts/ms-realty/calendar-email/20260929`.

Open: automatic notification fan-out/reminder policy, notified/acknowledged sequence
reconciliation, email-client interoperability and live delivery. Appointment commands do not
automatically queue these reviewed emails. Staff review remains mandatory for each send.
