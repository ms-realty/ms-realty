import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  listing: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "a".repeat(43) }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: mocked.redirect,
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/server/listings/detail", () => ({ getPublicListing: mocked.listing }));

import { issueSubmissionKey } from "@/server/inquiries/intake";
import InquiryPage from "../../../app/public/[locale]/(site)/inquire/page";

afterEach(cleanup);
beforeEach(() => {
  mocked.listing.mockReset();
  mocked.redirect.mockClear();
});

describe("native inquiry correction loader", () => {
  it.each([
    { context: "invalid", error: "VALIDATION_FAILED" },
    { selection: "invalid", error: "VALIDATION_FAILED" },
    { comparisonReferences: "MS-00101,MS-00101", reference: "MS-00101" },
  ])(
    "renders a correction with no generic submission form for $context $selection $comparisonReferences",
    async (query) => {
      const submission = issueSubmissionKey();
      const result = await InquiryPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({ ...query, submission }),
      });
      const view = render(result);
      expect(view.container.querySelector("form")).toBeNull();
      expect(screen.queryByRole("button", { name: "Send an inquiry" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute("href", "/en/compare");
      expect(mocked.listing).not.toHaveBeenCalled();
    },
  );
  it.each(["OUTCOME_UNKNOWN", "OPERATION_PENDING"])(
    "reconciles %s with the same submission key",
    async (error) => {
      const submission = issueSubmissionKey();
      await expect(
        InquiryPage({
          params: Promise.resolve({ locale: "en" }),
          searchParams: Promise.resolve({ submission, error }),
        }),
      ).rejects.toThrow(`REDIRECT:/en/requests/${submission}`);
    },
  );
  it("blocks a comparison-origin single subject which is no longer offered while retaining its navigation", async () => {
    const reference = "MS-00101";
    mocked.listing.mockResolvedValue({
      status: "listing",
      listing: {
        reference,
        manifestId: "12345678-1234-4123-8123-123456789001",
        availability: { primaryAction: "view_similar" },
      },
    });
    const result = await InquiryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({
        reference,
        manifest: "12345678-1234-4123-8123-123456789001",
        comparisonReferences: "MS-00303,MS-00101,MS-00202",
        submission: issueSubmissionKey(),
      }),
    });
    const view = render(result);
    expect(screen.queryByRole("button", { name: "Send an inquiry" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Purpose" })).toBeDisabled();
    expect(view.container.querySelector('input[name="listingReference"]')).toHaveValue(reference);
    expect(view.container.querySelector('input[name="selectedListings"]')).toHaveValue("");
    expect(view.container.querySelector('input[name="comparisonReferences"]')).toHaveValue(
      "MS-00303,MS-00101,MS-00202",
    );
    expect(
      screen
        .getAllByRole("link", { name: "Compare" })
        .every(
          (link) =>
            link.getAttribute("href") === "/en/compare?references=MS-00303%2CMS-00101%2CMS-00202",
        ),
    ).toBe(true);
  });
});
