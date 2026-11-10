# Plan

Direction and launch authority: [ADR 0011](adr/0011-platform-direction.md). The earlier slice plan
(S0–S7, gates R00–R12) is retired; its text is in git history.

## Goal

A client gets from a first question to a completed, verified deal, and a small agency runs that
path without training. MS Realty is the first brand; a second brand installs by editing the tenant
profile ([ADR 0010](adr/0010-tenant-profile.md)).

We watch three numbers per brand: time to a visitor's first useful answer, the share of inquiries
that reach a viewing, and deals completed with a recorded outcome.

## Where the product stands

| Step of the journey                        | State                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Find a home (search, map, detail, compare) | Works; shows nothing until listings are published                                                |
| Ask and get an answer                      | The inquiry reaches staff; the visitor waits for a person; no chat                               |
| Publish a listing                          | Six approvals and two reviewed documents per listing; being replaced by one decision (ADR 0012)  |
| Work a deal (needs, shortlist, viewings)   | Works for staff and client; viewings and proposals send no email                                 |
| Agree terms                                | Works; the agreement gate asks for a policy document, party checks and signed service agreements |
| Complete the deal                          | Missing; the deal path adds it (ADR 0013)                                                        |
| Butler                                     | Drafts for staff only; no action, no public answers                                              |
| Live                                       | Legacy site in production; staging behind Access and behind `main`; no production deploy path    |

## Order of work

1. **Publish in one decision** (ADR 0012), with a bulk carry-over of the listings that are live on
   the legacy site. Without it the public site stays empty.
2. **Deal path to completion** (ADR 0013): one shared path for client and broker, closed by a
   recorded completion.
3. **People hear about it**: e-mail to the client when a viewing, a proposal or a deal step
   changes; one template family, every enabled language.
4. **Butler answers and acts** at the levels in ADR 0011 §5: public answers from approved content,
   instant acknowledgement of inquiries, reminders. Each task ships with its evaluation set and the
   brand switch.
5. **Staging follows `main`** with the imported inventory, so the agency can use the product
   every day before the cutover.
6. **Production launch** on the five launch checks, then the cutover on the owner's go.
7. **Lighter agreement gate**: identity and contract checks become steps on the deal path a brand
   can require, not a wall in front of "terms agreed".
8. **Second brand**: deploy from the tenant profile, test the business model in ADR 0011 §8.

Each item ships as small pull requests that pass `ci / gate`. A slice is done when a person can do
the thing on staging, not when the code merges.

## Launch checks

| Check      | What is still needed                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Works      | A smoke run against the deployed build; the staff queue and command response times within a second                                                                        |
| Data safe  | A production database with backups; one restore into a scratch database; the legacy archive stored off-site                                                               |
| Found      | The 457 recorded URL decisions served by the gateway on the launch build                                                                                                  |
| Lawful     | Privacy notice, consent behaviour and retention policy published ([retention](delivery/retention-policy.md), [EU rules](delivery/compliance-eu27.md), ADRs 0008 and 0009) |
| Reversible | A staging rehearsal of the route change and of the return to the legacy origin                                                                                            |

## What only the owner can supply

| Input                                                                   | Until then                  |
| ----------------------------------------------------------------------- | --------------------------- |
| Legal entity and contact details for the notices                        | Notices stay unpublished    |
| Production accounts and spend: database, mail domain, model provider    | Staging only                |
| DNS for the client and staff hosts, the reply subdomain and the cutover | No cutover                  |
| Which listings are current, and the go to publish them                  | The public site stays empty |
| The people who sign in as brokers                                       | One staging manager         |
| The production go                                                       | No launch                   |

## Frozen

See ADR 0011 §7. Do not extend the release-evidence code, the two-key cutover adapter, the offline
archive coordinator, `docs/acceptance.md` or the delivery narratives.
