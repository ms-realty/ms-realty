import { afterEach, expect, it, vi } from "vitest";
import { installAnalyticsDocumentNavigation } from "./document-navigation";

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState({}, "", "/");
});
it("preempts Next link handlers with a document navigation before an inquiry or query can replace the page", () => {
  history.replaceState({}, "", "/bg");
  const navigate = vi.fn();
  const router = vi.fn();
  const release = installAnalyticsDocumentNavigation(navigate);
  document.body.innerHTML = '<a href="/bg/inquire?reference=MS-00815"><span>Ask</span></a>';
  document.body.addEventListener("click", router);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  document.querySelector("span")?.dispatchEvent(click);
  expect(navigate).toHaveBeenCalledWith(`${location.origin}/bg/inquire?reference=MS-00815`);
  expect(click.defaultPrevented).toBe(true);
  expect(router).not.toHaveBeenCalled();
  release();
  document.body.removeEventListener("click", router);
});
it("allows new tabs and external links to keep their native behavior", () => {
  const navigate = vi.fn();
  const release = installAnalyticsDocumentNavigation(navigate);
  for (const attributes of [
    'href="https://outside.example/"',
    'href="/en" target="_blank"',
    'href="/en" download',
  ]) {
    document.body.innerHTML = `<a ${attributes}>Visit</a>`;
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.querySelector("a")?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  }
  expect(navigate).not.toHaveBeenCalled();
  release();
});
it("reloads on back/forward before the client router can restore a sensitive page, and removes guards on cleanup", () => {
  const reload = vi.fn();
  const router = vi.fn();
  window.addEventListener("popstate", router);
  const release = installAnalyticsDocumentNavigation(vi.fn(), reload);
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(reload).toHaveBeenCalledOnce();
  expect(router).not.toHaveBeenCalled();
  release();
  window.dispatchEvent(new PopStateEvent("popstate"));
  expect(router).toHaveBeenCalledOnce();
  window.removeEventListener("popstate", router);
});
