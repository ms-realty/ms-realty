import test from "node:test";
import assert from "node:assert/strict";
import { filterMigrationReviewRoutes, migrationReviewTargetOptions } from "../lib/migration-review.mjs";

test("migration review filters decoded legacy URLs and preserves operator filter options", () => {
  const routes = [
    {
      old_url: "https://makler-realty.com/%D0%BA%D0%BE%D0%BD%D1%82%D0%B0%D0%BA%D1%82%D0%B8/",
      source_domain: "makler-realty.com",
      url_type: "page",
      source_evidence: { title: "Контакти" },
    },
    {
      old_url: "https://makler-realty.ru/tag/sandanski/",
      source_domain: "makler-realty.ru",
      url_type: "taxonomy",
      source_evidence: { title: "Сандански" },
    },
  ];

  const decoded = filterMigrationReviewRoutes(routes, { q: "контакти" });
  assert.deepEqual(decoded.rows.map((row) => row.old_url), [routes[0].old_url]);
  assert.deepEqual(decoded.filterOptions.types, ["page", "taxonomy"]);
  assert.deepEqual(decoded.filterOptions.domains, ["makler-realty.com", "makler-realty.ru"]);

  const scoped = filterMigrationReviewRoutes(routes, {
    type: "taxonomy",
    domain: "makler-realty.ru",
  });
  assert.deepEqual(scoped.rows.map((row) => row.old_url), [routes[1].old_url]);
  assert.deepEqual(scoped.filters, { q: "", type: "taxonomy", domain: "makler-realty.ru" });
});

// The select's choices used to come from the rows being filtered, so a choice
// vanished the moment the last pending URL of its kind was decided, and with
// nothing pending the control offered only "All" while the URL still named a
// type. The vocabulary is every reviewable route; the rows are what is left.
test("migration review filter options come from the whole vocabulary, not the pending rows", () => {
  const vocabulary = [
    { old_url: "https://makler-realty.com/a/", source_domain: "makler-realty.com", url_type: "page" },
    { old_url: "https://makler-realty.ru/tag/x/", source_domain: "makler-realty.ru", url_type: "taxonomy" },
  ];
  const nothingPending = filterMigrationReviewRoutes([], { type: "taxonomy" }, { vocabulary });
  assert.deepEqual(nothingPending.rows, []);
  assert.deepEqual(nothingPending.filters.type, "taxonomy");
  assert.deepEqual(nothingPending.filterOptions.types, ["page", "taxonomy"]);
  assert.deepEqual(nothingPending.filterOptions.domains, ["makler-realty.com", "makler-realty.ru"]);
  // Without a vocabulary the rows still supply the options, as before.
  assert.deepEqual(filterMigrationReviewRoutes(vocabulary.slice(1), {}).filterOptions.types, ["taxonomy"]);
});

test("migration review target options expose only published non-home content", () => {
  const options = migrationReviewTargetOptions({
    routes: [
      { path: "/bg/", type: "home", locale: "bg", public_indexable: true },
      { path: "/bg/tarsene", type: "search", locale: "bg", public_indexable: false },
      { path: "/bg/imoti/MS-1", type: "listing", locale: "bg", public_indexable: true },
      { path: "/bg/kontakt/", type: "contact", locale: "bg", public_indexable: true },
      { path: "/en/guides/buying-process", type: "guide", locale: "en", public_indexable: true },
      { path: "/en/guides/draft", type: "guide", locale: "en", public_indexable: false },
    ],
  });

  assert.deepEqual(options, [
    { path: "/bg/kontakt", type: "contact", locale: "bg" },
    { path: "/en/guides/buying-process", type: "guide", locale: "en" },
  ]);
});
