export const TOUR_PROVIDER = "photo-sphere-viewer";

function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value);
}

function imageUrlFromMediaItem(item) {
  if (!httpsUrl(item?.url)) return null;

  try {
    const parsed = new URL(item.url);
    const src = parsed.searchParams.get("src");
    const candidate = src && httpsUrl(src) ? src : item.url;
    if (!/\/wp-content\/uploads\/\d{4}\/\d{2}\//.test(candidate)) return null;
    if (!/\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

export function galleryFallback(media = []) {
  const seen = new Set();
  return media
    .map((item) => ({ ...item, url: imageUrlFromMediaItem(item) }))
    .filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .slice(0, 6)
    .map((item) => ({
      url: item.url,
      alt: item.alt || "Property photo",
    }));
}

export function createTourField({ listingId, panoramaUrl = null, thumbnailUrl = null, accessibilityCaption = "", isPublic = false, media = [] }) {
  const fallbackGallery = galleryFallback(media);
  if (panoramaUrl && !httpsUrl(panoramaUrl)) throw new Error("panorama_url must be an HTTPS URL");
  if (thumbnailUrl && !httpsUrl(thumbnailUrl)) throw new Error("thumbnail_url must be an HTTPS URL");
  if (isPublic && (!panoramaUrl || !accessibilityCaption || !fallbackGallery.length)) {
    throw new Error("Public 360 tours require panorama_url, accessibility_caption, and fallback gallery");
  }

  return {
    provider: TOUR_PROVIDER,
    listing_id: listingId,
    panorama_url: panoramaUrl,
    thumbnail_url: thumbnailUrl,
    hotspots: [],
    is_public: isPublic,
    accessibility_caption: accessibilityCaption,
    review_status: isPublic ? "approved" : "needs_panorama_upload",
    fallback_gallery: fallbackGallery,
  };
}

export function publicTour(tour) {
  if (!tour?.is_public) {
    return {
      available: false,
      provider: TOUR_PROVIDER,
      review_status: tour?.review_status || "missing",
      fallback_gallery: tour?.fallback_gallery || [],
    };
  }

  if (!httpsUrl(tour.panorama_url) || !tour.accessibility_caption || !tour.fallback_gallery?.length) {
    throw new Error("Public 360 tour is missing required fallback or caption");
  }

  return {
    available: true,
    provider: TOUR_PROVIDER,
    mount_target: "psv-listing-tour",
    panorama_url: tour.panorama_url,
    thumbnail_url: tour.thumbnail_url,
    accessibility_caption: tour.accessibility_caption,
    fallback_gallery: tour.fallback_gallery,
  };
}
