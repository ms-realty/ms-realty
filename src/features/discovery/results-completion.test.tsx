import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { announce } from "@/ui/announce";
import { ResultsCompletion } from "./results-completion";

vi.mock("@/ui/announce", () => ({ announce: vi.fn() }));
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
function Screen({
  identity = "first",
  message = "Search updated. Results: 2.",
}: {
  identity?: string;
  message?: string;
}) {
  return (
    <>
      <h1 id="discovery-title" tabIndex={-1}>
        Search
      </h1>
      <h2 id="results-heading" tabIndex={-1}>
        Results
      </h2>
      <form action="/en/properties" method="get" onSubmit={(event) => event.preventDefault()}>
        <input name="q" defaultValue="next" />
        <button type="submit">Search</button>
      </form>
      <ResultsCompletion
        locale="en"
        identity={identity}
        message={message}
        success
        offlineTitle="Reconnect and search again"
      />
    </>
  );
}
it("P02/M134 preserves direct-entry focus, then focuses and announces only the requested completed query", () => {
  window.history.replaceState({}, "", "/en/properties?q=first");
  const view = render(<Screen />);
  expect(screen.getByRole("heading", { name: "Results" })).not.toHaveFocus();
  expect(announce).not.toHaveBeenCalled();
  fireEvent.submit(document.querySelector("form") as HTMLFormElement);
  window.history.replaceState({}, "", "/en/properties?q=next");
  view.rerender(<Screen identity="next" />);
  expect(screen.getByRole("heading", { name: "Results" })).toHaveFocus();
  expect(announce).toHaveBeenCalledExactlyOnceWith("Search updated. Results: 2.");
  view.rerender(<Screen identity="next" />);
  expect(announce).toHaveBeenCalledTimes(1);
});
it("P02/M134 refuses an obsolete target and never automatically replays a request on reconnect", () => {
  sessionStorage.setItem("ms-realty.search-completion.v1", "/en/properties?q=obsolete");
  window.history.replaceState({}, "", "/en/properties?q=current");
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<Screen />);
  expect(announce).not.toHaveBeenCalled();
  expect(screen.getByText("Reconnect and search again")).toBeVisible();
  online.mockReturnValue(true);
  fireEvent(window, new Event("online"));
  expect(screen.queryByText("Reconnect and search again")).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
