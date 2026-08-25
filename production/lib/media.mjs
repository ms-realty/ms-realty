function httpsUrl(value) {
  return typeof value === "string" && /^https:\/\//.test(value);
}

function mediaUrl(item = {}) {
  return item.asset_url || item.url || item.image_url || item.source_url || "";
}

function importedImageUrl(item = {}) {
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

const WORDPRESS_IMAGE_DERIVATIVE = /-(\d{1,4})x(\d{1,4})(\.(?:avif|gif|jpe?g|png|webp)(?:\?.*)?)$/i;

function recoverWordPressOriginal(url = "") {
  const match = String(url).match(WORDPRESS_IMAGE_DERIVATIVE);
  if (!match) return url;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width >= 240 && height >= 180) return url;
  return String(url).replace(WORDPRESS_IMAGE_DERIVATIVE, "$3");
}

export function imageUrlFromMediaItem(item = {}) {
  const importedUrl = importedImageUrl(item);
  return importedUrl ? recoverWordPressOriginal(importedUrl) : null;
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
  const importedUrl = importedImageUrl({ url });
  const assetUrl = imageUrlFromMediaItem({ url });
  const kind = classifyMediaAsset({ url, alt: row.alt });
  const publicImportedPhoto = kind === "photo" && Boolean(assetUrl);
  const reviewedPrivate = kind === "site_chrome";
  const recoveredOriginal = Boolean(importedUrl && assetUrl && importedUrl !== assetUrl);

  return {
    url,
    asset_url: assetUrl,
    ...(recoveredOriginal ? { fallback_asset_url: importedUrl } : {}),
    alt: row.alt || (publicImportedPhoto ? fallbackAlt : ""),
    width: recoveredOriginal ? null : width,
    height: recoveredOriginal ? null : height,
    kind,
    is_public: publicImportedPhoto,
    review_status: publicImportedPhoto ? "approved_imported_photo" : reviewedPrivate ? "reviewed_private" : "needs_media_review",
  };
}

function publicAsset(item) {
  const fallbackUrl = item.fallback_asset_url || "";
  return {
    url: item.asset_url || item.url,
    // A recovered WordPress original is suitable for the public gallery, but
    // its tiny crawl thumbnail is not. Keep that derivative on the CMS record
    // for provenance without letting an image error turn a full-width hero
    // into a visibly pixelated 72px fallback.
    fallback_url: fallbackUrl && !isSmallDerivative(fallbackUrl) ? fallbackUrl : undefined,
    alt: item.alt || "Property photo",
    width: item.width,
    height: item.height,
  };
}

function reviewedPublicAsset(item = {}, kind) {
  if (item.kind !== kind || item.is_public !== true || item.review_status !== "approved_by_human") return false;
  const url = item.asset_url || item.url || "";
  if (!httpsUrl(url)) return false;
  if (!String(item.alt || "").trim()) return false;
  if (kind === "video") return /\.(?:m3u8|mov|mp4|webm)(?:[?#]|$)|(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(url);
  return /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(url);
}

function uniqueReviewedAssets(media, kind) {
  const seen = new Set();
  return media
    .filter((item) => reviewedPublicAsset(item, kind))
    .filter((item) => {
      const url = item.asset_url || item.url;
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((item) => ({ ...publicAsset(item), kind }));
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

// A WordPress sidebar widget ("recently added listings") renders a foreign
// property through timthumb at a navigation-sized box. The crawl recorded that
// widget on every listing page, so the same aerial shot is attached to the whole
// catalogue. The rendered box is what distinguishes it: a gallery image is
// requested large, a widget thumbnail is requested tiny.
const MINIMUM_GALLERY_RENDER_PX = 120;

function isNavigationThumbnailRender(item = {}) {
  const render = timthumbRenderDimensions(item);
  return Boolean(render && (render.width < MINIMUM_GALLERY_RENDER_PX || render.height < MINIMUM_GALLERY_RENDER_PX));
}

function isPublicPropertyPhoto(item = {}) {
  if (item.kind !== "photo" || !item.is_public || !item.asset_url) return false;
  const source = `${item.asset_url} ${item.alt || ""}`;
  if (NON_PROPERTY_MEDIA.test(source)) return false;
  if (isSmallDerivative(item.asset_url)) return false;
  if (isNavigationThumbnailRender(item)) return false;
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

function uniquePublicPropertyPhotos(media = []) {
  const seen = new Set();
  return media
    .filter(isPublicPropertyPhoto)
    .filter((item) => {
      if (seen.has(item.asset_url)) return false;
      seen.add(item.asset_url);
      return true;
    })
    .sort((left, right) => photoPriority(right) - photoPriority(left));
}

function galleryPhotos(media = []) {
  const candidates = uniquePublicPropertyPhotos(media);
  const strongestPriority = candidates.length ? photoPriority(candidates[0]) : null;
  return candidates
    .filter((item) => strongestPriority === null || photoPriority(item) >= strongestPriority - 60)
    .slice(0, 30);
}

export function mediaWorkflow(media = []) {
  const importedPublicAssets = new Set(
    media.filter((item) => item.kind === "photo" && item.is_public).map((item) => item.asset_url).filter(Boolean),
  );
  const publicGalleryAssets = galleryPhotos(media);
  const publicGalleryUrls = new Set(publicGalleryAssets.map((item) => item.asset_url));
  return {
    total_assets: media.length,
    public_gallery_assets: publicGalleryAssets.length,
    suppressed_public_assets: [...importedPublicAssets].filter((url) => !publicGalleryUrls.has(url)).length,
    floor_plan_candidates: media.filter((item) => item.kind === "floor_plan").length,
    video_candidates: media.filter((item) => item.kind === "video").length,
    review_gated_assets: media.filter((item) => !item.is_public && item.review_status !== "reviewed_private").length,
  };
}

export function publicMediaLibrary(media = [], { fallback = null } = {}) {
  // Keep alternate photos only when they are close to the strongest source
  // image. This removes inherited crawler chrome from galleries while retaining
  // legitimate listing shots recovered from WordPress thumbnail derivatives.
  const gallery = galleryPhotos(media).map(publicAsset);

  if (!gallery.length) {
    const thumbnail = selectPublicThumbnail(media, fallback);
    if (thumbnail) gallery.push(thumbnail);
  }

  return {
    gallery,
    gallery_count: gallery.length,
    floor_plans: uniqueReviewedAssets(media, "floor_plan"),
    videos: uniqueReviewedAssets(media, "video"),
    review: mediaWorkflow(media),
  };
}
