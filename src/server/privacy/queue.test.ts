import { expect, it } from "vitest";
import { privacyQueuePath, privacyQueueQuery } from "./requests";

const value = {
  createdAt: "2026-09-30T10:00:00.123456Z",
  id: "00000000-0000-4000-8000-000000000001",
};
const token = Buffer.from(JSON.stringify(value)).toString("base64url");
it("accepts a precise cursor and rejects ambiguous, duplicate, oversized and malformed positions", () => {
  expect(privacyQueueQuery.parse({ after: token }).after).toEqual(value);
  expect(privacyQueueQuery.parse({ before: token }).before).toEqual(value);
  for (const input of [
    { after: token, before: token },
    { after: [token, token] },
    { after: "x".repeat(257) },
    { before: "malformed" },
  ])
    expect(privacyQueueQuery.safeParse(input).success).toBe(false);
});
it("builds a locale-bound native return position without carrying a receipt or arbitrary destination", () => {
  expect(privacyQueuePath("bg", { after: token })).toBe(`/bg/operations/privacy?after=${token}`);
  expect(privacyQueuePath("en", { before: token })).toBe(`/en/operations/privacy?before=${token}`);
  expect(privacyQueuePath("en")).toBe("/en/operations/privacy");
  expect(() => privacyQueuePath("en", { after: "https://foreign.example.test" })).toThrow();
});
