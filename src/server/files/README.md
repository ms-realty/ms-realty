# File intake and review

`config.ts` constructs the real storage and ClamAV adapters. There is no runtime switch that marks a scan clean. Test adapters are passed explicitly by unit/integration tests.

## Local development

Set `FILE_STORAGE=local` and an absolute `FILE_STORAGE_ROOT` outside the web root. Local storage is accepted only when all three configured origins are loopback hosts. Keep the web process and worker on the same storage root.

Run a dedicated ClamAV daemon on a private interface with `TZ=UTC`, current freshclam signatures, and 6 GB available memory. A 4 GB container was observed to lose its daemon to an OOM kill during local acceptance while the container itself remained running. For example, on an ARM Mac using the tested AMD64 image:

```sh
docker run --detach --platform linux/amd64 --name msr-local-clamav \
  --memory=6g --memory-swap=6g --publish 127.0.0.1:53317:3310 --env TZ=UTC \
  clamav/clamav@sha256:0e31ce089574268aefa0b543767d66b70240ab51ed49eec53e07f18d5629d817
```

Set `CLAMAV_HOST=127.0.0.1` and `CLAMAV_PORT=53317` for both application and worker. Never expose ClamD's unauthenticated TCP port to the internet. Check `clamdscan --version` after startup: freshclam may finish before ClamD starts, leaving the running daemon on older signatures until `clamdscan --reload` or its self-check runs. `CLAMAV_MAX_SIGNATURE_AGE_HOURS` defaults to 48. Stale signatures, connection failures, timeouts and unknown replies keep files quarantined.

Do not use container-running state as readiness. Wait for its health check, then probe the actual host port through the application adapter (this tests signature freshness and a byte scan):

```sh
node --conditions=react-server --import tsx --input-type=module -e '
import { ClamAvScanner } from "./src/server/files/scan.ts";
const result = await new ClamAvScanner({host:"127.0.0.1",port:53317,maxSignatureAgeHours:48,timeoutMs:4000}).scan(Buffer.from("MS Realty readiness probe"));
console.log(result);
if (result.state !== "clean") process.exitCode = 1;
'
```

The worker consumes `files.process`. The explicit loopback test-outbox environment also starts workers in the web process. Normal environments need the separate worker command.

## Protected staging without a scanner

`STAGING=true FILE_SCAN_MODE=staging-unverified` explicitly receives and seals uploads without
claiming a scan. The worker records `file.scan.deferred`, returns `unverified` and keeps the
file quarantined: no scan timestamp/version, derivative, download, review or publication grant.
It does not repeatedly retry a deliberately absent scanner. This profile is accepted only for
`protected_partial_preview`; it cannot qualify complete parity or production scanning. The
default remains `FILE_SCAN_MODE=clamav`; the unverified profile fails without explicit staging.

## R2

Set `FILE_STORAGE=r2` with existing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`. The adapter addresses the EU-jurisdiction S3 endpoint. The bucket must remain private with no public/custom-domain access. Only the application's manifest-authorized derivative route may serve public images. Account permissions, bucket jurisdiction, availability and recovery need actual operator/provider validation; local tests do not prove them.

The existing staging buckets have default jurisdiction with an EEUR location hint, which is
not an EU jurisdiction guarantee. `STAGING=true R2_JURISDICTION=default` selects their standard
S3 endpoint. It fails without explicit staging; the production default remains EU.

Uploads write `staging/` only. Finalization copies measured bytes to a new `sealed/` key and verifies the stored digest. Immutable writes use local exclusive creation or R2 conditional creation. A scan binds to the exact sealed digest. Derivatives use per-asset content-addressed keys and strip image metadata. Image decoding is limited to 40 million pixels; raster uploads are at most 25 MB and documents at most 20 MB. Supported files are JPEG, PNG, WebP and PDF (documents only). PDFs are attachments under a sandbox policy, never public derivatives.

Storage lifecycle/orphan cleanup must preserve retained evidence and legal holds. This module does not automatically delete stored objects or define retention periods.

## Authorization and human work

Staff media requires `media.manage`; rights/privacy approval additionally needs recent authentication. Documents require current, recent identity and explicit document capability. Creating/reviewing documents requires `document.review`, assigned through the audited access-management page; roles are not widened implicitly. Case participation never grants another person's documents. Downloads authorize every request/range, recheck expiry and verify actual bytes before returning a no-store attachment. Public derivatives require a current eligible website manifest binding the same original and derivative digests.

A clean scan is separate from human rights/privacy review and publication. Document review is for the recorded purpose and version; it never supplies professional or legal validation. Seller authority and instructions use `seller_authority` and `seller_instruction` purposes respectively.

The staff route `/{locale}/cases/{caseId}/documents` accepts internal `service_agreement`, `express_start`, `case_check`, `process_policy` and `case_completion` evidence. Each read, upload, review and download additionally requires current `case.read` and `compliance.review` for that case. A direct client document grant or an incorrectly changed audience cannot expose these protected purposes. Agency outcome evidence does not assert legal completion. The process workbench at `/{locale}/cases/{caseId}/process` records the separately reviewed policy and case use of those exact current document versions.

Native forms support retrying an incomplete upload and requesting another scan. Scanner failures stay private and visible. There is no public original URL or durable signed private-download URL.

Save confirmations resolve an actual completed upload or succeeded operation for the current actor. A `saved` query parameter by itself is not evidence of a mutation.

## Verification

```sh
TEST_DATABASE_URL=postgres://postgres:pg@127.0.0.1:55474/postgres \
  REAL_CLAMAV_PORT=53317 npx vitest run src/server/files --maxWorkers=2
```

The `REAL_CLAMAV_PORT` test is skipped when not explicitly requested. When supplied, it checks actual EICAR detection, sealed originals, decoded derivative hashes, human media review, private document purpose review and downloads. The remaining tests inject failures and cover isolation, revoked/expired grants, mismatched objects and manifest withdrawal.

`e2e/identity.spec.ts` exercises real enrollment and native file forms. Its normal run expects an unavailable scanner. `E2E_REAL_SCAN=1 CLAMAV_PORT=53317` selects success assertions against a real daemon; this variable is read only by the test, never by application scanning code. These are local workflow proofs, not launch or hosted-provider evidence.

`e2e/publication-flow.spec.ts` joins native listing creation, upload/seal/actual scan, media and seller-document human reviews, BG publication, visible approved image bytes and withdrawal. It requires `CLAMAV_PORT=53317`; the browser harness creates its own database and storage root. The entry fixture contains only an authenticated synthetic operator and an inquiry-linked synthetic seller. The uploaded authority and agreement PDFs explicitly identify themselves as synthetic and never constitute legal or launch evidence.

References: [ClamD protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [official Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html), [R2 data location](https://developers.cloudflare.com/r2/reference/data-location/).
