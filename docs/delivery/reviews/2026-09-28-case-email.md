# Case email increment review

Scope: working-tree tracked diff and new email files above `7ea473bf`, before commit.
Sources: AGENTS.md, architecture §9 / AT44 / AT46–AT48, UX F13, the Case-email contract.
Review performed directly under the code-review skill, not an independent agent review.

## Standards

No unresolved correctness or repository-standard findings within the implemented slice.
The review fixed a native-form receipt disappearing after approval, WebKit native-select
overflow, a mutable sender display on approved history, and disabled Case mail starving a
bounded access-email sweep. Provider I/O follows a durably committed attempt. Callback
synchronization uses a transaction/savepoint and avoids acquiring Message locks before the
action lock, preserving the existing webhook lock order. Only synthetic contacts and
isolated generated databases were used. No launch files or production settings changed.

## Spec

Three broader requirement groups remain partial; this slice does not close all of §9/F13:

1. F13 says “add only audience-compatible approved attachments”. This first email path
   exposes plaintext only, one recipient per immutable draft. Attachments, multi-recipient
   versioning and a first-class revise/cancel workflow remain outside this increment.
2. §9 requires current recipient eligibility. Sending correctly requires a verified,
   purpose-specific service record; the client-facing capture/policy workflow is not yet
   implemented. Existing marketing/search choices do not silently create this record.
3. §9 says “Inbound email is untrusted content” and requires triage, safe matching and
   attachment quarantine. The reply address is opaque, but the safe inbound importer and
   ICS delivery still remain work. Live sender/reply-domain/provider evidence is absent.

Findings remaining: Standards 0; Spec 3 partial requirement groups, with inbound handling
and service-eligibility capture preventing complete communication/release acceptance.

## Follow-up, 29 September

The service-eligibility capture/policy path was implemented in 14f8a87e. Private inbound
triage is now locally qualified; see `../contracts/inbound-email.md` and the separate inbound
review. These supersede the corresponding missing-implementation observations above.
They do not close live policy/provider approval, email attachments/multi-recipient revision,
ICS dispatch or full communication acceptance. Linux CI on 14f8a87e exposed browser defects;
its findings and the local fixes are recorded separately.
