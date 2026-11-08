import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { InquiryForm } from "./inquiry-form";
import { InquiryReview } from "./inquiry-review";
import { inquiryReviewCopy } from "./inquiry-review-copy";
import { emptyInquiry, type InquiryState } from "./inquiry-state";

afterEach(cleanup);

it("shows exact review values and final intent, then native edit clears only the review token", async () => {
  const user = userEvent.setup();
  const state: InquiryState = {
    operationId: "same-issued-operation",
    expectedRevision: null,
    responseId: "review",
    outcome: { kind: "idle" },
    values: {
      ...emptyInquiry,
      name: "Synthetic visitor",
      message: "Keep this exact question",
      contactValue: "visitor@example.test",
      privacyNotice: "true",
    },
    review: {
      token: "signed-fixture-token",
      listings: [],
      content: {
        kind: "help",
        slug: "synthetic-guide",
        versionId: "12345678-1234-4123-8123-123456789001",
        title: "Approved guide",
        locale: "en",
        sourceUrl: "https://example.test/en/help/synthetic-guide",
      },
    },
  };
  render(
    <InquiryForm
      locale="en"
      copy={discoveryCopy("en")}
      initialState={state}
      action={async (previous, data) => {
        expect(data.get("editInquiry")).toBe("1");
        expect(data.get("inquiryStage")).toBe("confirm");
        expect(data.get("_operationId")).toBe(state.operationId);
        expect(data.get("contactValue")).toBe(state.values.contactValue);
        return { ...previous, responseId: "edited", review: undefined, outcome: { kind: "idle" } };
      }}
    />,
  );
  const review = screen.getByRole("region", { name: "Review your inquiry" });
  expect(review).toHaveTextContent("Nothing has been sent yet");
  expect(review).toHaveTextContent("MS Realty");
  expect(review).toHaveTextContent("English");
  expect(review).toHaveTextContent(state.values.message);
  expect(review).toHaveTextContent(state.values.contactValue);
  expect(screen.getByRole("link", { name: "Approved guide" })).toHaveAttribute(
    "href",
    state.review?.content?.sourceUrl,
  );
  expect(screen.getByRole("button", { name: "Send inquiry to MS Realty" })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit inquiry" }));
  expect(await screen.findByRole("textbox", { name: "Your inquiry" })).toHaveValue(
    state.values.message,
  );
  expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue(state.values.contactValue);
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(screen.getByRole("button", { name: "Review inquiry" })).toBeVisible();
  expect(document.querySelector('[name="reviewToken"]')).toBeNull();
});

it("keeps unavailable subjects and a native refresh action alongside editable private values", async () => {
  const user = userEvent.setup();
  const refs = ["MS-00303", "MS-00101"];
  const state: InquiryState = {
    operationId: "same-operation",
    expectedRevision: null,
    responseId: "changed",
    sourcesChanged: true,
    values: {
      ...emptyInquiry,
      selectedListings: JSON.stringify(
        refs.map((reference, index) => ({
          reference,
          observedManifestId: `12345678-1234-4123-8123-12345678900${index}`,
        })),
      ),
      message: "Preserved",
      contactValue: "visitor@example.test",
      privacyNotice: "true",
    },
    outcome: {
      kind: "validation",
      code: "VALIDATION_FAILED",
      message: "Changed",
      fieldErrors: { contentReference: ["Review current sources"] },
    },
  };
  render(
    <InquiryForm
      locale="en"
      copy={discoveryCopy("en")}
      initialState={state}
      action={async (previous, data) => {
        expect(data.get("refreshSources")).toBe("1");
        expect(data.get("selectedListings")).toBe(state.values.selectedListings);
        expect(data.get("message")).toBe("Preserved");
        return { ...previous, responseId: "still-unavailable" };
      }}
    />,
  );
  expect(screen.getByRole("link", { name: "Compare" })).toHaveAttribute(
    "href",
    "/en/compare?references=MS-00303%2CMS-00101",
  );
  expect(screen.getByRole("textbox", { name: "Your inquiry" })).toHaveValue("Preserved");
  expect(
    screen.queryByRole("button", { name: "Send inquiry to MS Realty" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Review current sources" }));
  expect(screen.getByRole("link", { name: "MS-00303" })).toBeVisible();
  expect(screen.getByRole("link", { name: "MS-00101" })).toBeVisible();
});

it.each([
  ["phone", "+359879696870"],
  ["email", "synthetic@example.test"],
  ["phone", ""],
])(
  "P12 Hebrew review isolates the %s value without changing its source text",
  (contactKind, contactValue) => {
    const copy = discoveryCopy("he");
    const { container } = render(
      <div lang="he" dir="rtl">
        <InquiryReview
          locale="he"
          copy={copy}
          values={{ ...emptyInquiry, contactKind, contactValue }}
          review={{ token: "synthetic-review", listings: [] }}
          pending={false}
        />
      </div>,
    );
    const label = contactKind === "phone" ? copy.phone : copy.email;
    const term = Array.from(container.querySelectorAll("dt")).find(
      (dt) => dt.textContent === label,
    );
    const value = term?.nextElementSibling;
    expect(value).toHaveTextContent(contactValue || inquiryReviewCopy("he").notProvided);
    if (contactValue) {
      expect(value).toHaveAttribute("dir", "ltr");
      expect(value?.querySelector('bdi[dir="ltr"]')?.textContent).toBe(contactValue);
    } else {
      expect(value).not.toHaveAttribute("dir");
      expect(value?.querySelector("bdi")).toBeNull();
    }
    expect(term).not.toHaveAttribute("dir", "ltr");
    expect(container.querySelector('input[name="contactValue"]')).toHaveValue(contactValue);
  },
);
