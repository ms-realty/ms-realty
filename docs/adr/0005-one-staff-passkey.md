# ADR 0005 — One staff passkey, optional backups

Status: accepted by the owner. Supersedes the mandatory two-passkey requirement in ADR 0002,
architecture §8.1 and the O23 enrollment flow.

The first manager enrolled a valid passkey but could not finish enrollment because no second
passkey provider or security key was available. The owner explicitly approved one verified
passkey for staff access, with backup passkeys optional, while retaining passkey sign-in and
fresh verification for sensitive actions.

An active staff membership and at least one unrevoked passkey are required for the workspace,
staff commands and operational ownership eligibility. `staffPasskeyMinimum` is the shared
policy; complaint owners, privacy owners and property-key holders use it too. Zero passkeys
still permit enrollment only. Existing keys and sessions are preserved; no data migration or
identity recreation is needed.

The first successful enrollment exposes the workspace action immediately. Additional keys
are available as an optional secondary action. Adding one after the five-minute sensitive
action window requires passkey reauthentication. A duplicate or unsupported authenticator
gets specific recovery guidance and does not remove a saved key or close workspace access.

Separate staff/client relying parties and host-only cookies, user verification, single-use
challenges, session limits, revocation, scoped grants, CSRF/origin checks and five-minute
verification for sensitive staff actions remain required. Recovery remains manager-issued
and audited, revokes all prior credentials and sessions, and requires a new verified passkey.
There is no password or staff email-sign-in fallback.

Qualification covers zero-key denial, one-key access and manager actions, optional distinct
backup enrollment, duplicate rejection, stale verification, recovery and revocation, the
operational ownership selectors and real browser sign-in. Synthetic tests remain separate
from the first manager's actual passkey enrollment and deployed journey acceptance. The
independent security review and production release gates remain open until their evidence
is complete.
