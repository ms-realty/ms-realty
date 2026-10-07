import { describe, expect, it, vi } from "vitest";
import { type MapAssetStorage, mapAsset as r2MapAsset, serveMapAsset } from "./map-assets";

function readAsset(
  request: Request,
  env: { MAP_RELEASE_ID?: string; MAP_ASSETS?: MapAssetStorage },
) {
  return serveMapAsset(request, env.MAP_RELEASE_ID, env.MAP_ASSETS);
}
const release = "a".repeat(64);
function fixture() {
  const bytes = new TextEncoder().encode("PMTiles-synthetic-range-body");
  const object = {
    key: "fixture",
    version: "v1",
    size: bytes.length,
    etag: "fixture-etag",
    httpEtag: '"fixture-etag"',
    checksums: { toJSON: () => ({}) },
    uploaded: new Date(),
    storageClass: "Standard",
    writeHttpMetadata: () => {},
  };
  const get = vi.fn<MapAssetStorage["get"]>(async (_key, options) => {
    const range = options.range;
    const payload = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
  });
  const bucket: MapAssetStorage = { head: vi.fn(async () => object), get };
  const env = { MAP_RELEASE_ID: release, MAP_ASSETS: bucket };
  return {
    env,
    get,
    object,
    request: (path = "basemap.pmtiles", init?: RequestInit) =>
      new Request(`https://makler-realty.com/maps/${release}/${path}`, init),
  };
}
describe("public immutable map byte serving", () => {
  it("streams the requested range, clamps EOF and supplies the exact ETag", async () => {
    const f = fixture();
    const r = await readAsset(f.request(undefined, { headers: { Range: "bytes=0-16383" } }), f.env);
    expect(r.status).toBe(206);
    expect(await r.text()).toBe("PMTiles-synthetic-range-body");
    expect(r.headers.get("content-range")).toBe(`bytes 0-${f.object.size - 1}/${f.object.size}`);
    expect(r.headers.get("etag")).toBe(f.object.httpEtag);
    expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(f.get).toHaveBeenCalledWith(`${release}/basemap.pmtiles`, {
      etag: f.object.etag,
      range: { offset: 0, length: f.object.size },
    });
    const part = await readAsset(f.request(undefined, { headers: { Range: "bytes=8-16" } }), f.env);
    expect(await part.text()).toBe("synthetic");
  });
  it("does not retrieve bytes for HEAD or a matching conditional request", async () => {
    const f = fixture();
    expect(
      (await readAsset(f.request(undefined, { method: "HEAD" }), f.env)).headers.get(
        "content-length",
      ),
    ).toBe(String(f.object.size));
    expect(
      (
        await readAsset(
          f.request(undefined, { headers: { "If-None-Match": f.object.httpEtag } }),
          f.env,
        )
      ).status,
    ).toBe(304);
    expect(f.get).not.toHaveBeenCalled();
  });
  it("rejects whole archives, unbounded/multiple/invalid ranges, private keys and other releases", async () => {
    const f = fixture();
    for (const range of [
      null,
      "bytes=0-",
      "bytes=-8",
      "bytes=0-1,3-4",
      "bytes=999-1000",
      "bytes=8-3",
      "bytes=9007199254740992-9007199254740993",
    ]) {
      expect(
        (await readAsset(f.request(undefined, { headers: range ? { Range: range } : {} }), f.env))
          .status,
      ).toBe(416);
    }
    for (const path of [
      "private.pdf",
      "fonts/%2e%2e/private.pbf",
      "sprites/light.png?token=secret",
    ])
      expect((await readAsset(f.request(path), f.env)).status).toBe(404);
    expect(
      (
        await readAsset(
          new Request(`https://makler-realty.com/maps/${"b".repeat(64)}/basemap.pmtiles`),
          f.env,
        )
      ).status,
    ).toBe(404);
    expect((await readAsset(f.request(undefined, { method: "POST" }), f.env)).status).toBe(405);
    expect(f.get).not.toHaveBeenCalled();
  });
  it("fails closed for missing configuration, an overwritten object, or storage failure", async () => {
    const f = fixture();
    expect((await r2MapAsset(f.request(), {})).status).toBe(503);
    f.get.mockResolvedValueOnce(null);
    expect(
      (await readAsset(f.request(undefined, { headers: { Range: "bytes=0-8" } }), f.env)).status,
    ).toBe(503);
    f.get.mockRejectedValueOnce(new Error("unavailable"));
    const result = await readAsset(f.request("sprites/light.png"), f.env);
    expect(result.status).toBe(503);
    expect(await result.text()).toBe("");
  });
});
