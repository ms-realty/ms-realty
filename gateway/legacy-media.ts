export interface LegacyMediaEnv {
  MEDIA?: R2Bucket;
  PUBLIC_MEDIA_JSON?: string;
  PUBLIC_MEDIA_SHA256?: string;
}
const types: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};
const denied = (status: number) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
export async function legacyMedia(
  request: Request,
  env: LegacyMediaEnv,
  sourceHost?: string,
): Promise<Response> {
  if (!["GET", "HEAD"].includes(request.method)) return denied(405);
  try {
    if (
      !env.MEDIA ||
      !env.PUBLIC_MEDIA_JSON ||
      !/^[a-f0-9]{64}$/.test(env.PUBLIC_MEDIA_SHA256 ?? "")
    )
      return denied(503);
    const sha = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.PUBLIC_MEDIA_JSON)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    if (sha !== env.PUBLIC_MEDIA_SHA256) return denied(503);
    const rows = JSON.parse(env.PUBLIC_MEDIA_JSON) as { host: string; path: string; key: string }[];
    if (!Array.isArray(rows) || !rows.length || rows.length > 20000) return denied(503);
    const seen = new Set<string>();
    for (const row of rows) {
      if (
        !row ||
        !/^makler-realty\.(com|ru)$/.test(row.host) ||
        !row.path.startsWith("/wp-content/uploads/") ||
        /[\\\r\n?#%]/.test(row.path) ||
        row.path.split("/").some((x) => x === "." || x === "..") ||
        row.key !== `${row.host}${row.path}` ||
        seen.has(row.key)
      )
        return denied(503);
      seen.add(row.key);
    }
    const pathname = new URL(request.url).pathname;
    if (/%(?:2f|5c)/i.test(pathname)) return denied(400);
    const key = sourceHost
      ? `${sourceHost}${decodeURIComponent(pathname)}`
      : decodeURIComponent(pathname.slice("/legacy-media/".length));
    const row = rows.find((x) => x.key === key);
    const type = types[key.split(".").at(-1)?.toLowerCase() ?? ""];
    if (!row || !type) return denied(404);
    const object = await env.MEDIA.get(row.key);
    if (!object) return denied(404);
    const reader = request.method === "HEAD" ? null : object.body.getReader();
    const body = reader
      ? new ReadableStream<Uint8Array>({
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
        })
      : null;
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(object.size),
        ETag: object.httpEtag,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return denied(503);
  }
}

import type { R2Bucket } from "./worker-configuration";
