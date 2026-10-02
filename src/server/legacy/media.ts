import objects from "../../../data/legacy/migration/public-media.json";

/** Same-host gateway path, derived only from the exact already-public source object allowlist. */
export function legacyMediaPath(source: string): string | null {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (
    !/^https?:$/.test(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /%2f|%5c/i.test(url.pathname)
  )
    return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const object = objects.find(
    (candidate) => candidate.host === url.hostname && candidate.path === path,
  );
  return object ? `/legacy-media/${object.host}${url.pathname}` : null;
}
