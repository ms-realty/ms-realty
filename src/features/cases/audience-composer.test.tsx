import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import { AudienceComposer } from "./audience-composer";

afterEach(cleanup);
it("shows one explicit audience and preserves separate drafts when switching", () => {
  render(
    <AudienceComposer
      sharedLabel="Deal participants"
      internalLabel="Internal note · staff only"
      recipients={[{ id: "synthetic-buyer", name: "Synthetic buyer" }]}
      shared={
        <label>
          Message
          <input defaultValue="" />
        </label>
      }
      internal={
        <label>
          Internal note
          <input defaultValue="" />
        </label>
      }
    />,
  );
  const message = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(message, { target: { value: "Public draft" } });
  expect(screen.getByText("Synthetic buyer")).toBeVisible();
  expect(screen.queryByRole("textbox", { name: "Internal note" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Internal note · staff only" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Internal note" }), {
    target: { value: "Confidential draft" },
  });
  expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Deal participants" }));
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Public draft");
  fireEvent.click(screen.getByRole("button", { name: "Internal note · staff only" }));
  expect(screen.getByRole("textbox", { name: "Internal note" })).toHaveValue("Confidential draft");
});

it("keeps both authorized composers usable in server HTML without JavaScript", () => {
  const html = renderToString(
    <AudienceComposer
      sharedLabel="Deal participants"
      internalLabel="Internal note · staff only"
      recipients={[]}
      shared={
        <form>
          <textarea aria-label="Message" />
        </form>
      }
      internal={
        <form>
          <textarea aria-label="Internal note" />
        </form>
      }
    />,
  );
  const page = new DOMParser().parseFromString(html, "text/html");
  expect(page.querySelectorAll("form")).toHaveLength(2);
  expect(page.querySelector("[hidden], [inert]")).toBeNull();
});
