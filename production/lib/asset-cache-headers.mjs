// Cache lifetimes for the static trees under public/.
//
// Two servers answer these paths — Next.js (via next.config.mjs `headers()`,
// which is what the deployed container actually uses for public/) and the Node
// app in http.mjs — and they had drifted apart: Node called the hero images
// immutable for a year while Next served them `max-age=0`, so the
// largest-contentful-paint image was revalidated on every navigation. Both
// import these constants so the two can no longer disagree.

// /vendor URLs are content-addressed: the filename carries a hash, or the page
// prints one in `?v=`. A given URL's bytes therefore never change, which is the
// only thing that makes `immutable` safe.
export const IMMUTABLE_ASSET_CACHE = "public, max-age=31536000, immutable";

// The hero photographs are named for their crop width, not their contents, so
// replacing one reuses its URL. `immutable` and a year would pin the old bytes
// in every browser that had seen them with no way to reach them, so these get a
// long but finite life instead: no revalidation round trip for a week, and a
// day of background refresh after that.
export const HERO_ASSET_CACHE = "public, max-age=604800, stale-while-revalidate=86400";
