import { expect, it } from "vitest";
import {
  isDepartingWorkspacePrefetch,
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
