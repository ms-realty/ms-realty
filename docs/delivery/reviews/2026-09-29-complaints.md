# Complaint register review

Direct review of migration, capability preset, server commands, native/shared forms and receipt
routes against plan §7/S5. This is not an independent multi-agent review.

## Standards

No unresolved defect found in this bounded slice. List/detail/create/review require current
global `complaint.manage` and two active staff passkeys. Clients, brokers and record-scoped
registry grants are denied. Owners must have current membership, capability and passkeys.
Version locks prevent lost decisions; idempotent creation returns the original result. Both
initial source content and history are protected in PostgreSQL. Audit payloads include metadata
and a hash, not the complaint text. No AI source, public projection or outbound effect is added.

Forms use the shared signed operation envelope, current staff host/session and origin guard.
Validation retains values and clears review confirmation. Receipts are bound to actor and
operation type. Dates use the labelled Europe/Sofia timezone and reject DST ambiguities;
deadlines are operator inputs. Queue/history paginate; inactive historical owner names and
decision authors remain readable only inside this restricted register.

Initial scoped-grant test used the wrong fixture shape and omitted the mandatory grant reason;
this was corrected before the passing run. Hydrated browser flows passed but exposed a test
server binding mismatch: Next listened on IPv6 while internal redirects fetched IPv4. The
child process now resolves localhost IPv4-first; 81 host/complaint scenarios passed without
redirect connection errors. Host routing/security checks were retained.

## Spec

Implements receipt/source/channel, accountable owner, due date/overdue display, reviewed
resolution, reopening and decision history. Only real recorded outcomes are shown. Recording
does not send customer messages, publish a review or certify legal compliance. Public review
consent, other agency registers and live operator qualification remain separate open work.

Evidence: 17 focused complaint/schema checks; full make-check (1237 passed, two explicit
unconfigured scanner skips); final 81 Linux browser scenarios, including six complaint flows.
Mobile WebKit screenshot inspected. Logs/screenshots:
`/Users/ivan/Code/.artifacts/ms-realty/complaints/20260929`.
