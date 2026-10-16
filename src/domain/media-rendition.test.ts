import { expect, it } from "vitest";
import {
  type MediaRendition,
  parseMediaRenditions,
  publishedMediaRenditions,
} from "./media-rendition";

const id = "00000000-0000-4000-8000-000000000001";
const rendition: MediaRendition = {
  key: `derivatives/${id}/${"a".repeat(64)}.webp`,
  sha256: "a".repeat(64),
  contentType: "image/webp",
  width: 480,
  height: 270,
  byteSize: 300,
};

it("requires the exact sealed descriptor in both asset and publication, with legacy fallback", () => {
  expect(publishedMediaRenditions([rendition], [rendition], id)).toEqual([rendition]);
  expect(publishedMediaRenditions([rendition], undefined, id)).toEqual([]);
  expect(publishedMediaRenditions([rendition], [{ ...rendition, width: 481 }], id)).toEqual([]);
  expect(publishedMediaRenditions([], [rendition], id)).toEqual([]);
  expect(parseMediaRenditions(undefined, id)).toEqual([]);
});

it.each([
  { ...rendition, key: "sealed/private-original" },
  { ...rendition, key: `derivatives/another-asset/${rendition.sha256}.webp` },
  { ...rendition, sha256: "not-a-digest" },
  { ...rendition, contentType: "text/html" },
  { ...rendition, width: 0 },
  { ...rendition, width: 2401 },
  { ...rendition, height: -1 },
  { ...rendition, byteSize: 0 },
])("rejects malformed or non-derivative evidence %#", (bad) => {
  expect(parseMediaRenditions([bad], id)).toBeNull();
  expect(publishedMediaRenditions([rendition], [bad], id)).toBeNull();
});
