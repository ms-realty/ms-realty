# Partner rulebook for MS Realty

> Sources: MS Realty ADR 0011, ADR 0007 and the previous viewing rehearsal.
> Raw: [Agency policy and rehearsal excerpts](../../raw/sources/partner-rulebook-agency-policy.md)
> Updated: —

For a proposed service change, name the client, the receiving broker, the decision each can make and the evidence each will see. Put the choice in the existing work item. Follow one request through both views and tell the agency owner early if a retry creates a duplicate, a message has an unknown outcome or a receipt implies the wrong next step.

## Agency decisions

A person makes one attested decision to publish a listing. The application checks the facts and records the decision. A brand can require independent review or supporting documents through tenant policy. A person approves a translation before it goes public and becomes indexable. [Publication decision](../../../docs/adr/0011-platform-direction.md#4-one-decision-per-outcome) · [Launch guidance](../../../AGENTS.md#launch-boundary)

Butler uses Watch, Suggest, Ask me first and Act per task and per brand. The owner confirmed Act for answers from approved public content and immediate inquiry acknowledgements in the visitor’s language. Answers cite the approved source, say when the source cannot answer and offer a broker hand-off. The first-brand defaults also list viewing reminders, due-step reminders and Deal step notices at Act. Qualify each Act task against the exact build and brand policy. Verify a receipt, a manual path and that the brand switch stops the task. [Task policy](../../../docs/adr/0011-platform-direction.md#5-butler-acts-within-levels) · [Public answers](../../../docs/adr/0007-public-butler-chat.md)

Use Ask me first for replies with new content, proposed viewing times and translations going public. A person approves the reply or proposal before it is sent. The agency owns confirmation of a viewing and checks the listing, access, participants and resource conflicts. Price decisions, offers, terms and conditions, contracts, money, publication and withdrawal, access changes, cancellations, and legal, tax or process conclusions stay human-only at every level. [Task policy](../../../docs/adr/0011-platform-direction.md#5-butler-acts-within-levels) · [Viewing checks](../../../docs/architecture.md#64-viewings-and-calendar)

**Status: Outdated.** The earlier rehearsal said that every customer send required a human decision. ADR 0011 supersedes that rule. A task's permitted level establishes authority after qualification. Check the build and brand configuration before claiming customer messaging is active.

## Rehearse a viewing request

Use a synthetic buyer and listing in a test environment with a captured sender. Have the buyer submit a preferred window, lose the first response and retry the same request. Check for one durable inquiry, one recoverable receipt and one coverage-queue entry. In the buyer’s language, test the approved receipt wording. If the build qualifies a separate acknowledgement send, verify its receipt, ensure the retry creates no second send and run the manual path with the task switched off.

Prepare a proposed viewing time and check that it waits for human approval before sending. Ask the buyer to explain what has been agreed and what happens next. Track duplicate inquiries and buyers who believe they already hold a confirmed appointment. Keep the case definition and denominator fixed when comparing versions. Record the inquiry receipt, broker acceptance of follow-up, proposed time and confirmed viewing as distinct events.

Report a rehearsal with its build and outcome. The partner running the service accepts the real workflow after observing the handoff with approved data. Production requires Works, Data safe, Found, Lawful and Reversible on the exact launch build, followed by the owner’s go. R00–R12 are frozen history. [Launch checks](../../../docs/adr/0011-platform-direction.md#6-five-launch-checks)
