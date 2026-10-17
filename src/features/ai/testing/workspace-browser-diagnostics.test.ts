import { expect, it } from "vitest";
import {
  classifyWorkspaceNavigationPrefetchPageError,
  isDepartingWorkspacePrefetch,
  type WorkspaceObservedRscRequest,
  type WorkspacePageError,
  type WorkspacePrefetchFailure,
} from "./workspace-browser-diagnostics";

const origin = "http://app.localhost:3100";
const departing = origin + "/bg/operations/assistance/research/synthetic-workspace";
const prefetch: WorkspacePrefetchFailure = {
  error: "Load request cancelled",
  method: "GET",
  resourceType: "fetch",
  url: origin + "/bg/operations/assistance?_rsc=synthetic-prefetch",
  referer: departing,
  rsc: "1",
  prefetch: "1",
};

it("identifies the observed cancelled Next prefetch only during its explicit departure", () => {
  expect(isDepartingWorkspacePrefetch(prefetch, departing, origin)).toBe(true);
  expect(isDepartingWorkspacePrefetch(prefetch, null, origin)).toBe(false);
  expect(isDepartingWorkspacePrefetch(prefetch, departing + "?other=1", origin)).toBe(false);
});

const observed: WorkspaceObservedRscRequest = {
  method: prefetch.method,
  resourceType: prefetch.resourceType,
  url: prefetch.url,
  referer: prefetch.referer,
  rsc: prefetch.rsc,
  prefetch: prefetch.prefetch,
  status: 200,
  finished: true,
  failure: null,
};
const pageError: WorkspacePageError = {
  name: "Fetch API cannot load http",
  message:
    "/app.localhost:3100/bg/operations/assistance?_rsc=synthetic-prefetch due to access control checks.",
  stack:
    "Fetch API cannot load " +
    observed.url +
    " due to access control checks.\n    at C (" +
    origin +
    "/_next/static/chunks/synthetic.js:1:18741)",
};

it("records the observed WebKit navigation page error separately from request aborts", () => {
  expect(
    classifyWorkspaceNavigationPrefetchPageError(
      "webkit",
      pageError,
      [observed],
      departing,
      origin,
    ),
  ).toEqual({ error: pageError, departingPage: departing, requests: [observed] });
  expect(
    classifyWorkspaceNavigationPrefetchPageError("webkit", pageError, [], departing, origin),
  ).toBeNull();
});

it("does not excuse the same message outside the exact departing page or browser", () => {
  for (const [browser, source] of [
    ["webkit", null],
    ["webkit", departing + "?other=1"],
    ["chromium", departing],
    ["firefox", departing],
  ])
    expect(
      classifyWorkspaceNavigationPrefetchPageError(
        browser ?? "",
        pageError,
        [observed],
        source ?? null,
        origin,
      ),
    ).toBeNull();
});

it.each<[string, Partial<WorkspaceObservedRscRequest>]>([
  ["active fetch", { prefetch: undefined }],
  ["document", { resourceType: "document" }],
  ["POST", { method: "POST" }],
  ["other origin", { url: "http://other.localhost:3100/bg/operations/assistance?_rsc=x" }],
  ["other referer", { referer: departing + "?other=1" }],
  ["other URL", { url: observed.url + "other" }],
  ["missing RSC", { rsc: undefined }],
  ["access denied response", { status: 403 }],
  ["server error response", { status: 500 }],
  ["unfinished response", { finished: false }],
  ["unknown response", { status: null }],
  ["failed response", { failure: "cancelled" }],
])("retains navigation errors with %s metadata", (_label, changes) => {
  expect(
    classifyWorkspaceNavigationPrefetchPageError(
      "webkit",
      pageError,
      [{ ...observed, ...changes }],
      departing,
      origin,
    ),
  ).toBeNull();
  if (!changes.url)
    expect(
      classifyWorkspaceNavigationPrefetchPageError(
        "webkit",
        pageError,
        [observed, { ...observed, ...changes }],
        departing,
        origin,
      ),
    ).toBeNull();
});

it.each<[string, Partial<WorkspacePageError>]>([
  ["another error name", { name: "TypeError" }],
  ["different message", { message: "Failed to fetch" }],
  ["malformed URL", { stack: "Fetch API cannot load invalid due to access control checks." }],
  ["no stack", { stack: undefined }],
  ["other stack", { stack: "Error: application failure" }],
  [
    "no framework frame",
    { stack: "Fetch API cannot load " + observed.url + " due to access control checks." },
  ],
])("retains %s instead of broadly filtering page errors", (_label, changes) => {
  expect(
    classifyWorkspaceNavigationPrefetchPageError(
      "webkit",
      { ...pageError, ...changes },
      [observed],
      departing,
      origin,
    ),
  ).toBeNull();
});

it("accepts the observed macOS abort spelling with the same navigation and prefetch boundaries", () => {
  const cancelled = { ...prefetch, error: "cancelled" };
  expect(isDepartingWorkspacePrefetch(cancelled, departing, origin)).toBe(true);
  expect(isDepartingWorkspacePrefetch(cancelled, null, origin)).toBe(false);
  expect(
    isDepartingWorkspacePrefetch({ ...cancelled, prefetch: undefined }, departing, origin),
  ).toBe(false);
  expect(
    isDepartingWorkspacePrefetch(
      { ...prefetch, error: "request cancelled unexpectedly" },
      departing,
      origin,
    ),
  ).toBe(false);
});

it.each<[string, Partial<WorkspacePrefetchFailure>]>([
  ["active navigation", { resourceType: "document" }],
  ["ordinary fetch", { prefetch: undefined }],
  ["network failure", { error: "Failed to fetch" }],
  ["server failure", { error: "HTTP 500" }],
  ["POST", { method: "POST" }],
  ["image", { resourceType: "image" }],
  ["another origin", { url: "http://other.localhost:3100/bg/operations/assistance?_rsc=x" }],
  ["missing RSC query", { url: origin + "/bg/operations/assistance" }],
  ["missing RSC header", { rsc: undefined }],
  ["different prefetch value", { prefetch: "0" }],
  ["different source page", { referer: origin + "/ru/operations/assistance/research/other" }],
  ["malformed URL", { url: "not a URL" }],
])("retains %s as a failure", (_label, changes) => {
  expect(isDepartingWorkspacePrefetch({ ...prefetch, ...changes }, departing, origin)).toBe(false);
});
