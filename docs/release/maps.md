# Public map delivery

The optional map uses pinned MapLibre GL 6.11.2, PMTiles 4.5.0 and Protomaps basemap styles 5.7.2. Search and property detail share the same map. Opening it loads the renderer; the server-rendered results and filters work independently. No geolocation request or third-party tile request is made. This implements ADR 0002's self-hosted Protomaps decision.

## Publication and privacy

A new publication manifest freezes an allowed geography-area centre. Region precision permits a district centre only. Settlement, neighbourhood, street and exact permissions currently receive a settlement centre, or a coarser district fallback. No private property latitude, longitude or street address is used. Missing/invalid geography coordinates mean no marker. Old manifests are not enriched from mutable geography records. The approved current-publication projection remains the sole source for markers; withdrawal removes the item on the next read.

The map covers the current result page, not the entire search count. Listings sharing a centre appear in one marker whose popup links to every listing. Copy explicitly distinguishes an area centre from a property address. The list remains the task alternative; full accessible geographic exploration and live atlas accuracy are separate acceptance checks.

## Asset contract

The application and gateway receive the same `MAP_RELEASE_ID`, a lowercase 64-character SHA-256 release identifier. Unset application configuration disables the optional map. Do not set it before the associated asset release has been prepared, verified and approved.

Use a dedicated **public map-only** R2 bucket bound as `MAP_ASSETS`. Never bind the private document/media bucket. Each immutable release prefix contains:

- `basemap.pmtiles`: a valid Protomaps-compatible vector archive covering the accepted BG/GR operating area.
- `sprites/light.json`, `sprites/light.png`, and their `light@2x` equivalents.
- `fonts/{fontstack}/{range}.pbf`: glyph ranges for the pinned style's Noto Sans Regular, Medium and Italic stacks and the supported map label scripts.

Record file sizes and SHA-256 hashes, source/version/licence/attribution, coverage bounds, style version and acquisition date in a release manifest. Hash the final manifest to obtain the release identifier. Upload under that prefix, verify read-back hashes and retain the approved manifest with the release evidence. A changed byte creates a new release prefix; never overwrite an existing release. This process has **not** been performed for a production BG/GR atlas in this increment.

The gateway serves only its configured prefix on the public host. Closed single byte ranges are bounded to 8 MiB; full PMTiles downloads, other releases, private paths and writes are rejected. Response bytes stream with an ETag and `Content-Range`. Conditional reads fence a replacement between metadata and body reads. Cached assets contain no customer or property-specific data.

`gateway/wrangler.jsonc` is explicitly a local-development configuration with a fixture bucket name and no public routes. It is not a deployable agency configuration. Provisioned release configuration must supply the existing reviewed host/origin/route artifact values and origin secret, plus the agency-owned map bucket and release ID. No provider mutation, credentials or live bucket approval are implied by this file.

Regenerate scoped Worker declarations with `node scripts/gateway-types.mjs` (pinned Wrangler 4.143.0). The generator scopes runtime declarations to one module so Cloudflare types do not replace the Next app's DOM/Node types. The generated declaration file is excluded from formatting, not from TypeScript validation.

`npm run build` and `npm run dev` generate same-origin worker assets from the pinned MapLibre package using `scripts/map-runtime.mjs`. Direct invocation of `next` must first run that script. The worker and its shared module use `worker-src 'self'`; there is no blob-worker or third-party CSP exception.

## Verification boundaries

`e2e/support/map-fixture.mjs` generates a small synthetic PMTiles v3 archive and synthetic sprites solely for browser verification. It tests the actual reader, byte-range HTTP response, WebGL renderer and marker interaction, but proves neither BG/GR coverage nor real map label glyphs. Its directory is ignored by Git and excluded from Docker input. Public requests at the origin are restricted to the explicitly configured release, and private hosts reject map assets.

Before release, additionally verify the actual gateway/R2 binding and approved atlas on all supported browsers and locales: range/caching headers, remote read-back checksums, glyphs, sprites, attribution, coverage and loading/failure recovery. Test keyboard, mobile and Hebrew direction; review desktop/mobile screenshots and network logs. Obtain source/usage and provider acceptance under the normal release gates. A local fixture or successful CI run cannot satisfy those live checks.

Primary implementation references: [PMTiles MapLibre integration](https://docs.protomaps.com/pmtiles/maplibre), [Protomaps styles and self-hosted assets](https://docs.protomaps.com/basemaps/maplibre), [Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

## Local candidate preparation and browser qualification

`node scripts/map-release.mjs seal ASSET_DIR SOURCE.json` creates a write-once
`release-manifest.json` containing the supplied source/coverage metadata and every file's
size and SHA-256. Its SHA-256 is the release ID. `verify ASSET_DIR` checks the complete
inventory, rejects changed/missing/additional files and symlinks, and prints that ID.
Required files include all sprites, licence receipts, and Latin, Greek, Cyrillic and
Hebrew glyph ranges in each of the three style fonts. This verifies bytes and required
paths; it does not certify glyph contents, map accuracy, legal approval or live hosting.
Run `pmtiles verify` and record the archive header before sealing. Keep the source
metadata truthful: a regional extract cannot verify the upstream whole-planet BLAKE3 hash.

For a sealed local candidate, run:

```sh
TEST_DATABASE_URL=postgres://... E2E_PORT=3169 NEXT_DIST_DIR=.next-real-atlas \
E2E_MAP_ASSETS_DIR=/absolute/path/to/sealed-candidate \
npx playwright test e2e/map.spec.ts --workers=1
```

The browser harness verifies the manifest and copied bytes, selects its hash as
`MAP_RELEASE_ID`, and uses only a disposable database with synthetic approved listings.
The optional qualification test checks Sandanski and Thessaloniki in seven locales on
Chromium desktop/mobile and WebKit mobile, including real font/sprite requests, same-origin
network traffic, failure/retry and no-JavaScript list fallback. It saves screenshots for
visual review. Without `E2E_MAP_ASSETS_DIR`, CI uses the small synthetic archive and
explicitly skips real-atlas qualification. Never interpret that skip as geographic proof.
