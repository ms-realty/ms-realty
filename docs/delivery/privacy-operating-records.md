# O26 / F30 privacy operating records

B09 adds controlled processing, processor/transfer and incident records at
`/staff/[locale]/operations/privacy-governance`. Agency settings provides the
permission-aware entry. C05 still requires the responsible human to accept the
actual operating/privacy policy and assignments. Saved references and synthetic
tests do not establish that acceptance or any release gate.

| Requirement                          | Controlled path                                                                                                                                                                                    | Evidence and next action                                                                                                                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Processing register                  | A versioned processing record names purpose, people/data categories, recipients, systems, lawful-basis source, retention/hold policy and safeguards.                                               | A currently allocated staff owner, minimised source reference, review/response policy reference and next internal review accompany the record.                                                                                                                          |
| Processor and transfer register      | A processor record links to a currently reviewed active processing record and records purpose, data categories, territories, agreement, retention, safeguards and an explicit transfer assessment. | Unknown assessment holds review. A transfer requires a mechanism source; a no-transfer assessment still requires evidence. No vendor handling is inferred from database placement.                                                                                      |
| Breach ownership and response        | An incident records observed/awareness instants, minimised scope, impact evidence, response policy, accountable owner and next action.                                                             | An operator can save an incomplete working record. Missing policy, qualified determination, source or ownership remains held.                                                                                                                                           |
| Notification determination and timer | A qualified human explicitly records whether notification is required, the determination source, responsible qualified person and, where required, the target instant and timezone.                | The timer counts to that reviewed human-entered instant. Working legal determinations do not become notification timers. An internal review target remains available while legal determination is pending. No statutory interval or notification decision is generated. |
| Review and response history          | Every save and exact-hash/version human review appends an immutable source edition.                                                                                                                | The current working revision, latest reviewed edition, actor, note, hash and receipt stay distinguishable. Closure requires response/closure evidence. Prior commitments and evidence are retained.                                                                     |

All register reads, lists, source revisions, mutations, replays and operation
status checks require a live passkey-enrolled staff session, fresh authentication,
and both `settings.manage` and `privacy.manage` for the fixed `settings` resource
`00000000-0000-4000-8000-000000000026`. Incident review and its exact operation
status additionally require explicitly allocated `claim.approve` for that same
resource. No role preset or AI permission receives this qualified authority.
Reviewed owners must still have the register allocation and a usable passkey;
the named incident determiner must also retain qualified review authority.
Revocation, lost passkey access or an ended membership makes the affected
ownership/evidence visibly held. The same qualified person may own, determine
and review a record with one active passkey; no second person or signature is
required by this software.

The real access-grant command and native/enhanced access form can allocate the
fixed operating-policy and privacy-settings scopes. Unknown settings IDs,
unrelated capabilities and language restrictions are rejected. Allocation and
revocation end the target's sessions. Current authority is rechecked before a
stored result can be replayed or read.

A processor review binds the linked processing record's exact reviewed revision
and content hash in its immutable review edition. A changed source revision
holds the prior processor review even after the new processing source is
reviewed; the operator must freshly review the processor against that edition.
Older processor reviews without this binding remain historical and require a
fresh review. The form's review hash includes the source binding, so a source
change between opening and submitting the form is rejected. The displayed
working content hash continues to describe the working document alone.

Native HTML forms and their enhanced equivalents share the guarded commands.
Each signed form operation is bound to the command and record. Stale revisions,
changed hashes and key reuse fail without overwriting a reviewed edition. A
pending or unknown result has an exact actor/record/command/key status path and
does not authorize a replacement submission. Audit/outbox projections contain
identifiers and hashes rather than incident scope or source bodies. There is no
regulator/customer send or automatic policy adoption in this workflow.

Source verification lives in `src/domain/privacy-governance.test.ts`,
`src/server/privacy-governance/service.int.test.ts`,
`src/server/auth/grants.int.test.ts`, `e2e/settings-scopes.spec.ts` and
`e2e/privacy-governance.spec.ts`. Their people, policies, incidents, evidence,
deadlines and decisions are synthetic. Live incident execution, actual policy
ratification, qualified professional determinations, provider/account evidence,
deployed behavior and owner acceptance remain separate evidence requirements.
