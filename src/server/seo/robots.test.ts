import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/seo/public-metadata", () => ({
  publicSeoOrigin: () => new URL("https://makler-realty.com"),
}));

import robots from "../../../app/robots";

afterEach(() => vi.unstubAllEnvs());

it("allows eligible public media crawling while every other API remains excluded", async () => {
  vi.stubEnv("STAGING", "false");
  expect(await robots()).toEqual({
    rules: { userAgent: "*", allow: ["/", "/api/media/"], disallow: "/api/" },
    sitemap: "https://makler-realty.com/sitemap.xml",
  });
});

it("keeps the full staging crawl exclusion, including public media", async () => {
  vi.stubEnv("STAGING", "true");
  expect(await robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
});
