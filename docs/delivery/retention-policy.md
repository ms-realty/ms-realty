# MS Realty retention policy

Status: approved by the agency owner as privacy owner (Opened Questions Q148 A, with Q109 B, Q111 A and
Q136 A). Version 1. This is the operator-approved policy that architecture §8.4 requires before
production personal-data capture; it does not by itself clear R00 or R05, which still need their release
evidence.

## Roles

- **Privacy owner:** the agency owner. Approves this policy and its changes, places and lifts legal holds,
  decides refused or partial privacy requests.
- **Office manager:** prepares privacy requests and retention reviews, keeps the AML journal and its
  deadlines (ADR 0008), and runs the deletion review.
- **Brokers:** keep each Deal's record accurate and record the closeout disposition that starts its clock.

## Rules

1. Keep personal data no longer than its purpose needs (GDPR art. 5(1)(e)). A statutory minimum wins over a
   shorter purpose period; nothing is kept forever.
2. A record that belongs to several classes follows the longest applicable period.
3. Periods that start "after the year" run from 1 January of the following year.
4. A legal hold suspends deletion for the records it names. It records its reason and who placed it, shows
   no end date, and is reviewed every 6 months.
5. Deletion and restriction propagate to derived stores and providers as described in
   `privacy-erasure-propagation.md`. A restored backup re-applies the deletion ledger before access or jobs
   reopen. Changing backup or R2 lifecycle rules stays a separate decision under ADR 0006.
6. Records nobody can classify are held for the next review, never kept by default.
7. The software applies these periods; it does not invent country-specific deadlines (§8.4).

## Record classes

| Record class                                                                                                                                              | Period                                                                                                                                                                  | Starts                                                                                | Basis                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inquiry that did not become a Deal (contact data, question, chat-free form content, call notes)                                                           | 12 months, then deleted                                                                                                                                                 | Last contact                                                                          | GDPR art. 5(1)(e); owner decision                                                                                                                                                                      |
| Closed Deal file: brief, Interests, messages, call and chat notes, proposals and decisions, appointments, closeout, documents not listed below            | 5 years                                                                                                                                                                 | After the year the Deal closed                                                        | Bulgaria: Obligations and Contracts Act art. 110 (5-year limitation). Greece: Civil Code arts. 250 and 253 (5 years for merchants' and professionals' claims, from year end); owner decision           |
| Brokerage contracts and the Bulgarian deal journal (Commerce Act art. 50)                                                                                 | As the Deal file, and at least as long as the invoices they support                                                                                                     | After the year the Deal closed                                                        | Commerce Act art. 50; accounting rows below                                                                                                                                                            |
| AML customer due diligence: identification, beneficial owner, PEP check, source of funds, risk assessment, transaction records, ID copies taken under AML | 5 years, then deleted; longer only when the authority requires it                                                                                                       | End of the business relationship, or the date of an occasional transaction            | Bulgaria: Measures Against Money Laundering Act arts. 67 and 83(4) (extension up to 2 years on request). Greece: Law 4557/2018 art. 30(3) (extension only by law or decision, at most 10 years in all) |
| Copies of identity documents outside an AML-scoped deal                                                                                                   | Not taken. Staff record that the document was seen and checked                                                                                                          | —                                                                                     | Bulgaria: Personal Data Protection Act art. 25g; Greece: HDPA practice on proportionality                                                                                                              |
| Accounting and tax documents: invoices, commission statements, payments                                                                                   | Bulgaria: 10 years for registers, statements and tax-control documents; 3 years for other carriers. Greece: at least 5 years, longer while a tax claim or audit is open | Bulgaria: 1 January after the reporting period. Greece: end of the period or tax year | Bulgaria: Accountancy Act art. 12(1). Greece: Law 4308/2014 art. 7(1); Tax Procedure Code (Law 4987/2022) arts. 13(2) and 36(1)                                                                        |
| Saved searches and alert subscriptions                                                                                                                    | While active; deleted 30 days after unsubscribe or expiry                                                                                                               | Unsubscribe or expiry                                                                 | GDPR art. 5(1)(e); owner decision                                                                                                                                                                      |
| Marketing consent and its withdrawal                                                                                                                      | Proof kept 3 years after withdrawal; no marketing sent after it                                                                                                         | Withdrawal                                                                            | Evidence of lawful sending; owner decision                                                                                                                                                             |
| Privacy requests: receipt, verification, scope, decision, completion                                                                                      | 3 years                                                                                                                                                                 | Completion                                                                            | Evidence of compliance (GDPR art. 5(2)); owner decision                                                                                                                                                |
| Copy of personal data prepared for a client                                                                                                               | Download link 7 days, then the copy is deleted                                                                                                                          | Delivery                                                                              | Q111 A                                                                                                                                                                                                 |
| Audit and operation records of a business record                                                                                                          | As the record they belong to                                                                                                                                            | As that record                                                                        | Architecture §5.1 and §8.4                                                                                                                                                                             |
| Security events: sign-ins, passkeys, access changes                                                                                                       | 12 months                                                                                                                                                               | Event                                                                                 | Owner decision                                                                                                                                                                                         |
| Application logs and traces (contact data, tokens and bodies redacted by design)                                                                          | 30 days                                                                                                                                                                 | Event                                                                                 | Architecture §17; owner decision                                                                                                                                                                       |
| Backups and recovery points                                                                                                                               | As the recovery design requires (ADR 0006); deletion ledger re-applied on restore                                                                                       | —                                                                                     | Architecture §17, ADR 0006                                                                                                                                                                             |

## Response deadlines

Privacy requests are answered within one month of receipt, extendable by two further months for complex or
numerous requests, with the client told why within the first month (GDPR art. 12(3)). Pages show the
receipt and "within one month", never an invented date.

## Review

The privacy owner reviews this policy once a year and whenever a source law changes. The office manager runs
the deletion review every quarter and reports what was deleted, held or left unclassified.

## For a lawyer to confirm before launch

- The limitation period for broker commission: Bulgaria art. 110 or 111(a); Greece Civil Code art. 250
  item 1 or item 5.
- The Tax and Social Insurance Procedure Code retention rule in Bulgaria.
- Any Greek statutory rule on copying identity documents.
- Whether AML checks cover both parties when MS Realty acts for one side only.
