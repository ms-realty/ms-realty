# UX18 / O23 — receiving a viewing from staff coverage

A staff member with current Case-read and appointment-management access can explicitly
accept hosting a viewing from agency coverage. The receiver is the signed-in actor; the
command cannot assign or accept on behalf of another employee. It requires two passkeys,
fresh authentication, the reviewed appointment revision, a handover reason, a property-access
check and a check of the receiver's external calendar. No AI or manager impersonation path
exists. An available existing host cannot be displaced through this coverage command.

The screen presents the recorded arrangement and reserved travel interval. Acceptance
preserves time, participants, property, logistics, Case ownership and existing task promises.
For a booked viewing, the receiver must be available through the entire reserved interval.
The old broker reservation is released and its exact interval reserved for the receiver in
the same transaction. The property-access reservation stays unchanged. Ordered broker locks
and the database exclusion constraint prevent simultaneous overlapping acceptances.

Missing or inconsistent booked resources require repair. A viewing that has already begun
cannot be transferred through this action. A requested/proposed viewing remains unconfirmed.
The immutable appointment snapshot, audit, activity, outbox event and operation receipt are
recorded with the host change. The calendar UID stays stable and SEQUENCE increases; any
previously approved version-bound calendar email must be reviewed again. Acceptance itself
does not send a message or confirm participant attendance.

Successful native and JavaScript forms open the actor-bound receipt. A known calendar
conflict retains the reason and original booking, clears the review checkboxes and requires
renewed human confirmation with a new operation identity. Unknown results cannot be retried
automatically. Current membership, absence, scope and revision are checked again at execution.

This covers acceptance of existing agency-coverage work. Manager-requested future handover
between two available hosts, outbound notification policy/acknowledgement, external calendar
synchronization and actual agency staffing approval remain separate.
