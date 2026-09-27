# Agency obligations missing from the architecture

Research record, 2026-09-26. Primary sources were read where linked; items marked **[UV]**
are unverified (memory or secondary source) and must be confirmed by a lawyer or accountant
before the slice that implements them. This is input to product design, not legal advice.
Ranking is risk × value. **L** = legal obligation, **GP** = good practice. Section references
(§) point to `docs/architecture.md`.

## 1. AML/CFT (L) — not covered by the architecture

Bulgarian ZMIP, consolidated text to State Gazette 51/2026:
https://dans.bg/upload/4272/ZAKON_za_merkite_sresu_izpiraneto_na_pari.pdf

- Scope: real-estate intermediaries are obliged entities (art. 4 item 18); lettings only when
  monthly rent is ≥ EUR 10 000.
- Triggers (art. 11(1)): start of a business relationship; one-off transaction ≥ EUR 15 000;
  cash ≥ EUR 5 000.
- Due diligence (art. 10): identify and verify the customer and beneficial owner, record the
  purpose of the relationship, source of funds by at least two methods (art. 66), ongoing
  monitoring. Copy of official ID (art. 53(1)) — the legal basis the Personal Data Protection
  Act art. 25g requires before copying IDs **[UV]**. Representative and represented person
  both verified (art. 65), relevant to foreign buyers acting by power of attorney. Enhanced
  checks for politically exposed persons (art. 36). Sanctions screening under the Measures
  Against the Financing of Terrorism Act, cross-referenced by ZMIP.
- Agency documents: own risk assessment (art. 98) and written internal rules (art. 101), due
  within 4 months of registration (art. 102).
- Retention: 5 years from the end of the relationship or transaction (art. 67).
- Suspicion: report to SANS Financial Intelligence Directorate immediately and before
  execution (art. 72) through the secure channel (art. 79); tipping-off prohibited (article
  not checked).
- Registration: ZMIP creates none. A pending bill would add a broker register and compulsory
  insurance **[UV]**: https://www.parliament.bg/bg/bills/ID/165191
