import type { Env as MapWorkerEnv } from "./worker-configuration";

/** Immutable, same-origin public map assets. This binding must never contain private files. */
export type MapAssetsEnv = Partial<Pick<MapWorkerEnv, "MAP_ASSETS" | "MAP_RELEASE_ID">>;
const failure = (status: number, extra?: Record<string, string>) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
const MAX_RANGE = 8 * 1024 * 1024;

export interface MapAssetStorage {
  head(key: string): Promise<{ size: number; etag: string; httpEtag: string } | null>;
  get(
    key: string,
    options: { etag: string; range?: { offset: number; length: number } },
  ): Promise<ReadableStream<Uint8Array> | null>;
}

export async function mapAsset(request: Request, env: MapAssetsEnv): Promise<Response> {
  const bucket = env.MAP_ASSETS;
  if (!bucket) return failure(503);
  return serveMapAsset(request, env.MAP_RELEASE_ID, {
    head: (key) => bucket.head(key),
    async get(key, options) {
      const data = await bucket.get(key, {
        onlyIf: { etagMatches: options.etag },
        ...(options.range ? { range: options.range } : {}),
      });
      if (!data || !("body" in data)) return null;
      // Preserve backpressure and cancellation across the Worker/DOM stream type boundary.
      const reader = data.body.getReader();
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              reader.releaseLock();
              controller.close();
            } else controller.enqueue(part.value);
          } catch (error) {
            reader.releaseLock();
            controller.error(error);
          }
        },
        async cancel(reason) {
          try {
            await reader.cancel(reason);
          } finally {
            reader.releaseLock();
          }
        },
      });
    },
  });
}

/** Portable HTTP contract; the R2 adapter above owns provider-specific conditional reads. */
export async function serveMapAsset(
  request: Request,
  release: string | undefined,
  storage: MapAssetStorage | undefined,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) return failure(405, { Allow: "GET, HEAD" });
  if (!storage || !release || !/^[a-f0-9]{64}$/.test(release)) return failure(503);
  const url = new URL(request.url);
  const prefix = `/maps/${release}/`;
  if (!url.pathname.startsWith(prefix) || url.search) return failure(404);
  let asset: string;
  try {
    asset = decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return failure(404);
  }
  let type: string;
  if (asset === "basemap.pmtiles") type = "application/vnd.pmtiles";
  else if (/^sprites\/light(?:@2x)?\.(?:json|png)$/.test(asset))
    type = asset.endsWith(".png") ? "image/png" : "application/json";
  else if (/^fonts\/[A-Za-z0-9 ,_-]{1,120}\/[0-9]{1,7}-[0-9]{1,7}\.pbf$/.test(asset))
    type = "application/x-protobuf";
  else return failure(404);
  const key = `${release}/${asset}`;
  try {
    const object = await storage.head(key);
    if (!object) return failure(404);
    const headers = new Headers({
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: object.httpEtag,
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    if (request.headers.get("if-none-match") === object.httpEtag)
      return new Response(null, { status: 304, headers });
    if (request.method === "HEAD") {
      headers.set("Content-Length", String(object.size));
      return new Response(null, { headers });
    }
    const rawRange = request.headers.get("range");
    const invalidRange = () => failure(416, { "Content-Range": `bytes */${object.size}` });
    let range: { offset: number; length: number } | undefined;
    if (rawRange) {
      const match = /^bytes=(\d+)-(\d+)$/.exec(rawRange);
      if (!match) return invalidRange();
      const start = Number(match[1]),
        end = Math.min(Number(match[2]), object.size - 1);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(Number(match[2])) ||
        start > end ||
        end - start + 1 > MAX_RANGE
      )
        return invalidRange();
      if (request.headers.has("if-range") && request.headers.get("if-range") !== object.httpEtag)
        return invalidRange();
      range = { offset: start, length: end - start + 1 };
    } else if (asset === "basemap.pmtiles" || object.size > MAX_RANGE) return invalidRange();
    const body = await storage.get(key, { etag: object.etag, ...(range ? { range } : {}) });
    if (!body) return failure(503);
    headers.set("Content-Length", String(range?.length ?? object.size));
    if (range)
      headers.set(
        "Content-Range",
        `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`,
      );
    return new Response(body, { status: range ? 206 : 200, headers });
  } catch {
    return failure(503);
  }
}
