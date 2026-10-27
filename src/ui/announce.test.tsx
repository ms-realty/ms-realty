import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { announce } from "./announce";
import { LiveAnnouncer } from "./live-announcer";

afterEach(() => {
  cleanup();
  document.querySelectorAll("[data-announcer]").forEach((node) => {
    node.remove();
  });
});

it("uses the already present server regions for route/task feedback without adding a duplicate", async () => {
  render(<LiveAnnouncer />);
  const polite = document.querySelector('[data-announcer="polite"]');
  const assertive = document.querySelector('[data-announcer="assertive"]');
  expect(polite).toBeEmptyDOMElement();
  expect(assertive).toBeEmptyDOMElement();
  expect(polite).toHaveAttribute("data-live-announcer", "true");
  announce("Three approved properties match.");
  await waitFor(() => expect(polite).toHaveTextContent("Three approved properties match."));
  announce("The source changed. Review before confirming.", "assertive");
  await waitFor(() =>
    expect(assertive).toHaveTextContent("The source changed. Review before confirming."),
  );
  expect(document.querySelectorAll("[data-announcer]")).toHaveLength(2);
  expect(document.querySelector('[data-announcer="polite"]')).toBe(polite);
});
