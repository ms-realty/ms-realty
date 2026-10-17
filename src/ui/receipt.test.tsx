import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { Receipt } from "./receipt";

afterEach(cleanup);
const props = {
  title: "Change recorded",
  referenceLabel: "Record reference",
  recordedAt: { dateTime: "2026-10-01T09:00:00Z", label: "Recorded at the agency" },
  recordedAtLabel: "Recorded at",
  actions: <a href="/en/tasks/next">Open current task</a>,
};

it.each([
  ["bg", "Технически данни"],
  ["en", "Technical details"],
  ["he", "פרטים טכניים"],
])("keeps an opaque record reference under localized details in %s", async (locale, label) => {
  const id = "00000000-0000-4000-8000-000000000001";
  render(<Receipt {...props} locale={locale} reference={id} />);
  expect(screen.getByRole("heading", { name: "Change recorded" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open current task" })).toHaveAttribute(
    "href",
    "/en/tasks/next",
  );
  expect(screen.getByText("Recorded at the agency")).toBeVisible();
  expect(screen.getByText(id)).not.toBeVisible();
  await userEvent.click(screen.getByText(label));
  expect(screen.getByText(id)).toBeVisible();
});

it("keeps a human listing reference on the receipt's primary surface", () => {
  const { container } = render(<Receipt {...props} reference="MS-202" />);
  expect(screen.getByText("MS-202")).toBeVisible();
  expect(container.querySelector("details")).toBeNull();
});
