# MS Realty retention policy

Status: approved by the agency owner as privacy owner (Opened Questions Q148 A, with Q109 B, Q111 A and
Q136 A). Version 2: covers all 27 EU member states. This is the operator-approved policy that architecture
§8.4 requires before production personal-data capture; it does not by itself clear R00 or R05, which still
need their release evidence. Country rules and sources: `compliance-eu27.md` and
`docs/research/legal-eu27/`.

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
4. A Deal's country is the country of its property; the books' country is where MS Realty keeps its
   accounts (today Bulgaria).
5. A legal hold suspends deletion for the records it names. It records its reason and who placed it, shows
   no end date, and is reviewed every 6 months.
6. Deletion and restriction propagate to derived stores and providers as described in
   `privacy-erasure-propagation.md`. A restored backup re-applies the deletion ledger before access or jobs
   reopen. Changing backup or R2 lifecycle rules stays a separate decision under ADR 0006.
7. Records nobody can classify are held for the next review, never kept by default.
8. The software applies these periods per country; it does not invent deadlines (§8.4).

## Record classes

| Record class                                                                                                                                                        | Period                                                                                                                                                       | Starts                                                                       | Basis                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Inquiry that did not become a Deal                                                                                                                                  | 12 months, then deleted                                                                                                                                      | Last contact                                                                 | GDPR art. 5(1)(e); owner decision                                                       |
| Closed Deal file: brief, Interests, messages, call and chat notes, proposals and decisions, appointments, closeout, brokerage contracts, documents not listed below | The longer of 5 years and the Deal country's general limitation period for contract claims, capped at 10 years (table below)                                 | After the year the Deal closed                                               | Keeping evidence while claims can still be brought (GDPR art. 17(3)(e)); owner decision |
| AML customer due diligence and transaction records, including identity-document copies taken under AML                                                              | The Deal country's AML period (table below); from 10 July 2027, 5 years under Regulation (EU) 2024/1624 art. 77 unless an authority extends it. Then deleted | End of the business relationship, the occasional transaction, or the refusal | National AML laws; AMLR art. 77                                                         |
| Identity-document copies outside AML                                                                                                                                | Not taken. Staff record that the document was seen and checked                                                                                               | —                                                                            | National bans and GDPR art. 5(1)(c) (`compliance-eu27.md` §2)                           |
| Accounting and tax documents: invoices, commission statements, payments                                                                                             | The books' country period: Bulgaria 10 years (Accountancy Act art. 12; ДОПК art. 38). Other countries in the table below if MS Realty keeps books there      | 1 January after the reporting period                                         | National accounting and tax law                                                         |
| Saved searches and alert subscriptions                                                                                                                              | While active; deleted 30 days after unsubscribe or expiry                                                                                                    | Unsubscribe or expiry                                                        | GDPR art. 5(1)(e); owner decision                                                       |
| Marketing consent and its withdrawal                                                                                                                                | Proof kept 3 years after withdrawal; no marketing sent after it                                                                                              | Withdrawal                                                                   | Evidence of lawful sending; owner decision                                              |
| Privacy requests: receipt, verification, scope, decision, completion                                                                                                | 3 years                                                                                                                                                      | Completion                                                                   | Evidence of compliance (GDPR art. 5(2)); owner decision                                 |
| Copy of personal data prepared for a client                                                                                                                         | Download link 7 days, then the copy is deleted                                                                                                               | Delivery                                                                     | Q111 A                                                                                  |
| Audit and operation records of a business record                                                                                                                    | As the record they belong to                                                                                                                                 | As that record                                                               | Architecture §5.1 and §8.4                                                              |
| Security events: sign-ins, passkeys, access changes                                                                                                                 | 12 months                                                                                                                                                    | Event                                                                        | Owner decision                                                                          |
| Application logs and traces (contact data, tokens and bodies redacted by design)                                                                                    | 30 days                                                                                                                                                      | Event                                                                        | Architecture §17; owner decision                                                        |
| Backups and recovery points                                                                                                                                         | As the recovery design requires (ADR 0006); deletion ledger re-applied on restore                                                                            | —                                                                            | Architecture §17, ADR 0006                                                              |

## Periods by country

| CC  | Closed Deal file (years) | AML records until 10 Jul 2027 (years) | Accounting if books kept there (books / source documents) |
| --- | ------------------------ | ------------------------------------- | --------------------------------------------------------- |
| AT  | 10                       | 5                                     | 7 / 7                                                     |
| BE  | 10                       | 10                                    | 10 / 10                                                   |
| BG  | 5                        | 5                                     | 10 / 10                                                   |
| CY  | 6                        | 5                                     | 6 / 6                                                     |
| CZ  | 5                        | 10                                    | 5 / 10                                                    |
| DE  | 5                        | 5 (from year end)                     | 10 / 8                                                    |
| DK  | 5                        | 5                                     | 5 / 5                                                     |
| EE  | 5                        | 5                                     | 7 / 7                                                     |
| ES  | 5                        | 10                                    | 6 / 6                                                     |
| FI  | 5                        | 5                                     | 10 / 6                                                    |
| FR  | 5                        | 5                                     | 10 / 10                                                   |
| GR  | 10                       | 5                                     | 5 / 5 (tax up to 10)                                      |
| HR  | 5                        | 10                                    | 11 / 11                                                   |
| HU  | 5                        | 8                                     | 8 / 8                                                     |
| IE  | 6                        | 5                                     | 6 / 6                                                     |
| IT  | 10                       | 10                                    | 10 / 10                                                   |
| LT  | 10                       | 8                                     | 10 / 10 (assumed)                                         |
| LU  | 10                       | 5                                     | 10 / 10                                                   |
| LV  | 10                       | 5                                     | 10 / 5                                                    |
| MT  | 5                        | 5                                     | 10 / 10                                                   |
| NL  | 5                        | 5                                     | 7 / 7                                                     |
| PL  | 6                        | 5                                     | 5 / 5                                                     |
| PT  | 10                       | 7                                     | 10 / 10                                                   |
| RO  | 5                        | 5                                     | 5 / 5                                                     |
| SE  | 10                       | 5                                     | 7 / 7                                                     |
| SI  | 5                        | 10                                    | permanent / 10                                            |
| SK  | 5                        | 5                                     | 10 / 10                                                   |

## Response deadlines

Privacy requests are answered within one month of receipt, extendable by two further months for complex or
numerous requests, with the client told why within the first month (GDPR art. 12(3)). Pages show the
receipt and "within one month", never an invented date.

## Review

The privacy owner reviews this policy once a year and whenever a source law changes, starting with the
application of Regulation (EU) 2024/1624 on 10 July 2027. The office manager runs the deletion review every
quarter and reports what was deleted, held or left unclassified.
