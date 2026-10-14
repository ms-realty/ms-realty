import assert from "node:assert/strict";
import { test } from "node:test";
import { settle } from "./staging-settle.mjs";

function clock() {
  let at = 0;
  return { now: () => at, wait: async (ms) => void (at += ms) };
}

test("returns the first success after transient failures", async () => {
  const c = clock();
  let calls = 0;
  const value = await settle(
    async () => {
      calls++;
      if (calls < 3) throw new Error("starting");
      return "ready";
    },
    { ms: 60_000, ...c },
  );
  assert.equal(value, "ready");
  assert.equal(calls, 3);
});

test("rethrows the last error once the deadline passes", async () => {
  const c = clock();
  let calls = 0;
  await assert.rejects(
    settle(
      async () => {
        calls++;
        throw new Error(`attempt ${calls}`);
      },
      { ms: 12_000, every: 5_000, ...c },
    ),
    /attempt 3/,
  );
  assert.equal(c.now(), 10_000);
});
