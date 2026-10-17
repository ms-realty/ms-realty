import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "@/server/config/env";

const mocked = vi.hoisted(() => ({
  listing: vi.fn(),
  submit: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: getEnv().hosts.public }),
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
vi.mock("@/server/inquiries/intake", async (original) => ({
  ...(await original<typeof import("@/server/inquiries/intake")>()),
  submitInquiry: mocked.submit,
}));

import { issueSubmissionKey } from "@/server/inquiries/intake";
import InquiryPage from "../../../app/public/[locale]/(site)/inquire/page";
import { inquiryReviewCopy } from "./inquiry-review-copy";

const review = inquiryReviewCopy("en");

afterEach(cleanup);
beforeEach(() => {
  mocked.listing.mockReset();
  mocked.redirect.mockClear();
  mocked.submit.mockReset();
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
      expect(screen.queryByRole("button", { name: review.reviewAction })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: review.confirmAction })).not.toBeInTheDocument();
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
  it.each(["view_similar", "unavailable"])(
    "keeps a %s subject editable but refuses review and refresh without losing its draft or navigation",
    async (availability) => {
      const user = userEvent.setup();
      const reference = "MS-00101";
      const submission = issueSubmissionKey();
      mocked.listing.mockResolvedValue(
        availability === "unavailable"
          ? { status: "unavailable" }
          : {
              status: "listing",
              listing: {
                reference,
                manifestId: "12345678-1234-4123-8123-123456789001",
                availability: { primaryAction: "view_similar" },
              },
            },
      );
      const result = await InquiryPage({
        params: Promise.resolve({ locale: "en" }),
        searchParams: Promise.resolve({
          reference,
          manifest: "12345678-1234-4123-8123-123456789001",
          comparisonReferences: "MS-00303,MS-00101,MS-00202",
          submission,
        }),
      });
      const view = render(result);
      expect(screen.queryByRole("button", { name: review.confirmAction })).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Purpose" })).toBeEnabled();
      expect(view.container.querySelector('input[name="inquiryStage"]')).toHaveValue("review");
      expect(screen.getByRole("button", { name: review.refreshSources })).toBeInTheDocument();
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
      await user.type(
        screen.getByRole("textbox", { name: "Your inquiry" }),
        "Keep this private question",
      );
      await user.type(screen.getByRole("textbox", { name: "Email" }), "private@example.test");
      await user.click(screen.getByRole("checkbox"));
      for (const action of [review.reviewAction, review.refreshSources]) {
        await user.click(screen.getByRole("button", { name: action }));
        expect(screen.queryByRole("region", { name: review.reviewTitle })).not.toBeInTheDocument();
        expect(
          screen.queryByRole("button", { name: review.confirmAction }),
        ).not.toBeInTheDocument();
        expect(view.container.querySelector('[name="reviewToken"]')).toBeNull();
        expect(view.container.querySelector('[name="_operationId"]')).toHaveValue(submission);
        expect(view.container.querySelector('[name="listingReference"]')).toHaveValue(reference);
        expect(view.container.querySelector('[name="observedManifestId"]')).toHaveValue(
          "12345678-1234-4123-8123-123456789001",
        );
        expect(view.container.querySelector('[name="selectedListings"]')).toHaveValue("");
        expect(view.container.querySelector('[name="comparisonReferences"]')).toHaveValue(
          "MS-00303,MS-00101,MS-00202",
        );
        expect(screen.getByRole("textbox", { name: "Your inquiry" })).toHaveValue(
          "Keep this private question",
        );
        expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("private@example.test");
        expect(screen.getByRole("checkbox")).toBeChecked();
        expect(mocked.submit).not.toHaveBeenCalled();
      }
    },
  );
});
