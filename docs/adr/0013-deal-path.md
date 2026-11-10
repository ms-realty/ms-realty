# ADR 0013 — Every Deal has a Path; completing its last step completes the Deal

Status: accepted (owner decision). Implemented on `claude/deal-path` with migration
`0039_deal_path`. Emails and notifications about the Path are a separate slice.

## Context

The product goal is to take a client from first interest to a verified, completed transaction.
The code stopped at a proposal reaching `agreed_for_next_step`: nothing recorded the deposit and
preliminary contract, checks, notary deed, registration or handover; the client could not see
where their purchase stood; and a Case closed with a free-text outcome. The existing
`completed` / `completion_handover` stage needs a Listing already sold or let, a reviewed
`case_completion` document and the full agreement gate, and no command sets a Listing to sold or
let, so in practice no Deal could reach it. For cross-border buyers in Bulgaria and Greece this
completion layer is what competitors do not offer. A Case is a "Deal" / «Сделка» in everything
users see; code keeps `case`.

## Decision

Every buyer, tenant, seller and landlord Deal has a **Path**: one ordered list of plain-language
steps from first contact to keys in hand. The client and the broker read the same list: what is
done, where the Deal is now, what comes next, who acts and by when.

- **Derived early steps** come from records that already exist and are never stored twice:
  request received (Inquiry or the Case itself), needs agreed (a client-acknowledged Brief),
  homes shortlisted (an Interest past `suggested`), viewings (a completed viewing Appointment; an
  upcoming confirmed one gives the expected date) and terms agreed (the active Proposal revision
  at `agreed_for_next_step` with unchanged terms). Sellers and landlords get request received and
  terms agreed. A derived step that a later step passed without its own record reads "No record
  here", never "done".
- **Recorded later steps** come from a template in the tenant profile (`dealPathTemplates`,
  `src/config/tenant.ts`) per jurisdiction × transaction: BG sale, BG long-term rent and GR sale,
  with a generic fallback per transaction. Each template step has a stable key, who acts (client,
  agency, owner, notary, lawyer), whether a document is usually kept and whether the client sees
  it. The jurisdiction is the country of the agreed Proposal's property, else the latest
  Proposal's or Interest's. Wording lives in the `dealPath` (seven locales) and `dealPathStaff`
  (bg, en, ru) message catalogs, never in the profile.
- The recorded steps are copied into `case_path_steps` when every required party agrees the
  terms (inside the proposal decision transaction), or on the first staff action. A Deal keeps
  that copy; editing a template changes new Deals only.
- Staff record one step at a time (`recordPathStep`): mark done with the date it happened, an
  optional note for the client, an optional internal note and an optional Case document; mark not
  needed with a reason; reopen with a reason; or set the date it is expected by. Each action is
  an idempotent operation bound to the Case version, audited as `case.path.<action>`.
- **Completion is verified, not labelled.** When terms are agreed, every recorded step is done or
  not needed and the final step (keys handed over) is done, the broker confirms the deed or lease
  date with an optional registry or deed reference and document (`completeDealFromPath`). One
  operation, after step-up and the same open-work check as the close flow, records a
  `case_completions` row, moves the Case to its pipeline's terminal stage and closes it with the
  structured outcome `deal_completed`. The stage history row carries `toDisposition: closed`, so
  retention starts exactly as for any other closeout. The recorded path is the completion
  evidence for this route; the existing stage form with its stricter evidence stays available.
- An incomplete Deal still closes with a truthful reason through the existing close flow; it
  never reads as completed.

The app still holds no money, executes no signature and gives no legal advice. Step sentences
say who does what; they state no legal requirement, cost, deadline or tax rule and promise no
outcome.

## Consequences

- Clients see the Path first on their Deal overview (compact and full), staff get a Path panel
  with one-step actions on the Deal page. Both render on the server with native forms and work
  without JavaScript.
- Clients see only client-visible steps and client notes on Deals they participate in; an
  internal note, a not-needed reason and evidence documents stay with staff who hold
  `case.read_internal`. A non-participant gets not found.
- No command sets a Listing to sold or let, so completion changes no Listing; its commercial
  state is still changed separately. That command is a follow-up.
- New jurisdictions or transactions are a template entry plus catalog copy; the actor list is
  pinned by a CHECK constraint, so a new actor needs a migration.
- The agreement gate (`assertCaseAgreementReady`) is unchanged and still decides when terms can
  be agreed.
