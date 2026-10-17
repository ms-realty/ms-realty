import { expect, it } from "vitest";
import objects from "../../../data/legacy/migration/public-media.json";
import { legacyMediaPath } from "./media";

it("each recorded public photo maps to a same-host adapter without arbitrary object access", () => {
  for (const object of objects) {
    const source = new URL(object.path, `https://${object.host}`);
    expect(legacyMediaPath(source.href)).toBe(`/legacy-media/${object.host}${source.pathname}`);
    expect(object.key).toBe(`${object.host}${object.path}`);
  }
  expect(legacyMediaPath("https://makler-realty.com/wp-content/uploads/private.jpg")).toBeNull();
  expect(legacyMediaPath("https://makler-realty.com/wp-content%2fuploads/private.jpg")).toBeNull();
  expect(legacyMediaPath("https://private.example.test/wp-content/uploads/photo.jpg")).toBeNull();
});
