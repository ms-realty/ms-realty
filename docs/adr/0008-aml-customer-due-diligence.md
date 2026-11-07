# ADR 0008 — Customer due diligence before an offer or a seller instruction

Status: accepted by the owner (Opened Questions Q147 A, with Q114 A). Adds an obligation the architecture
does not yet name. Everything else in the architecture applies unchanged.

Real-estate agents are obliged entities under anti-money-laundering law in both countries MS Realty serves:

- **Bulgaria:** Measures Against Money Laundering Act art. 4(18) covers every real-estate brokerage deal, and
  lettings only where the monthly rent is EUR 10,000 or more. Records are kept 5 years after the business
  relationship ends or the occasional operation (art. 67) and then deleted (art. 83(4)). Identification is
  by an official identity document, of which a copy is taken (art. 53(1)); outside that scope the Personal
  Data Protection Act art. 25g forbids copying identity documents.
- **Greece:** Law 4557/2018 art. 5(1)(h) covers transactions of EUR 10,000 or more, purchase, sale or monthly
  rent. Records are kept 5 years after the relationship ends or the occasional transaction (art. 30(3)).

## Decision

The broker runs customer due diligence on his own client before the first offer on a sale, or before the
seller instruction: identity seen and recorded, beneficial owner, politically exposed person check, source
of funds and a risk assessment. A politically exposed person or a high risk needs an enhanced check that the
agency owner approves. The office manager keeps the AML journal and its deadlines. An offer cannot be
submitted, and a listing cannot be published, until the check is recorded. A client who refuses or cannot
document the source of funds gets no offer submitted; the reason is recorded.

## Dual mandate (Q114 A)

When one broker acts for the buyer and the seller of the same home, the brokerage contract with each party
says so and states who pays which fee, and each party is told in writing before signing (Greece: Law
4072/2012 arts. 200(7) and 201(1)(b); Bulgaria: Consumer Protection Act art. 68e on misleading omissions,
Obligations and Contracts Act art. 38 when the broker represents both). Screens name the dual mandate.

## Obligations

1. A customer-check record on the Deal with its result, evidence references and reviewer, and an AML
   journal in Operations, with retention under `docs/delivery/retention-policy.md`.
2. Gates: the proposal submit command and the publication command refuse while an in-scope Deal has no
   recorded check.
3. Brokerage-contract templates with the dual-mandate clause, reviewed by a lawyer.
4. A lawyer confirms whether both parties must be checked when MS Realty acts for one side only.

The workflow is drawn as W32 on the Staff - Broker page of the MS Realty workflow file.
