import { renderLegacyUploadResponse } from "../../../_ms-realty/render.js";

// Legacy image URLs (/wp-content/uploads/YYYY/MM/file.jpg) carry 13 years of
// image-search equity and are referenced by every listing gallery. After
// cutover the old WordPress origin no longer answers, so the mirrored bytes are
// served here at the original paths.
// The handler reads the request Host to pick the right mirrored domain, which
// is a dynamic API; the immutable cache-control header is what makes the CDN
// hold these long-term.
export const dynamic = "force-dynamic";

export async function GET(request) {
  return renderLegacyUploadResponse({
    pathname: new URL(request.url).pathname,
    host: request.headers.get("x-forwarded-host") || request.headers.get("host"),
  });
}
