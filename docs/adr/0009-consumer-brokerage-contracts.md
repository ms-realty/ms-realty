# ADR 0009 — Brokerage contracts with consumers: information, withdrawal and fees

Status: accepted by the owner and the design session from primary sources (Opened Questions Q149). Adds a
contract step the architecture does not yet draw. Country detail: `docs/delivery/compliance-eu27.md`.

A brokerage contract between MS Realty and a consumer is a service contract under Directive 2011/83/EU
(recital 26; the exclusion in art. 3(3)(e) covers contracts for the transfer of immovable property, not
the agent's service). When it is concluded online or away from the office, the consumer has a 14-day
withdrawal right, and a missing information duty costs the whole fee (art. 14(4)(a); CJEU C-97/22).

## Decision

1. **Every client signs a written brokerage contract** before MS Realty acts for them. It names the
   service, the fee (amount or method, who pays which part), the dual-mandate clause where it applies
   (ADR 0008), the country fee rule, and the complaint path.
2. **Pre-contract information** on a durable medium (art. 6(1)), with the model withdrawal form; the
   contract and the confirmation are sent on a durable medium (arts. 7, 8(7)).
3. **The signing button** reads "Sign with obligation to pay" (art. 8(2)).
4. **Withdrawal.** For contracts concluded online or off-premises: 14 days (art. 9). MS Realty starts work
   within that period only on the consumer's express request on a durable medium, with the acknowledgement
   that the right ends once the service is fully performed (arts. 7(3), 8(8)); after a withdrawal the
   consumer pays only for what was done (art. 14(3)).
5. **A "Withdraw from the contract here" function** in the client area for contracts concluded online (art.
   11a).
6. **Country fee rules** apply before the contract is offered: no fee from a consumer buyer or tenant in
   NL; equal split for a consumer home purchase in DE and the client-pays rule for residential lettings;
   one-side fee in PT; fee only from MS Realty's own client in IE and SI; no tenant fee for residential
   lettings in ES; 50/50 for residential lettings in LU.
7. **Customer due diligence** of MS Realty's own client happens before the contract is signed (ADR 0008).

## Obligations

1. Contract templates per country and per side (buyer, seller, tenant, landlord) with the clauses above.
2. A contract record on the Deal: version, sent and signed times, durable-medium copy, express-request flag,
   withdrawal deadline and outcome.
3. The client-area withdrawal function and its confirmation.

The workflow is drawn as W33 on the Staff - Broker page of the MS Realty workflow file.
