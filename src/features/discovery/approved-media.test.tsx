import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import type { PublicMedia } from "@/server/listings/view-models";
import {
  ApprovedGallery,
  ApprovedMedia,
  approvedMediaHref,
  approvedMediaSrcSet,
} from "./approved-media";

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

it("renders only real width descriptors, keeps lazy sizes tied to layout and prioritizes the first gallery image", () => {
  const responsive = {
    ...media,
    width: 2400,
    height: 1350,
    renditions: [
      { digest: "b".repeat(64), width: 480, height: 270 },
      { digest: media.digest, width: 2400, height: 1350 },
    ],
  };
  const view = render(
    <ApprovedGallery
      media={[responsive, { ...responsive, relationId: "second" }]}
      unavailable="Unavailable"
      morePhotos="More photos ({count})"
    />,
  );
  const disclosure = screen.getByText("More photos (1)").closest("details");
  expect(disclosure).not.toHaveAttribute("open");
  disclosure?.setAttribute("open", "");
  const images = screen.getAllByRole("img");
  expect(images[0]).toHaveAttribute(
    "srcset",
    `/api/media/${media.assetId}/${"b".repeat(64)} 480w, /api/media/${media.assetId}/${media.digest} 2400w`,
  );
  expect(images[0]).toHaveAttribute("loading", "eager");
  expect(images[0]).toHaveAttribute("fetchpriority", "high");
  expect(images[0]?.getAttribute("sizes")).toContain("896px");
  expect(images[1]).toHaveAttribute("loading", "lazy");
  expect(images[1]?.getAttribute("sizes")).toMatch(/^auto,/);
  expect(images[1]).not.toHaveAttribute("fetchpriority");
  const markup = renderToStaticMarkup(
    <ApprovedGallery
      media={[responsive]}
      unavailable="Unavailable"
      morePhotos="More photos ({count})"
    />,
  );
  expect(markup).toContain('rel="preload"');
  expect(markup).toContain('as="image"');
  expect(markup).toContain(
    `imageSrcSet="/api/media/${media.assetId}/${"b".repeat(64)} 480w, /api/media/${media.assetId}/${media.digest} 2400w"`,
  );
  view.rerender(<ApprovedMedia media={media} unavailable="Unavailable" />);
  expect(screen.getByRole("img")).not.toHaveAttribute("srcset");
  expect(screen.getByRole("img")).not.toHaveAttribute("sizes");
  expect(
    approvedMediaSrcSet({
      ...responsive,
      renditions: [{ digest: "private/storage", width: 480, height: 270 }],
    }),
  ).toBeUndefined();
});
