import { describe, expect, it } from "vitest";

import { hashRequest, keyedHash, randomToken } from "./crypto";

describe("crypto helpers", () => {
  it("hashes requests canonically: key order and undefined fields do not matter", () => {
    expect(hashRequest({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(
      hashRequest({ b: { d: "x", c: [1, 2] }, a: 1, e: undefined }),
    );
    expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
    expect(hashRequest([1, 2])).not.toBe(hashRequest([2, 1]));
  });

  it("produces 32-byte random tokens and secret-dependent keyed hashes", () => {
    expect(Buffer.from(randomToken(), "base64url")).toHaveLength(32);
    expect(randomToken()).not.toBe(randomToken());
    expect(keyedHash("a".repeat(32), "192.0.2.1")).not.toBe(keyedHash("b".repeat(32), "192.0.2.1"));
  });
});
