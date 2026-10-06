# Figma page 14 coverage evidence

This is a read-only inventory of [Responsive & localization](https://www.figma.com/design/PxfBJ2tdrj9A923fpgqzDn?node-id=38-4). It supplies frame identities for the sole verdict in `docs/acceptance.md`; it does not accept design, copy or rendered implementation. Live Figma metadata and eight official screenshots were inspected. Layer names sometimes retain their source language, so screenshots, not layer names, determine visible copy.

## Standalone responsive specimens

| Specimen | Node | Frame size |
| --- | --- | --- |
| P02 tablet, BG | `40:5` | 768 × 3171 |
| C05 tablet, BG | `40:95` | 768 × 1743 |
| O01 laptop, BG | `40:157` | 1024 × 1198 |
| Agency Today dark | `40:364` | 1440 × 1072 |
| Hebrew RTL client sketch | `56:114` | 390 × 980 |
| Offboarding narrow stress | `327:17695` | 320 × 900 |

## Named Hebrew base screens

The 27 sections contain 52 frames. P11 and P12 have desktop frames only. These are base screens, not evidence that their validation, failure, interruption, recovery or accessibility states are covered.

| Screen | Desktop 1440 | Mobile 390 |
| --- | --- | --- |
| P01 | `606:48543` | `606:48647` |
| P02 | `606:51913` | `606:52012` |
| P03 | `606:52539` | `606:52640` |
| P04 | `606:54967` | `606:55038` |
| P05 | `606:52736` | `606:52840` |
| P06 | `606:54190` | `606:54246` |
| P11 | `606:45139` | — |
| P12 | `606:45611` | — |
| P13 | `606:54800` | `606:54882` |
| P15 | `606:55101` | `606:55177` |
| C01 | `606:44594` | `606:44620` |
| C02 | `606:45074` | `606:45106` |
| C03 | `606:48131` | `606:48266` |
| C04 | `606:45235` | `606:45377` |
| C05 | `606:44647` | `606:44776` |
| C06 | `606:52934` | `606:53048` |
| C07 | `606:53484` | `606:53581` |
| C08 | `606:52103` | `606:52262` |
| C09 | `606:52361` | `606:52480` |
| C10 | `606:51677` | `606:51825` |
| C11 | `606:53272` | `606:53408` |
| C12 | `606:53102` | `606:53217` |
| C13 | `606:44845` | `606:44989` |
| C14 | `606:53618` | `606:53725` |
| C16 | `606:51491` | `606:51614` |
| C17 | `606:48341` | `606:48472` |
| C18 | `606:45462` | `606:45566` |

## Open design and verification gaps

- The named Hebrew frames cover 27 of 41 active public/client screen IDs. P07–P10, P14 and P16–P24 have no named Hebrew specimen here. P14 may reuse C06 under `docs/ux-spec.md` §P14, but its authentication handoff and arrangement states still need an explicit mapping. C15 is retired.
- P11 and P12 lack mobile Hebrew frames for inquiry entry, validation, receipt reconciliation and unknown-outcome handling. The separate 390 px client sketch does not fill those contracts.
- In the 1024 px O01 frame `40:157`, Butler action `40:344` extends to x=1062 and language control `40:236` extends to x=1047, visibly beyond the frame. Its 226 px supporting pane is narrower than the UX spec's 320–360 px inspector guidance. This is a Figma design issue, not a measured implementation defect.
- P13 Hebrew mobile `606:54882` visibly has a preferred date/time and contact field, but does not explicitly show the timezone, contact-language choice, requested format or practical-access note required by `docs/ux-spec.md` §P13. Additional state/component mappings elsewhere were not established by this audit.
- Page 14 has no named Hebrew variants for the applicable validation/recovery combinations in C01/C02, interrupted/rejected C09 uploads, superseded/unknown C10 proposals or revoked-access combinations. Page-09 shared states must be mapped to those journeys.
- The 320 px offboarding frame is a single stress specimen with 20 px gutters, not complete narrow-width coverage. No 414 px specimen or named EN/RU/DE/NL/EL locale set was identified on this page. Build a viewport/locale task matrix before claiming responsive parity.
- `docs/ux-spec.md` states release appearance is light, while page 14 contains dark Agency Today `40:364`. Reconcile whether this is a stress specimen or a released dark-mode obligation; do not infer a whole dark theme from one frame.

Human language approval, bidirectional text, keyboard order, real interactions, exact-candidate rendered comparisons and release behavior remain unverified.
