# EU-27 compliance rules for brokerage, AML and retention

Status: decided by the owner and the design session from primary sources. There is no lawyer; these rules
are the agency's own decisions and are revised when the law or the evidence changes. Scope: sales and
lettings brokered by MS Realty for clients in any of the 27 EU member states. Research records, with
article references, quotes and source links per country: `docs/research/legal-eu27/<CC>.json` and
`EU.json`. Points those records mark UNCONFIRMED are settled below by choosing the stricter reading.

## Which country's rules apply

A Deal follows the rules of the country where the property is, plus the consumer rules of the client's
country of residence where they are stricter (Rome I art. 6). Accounting rules follow the country where
MS Realty keeps its books (today Bulgaria).

## 1. Dual mandate (Q114, revised)

EU rule: hiding that a broker also acts for, or is paid by, the other party is a misleading omission
(Directive 2005/29/EC arts. 6–7). MS Realty therefore acts for both sides only when **all** of these hold:

1. each written brokerage contract contains a dual-mandate clause and states who pays which fee;
2. each party is told in writing before signing, and consents in writing;
3. the country allows it, with its fee rule applied:

| Country    | Rule MS Realty applies                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DK         | Never: no one may represent both seller and buyer. MS Realty acts for one side; the other is referred elsewhere                                       |
| PT         | Both sides may be served, but a fee is charged to one side only (Lei 15/2013 art. 17(2)(a))                                                           |
| NL         | Written consent; no fee from a consumer buyer or tenant (BW 7:417(4))                                                                                 |
| DE         | Consumer purchase of a flat or house: equal split if both pay (BGB §656c, §656d). Residential letting: the client who orders pays (WoVermittG §2(1a)) |
| IE         | Written conflict notice; fee only from MS Realty's own client (S.I. 564/2020 regs. 8(2), 21)                                                          |
| SI         | Written conflict warning; fee only from a party with its own contract (ZNPosr arts. 5(3), 20–21)                                                      |
| HR         | A separate written contract with each side; combined fee within the legal cap (NN 69/2026 art. 30)                                                    |
| BE         | Fees from both sides only by agreement of all parties (code of ethics art. 34)                                                                        |
| GR         | The clause is mandatory in each contract and the client is told before signing (Law 4072/2012 arts. 200(7), 201(1)(b))                                |
| FI         | One commission in total (1074/2000 §20(2))                                                                                                            |
| LU         | Residential lettings: the fee is split 50/50 by law                                                                                                   |
| ES         | Residential lettings: no agency fee from the tenant (LAU art. 20.2)                                                                                   |
| All others | Rules 1–2 above                                                                                                                                       |

Screens name the dual mandate: "Georgi Ivanov acts for the buyer and for the seller of MS-00142."

## 2. Customer due diligence (Q147, revised; ADR 0008)

- **In scope:** every sale. Lettings with a monthly rent of EUR 10,000 or more; lettings at **any** rent
  in BE, DK, FI, LV, PT and SE; from HUF 500,000 a month in HU; lettings are out of scope in PL.
- **Both parties:** MS Realty identifies both parties of every in-scope deal, whoever pays the fee. This
  is already the rule in most states and is EU law from 10 July 2027 (Regulation (EU) 2024/1624 art.
  19(6)(c)); applying it now everywhere is the stricter reading.
- **Timing:** MS Realty's own client before the brokerage contract is signed (Directive 2015/849 art.
  14(1)); the other party once an offer is accepted and always before any deposit, preliminary contract,
  notary deed or handover (AMLR art. 23(1)).
- **Content:** identity, beneficial owner, politically exposed person and sanctions check, source of
  funds, risk assessment, authority of representatives. High risk or a politically exposed person needs an
  enhanced check approved by the agency owner. A person decides; Butler does not take part (AMLR art.
  76(5)).
- **Refusal:** no deal, the refusal recorded; suspicion handled without telling the client (Directive
  2015/849 art. 39; AMLR art. 73).
- **Separate store:** AML records are never used for CRM, marketing or Butler drafts (Directive 2015/849
  art. 41(2); AMLR art. 76(4)).
- **Identity-document copies:** taken only inside due diligence, and only where the country requires or
  allows it. Never outside AML (banned or restricted in BG, CZ, DE, HU, IT, PT, SI, GR and for the Belgian
  eID). National identity numbers (NL BSN, BE National Register number, RO CNP) are masked unless the law
  requires them.
- **Retention:** see the retention policy.

## 3. Consumer brokerage contracts (ADR 0009)

A brokerage contract with a consumer concluded online or away from the office falls under Directive
2011/83/EU: pre-contract information on a durable medium (art. 6), a 14-day withdrawal right (art. 9),
services during that period only on the consumer's express request (arts. 7(3), 8(8)), a withdrawal
function in the client area (art. 11a), and no fee at all if the information was not given (art. 14(4)(a);
C-97/22).

## 4. Butler

