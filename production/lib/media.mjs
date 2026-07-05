function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value);
}

function mediaUrl(item = {}) {
  return item.asset_url || item.url || item.image_url || item.source_url || "";
}

export function imageUrlFromMediaItem(item = {}) {
  const url = mediaUrl(item);
  if (!httpsUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const src = parsed.searchParams.get("src");
    const candidate = src && httpsUrl(src) ? src : url;
    if (!/\/wp-content\/uploads\/\d{4}\/\d{2}\//.test(candidate)) return null;
    if (!/\.(avif|gif|jpe?g|png|webp)(\?|$)/i.test(candidate)) return null;
    return candidate;
  } catch {
    return null;
  }
}

export function classifyMediaAsset(item = {}) {
  const rawUrl = mediaUrl(item);
  const text = `${rawUrl} ${item.alt || ""}`;
  if (/\.(mp4|m3u8|mov|webm)(?:[?#\s]|$)|youtube\.com|youtu\.be|vimeo\.com/i.test(text)) return "video";
  if (!imageUrlFromMediaItem(item)) return "site_chrome";
  if (/floor[\s_-]?plan|floorplan|планировка|разпределение|схема/i.test(text)) return "floor_plan";
  return "photo";
}

export function normalizeMediaAsset(row, { width = null, height = null, fallbackAlt = "" } = {}) {
  const url = row.image_url || row.url || "";
  const assetUrl = imageUrlFromMediaItem({ url });
  const kind = classifyMediaAsset({ url, alt: row.alt });
  const publicImportedPhoto = kind === "photo" && Boolean(assetUrl);
  const reviewedPrivate = kind === "site_chrome";

  return {
    url,
    asset_url: assetUrl,
    alt: row.alt || (publicImportedPhoto ? fallbackAlt : ""),
    width,
    height,
    kind,
    is_public: publicImportedPhoto,
    review_status: publicImportedPhoto ? "approved_imported_photo" : reviewedPrivate ? "reviewed_private" : "needs_media_review",
  };
}

function publicAsset(item) {
  return {
    url: item.asset_url,
    alt: item.alt || "Property photo",
    width: item.width,
    height: item.height,
  };
}

export function mediaWorkflow(media = []) {
  const publicGalleryAssets = new Set(
    media.filter((item) => item.kind === "photo" && item.is_public).map((item) => item.asset_url).filter(Boolean),
  ).size;
  return {
    total_assets: media.length,
    public_gallery_assets: publicGalleryAssets,
    floor_plan_candidates: media.filter((item) => item.kind === "floor_plan").length,
    video_candidates: media.filter((item) => item.kind === "video").length,
    review_gated_assets: media.filter((item) => !item.is_public && item.review_status !== "reviewed_private").length,
  };
}

export function publicMediaLibrary(media = []) {
  const seen = new Set();
  const gallery = media
    .filter((item) => item.kind === "photo" && item.is_public && item.asset_url)
    .filter((item) => {
      if (seen.has(item.asset_url)) return false;
      seen.add(item.asset_url);
      return true;
    })
    .slice(0, 30)
    .map(publicAsset);

  return {
    gallery,
    gallery_count: gallery.length,
    floor_plans: [],
    videos: [],
    review: mediaWorkflow(media),
  };
}
