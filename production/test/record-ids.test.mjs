import test from "node:test";
import assert from "node:assert/strict";
import { findByIdempotencyKey, newRecordId, normalizeIdempotencyKey } from "../lib/record-ids.mjs";

test("record ids are prefixed, unique, and never derived from caller input", () => {
  const first = newRecordId("lead-draft");
  const second = newRecordId("lead-draft");
  assert.match(first, /^lead-draft-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(first, second, "two records minted in the same tick must differ");

  const ids = new Set(Array.from({ length: 500 }, () => newRecordId("saved-search")));
  assert.equal(ids.size, 500, "no collisions across a burst of submissions");

  for (const bad of ["", "Lead", "lead_draft", "-lead", "l".repeat(41), null]) {
    assert.throws(() => newRecordId(bad), /prefix/);
  }
});

test("idempotency keys are constrained and separate from identity", () => {
  assert.equal(normalizeIdempotencyKey(" browser-retry:1 "), "browser-retry:1");
  assert.equal(normalizeIdempotencyKey("a.b_c-d:1"), "a.b_c-d:1");
  assert.equal(normalizeIdempotencyKey(""), null);
  assert.equal(normalizeIdempotencyKey(undefined), null);
  assert.equal(normalizeIdempotencyKey(null), null);
  assert.equal(normalizeIdempotencyKey("x".repeat(128)), "x".repeat(128));

  for (const bad of ["has space", "emoji-🙂", "x".repeat(129), "-leading-symbol-is-fine?"]) {
    assert.throws(() => normalizeIdempotencyKey(bad), /idempotencyKey/);
  }
});

test("lookup finds a prior submission only for a real key", () => {
  const rows = [
    { id: "lead-draft-1", idempotency_key: null },
    { id: "lead-draft-2", idempotency_key: "retry-a" },
    null,
  ];
  assert.equal(findByIdempotencyKey(rows, "retry-a").id, "lead-draft-2");
  assert.equal(findByIdempotencyKey(rows, "retry-b"), null);
  // A null key must never match the rows that also have no key.
  assert.equal(findByIdempotencyKey(rows, null), null);
  assert.equal(findByIdempotencyKey([], "retry-a"), null);
});
