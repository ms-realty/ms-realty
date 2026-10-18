import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { InquiryForm } from "./inquiry-form";
import { emptyInquiry, type InquiryState } from "./inquiry-state";
import { ViewingPreferenceSummary } from "./inquiry-viewing";

afterEach(cleanup);
// 2030-10-27: Sofia's clocks go back at 04:00, so 03:00–03:59 happens twice.
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
    viewingStart1: "2030-10-27T03:15",
    viewingEnd1: "2030-10-27T03:45",
    viewingAccessNeeds: "Step-free access, please.",
  },
};
const forbidden = /Europe\/|Asia\/|UTC|GMT|occurrence|Repeated-clock/;

it("provides native optional windows on Sofia time and exposes retained errors in the right disclosure", () => {
  const { container } = render(
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
  const second = screen.getByLabelText(/^From date and time 2.*optional/i);
  expect(second).toHaveAttribute("type", "datetime-local");
  expect(second).toHaveAccessibleDescription(/^Sofia time/);
  expect(screen.queryByLabelText(/time ?zone/i)).not.toBeInTheDocument();
  expect(screen.getByText("Complete this window", { selector: "p" })).toBeVisible();
  expect(screen.getByRole("combobox", { name: "Preferred format" })).toHaveTextContent("In person");
  expect(screen.queryByRole("option", { name: /video/i })).not.toBeInTheDocument();
  expect(container.querySelector("form")?.textContent).not.toMatch(forbidden);
});

it("never asks a visitor which repeated hour: it takes the first and says so", () => {
  render(
    <InquiryForm
      locale="en"
      copy={discoveryCopy("en")}
      initialState={state}
      action={async (previous) => previous}
    />,
  );
  const viewing = screen.getByRole("group", { name: "Viewing preferences" });
  expect(
    within(viewing)
      .getAllByRole("combobox")
      .map((select) => select.getAttribute("name")),
  ).toEqual(["viewingFormat"]);
  const from = screen.getByLabelText(/^From date and time 1/);
  expect(from).toHaveAccessibleDescription(
    /27 October 2030.*03:15.*The clocks go back one hour that night.*use the first one/,
  );
  expect(document.querySelector('[name^="viewingStartChoice"]')).toBeNull();
  expect(document.querySelector('[name="viewingTimezone"]')).toBeNull();
});

it("reviews the windows in words with the first-occurrence note, then native Edit keeps them and the same operation", async () => {
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
            timezone: "Europe/Sofia",
            windows: [
              {
                startsAtLocal: state.values.viewingStart1,
                endsAtLocal: state.values.viewingEnd1,
                startOccurrence: "earlier",
                endOccurrence: "earlier",
              },
            ],
            accessNeeds: state.values.viewingAccessNeeds,
          },
        },
      }}
      action={async (previous, data) => {
        expect(data.get("_operationId")).toBe(state.operationId);
        for (const key of ["viewingStart1", "viewingEnd1", "viewingAccessNeeds"] as const)
          expect(data.get(key)).toBe(state.values[key]);
        return { ...previous, review: undefined, responseId: "edited" };
      }}
    />,
  );
  const summary = screen.getByRole("region", { name: "Viewing preferences" });
  expect(summary).toHaveTextContent("Time zoneSofia time");
  expect(summary).toHaveTextContent(/27 October 2030.*03:15.*03:45/);
  expect(summary).toHaveTextContent("We'll use the first one, before the change.");
  expect(summary).not.toHaveTextContent(/Europe\/|2030-10-27/);
  expect(summary).toHaveTextContent(state.values.viewingAccessNeeds);
  expect(within(summary).queryByRole("link")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Edit inquiry" }));
  expect(await screen.findByLabelText(/^From date and time 1/)).toHaveValue("2030-10-27T03:15");
  expect(screen.getByLabelText(/^Practical access needs/)).toHaveValue(
    state.values.viewingAccessNeeds,
  );
  expect(document.querySelector('[name="reviewToken"]')).toBeNull();
});

it("words an older preference kept in another zone without its zone id", () => {
  render(
    <ViewingPreferenceSummary
      locale="en"
      input={{
        version: 1,
        provenance: "self_declared",
        timezone: "Europe/London",
        windows: [
          {
            startsAtLocal: "2030-10-27T01:15",
            endsAtLocal: "2030-10-27T01:45",
            startOccurrence: "later",
            endOccurrence: "later",
          },
        ],
      }}
    />,
  );
  const summary = screen.getByRole("region", { name: "Viewing preferences" });
  expect(summary).toHaveTextContent(/27 October 2030.*01:15.*01:45/);
  expect(summary).toHaveTextContent("Second, after the clocks change");
  expect(summary).not.toHaveTextContent(/Europe\/|UTC|GMT/);
  expect(summary).not.toHaveTextContent("We'll use the first one");
});
