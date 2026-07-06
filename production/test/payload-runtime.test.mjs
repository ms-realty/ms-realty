import test from "node:test";
import assert from "node:assert/strict";
import config from "../../payload.config.js";

test("Payload config exposes generated CMS collections behind an admin runtime", async () => {
  const resolved = await config;
  const slugs = resolved.collections.map((collection) => collection.slug);

  assert.equal(resolved.admin.user, "admins");
  assert.equal(resolved.routes.admin, "/payload-admin");
  assert.ok(slugs.includes("admins"));
  assert.ok(slugs.includes("locales"));
  assert.ok(slugs.includes("listings"));
  assert.ok(slugs.includes("listing_translations"));
  assert.ok(slugs.includes("media_assets"));
  assert.ok(slugs.includes("listing_tours"));
  assert.ok(
    resolved.collections
      .find((collection) => collection.slug === "listing_translations")
      .fields.some((field) => field.name === "locale" && field.relationTo === "locales"),
  );
});
