import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { InquiryForm } from "./inquiry-form";
import { emptyInquiry, type InquiryState } from "./inquiry-state";

afterEach(cleanup);
const state: InquiryState = {
  operationId: "same-viewing-operation",
  expectedRevision: null,
  responseId: "entry",
  outcome: { kind: "idle" },
  values: {
    ...emptyInquiry,
    purpose: "viewing_request",
    listingReference: "MS-00001",
    contactValue: "visitor@example.test",
    privacyNotice: "true",
    viewingTimezone: "Europe/London",
    viewingStart1: "2030-10-27T01:15",
    viewingEnd1: "2030-10-27T01:45",
    viewingStartChoice1: "earlier",
    viewingEndChoice1: "later",
    viewingAccessNeeds: "Step-free access, please.",
  },
};
it("provides native optional windows and exposes retained errors inside the right disclosure", () => {
  render(
    <InquiryForm
      locale="en"
      copy={discoveryCopy("en")}
      initialState={{
        ...state,
        values: { ...state.values, viewingStart2: "2030-10-28T10:00" },
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: "Check",
          fieldErrors: { viewingEnd2: ["Complete this window"] },
        },
      }}
      action={async (previous) => previous}
    />,
  );
  expect(screen.getByText(/This is a request, not a booking/)).toBeVisible();
  expect(screen.getByLabelText("Timezone for preferred times")).toHaveValue("Europe/London");
  expect(screen.getByLabelText(/^From date and time 2.*optional/i)).toHaveAttribute(
    "type",
    "datetime-local",
  );
  expect(screen.getByText("Complete this window", { selector: "p" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Preferred format" })).toHaveTextContent("In person");
  expect(screen.queryByRole("option", { name: /video/i })).not.toBeInTheDocument();
});
it("reviews the exact zone/windows/access note, then native Edit retains them and the same operation", async () => {
  const user = userEvent.setup();
  render(
    <InquiryForm
      locale="en"
      copy={discoveryCopy("en")}
      initialState={{
        ...state,
        review: {
          token: "signed-token",
          listings: [],
          viewingPreferences: {
            version: 1,
            provenance: "self_declared",
            timezone: "Europe/London",
            windows: [
              {
                startsAtLocal: state.values.viewingStart1,
                endsAtLocal: state.values.viewingEnd1,
                startOccurrence: "earlier",
                endOccurrence: "later",
              },
            ],
            accessNeeds: state.values.viewingAccessNeeds,
          },
        },
      }}
      action={async (previous, data) => {
        expect(data.get("_operationId")).toBe(state.operationId);
        for (const key of [
          "viewingTimezone",
          "viewingStart1",
          "viewingStartChoice1",
          "viewingEndChoice1",
          "viewingAccessNeeds",
        ] as const)
          expect(data.get(key)).toBe(state.values[key]);
        return { ...previous, review: undefined, responseId: "edited" };
      }}
    />,
  );
  const summary = screen.getByRole("region", { name: "Viewing preferences" });
  expect(summary).toHaveTextContent("Europe/London");
  expect(summary).toHaveTextContent("2030-10-27 01:15");
  expect(summary).toHaveTextContent("First occurrence");
  expect(summary).toHaveTextContent("Second occurrence");
  expect(summary).toHaveTextContent(state.values.viewingAccessNeeds);
  expect(within(summary).queryByRole("link")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit inquiry" }));
  expect(await screen.findByLabelText("Timezone for preferred times")).toHaveValue("Europe/London");
  expect(screen.getByLabelText(/^Practical access needs/)).toHaveValue(
    state.values.viewingAccessNeeds,
  );
  expect(document.querySelector('[name="reviewToken"]')).toBeNull();
});
