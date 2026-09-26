# Implementation deviations from the final architecture

Status: accepted for the rebuild on 2026-09-26 · Supersedes nothing in `docs/architecture.md`
except the rows below. Any further deviation needs its own ADR.

`docs/architecture.md` (final architecture v1.0, 24 Sep 2026) is the product authority. Its
domain contracts, workflows, state machines, publication rules, security rules, acceptance
scenarios (AT01–AT68) and release gates (R00–R12) apply unchanged. The rebuild already has
a working foundation (slice S1) built before that document existed. Where the foundation
meets the architecture's contract with a different component, we keep the component and
record why here. Each row states the obligation that still has to be proved.

| Architecture decision | Implementation | Why | Obligation that remains |
|---|---|---|---|
| D01/D02 Payload for persistence, admin and draft primitives | No Payload. Drizzle ORM over PostgreSQL; domain modules own every transition; the staff workspace is the admin | D02 already makes modules the authority and §7.2 forbids Payload drafts as a gate; §5 forbids generated CRUD as a parallel write path. Removing Payload removes that bypass surface entirely (AT26) and the legacy advisory GHSA-jg8r-5jh2-v2xj | Every §5 module interface, the mutation envelope (§5.1) and one OpenAPI/transport schema (§19.3) |
| D05 Payload jobs as the only queue | pg-boss on the same PostgreSQL, one dedicated worker process | Same properties D05 asks for: one queue, database-backed, transactional enqueue with the business change, lanes, leases | §15 lanes, leases, singleton schedules, outbox + external-action ledger, AT50–AT51 |
| D08 WorkOS AuthKit, staff TOTP MFA | First-party passwordless authentication: staff sign in with a passkey (WebAuthn, phishing-resistant, stronger than TOTP) and must enrol two; e-mail link only for first enrolment and audited recovery. Clients sign in by e-mail link with an explicit confirm POST, passkey optional | No passwords or OTP secrets are stored, so the "homegrown password/MFA" risk D08 rejects does not arise; no identity-provider account is needed to operate; separate staff and client contexts are enforced by host-only cookies and separate WebAuthn relying parties | §8.1 session limits (staff 12 h / 30 min idle, client 7 d / 24 h), reauthentication windows (5 min staff sensitive, 15 min client documents), §8.3 invitations, AT36–AT39, an independent security review before R08 |
| D11 MapTiler tiles | MapLibre with a self-hosted Protomaps PMTiles extract (Bulgaria + Greece) served from the public R2 bucket through the gateway | No third-party tile request from visitors' browsers, no API key to leak or rotate, negligible cost | AT06 (list works without the map), attribution for OpenStreetMap data, approximate-point rules (§4.2) |
| §11.3 CSS Modules | Tailwind CSS v4 over the same CSS custom-property semantic tokens | One styling system for all three surfaces, as §11.3 requires; Tailwind v4 compiles to plain CSS from the tokens | §11.3 palette, type, spacing, breakpoints and states |
| §2 PostgreSQL 18 | PostgreSQL 18 from slice S1b (was 17) | Adopted, not a deviation | Driver and migration qualification on 18 |

Everything else in §2 is adopted as written: Next.js/React/TypeScript modular application
(D01 minus Payload), PostgreSQL search (D04), DigitalOcean App Platform Frankfurt with HA
Managed PostgreSQL (D06), Cloudflare gateway and EU-jurisdiction R2 (D07), Resend (D09),
application-owned calendar and ICS (D10), Hermes as draft-only bounded tasks behind one
adapter, OpenAI Responses first (D12), shared tokens with isolated contexts (D13), release
manifest and machine-evaluated gates (D14), Better Stack monitoring (D15) and the
independent S3 recovery archive (D16). Provider accounts, plans and DNS are operator inputs
(§21.4); the code is written against the chosen providers and tested with local fakes until
those accounts exist.
