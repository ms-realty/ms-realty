import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { discoveryCopy } from "./copy";
import { InquiryForm } from "./inquiry-form";
import {
  emptyInquiry,
  type InquiryState,
  inquiryPermalink,
  inquiryReceiptView,
} from "./inquiry-state";

afterEach(cleanup);
describe("P11 inquiry draft", () => {
  it("retains separate contact drafts, selected method and consent after server validation", async () => {
    const user = userEvent.setup();
    const state: InquiryState = {
      operationId: "server-key",
      expectedRevision: null,
      responseId: "initial",
      values: emptyInquiry,
      outcome: { kind: "idle" },
    };
    render(
      <InquiryForm
        locale="en"
        copy={discoveryCopy("en")}
        initialState={state}
        action={async (previous, data) => ({
          ...previous,
          responseId: "checked",
          values: Object.fromEntries(
            Object.keys(emptyInquiry).map((key) => [key, String(data.get(key) ?? "")]),
          ) as typeof emptyInquiry,
          outcome: {
            kind: "validation",
            code: "VALIDATION_FAILED",
            message: "Check",
            fieldErrors: { message: ["Add a question"] },
          },
        })}
      />,
    );
    await user.type(screen.getByLabelText("Email", { exact: true }), "visitor@example.test");
    await user.selectOptions(screen.getByLabelText("Preferred contact method"), "phone");
    await user.type(
      screen.getByLabelText("Phone with country code", { exact: true }),
      "+359881234567",
    );
    await user.selectOptions(screen.getByLabelText("Preferred contact method"), "email");
    expect(screen.getByLabelText("Email", { exact: true })).toHaveValue("visitor@example.test");
    await user.selectOptions(screen.getByLabelText("Preferred contact method"), "phone");
    expect(screen.getByLabelText("Phone with country code", { exact: true })).toHaveValue(
      "+359881234567",
    );
    const consent = screen.getByRole("checkbox");
    await user.click(consent);
    await user.click(screen.getByRole("button", { name: "Review inquiry" }));
    await screen.findByRole("link", { name: "Your inquiry: Add a question" });
    expect(screen.getByLabelText("Preferred contact method")).toHaveValue("phone");
    expect(screen.getByLabelText("Phone with country code", { exact: true })).toHaveValue(
      "+359881234567",
    );
    expect(consent).toBeChecked();
  });
});

describe("P07 collective inquiry retention", () => {
  const selectedListings = JSON.stringify(
    ["MS-00303", "MS-00101", "MS-00202"].map((reference, index) => ({
      reference,
      observedManifestId: `12345678-1234-4123-8123-12345678900${index}`,
    })),
  );
  const state: InquiryState = {
    operationId: "server-key",
    expectedRevision: null,
    responseId: "initial",
    values: { ...emptyInquiry, selectedListings },
    outcome: { kind: "idle" },
  };
  it("carries one ordered JSON field through server validation and exposes a focusable error target", async () => {
    const user = userEvent.setup();
    const rendered = render(
      <InquiryForm
        locale="en"
        copy={discoveryCopy("en")}
        initialState={state}
        action={async (previous, data) => {
          expect(data.getAll("selectedListings")).toEqual([selectedListings]);
          return {
            ...previous,
            responseId: "invalid-selection",
            outcome: {
              kind: "validation",
              code: "VALIDATION_FAILED",
              message: "Check",
              fieldErrors: { selectedListings: ["Review all selected properties"] },
            },
          };
        }}
      />,
    );
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "MS-00303",
      "MS-00101",
      "MS-00202",
    ]);
    expect(screen.queryByRole("option", { name: "Request a viewing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Review inquiry" }));
    const errorLink = await screen.findByRole("link", {
      name: "Compare: Review all selected properties",
    });
    await user.click(errorLink);
    expect(screen.getByRole("region", { name: "Compare" })).toHaveFocus();
    expect(rendered.container.querySelector('input[name="selectedListings"]')).toHaveValue(
      selectedListings,
    );
  });
  it("retains selection in native permalink and immediate receipt without contact data", () => {
    const url = new URL(inquiryPermalink("en", "key", state.values), "https://example.test");
    expect(url.searchParams.get("selection")).toBe(selectedListings);
    const receipt = inquiryReceiptView(
      {
        receiptId: "key",
        reference: "RQ-2026-000001",
        status: "accepted",
        acceptedAt: "2026-09-30T12:00:00Z",
        purpose: "question",
        locale: "en",
        listing: null,
        selectedListings: ["MS-00303", "MS-00101", "MS-00202"].map((reference) => ({
          reference,
          title: null,
          locale: null,
          sourceUrl: null,
          publicNow: null,
        })),
        listingReference: null,
        selectedListingReferences: ["MS-00303", "MS-00101", "MS-00202"],
        comparisonReferences: [],
      },
      "en",
      discoveryCopy("en"),
    );
    expect(receipt.nextStep).toContain("MS-00303, MS-00101, MS-00202");
    expect(receipt.destination.href).toBe("/en/requests/key");
  });
});

it("identifies only the individual inquiry subject on immediate confirmation, not its comparison return set", () => {
  const receipt = inquiryReceiptView(
    {
      receiptId: "key",
      reference: "RQ-2026-000001",
      status: "accepted",
      acceptedAt: "2026-09-30T12:00:00Z",
      purpose: "question",
      locale: "en",
      listing: {
        reference: "MS-00101",
        title: null,
        locale: null,
        sourceUrl: null,
        publicNow: null,
      },
      selectedListings: [],
      listingReference: "MS-00101",
      selectedListingReferences: [],
      comparisonReferences: ["MS-00303", "MS-00101", "MS-00202"],
    },
    "en",
    discoveryCopy("en"),
  );
  expect(receipt.nextStep).toContain("MS-00101");
  expect(receipt.nextStep).not.toMatch(/MS-00303|MS-00202/);
});
