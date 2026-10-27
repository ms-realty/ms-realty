# Implemented route and screen contract mapping

The route families in `docs/ux-spec.md` §03.2 define the task contracts. This table records the implementation's existing entry points and related panels so source, tests and review packets refer to the same work. Paths are relative to the selected host and locale.

| Surface | Implemented entry | Contract family | Screen or flow |
|---|---|---|---|
| Public | `/sell` | `/sell`, owner consultation | P17, F27 |
| Public | `/let` | `/let`, owner consultation | P18, F28 |
| Public | `/search-alerts` | `/preferences` and subscription task routes | P10, P24; invited-client continuation C13 |
| Public | `/inquire/receipt/{reference}` | `/requests/{receiptId}` | P12; durable receipt-session scope |
| Client | `/overview` | `/cases` | C03; accessible deal chooser |
| Client | `/cases/{id}/lifecycle` | `/cases/{id}` continuity and closeout state | C11, C16 |
| Client | `/cases/{id}/participants` | scoped `/participants` | C17 |
| Staff | `/contacts`, `/contacts/{id}` | `/parties/{id}` and relationship context | O04–O07, O19, O20; current inquiry scope applies |
| Staff | `/calendar/{id}` | `/appointments/{id}` | O09 |
| Staff | `/inventory/{reference}` | `/inventory/{propertyId}` | O10–O14; stable Listing reference selects its Property workbench |
| Staff | `/inventory/{reference}/correction` | `/corrections/{id}` | O33, F31; correction operation/task identity retained in the workspace |
| Staff | `/coverage`, `/tasks`, `/proposals` | worklist and record-context panels | O01, O18, O19, O20 |
| Staff | `/reports` | `/operations/{section}` reports | O22 |
| Staff | `/operations/privacy`, `/operations/imports`, `/operations/consultations` | `/operations/{section}` | O25–O30; actual route guards select the permitted task |

Each implemented route keeps its own current authorization, source eligibility and operation-recovery rules. A route alias supplies no new capability or finding closure. Exact legacy host/path/query decisions remain in `data/legacy/url-decisions.json`; this table changes none of them.

The source navigation registry and its route checks remain the executable destination inventory. New source needs the matching contract ID and current evidence in its route/test/PR. Native and enhanced variants share the same task identity. Actual runtime, locale approval, parity and owner acceptance still require their respective evidence.
