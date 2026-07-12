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

// Imported pages frequently include operational imagery (taxi, phone, logos)
// beside the actual property gallery. Keep the source records for audit, but do
// not put those assets into a property card or public gallery by default.
const NON_PROPERTY_MEDIA = /(?:^|[\/_-])(taxi|phone|logo|flag|whatsapp|viber|avatar)(?:[\/_.-]|$)/i;
const IMAGE_DIMENSIONS = /-(\d{1,4})x(\d{1,4})\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i;

function dimensionsInUrl(url = "") {
  const match = String(url).match(IMAGE_DIMENSIONS);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function isSmallDerivative(url = "") {
  const dimensions = dimensionsInUrl(url);
  return Boolean(dimensions && (dimensions.width < 240 || dimensions.height < 180));
}

function hasLargeDimensions(url = "") {
  const dimensions = dimensionsInUrl(url);
  return Boolean(dimensions && dimensions.width >= 640 && dimensions.height >= 360);
}

function timthumbRenderDimensions(item = {}) {
  const sourceUrl = item.url || item.image_url || item.source_url || "";
  if (!/timthumb\.php/i.test(sourceUrl)) return null;

  try {
    const parsed = new URL(sourceUrl);
    const width = Number(parsed.searchParams.get("w"));
    const height = Number(parsed.searchParams.get("h"));
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;
  } catch {
    return null;
  }
}

function isPublicPropertyPhoto(item = {}) {
  if (item.kind !== "photo" || !item.is_public || !item.asset_url) return false;
  const source = `${item.asset_url} ${item.alt || ""}`;
  if (NON_PROPERTY_MEDIA.test(source)) return false;
  if (isSmallDerivative(item.asset_url)) return false;
  // Crawl chrome can report a 45px display box for a full WordPress asset.
  // A large size embedded in the filename is more reliable than that box.
  if (!hasLargeDimensions(item.asset_url)) {
    if (Number.isFinite(Number(item.width)) && Number(item.width) > 0 && Number(item.width) < 160) return false;
    if (Number.isFinite(Number(item.height)) && Number(item.height) > 0 && Number(item.height) < 120) return false;
  }
  return true;
}

function photoPriority(item = {}) {
  const url = item.asset_url || "";
  const sourceUrl = item.url || item.image_url || item.source_url || url;
  const renderDimensions = timthumbRenderDimensions(item);
  let score = 0;
  if (!/timthumb\.php/i.test(sourceUrl)) score += 40;
  if (renderDimensions && renderDimensions.width >= 640 && renderDimensions.height >= 360) score += 40;
  if (renderDimensions && (renderDimensions.width < 240 || renderDimensions.height < 180)) score -= 60;
  if (!isSmallDerivative(url)) score += 20;
  if (hasLargeDimensions(url) || Number(item.width) >= 800 || Number(item.height) >= 500) score += 20;
  if (item.alt && item.alt.trim()) score += 5;
  return score;
}

export function selectPublicThumbnail(media = [], fallback = null) {
  const candidates = media
    .filter(isPublicPropertyPhoto)
    .sort((left, right) => photoPriority(right) - photoPriority(left));
  const selected = candidates[0];
  if (selected) return publicAsset(selected);

  // Do not render an unsafe legacy thumbnail. The design system has a stable
  // photo placeholder for listings awaiting a human media review.
  if (fallback && !NON_PROPERTY_MEDIA.test(`${fallback.url || ""} ${fallback.alt || ""}`)) return fallback;
  return null;
}

export function mediaWorkflow(media = []) {
  const publicGalleryAssets = new Set(
    media.filter((item) => item.kind === "photo" && item.is_public).map((item) => item.asset_url).filter(Boolean),
  ).size;
  const suppressedPublicAssets = new Set(
    media
      .filter((item) => item.kind === "photo" && item.is_public && item.asset_url && !isPublicPropertyPhoto(item))
      .map((item) => item.asset_url),
  ).size;
  return {
    total_assets: media.length,
    public_gallery_assets: publicGalleryAssets,
    suppressed_public_assets: suppressedPublicAssets,
    floor_plan_candidates: media.filter((item) => item.kind === "floor_plan").length,
    video_candidates: media.filter((item) => item.kind === "video").length,
    review_gated_assets: media.filter((item) => !item.is_public && item.review_status !== "reviewed_private").length,
  };
}

export function publicMediaLibrary(media = [], { fallback = null } = {}) {
  const seen = new Set();
  const candidates = media
    .filter(isPublicPropertyPhoto)
    .filter((item) => {
      if (seen.has(item.asset_url)) return false;
      seen.add(item.asset_url);
      return true;
    })
    .sort((left, right) => photoPriority(right) - photoPriority(left));

  // Keep alternate photos only when they are close to the strongest source
  // image. This removes inherited 45px crawler thumbnails from galleries
  // while retaining legitimate lower-priority listing shots.
  const strongestPriority = candidates.length ? photoPriority(candidates[0]) : null;
  const gallery = candidates
    .filter((item) => strongestPriority === null || photoPriority(item) >= strongestPriority - 60)
    .slice(0, 30)
    .map(publicAsset);

  if (!gallery.length) {
    const thumbnail = selectPublicThumbnail(media, fallback);
    if (thumbnail) gallery.push(thumbnail);
  }

  return {
    gallery,
    gallery_count: gallery.length,
    floor_plans: [],
    videos: [],
    review: mediaWorkflow(media),
  };
}