- EU AMLR 2024/1624 (https://eur-lex.europa.eu/eli/reg/2024/1624/oj/eng) applies from
  10 July 2027 (art. 90): estate agents stay in scope with the EUR 10 000 rent threshold
  (art. 3(3)(d)), both parties to the transaction are checked (art. 19(6)(c)), one-off
  threshold EUR 10 000 (art. 19(1)(b)), cash payments capped at EUR 10 000 (art. 80), 5-year
  retention (art. 77); recital 56: checks start once an offer is made and accepted.

Product support: restricted `ComplianceCheck` per party on a Case/Proposal, triggered at
`agreed_for_next_step` or cash ≥ EUR 5 000; fields for ID copy, representative, beneficial
owner, PEP answer, sanctions result (source and date), funds-origin methods, risk rating and
the named deciding person; its own document class with 5-year retention that blocks
erasure; suspicion register visible only to the compliance role; Hermes excluded; operator
inputs for AML officer, internal rules and risk assessment.

## 2. Service agreement, withdrawal right, commission, VAT (L) — partly covered

- Bulgaria: no statute found that prescribes a form for real-estate brokerage agreements
  **[UV]**.
- Distance or off-premises agreements carry a 14-day withdrawal right (Consumer Protection
  Act art. 50 **[UV, secondary]**; Consumer Rights Directive art. 9,
  https://eur-lex.europa.eu/eli/dir/2011/83/oj/eng). Services start inside that period only on
  the consumer's express request (art. 7(3), 8(8)); if the withdrawal information or the
  request is missing the consumer may owe nothing (art. 14(4)(a); CJEU C-97/22 **[UV]**) — a
  direct commission risk.
- Greece: brokerage agreement must be written and name the tax numbers and the agent's GEMI
  registration; EU agents providing occasional cross-border services are exempt from GEMI
  registration:
  https://en.mitos.gov.gr/index.php/%CE%94%CE%94:Real_Estate_Agents,
  https://en.mitos.gov.gr/index.php/%CE%94%CE%94:Cross-border_Provision_of_Services_of_Real-estate_Agents
- VAT: services connected with immovable property are taxed where the property is (VAT
  Directive art. 47; estate-agent services under Regulation 1042/2013 art. 31a(2) **[UV]**), so
  commission on a Greek property is subject to Greek VAT — accountant decision.
- The architecture's SellerInstruction (§6.3) covers sellers only; there is no buyer/tenant
  agreement and no commission record.

Product support: `ServiceAgreement` (channel on-premises/off-premises/distance, withdrawal
information and express-request timestamps, computed deadline, signed copy, commission basis
and payer) blocking service start until the request is recorded; Commission record with the
external invoice reference.

## 3. GDPR (L) — about 60% covered (§8.4, ConsentEvent in §4.1, §21.4)

Source: https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng (article numbers not re-fetched).

- Records of processing (art. 30): the small-organisation exemption does not apply to
  regular processing.
- Data-subject requests: one month, extendable by two (art. 12(3)); EU-wide, so §8.4's "no
  invented deadlines" does not prevent a default due date.
- Processor agreements (art. 28) with every provider; documented basis for US transfers.
- Breach notification within 72 hours (art. 33).
- Cookies: Bulgarian consent rule is the Electronic Commerce Act art. 4a (not the Electronic
  Communications Act):
  https://www.mi.government.bg/file/2015/09/zakon_za_elektronnata_targoviq-2024.pdf. The
  receipt-session cookie is strictly necessary; a consent banner is needed only if analytics
  or third-party embeds are added.

Product support: processing register, processor/transfer register, breach log with a 72 h
timer, default due date on each data-subject request.

## 4. Country transaction checklists (L-adjacent) — structure exists (§3.2, §6.5), content missing

- Bulgaria: preliminary contract and deposit, notarial deed, municipal tax assessment, local
  transfer tax, notary declarations, property-register entry **[UV detail]**. Non-EU/EEA
  buyers may own land only under a ratified treaty (Constitution art. 22); agricultural land
  limited to EU/EEA buyers (secondary source); usual routes are buying the building without
  land or buying through a Bulgarian company.
- Greece: tax number (AFM), bank account, lawyer (whether mandatory **[UV]**), notary,
  transfer tax, engineer's certificate, energy certificate, cadastre registration, annual
  ENFIA. Border areas require a permit for non-EU buyers under Law 1892/1990; which northern
  areas are covered is **[UV]**:
  https://www.sioufaslaw.gr/restrictions-on-the-acquisition-of-real-estate-property-in-greece-3/

Product support: versioned checklist templates by country × sale/let × EU/non-EU buyer;
items with owner, responsible professional, evidence and due date, completed by a human; a
non-EU buyer automatically creates a land/border-permit task.

## 5. Reviews, complaints, dispute resolution (L, light) — not covered

- Reviews: if shown, disclose how genuineness is checked; fake reviews prohibited (UCPD
  art. 7(6), Annex I 23b–c, via Directive 2019/2161).
- Consumers must still be told about out-of-court dispute resolution; the EU ODR platform
  link is no longer required (Regulation 2024/3228 **[UV]**).

Product support: complaint record (receipt, owner, due, outcome); review-consent event on
completed Cases.

## 6. European Accessibility Act — very likely exempt

Microenterprise service providers are exempt (Directive 2019/882 art. 4(5)); microenterprise
= fewer than 10 staff and turnover or balance sheet ≤ EUR 2 million (art. 3(23)) **[UV]**.
Bulgarian transposition (2025):
https://dv.parliament.bg/DVWeb/showMaterialDV.jsp?idMat=233836. WCAG 2.2 AA (AT61) remains
the product target; record the microenterprise test annually in release evidence.

## 7. Everyday agency workflows (GP)

| Workflow | Architecture coverage | Addition |
|---|---|---|
| Portal leads | Inquiry records channel and source (§4.1) | Portal name and portal reference on manual entry |
| Call logging | Communication summaries (§9) | — |
| Keys | Access permission only (§6.4) | Key register: holder, check-out, due-back reminder |
| Photography | None | Property-work appointment type tied to media rights (§6.3) |
| Owner price feedback | Partial (§6.2, §6.3) | Periodic owner report approved by a human |
| Referral partners and fees | None (F28 is intake only) | Partner record and fee agreement; GEMI number for Greek co-agents |
| Staff offboarding | Reassignment (§6.6) | Checklist: keys returned, client data on personal devices handed back, mailbox access revoked |
