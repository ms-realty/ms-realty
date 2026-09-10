# Loading performance — 10 September 2026

The eight live Lighthouse runs before this change used Chrome 152 and Lighthouse
13.4.1 with the standard mobile/desktop presets and fresh browser storage.
The tested release was `52b9ebeaa31ebbace4d1e6a143319c30523cf259`.

| Page | Mobile performance | Desktop performance | Mobile LCP |
|---|---:|---:|---:|
| BG home | 90 | 93 | 3.34 s |
| BG search | 80 | 82 | 4.67 s |
| MS-00907 | 77 | 99 | 4.04 s |
| BG contact | 77 | 99 | 4.34 s |

All eight accessibility scores were 100 and none had load warnings. These are
lab observations, not manual accessibility or field interaction measurements.
The source reports are retained in the completion/performance-before-images
artifact directory for this task.

Payload's installed `withPayload` implementation adds `Critical-CH` globally.
Both the direct production container and public edge returned it. Chrome's
trace showed the same document being requested again before rendering.
`Critical-CH` requires a browser to retry a request that omitted the hint.
[MDN header reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Critical-CH).
The website and custom CRM already choose their theme before paint, using
CSS and the storage bootstrap. The critical hint is now limited to the native
Payload admin; its normal hint negotiation and cache variation remain.

Next's installed image optimizer supports constrained remote sources, browser
format negotiation and persistent derivative caching. This change uses its
default WebP/quality settings and the canonical public media allowlist.
[Next Image reference](https://nextjs.org/docs/app/api-reference/components/image).
Listing source records and original image URLs remain unchanged. The native
browser selects the rendition through `srcset` and `sizes`; the gallery viewer
keeps full originals. A failed derivative retries the preserved original.

Local optimizer measurements for the first live search photo were 86,629 bytes
for the original JPEG, 22,748 bytes at 384 px, 51,084 at 640 px and 59,544 at
750 px as WebP. Those derivatives were cache hits; their 3–22 ms local fetches
are not production latency claims. The generated public script shrank from
177,144 to 104,961 bytes using the already installed esbuild minifier. Both
public and admin cache hashes now identify their actual minified bytes.

Validation: header regression failed before the change and passes after it;
18 focused config/image/HTML/asset checks pass. Twelve browser admin interactions
pass with the minified bundle, and the isolated browser verifies image-error
recovery. Live Lighthouse and release verification must be repeated after
deployment before the performance gate can close.

## Live verification and follow-up

Release `52d6ed900814d3186210aa02a8858c5aa622f058` was verified on both hosts.
Fresh Lighthouse scores (mobile/desktop): home 93/95, search 77/81,
listing 82/96, contact 94/99. All accessibility scores remain 100 with no
load warnings. Search and the mobile listing page still fail the target.

Authenticated origin requests exposed an uncovered production configuration:
the retained admin volume sets `runtimeDataDurableOnly=false`. That path rebuilt
the edited seed on every request, so Listings and Hermes still took roughly two
seconds. The shared file cache now accepts an ordered list of dependencies;
the derived admin seed is reused until its seed, edits, uploads or reviews
change. The existing projection TTL, transaction reads and save invalidation
remain intact. The regression fails before the fix and passes in both modes,
including newly created ledgers, later edits and explicit invalidation.

The baseline trace also attributes about 800 ms of mobile render blocking to
Google's font stylesheet. Production now serves the same three font families
as pinned variable WOFF2 subsets on its own origin. `unicode-range` requests
only the required script, while `font-display: swap` keeps text visible.
This follows the browser guidance on reducing connection setup and preserving
subsetting when moving fonts to the site's own CDN.
[Chrome font guidance](https://web.dev/articles/font-best-practices).
The portable design previews retain their existing Google entry points.

The font files came from the Google Fonts CSS API on 10 September 2026:
Commissioner v24 (weights 400–700), Sofia Sans Semi Condensed v8 (600–800),
and Noto Sans Hebrew v50 (400–800). The CSS includes the original Unicode
ranges. Content hashes identify every font filename and the stylesheet URL.
Their OFL licenses are retained in `public/vendor/ms-realty-fonts-LICENSE.txt`.
The source request used the same families with variable weight ranges and
`display=swap`; no build or runtime download is required.

The local browser checks cover all seven public locales, Hebrew RTL and admin
connections/sign-in. They verify font loading without a Google font request,
failed font, page exception or mobile overflow. Standalone QA lacks Next's
image optimizer; its image requests exercise the already tested original-image
fallback. These font checks are separate from live performance proof, which
must be repeated after the follow-up release.
