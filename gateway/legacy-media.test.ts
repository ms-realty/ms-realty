import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { type LegacyMediaEnv, legacyMedia } from "./legacy-media";

describe("Public legacy R2 allowlist", () => {
  it("serves only exact provenance keys from the bound staging bucket and supports original URLs", async () => {
    const rows = [
      {
        host: "makler-realty.ru",
        path: "/wp-content/uploads/снимка.jpg",
        key: "makler-realty.ru/wp-content/uploads/снимка.jpg",
      },
    ];
    const json = JSON.stringify(rows),
      get = vi.fn(async () => ({ size: 3, httpEtag: '"fixture"', body: new Response("img").body }));
    const env: LegacyMediaEnv = {
      PUBLIC_MEDIA_JSON: json,
      PUBLIC_MEDIA_SHA256: createHash("sha256").update(json).digest("hex"),
      MEDIA: { get } as unknown as LegacyMediaEnv["MEDIA"],
    };
    const url = `https://staging.makler-realty.com/legacy-media/makler-realty.ru/wp-content/uploads/${encodeURIComponent("снимка.jpg")}`;
    const response = await legacyMedia(new Request(url), env);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("img");
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(get).toHaveBeenLastCalledWith(rows[0]?.key);
    expect((await legacyMedia(new Request(url, { method: "HEAD" }), env)).body).toBe(null);
    const original = `https://makler-realty.ru/wp-content/uploads/${encodeURIComponent("снимка.jpg")}`;
    expect((await legacyMedia(new Request(original), env, "makler-realty.ru")).status).toBe(200);
    const count = get.mock.calls.length;
    for (const path of [
      "private/contracts.pdf",
      "makler-realty.ru/wp-content/uploads/unknown.jpg",
      "makler-realty.ru%2Fwp-content/uploads/снимка.jpg",
    ])
      expect(
        (
          await legacyMedia(
            new Request(`https://staging.makler-realty.com/legacy-media/${path}`),
            env,
          )
        ).status,
      ).not.toBe(200);
    expect((await legacyMedia(new Request(url, { method: "POST" }), env)).status).toBe(405);
    expect(
      (await legacyMedia(new Request(url), { ...env, PUBLIC_MEDIA_SHA256: "0".repeat(64) })).status,
    ).toBe(503);
    expect(get).toHaveBeenCalledTimes(count);
    get.mockResolvedValueOnce(null as never);
    expect((await legacyMedia(new Request(url), env)).status).toBe(404);
  });
});
