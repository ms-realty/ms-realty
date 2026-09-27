# Privacy requests and preferences

Client routes are `/{locale}/privacy` and `/{locale}/preferences` on the client host. Staff review is `/{locale}/operations/privacy` on the staff host. Each mutation is an explicit native POST, works without JavaScript, checks the configured host and origin, and requires a current, recently reverified session. Staff reviewers additionally need an explicit `privacy.manage` capability and two active passkeys. Receipt banners read successful operations for the current actor.

## Human privacy work

Requests concern the signed-in principal's current party. They receive an available, active privacy operator and the explicit due condition `awaiting_human_assessment`. The service does not invent a statutory deadline. A reviewer records the approved policy reference, reviewed response date, owner and verification before work starts; completion requires human evidence and a retention disposition. These commands record work, and do not themselves delete data, export a dossier or send records to a model.

The compliance retention service returns a boolean only. Current restricted reports or case process retention can prevent deletion/restriction completion or release of a legal hold. Neither the client projection nor privacy workbench exposes the restricted record responsible for that decision. Historical case participation remains relevant after access is revoked. A checkbox or free-text disposition does not override an active server retention obligation.

## Separate optional consent

Consuming a valid account email link verifies that email contact route. GET inspection, inquiries, invitations and service preferences never create optional subscriptions or consent events.

Optional purposes require separately authored and human-approved content: `help/search-alert-consent` and `help/marketing-consent`. The generic privacy page does not authorize either. `readApprovedContent` checks the published immutable version and current editorial, publication and legal-process approvals. No environment variable or bundled default constitutes approval. The UI disables opt-in where approved terms in the chosen language or a verified contact are absent. Current authored content supports BG; translated terms must become an approved content contract before they can authorize another locale.

An opt-in binds the contact, distinct purpose and exact version/hash/locale, stores the acknowledged normalized search, and appends consent events. Criteria edits are versioned, preserve filters that the simple edit form does not expose, and do not resume paused subscriptions. Pause, resume and withdrawal append events; withdrawal remains available after policy withdrawal. Resuming and editing require current approved terms. `eligibleSubscriptionRecipient` rechecks consent, contact and the same live published version at dispatch time; a queue snapshot must never substitute for this check.

This module stores and manages preferences. Search-alert scheduling and provider delivery are separate integration work; no live messages are sent by these commands. Do not treat local preference tests as provider or production launch evidence.

## Local verification

`TEST_DATABASE_URL=... npx vitest run src/server/privacy src/server/auth/email-link.int.test.ts --maxWorkers=2` creates disposable UUID databases. Tests author explicitly synthetic policy pages and approve them through the real content commands. They cover identity/party isolation, idempotent requests, version conflicts, fresh review, retained evidence, separate purposes, unverified contacts, policy withdrawal, search edits and dispatch eligibility.

`e2e/identity.spec.ts` adds native client request/preference forms and staff privacy assessment to the real email-link and two-passkey browser journeys. These run against the per-run isolated database and local outbox only.
