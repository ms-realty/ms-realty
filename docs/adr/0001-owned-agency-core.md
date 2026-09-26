# Own one integrated agency core

Status: final design decision for the accompanying development specification; not an implementation or procurement approval.

MS Realty will own one modular application and one authoritative PostgreSQL data model for Property, Listing, Case, Interest, approvals, and agency work. Payload supplies persistence/admin primitives; managed providers supply infrastructure, identity, email, and model inference. No external CRM or property-platform product is the canonical launch backend.

## Considered options

- A property-native SaaS backend could reduce implementation work, but the reviewed candidates have not demonstrated MS Realty's exact multilingual approval, publication-version, portal, relationship, and export requirements.
- A custom catalogue plus generic CRM creates a second operational workspace and permanent synchronization of buyer–listing relationships and authority-sensitive changes.
- A bespoke general CRM or property-management platform creates unnecessary scope.

## Consequences

The product must implement focused agency Case and Interest workflows, including their permissions and recovery behavior. It must not expand into configurable CRM software, accounting, payment custody, or short-stay booking. The earlier buy-first and split-CRM recommendations are superseded for this development baseline. A later change of canonical backend requires a versioned architecture decision, migration plan, and revalidation of the affected release gates.
