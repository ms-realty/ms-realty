import { CANONICAL_PUBLIC_ORIGIN, FALLBACK_PUBLIC_ORIGIN } from "./public-origin.mjs";

const IMAGE_WIDTHS = [384, 640, 750, 828, 1080, 1200, 1920];
const MIRRORED_PHOTO = /^\/media\/(?:makler-realty\.com|makler-realty\.ru)\/wp-content\/uploads\/.+\.(?:avif|jpe?g|png|webp)$/i;

export function publicImageOptimizerSource(src) {
  try {
    const url = new URL(src, CANONICAL_PUBLIC_ORIGIN);
    if (url.username || url.password || url.port || url.search || url.hash || url.protocol !== "https:") return null;
    if (String(src).startsWith("/hero/") && /^\/hero\/[^/]+\.(?:avif|jpe?g|png|webp)$/i.test(url.pathname)) return url.pathname;
    if (![CANONICAL_PUBLIC_ORIGIN, FALLBACK_PUBLIC_ORIGIN].includes(url.origin) || !MIRRORED_PHOTO.test(url.pathname)) return null;
    // The mirror is served by the Worker, outside Next's internal router.
    // Fetch its canonical public URL while retaining the original img src.
    return `${CANONICAL_PUBLIC_ORIGIN}${url.pathname}`;
  } catch {
    return null;
  }
}

export function responsivePublicImageProps(src, sizes, { widths = IMAGE_WIDTHS, originalWidth } = {}) {
  const source = publicImageOptimizerSource(src);
  if (!source || !sizes) return {};
  const candidates = widths.map((width) => `/_next/image?url=${encodeURIComponent(source)}&w=${width}&q=75 ${width}w`);
  // The existing large AVIF can be smaller than a same-size WebP. Keep that
  // measured rendition at its original resolution instead of recompressing it.
  if (originalWidth) candidates.push(`${src} ${originalWidth}w`);
  return { srcSet: candidates.join(", "), sizes };
}
