# OpenNext qualification for the complete candidate

The owner prefers Workers/OpenNext and permits Containers when a concrete runtime blocker
prevents the complete candidate from working. These checks are local qualification, not a
provider deployment, an exact-release parity PASS or production acceptance.

On 1 October 2026, Next 16.3.6 and OpenNext 1.20.7 built successfully with Wrangler 4.143.0.
The original pg-cloudflare error was repaired: Node tracing includes only the Node empty
export by default; the Worker needs the workerd export. The Cloudflare build now explicitly
traces that package's small dist/esm runtime directories. Wrangler dry-run also passed.

The complete candidate remains **blocked on the Worker runtime**. Importing its pinned
Sharp 0.35.4 in workerd fails in `createRequire` initialization before the Worker can start.
The native media/document intake calls Sharp in `src/server/files/inspect.ts`; the staff
media/document and client requested-document routes depend on that validation. The queue
also uses Sharp for safe derivatives. The protections must survive migration: signatures,
bounded full decode, dimensions, single-page images and metadata removal. A browser MIME
claim is not a replacement.

The qualification-only OpenNext configuration is `gateway/wrangler.opennext-qualification.jsonc`.
`npm run build:cloudflare` and `npm run preview:cloudflare` select it explicitly; neither
is a release deployment command. The default gateway config remains the local map fixture.

Reproduce the isolated library boundary after `npm ci`:

```js
// Temporary local-only Worker; not a deploy entry point.
import sharp from "sharp";
export default {
  async fetch() {
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL7sAAAAASUVORK5CYII=",
      "base64",
    );
    return Response.json(await sharp(pixel, {
      limitInputPixels: 40_000_000, failOn: "warning", pages: 1,
    }).metadata());
  },
};
```

Run `wrangler dev --local` with `compatibility_date: "2026-10-01"`, `nodejs_compat`,
`workers_dev: false`, `preview_urls: false` and no routes. The pinned toolchain reports the
invalid file URL/path in `createRequire` and that the Worker runtime failed to start.

The captured result and SHA-256-pinned logs are in
`/Users/ivan/Code/.artifacts/ms-realty/recovery/20261001/cloudflare-contract/opennext-qualification.json`.
The separate raw OpenNext preview intentionally had an unconnected diagnostic database:
its recovery startup rejection is a fixture dependency failure, not a claimed runtime blocker.

The deployment candidate therefore uses the **owner-authorized Cloudflare Containers
fallback**, keeping web, pg-boss and migrations on one immutable image digest. OpenNext
tooling is retained for reproducible qualification, not silently selected for deployment.
A future Worker web/image-processing split needs its own architecture, security and
complete journey proof. Do not rebuild a different runtime at production promotion.

Runtime references: [OpenNext compatibility](https://opennext.js.org/cloudflare),
[Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/),
and the pinned local Next guide `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`.