Butler never sees AML records. Where MS Realty acts as a Belgian-licensed agent, the Belgian code of
ethics (arts. 40–42) bars entering personal data into an open AI system: Butler drafts for those Deals use
pseudonymised context, and the client is told that drafts are AI-assisted.

## 5. Per-country annex

| CC  | Dual mandate                   | AML lettings  | AML both parties                    | AML retention (until 10 Jul 2027) | ID copy under AML | Accounting (books / source documents) | Contract claims: general / commission |
| --- | ------------------------------ | ------------- | ----------------------------------- | --------------------------------- | ----------------- | ------------------------------------- | ------------------------------------- |
| AT  | disclosure                     | ≥ €10,000     | yes                                 | 5                                 | required          | 7 / 7                                 | 30 / 3                                |
| BE  | consent                        | any rent      | yes                                 | 10                                | required          | 10 / 10                               | 10 / 10                               |
| BG  | allowed                        | ≥ €10,000     | stricter reading                    | 5 (+2 on request)                 | required          | 10 / 10                               | 5 / 5                                 |
| CY  | stricter reading               | ≥ €10,000     | stricter reading                    | 5 (+5)                            | required          | 6 / 6                                 | 6 / 3                                 |
| CZ  | disclosure                     | ≥ €10,000     | yes                                 | 10                                | optional          | 5 / 10                                | 3 / 3                                 |
| DE  | disclosure                     | ≥ €10,000     | yes                                 | 5 from year end, ≤ 10             | required          | 10 / 8                                | 3 / 3                                 |
| DK  | prohibited                     | any rent      | stricter reading                    | 5                                 | required          | 5 / 5                                 | 3 / 3                                 |
| EE  | consent                        | ≥ €10,000     | stricter reading                    | 5 (+5)                            | required          | 7 / 7                                 | 3 / 3                                 |
| ES  | stricter reading               | ≥ €10,000     | stricter reading                    | 10                                | required          | 6 / 6                                 | 5 / 3                                 |
| FI  | allowed                        | any rent      | yes                                 | 5                                 | optional          | 10 / 6                                | 3 / 3                                 |
| FR  | disclosure                     | ≥ €10,000     | yes                                 | 5                                 | required          | 10 / 10                               | 5 / 2 (consumer)                      |
| GR  | consent                        | ≥ €10,000     | own client by law; both by our rule | 5 (≤ 10)                          | not required      | 5 / 5 (tax up to 10)                  | 20 / 5                                |
| HR  | consent                        | ≥ €10,000     | yes                                 | 10                                | required          | 11 / 11                               | 5 / 5                                 |
| HU  | stricter reading               | ≥ HUF 500,000 | yes                                 | 8 (≤ 10)                          | required          | 8 / 8                                 | 5 / 5                                 |
| IE  | disclosure                     | ≥ €10,000     | stricter reading                    | 5 (+5)                            | required          | 6 / 6                                 | 6 / 6                                 |
| IT  | allowed                        | ≥ €10,000     | yes                                 | 10                                | required          | 10 / 10                               | 10 / 1                                |
| LT  | stricter reading               | ≥ €10,000     | stricter reading                    | 8 (+2)                            | required          | 10 (assumed)                          | 10 (assumed)                          |
| LU  | stricter reading               | ≥ €10,000     | yes                                 | 5 (+5, +5)                        | required          | 10 / 10                               | 30 / 10                               |
| LV  | allowed                        | any rent      | yes                                 | 5 (+5)                            | required          | 10 / 5                                | 10 / 3                                |
| MT  | allowed                        | ≥ €10,000     | yes                                 | 5 (≤ 10)                          | allowed           | 10 / 10                               | 5 / 1.5                               |
| NL  | consent                        | ≥ €10,000     | yes                                 | 5                                 | allowed           | 7 / 7                                 | 5 / 5                                 |
| PL  | stricter reading               | out of scope  | own client by law; both by our rule | 5                                 | allowed           | 5 / 5                                 | 6 / 3                                 |
| PT  | stricter reading; one-side fee | any rent      | yes                                 | 7                                 | allowed           | 10 / 10                               | 20 / 20                               |
| RO  | allowed                        | ≥ €10,000     | yes                                 | 5 (+5)                            | allowed           | 5 / 5                                 | 3 / 2                                 |
| SE  | allowed                        | any rent      | yes                                 | 5 (≤ 10)                          | required          | 7 / 7                                 | 10 / 3                                |
| SI  | disclosure                     | ≥ €10,000     | yes                                 | 10                                | in person         | permanent / 10                        | 5 / 5                                 |
| SK  | allowed                        | ≥ €10,000     | stricter reading                    | 5 (+5)                            | optional          | 10 / 10                               | 3 / 3                                 |

"Stricter reading" marks a point the research could not confirm from a primary source; MS Realty applies
the EU default rule (dual mandate: written clause, notice and consent; AML: identify both parties).
Lithuanian accounting and limitation periods could not be read (portal blocked) and are assumed at 10
years, the longest common value.
