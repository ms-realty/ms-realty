import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { PublicMedia } from "@/server/listings/view-models";
import { ApprovedMedia, approvedMediaHref } from "./approved-media";

afterEach(cleanup);
const media: PublicMedia = {
  relationId: "relation",
  assetId: "00000000-0000-4000-8000-000000000001",
  digest: "a".repeat(64),
  contentType: "image/webp",
  kind: "render",
  width: null,
  height: null,
  alt: "Synthetic architectural rendering",
  caption: "Synthetic test caption",
  modificationDisclosure: "Architectural rendering",
  position: 0,
};
it("serves the approved digest directly and retains the modification disclosure with an unavailable fallback", () => {
  const { rerender } = render(<ApprovedMedia media={media} unavailable="Photos unavailable" />);
  const img = screen.getByRole("img", { name: media.alt ?? "" });
  expect(new URL(img.getAttribute("src") ?? "", "http://localhost:3000").pathname).toBe(
    `/api/media/${media.assetId}/${media.digest}`,
  );
  expect(img).not.toHaveAttribute("srcset");
  expect(screen.getByText("Architectural rendering")).toBeVisible();
  fireEvent.error(img);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Photos unavailable")).toBeVisible();
  rerender(
    <ApprovedMedia media={{ ...media, digest: "b".repeat(64) }} unavailable="Photos unavailable" />,
  );
  expect(
    new URL(screen.getByRole("img").getAttribute("src") ?? "", "http://localhost:3000").pathname,
  ).toBe(`/api/media/${media.assetId}/${"b".repeat(64)}`);
});
it("never turns a storage URL or unsupported media type into a public source", () => {
  expect(approvedMediaHref({ ...media, digest: "https://private.invalid/staging" })).toBeNull();
  expect(approvedMediaHref({ ...media, contentType: "text/html" })).toBeNull();
});
