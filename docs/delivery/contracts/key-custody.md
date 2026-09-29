# Physical key custody — agency operations (§7.2 plan)

Staff `/operations/keys` records physical custody; it does not grant permission to enter a
property. Only a live staff session with two passkeys and global `key.manage` can read or
change this register. The manager preset includes that capability. Brokers may be selected
as physical holders, but receive no register permission through that selection. Holder choices
include staff email to distinguish people with identical display names. Clients and
Hermes cannot use these commands. No access codes or exact property addresses are exposed.

Receipt requires the current Property reference, unique normalized key-set tag, immutable
count (1–50), authority/receipt reference, storage label, evidence note and explicit human
confirmation. The reference is stored as text; the service does not fetch it or infer legal
authority from it. A recorded declaration is not independent evidence of a real handover.

| Current state | Allowed next states | Required evidence |
|---|---|---|
| In storage | Checked out, returned to owner, lost | Reviewed handover/loss note |
| Checked out | In storage, returned to owner, lost | Reviewed return/loss note |
| Lost | In storage, returned to owner | Reviewed recovery and destination evidence |
| Returned to owner | None | New receipt needs a new set tag and record |

Check-out requires an active staff holder with current membership and two passkeys plus a
future due-back instant. Forms interpret native local input in Europe/Sofia and reject
ambiguous/nonexistent DST times. Return to storage requires its real storage label. Returns
can still be recorded after the previous holder has been offboarded. This does not restore
that person's access. A set is indivisible in this slice: partial return/loss belongs in the
note and must not be represented as full physical return to storage.

Every mutation locks the set, rechecks live operator authority and expected version, uses a
stable operation identity, and appends an immutable custody event. Original property, tag,
count and receipt identity are protected by a PostgreSQL trigger. Current state, storage,
holder and deadline must satisfy database consistency checks. The event records actual
recording time, staff author, operation, version, state, holder/location/deadline and note.
Generic audit records contain a digest rather than physical storage details. An identical
retry returns the same receipt; concurrent stale changes cannot both commit.

Queue and history reads use bounded pagination. The overdue filter derives from checked-out
state and the current clock; deadline expiry never returns keys automatically. Historical
staff names remain available after offboarding for authorized custody operators. Forms retain
failed input, clear physical confirmation, bind signed operation envelopes and expose durable
actor-bound receipts. No email, background reminder, entry permission, customer disclosure or
provider action is produced. Automated reminders, partial set splits and full staff offboarding orchestration remain
separate work.

A separate reviewed deadline amendment is allowed only while checked out to a currently
eligible holder. It requires a different future deadline, reason/agreement note and fresh
confirmation. It changes neither holder nor custody state. A distinct operation and audit
action identify the amendment; history labels it separately and retains the previous deadline.
Shortening or extending a deadline uses the same guarded operation. No amendment is allowed
for an offboarded holder; actual return remains available. An amendment and a concurrent
return share the same row lock/version, so only one can commit from a given version.
The review records an operator declaration, not independent proof of the holder’s agreement.
