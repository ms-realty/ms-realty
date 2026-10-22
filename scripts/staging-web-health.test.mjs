import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForStagingWebHealth } from "./staging-web-health.mjs";

const input = {
  sourceCommit: "qualified-source",
  origins: {
    public: "https://www.stage.example.test",
    client: "https://my.stage.example.test",
    staff: "https://app.stage.example.test",
  },
};
const ready = (body = { status: "ok", build: input.sourceCommit }, noindex = true) =>
  Response.json(body, { headers: noindex ? { "x-robots-tag": "noindex, nofollow" } : {} });
function retryClock() {
  let elapsed = 0;
  return {
    now: () => elapsed,
    wait: async (ms) => {
      elapsed += ms;
    },
    log: () => {},
  };
}

test("waits through a cold web response, then qualifies all three unchanged protected hosts", async () => {
  const seen = [];
  let publicReads = 0;
  const headers = { "CF-Access-Client-Id": "synthetic-service" };
  const result = await waitForStagingWebHealth(input, headers, {
    fetcher: async (url, options) => {
      seen.push({ url, options });
      if (url.startsWith(input.origins.public) && ++publicReads === 1)
        return new Response("starting", { status: 500 });
      return ready();
    },
    retry: retryClock(),
  });
  assert.deepEqual(
    result.map(({ role }) => role),
    ["public", "client", "staff"],
  );
  assert.equal(publicReads, 2);
  assert.equal(seen.length, 6);
  assert(seen.every(({ url, options }) => url.endsWith("/api/health") && !options.method));
  assert(seen.every(({ options }) => options.headers === headers && options.redirect === "error"));
});

for (const [name, response, expected] of [
  ["rejected access", () => new Response(null, { status: 403 }), /access rejected/],
  ["missing noindex", () => ready(undefined, false), /missing noindex/],
  ["another source", () => ready({ status: "ok", build: "another-source" }), /identity mismatch/],
]) {
  test(`does not retry ${name}`, async () => {
    let waits = 0;
    await assert.rejects(
      waitForStagingWebHealth(
        input,
        {},
        {
          fetcher: async () => response(),
          retry: {
            ...retryClock(),
            wait: async () => {
              waits++;
            },
          },
        },
      ),
      expected,
    );
    assert.equal(waits, 0);
  });
}
