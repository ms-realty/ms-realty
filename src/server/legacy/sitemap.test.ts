import { expect, it } from "vitest";
import routes from "../../../data/legacy/migration/staging-legacy-routes.json";
import { reviewedSamePathLegacyPages } from "./sitemap";

it("only source-backed retained200 paths become sitemap candidates, without redirect URLs or invented sibling/indexing approvals", () => {
  const origin = new URL("https://makler-realty.com");
  const pages = reviewedSamePathLegacyPages(origin);
  expect(pages.length).toBe(routes.filter((route) => route.status === 200).length);
  expect(
    pages.every((page) =>
      routes.some(
        (route) =>
          route.status === 200 && new URL(`${route.path}${route.query}`, origin).href === page.url,
      ),
    ),
  ).toBe(true);
  expect(pages.every((page) => page.alternatives.length === 0 && !page.indexabilityApproved)).toBe(
    true,
  );
});
