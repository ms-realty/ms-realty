# Application transport contract

`openapi.json` is OpenAPI 3.1, versioned by `transportVersion` in
`src/server/transport/openapi.ts`. Generate it with `npm run openapi:generate`; verify it without
writing with `npm run openapi:generate -- --check`. Runtime request schemas, response types,
error serialization and the registry use the same application/domain implementations.

The current artifact describes the implemented API operations:

| Method and path | Host / authorization | Contract |
|---|---|---|
| `GET /api/health` | Every host / public | Minimal process response; never readiness |
| `GET /api/ops/readiness` | Staff / session + `report.read` | Exact deployed identity, snapshot expiry and R00–R12 summary; no-store |
| `GET /api/inquiries` | Public / public | Issue a submission key and receipt session |
| `POST /api/inquiries` | Public / public | Payload-bound idempotency; durable receipt; JSON or form redirect |
| `GET /api/inquiries/{submission}` | Public / originating receipt session | Reconcile acceptance without exposing contact details or message |
| `PUT /api/files/uploads/{id}` | Client or staff / current session + scoped upload token | Raw bytes; same-origin, current file-specific authority and immutable evidence |
| `GET /api/files/private/{kind}/{id}` | Client or staff / current file-specific authority | Authenticated binary download/range; private/no-store; no object keys or signed original URLs |
| `GET /api/media/{id}/{digest}` | Public / current approved publication | Exact eligible reviewed derivative; stale or withdrawn presentation is unavailable |
| `POST /api/providers/resend/webhook` | Staff host / verified provider signature | Deduplicated durable provider ingress; acceptance does not imply customer receipt |

Every operation declares its authorization class, host, idempotency, revision and pagination
contract, response/error status, and representative examples. `x-acceptance` identifies covered
architecture scenarios; it is a traceability claim, not proof that a release passed them.
`x-idempotency: submission_key` means same key plus same payload returns the original receipt;
reusing the key for a different payload is a conflict. Existing operations require no expected
revision and do not paginate; future revision/cursor endpoints must add those schemas when
implemented. Common JSON errors carry code, message, field errors where applicable, retryability,
correlation ID, outcome, and authorized current state on revision conflicts.

Registry tests compare registered method/path pairs to actual route files and enforce host
isolation, examples and generated-artifact consistency. Unimplemented groups in architecture
§19.3 are not advertised as working APIs. Client and staff server actions remain ordinary shared
domain command callers; this artifact does not introduce a parallel CRUD/write implementation.
Localized native identity forms, private calendar downloads and owner preview image reads are
documented with their owning modules. In particular, client
`/{locale}/properties/{caseId}/preview/media/{assetId}?listing={reference}&digest={previewHash}`
rechecks the exact preview, active owner authority and reviewed derivative bytes on every read.
It is private/no-store and cannot be used as a public media URL.
The local `/api/test-outbox` developer helper is explicitly inventoried separately and excluded
from OpenAPI; it requires the test-outbox flag and loopback client/staff origins. It is not a
deployed API. Adding another local helper requires an explicit inventory entry, not a blanket
route-coverage exemption.

See `release/README.md` for evaluation commands, signed evidence, runtime pins and expiry behavior.
A 200 response from health or readiness is not a release approval; inspect the readiness verdict,
snapshot state and gate blockers.
