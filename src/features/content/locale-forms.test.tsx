import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { type FormState, formFields } from "@/ui/form/contract";
import type { DecisionValues } from "./actions";
import { contentCopy } from "./copy";
import type { LocaleContentValues } from "./locale-actions";
import { contentLocaleCopy } from "./locale-copy";
import { ContentLocaleForm, ContentLocaleReviewForm } from "./locale-forms";

afterEach(cleanup);
const initial: FormState<LocaleContentValues> = {
  operationId: "synthetic-operation-key",
  expectedRevision: 2,
  responseId: "first",
  values: {
    title: "כותרת בדיקה",
    text: "טקסט MS-00001 https://example.test/",
    bodyFormat: "paragraphs",
    composition: "[]",
  },
  outcome: { kind: "idle" },
};
it("O21 / AT03: Hebrew fields preserve native names, exact mixed-direction text and their own language", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <ContentLocaleForm
      shell="en"
      id="synthetic"
      target="he"
      initialState={initial}
      action={async (state) => state}
    />,
  );
  const form = host.querySelector("form");
  if (!form) throw new Error("Missing native edition form");
  const data = new FormData(form);
  expect(data.get("title")).toBe(initial.values.title);
  expect(data.get("text")).toBe(initial.values.text);
  for (const field of host.querySelectorAll('[name="title"], [name="text"]')) {
    expect(field).toHaveAttribute("lang", "he");
    expect(field).toHaveAttribute("dir", "rtl");
  }
  expect(data.get(formFields.operationId)).toBe(initial.operationId);
  expect(data.get(formFields.expectedRevision)).toBe("2");
  expect(host.querySelector('input[name="sourceVersionId"]')).toBeNull();
  expect(host.textContent).toContain(contentLocaleCopy("en").manual);
});

it("O21 native review keeps a separate explicit human confirmation and does not require expiry for requesting review", () => {
  const initialReview: FormState<DecisionValues> = {
    ...initial,
    outcome: { kind: "idle" },
    values: { note: "", reviewed: "", expiresAt: "" },
  };
  const host = document.createElement("div");
  host.innerHTML = renderToString(
    <ContentLocaleReviewForm
      shell="en"
      id="synthetic"
      target="he"
      decision="request_review"
      initialState={initialReview}
      action={async (state) => state}
    />,
  );
  const checkbox = host.querySelector<HTMLInputElement>('input[name="reviewed"]');
  expect(checkbox).not.toBeChecked();
  expect(checkbox).toHaveAttribute("required");
  expect(host.querySelector('[name="expiresAt"]')).toBeNull();
  expect(host.querySelector("button[type=submit]")?.textContent).toContain(
    contentLocaleCopy("en").request_review,
  );
});

it("O21 unknown save keeps target text and the same operation available for reconciliation", async () => {
  render(
    <ContentLocaleForm
      shell="en"
      id="synthetic"
      target="he"
      initialState={initial}
      action={async (state) => ({
        ...state,
        responseId: "unknown",
        outcome: {
          kind: "unknown",
          code: "OUTCOME_UNKNOWN",
          message: contentCopy("en").retained,
          status: {
            href: "/en/content/synthetic/editions/he/operations?kind=save&key=same",
            label: contentCopy("en").check,
          },
        },
      })}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: contentCopy("en").save }));
  expect(await screen.findByText(contentCopy("en").retained)).toBeVisible();
  expect(screen.getByLabelText(contentCopy("en").text, { exact: true })).toHaveValue(
    initial.values.text,
  );
  expect(
    screen
      .getAllByRole("link", { name: contentCopy("en").check })
      .some((link) => link.getAttribute("href")?.includes("key=same")),
  ).toBe(true);
});
