/** Immutable metadata for bytes produced from the same scanned, metadata-stripped image. */
export interface MediaRendition {
  readonly key: string;
  readonly sha256: string;
  readonly contentType: "image/webp";
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
}

/** Missing is the legacy single-derivative format; malformed metadata never grants exposure. */
export function parseMediaRenditions(
  value: unknown,
  assetId: string,
): readonly MediaRendition[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 4) return null;
  const widths = new Set<number>();
  const digests = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      item.key !== `derivatives/${assetId}/${item.sha256}.webp` ||
      item.contentType !== "image/webp" ||
      !Number.isSafeInteger(item.width) ||
      item.width < 1 ||
      item.width > 2400 ||
      !Number.isSafeInteger(item.height) ||
      item.height < 1 ||
      item.height > 2400 ||
      !Number.isSafeInteger(item.byteSize) ||
      item.byteSize < 1 ||
      widths.has(item.width) ||
      digests.has(item.sha256)
    )
      return null;
    widths.add(item.width);
    digests.add(item.sha256);
  }
  return value;
}

/** Only exact descriptors included in both current asset evidence and a manifest may be used. */
export function publishedMediaRenditions(
  current: unknown,
  snapshot: unknown,
  assetId: string,
): readonly MediaRendition[] | null {
  const asset = parseMediaRenditions(current, assetId);
  const manifest = parseMediaRenditions(snapshot, assetId);
  if (!asset || !manifest) return null;
  return manifest
    .filter((item) =>
      asset.some(
        (stored) =>
          item.key === stored.key &&
          item.sha256 === stored.sha256 &&
          item.contentType === stored.contentType &&
          item.width === stored.width &&
          item.height === stored.height &&
          item.byteSize === stored.byteSize,
      ),
    )
    .sort((a, b) => a.width - b.width);
}
