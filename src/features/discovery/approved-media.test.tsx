import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { PublicMedia } from "@/server/listings/view-models";
import {
  ApprovedGallery,
  ApprovedMedia,
  approvedMediaHref,
  approvedMediaSrcSet,
} from "./approved-media";
import { discoveryCopy } from "./copy";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
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
it("recovers an image that finished failing before its client handler was attached", () => {
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
  render(<ApprovedMedia media={media} unavailable="Photos unavailable" />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText("Photos unavailable")).toBeVisible();
  expect(screen.getByText("Synthetic test caption")).toBeVisible();
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
      locale="en"
      copy={discoveryCopy("en")}
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
      locale="en"
      copy={discoveryCopy("en")}
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

it("P06/UI17 opens the selected item, bounds zoom, keeps a failed item navigable and restores the launcher's focus", async () => {
  const user = userEvent.setup();
  const plan = {
    ...media,
    relationId: "plan",
    digest: "b".repeat(64),
    kind: "floor_plan" as const,
    alt: "Synthetic full floor plan",
    caption: "Synthetic plan caption",
    modificationDisclosure: null,
  };
  const third = {
    ...media,
    relationId: "third",
    digest: "c".repeat(64),
    alt: "Synthetic third photo",
  };
  render(
    <ApprovedGallery
      media={[media, plan, third]}
      unavailable="Unavailable"
      morePhotos="More photos ({count})"
      locale="en"
      copy={discoveryCopy("en")}
    />,
  );
  await user.click(screen.getByText("More photos (2)"));
  const launcher = screen.getByRole("link", { name: "Open media 2 · Synthetic full floor plan" });
  expect(launcher).toHaveAttribute("href", `/api/media/${plan.assetId}/${plan.digest}`);
  await user.click(launcher);
  const dialog = screen.getByRole("dialog", { name: "Property gallery" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Close" })).toHaveFocus());
  expect(dialog).toHaveTextContent("Floor plan · 2 of 3");
  expect(within(dialog).getByRole("img", { name: plan.alt })).toHaveClass("object-contain");
  for (let step = 0; step < 4; step += 1)
    await user.click(within(dialog).getByRole("button", { name: "Zoom in" }));
  expect(within(dialog).getByRole("button", { name: "Zoom in" })).toBeDisabled();
  expect(dialog).toHaveTextContent("300%");
  await user.click(within(dialog).getByRole("button", { name: /Fit image/ }));
  expect(dialog).toHaveTextContent("100%");
  fireEvent.error(within(dialog).getByRole("img"));
  expect(within(dialog).getByRole("status")).toHaveTextContent("Unavailable");
  await user.click(within(dialog).getByRole("button", { name: "Next media" }));
  expect(dialog).toHaveTextContent("3 of 3");
  expect(within(dialog).getByRole("img")).toHaveAttribute("alt", third.alt);
  expect(within(dialog).getByRole("button", { name: "Next media" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.keyboard("{ArrowLeft}");
  expect(dialog).toHaveTextContent("2 of 3");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await waitFor(() => expect(launcher).toHaveFocus());
});

it("P06 Back closes the viewer without leaving the parent; RTL arrows retain logical item order", async () => {
  const user = userEvent.setup();
  const copy = discoveryCopy("he");
  render(
    <ApprovedGallery
      media={[media, { ...media, relationId: "second", digest: "d".repeat(64) }]}
      unavailable="Unavailable"
      morePhotos="More ({count})"
      locale="he"
      copy={copy}
    />,
  );
  await user.click(
    screen.getByRole("link", { name: new RegExp(copy.openMedia.replace("{position}", "1")) }),
  );
  const dialog = screen.getByRole("dialog", { name: copy.mediaViewer });
  await user.keyboard("{ArrowLeft}");
  expect(dialog).toHaveTextContent(
    copy.mediaPosition.replace("{position}", "2").replace("{count}", "2"),
  );
  act(() => window.history.back());
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(window.location.pathname).toBe("/");
});
