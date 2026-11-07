# ADR 0008 — Customer due diligence on both parties, across the EU

Status: accepted by the owner (Opened Questions Q147, with Q114). Adds an obligation the architecture does
not yet name. Everything else in the architecture applies unchanged. Country detail and sources:
`docs/delivery/compliance-eu27.md`, `docs/research/legal-eu27/`.

Estate agents are obliged entities under EU anti-money-laundering law in every member state (Directive
(EU) 2015/849 art. 2(1)(3)(d), and from 10 July 2027 Regulation (EU) 2024/1624 art. 3(3)(d)). The AML
Regulation names both parties of the transaction as the agent's customers, whoever pays the fee (art.
19(6)(c)). National laws differ today on lettings, on the other party and on retention.

## Decision

1. **Scope.** Every sale. Lettings with a monthly rent of EUR 10,000 or more; at any rent in BE, DK, FI,
   LV, PT and SE; from HUF 500,000 a month in HU; not in PL.
2. **Both parties, everywhere, now.** MS Realty identifies both parties of every in-scope deal.
3. **Timing.** MS Realty's own client before the brokerage contract is signed (Directive 2015/849 art.
   14(1)). The other party once an offer is accepted, and always before any deposit, preliminary contract,
   notary deed or handover (AMLR art. 23(1)).
4. **Content.** Identity, beneficial owner, politically exposed person and sanctions check, source of funds,
   risk assessment, authority of representatives. High risk or a politically exposed person needs an
   enhanced check approved by the agency owner. A person decides; Butler takes no part (AMLR art. 76(5)).
5. **Gates.** The proposal submit command refuses until the own-client check is recorded; the coordination
   steps (deposit, preliminary contract, notary deed, handover) refuse until both checks are recorded; the
   publication command refuses until the seller's check is recorded.
6. **Refusal and suspicion.** No deal; the refusal is recorded; a suspicion is handled without telling the
   client (Directive 2015/849 art. 39; AMLR art. 73).
7. **Separation.** AML records live apart from Deal records and are never used for CRM, marketing or Butler
   (Directive 2015/849 art. 41(2); AMLR art. 76(4)). The AML privacy notice is given before the check.
8. **Identity-document copies** only inside the check and only where the country requires or allows them;
   never outside AML. National identity numbers are masked unless a law requires them.
9. **Retention** per `docs/delivery/retention-policy.md`: the country's AML period until 10 July 2027, then 5
   years under AMLR art. 77, then deletion. The office manager keeps the AML journal and its deadlines.

## Dual mandate (Q114)

MS Realty acts for both sides only with a dual-mandate clause in each written contract, written notice
before signing and written consent, and never in Denmark; country fee rules apply (`compliance-eu27.md` §1).
Screens name the dual mandate.

## Obligations

1. A customer-check record per party with its result, evidence references and reviewer; the AML journal in
   Operations.
2. The three gates above, enforced by the domain commands.
3. Brokerage-contract templates with the dual-mandate clause and the country fee rules (ADR 0009).
4. A review when Regulation (EU) 2024/1624 and the AMLA standards apply.

The workflow is drawn as W32 on the Staff - Broker page of the MS Realty workflow file.
