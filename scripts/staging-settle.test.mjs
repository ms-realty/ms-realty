import assert from "node:assert/strict";
import { test } from "node:test";
import { permanent, settle } from "./staging-settle.mjs";

function clock() {
  let at = 0;
  return {
    now: () => at,
    wait: async (ms) => {
      at += ms;
    },
  };
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
    { ms: 60_000, log: () => {}, ...c },
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
      { ms: 12_000, every: 5_000, log: () => {}, ...c },
    ),
    /attempt 3/,
  );
  assert.equal(c.now(), 10_000);
});

test("stops at once on a permanent error and logs each new message once", async () => {
  const c = clock(),
    logged = [];
  let calls = 0;
  await assert.rejects(
    settle(
      async () => {
        calls++;
        if (calls < 3) throw new Error("starting");
        throw permanent("rejected credential (HTTP 403)");
      },
      { ms: 60_000, log: (line) => logged.push(line), ...c },
    ),
    /HTTP 403/,
  );
  assert.equal(calls, 3);
  assert.deepEqual(logged, ["Waiting, will retry: starting"]);
});
