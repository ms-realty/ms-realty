import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import {
  openCaseDirectoryFilter,
  retainCaseDirectoryFilter,
  retainedCaseDirectoryFilter,
  sealCaseDirectoryFilter,
} from "./directory-private";

const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: vi.fn((name: string) => (values.has(name) ? { value: values.get(name) } : undefined)),
    getAll: vi.fn(() => [...values].map(([name, value]) => ({ name, value }))),
    set: vi.fn((name: string, value: string, options: { maxAge: number }) => {
      if (options.maxAge === 0) values.delete(name);
      else values.set(name, value);
    }),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("@/server/config/env", () => ({
  getEnv: () => ({ authSecret: "x".repeat(64), hosts: { staff: "https://staff.example.test" } }),
}));
const session = {
  id: "session-one",
  account: { kind: "staff", id: "broker-one" },
  expiresAt: new Date(Date.now() + 3_600_000),
} as Session;
const value = () => ({
  id: randomUUID(),
  expiresAt: Date.now() + 60_000,
  shortened: false,
  values: {
    q: "Synthetic private search",
    party: "Synthetic private party",
    purpose: "Synthetic private purpose",
    nextAction: "Synthetic private step",
  },
});

beforeEach(() => {
  jar.values.clear();
  vi.clearAllMocks();
});

it("encrypts private criteria and binds authentication to both session and locale", () => {
  const original = value();
  const encoded = sealCaseDirectoryFilter(session, "en", original);
  expect(encoded).not.toContain("Synthetic");
  expect(Buffer.from(encoded, "base64url").toString("utf8")).not.toContain("Synthetic");
  expect(openCaseDirectoryFilter(session, "en", encoded)).toEqual(original);
  expect(openCaseDirectoryFilter({ ...session, id: "session-two" }, "en", encoded)).toBeNull();
  expect(
    openCaseDirectoryFilter({ ...session, account: { kind: "staff", id: "other" } }, "en", encoded),
  ).toBeNull();
  expect(openCaseDirectoryFilter(session, "bg", encoded)).toBeNull();
  const modified = Buffer.from(encoded, "base64url");
  modified[modified.length - 1] = (modified[modified.length - 1] ?? 0) ^ 1;
  expect(openCaseDirectoryFilter(session, "en", modified.toString("base64url"))).toBeNull();
});

it("rejects expired, oversized, malformed and stale-session context without a fallback filter", () => {
  const original = value();
  const encoded = sealCaseDirectoryFilter(session, "en", original);
  expect(openCaseDirectoryFilter(session, "en", encoded, original.expiresAt)).toBeNull();
  expect(openCaseDirectoryFilter({ ...session, expiresAt: new Date(0) }, "en", encoded)).toBeNull();
  for (const invalid of ["!invalid", "x".repeat(4000), "short"])
    expect(openCaseDirectoryFilter(session, "en", invalid)).toBeNull();
});

it("retains at most two protected cookie contexts and fails visibly for displaced IDs", async () => {
  const first = randomUUID(),
    second = randomUUID(),
    third = randomUUID();
  await retainCaseDirectoryFilter(session, "en", first, { party: "First private party" }, false);
  await retainCaseDirectoryFilter(session, "en", second, { party: "Second private party" }, false);
  expect(jar.values.size).toBe(2);
  expect(await retainedCaseDirectoryFilter(session, "en", first)).toMatchObject({
    values: { party: "First private party" },
  });
  await retainCaseDirectoryFilter(session, "en", third, { party: "Third private party" }, true);
  expect(jar.values.size).toBe(2);
  expect(await retainedCaseDirectoryFilter(session, "en", third)).toMatchObject({
    shortened: true,
  });
  const retained = await Promise.all(
    [first, second].map((id) => retainedCaseDirectoryFilter(session, "en", id)),
  );
  expect(retained.filter(Boolean)).toHaveLength(1);
  expect(await retainedCaseDirectoryFilter(session, "en", "not-an-id")).toBeNull();
  const last = jar.set.mock.calls.at(-1);
  expect(last?.[2]).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/en/cases",
    maxAge: 1800,
  });
  for (const encoded of jar.values.values()) expect(encoded.length).toBeLessThanOrEqual(3500);
});

it("refuses a cookie that cannot fit instead of silently dropping part of the filter", async () => {
  const malformed = "\ud800".repeat(120);
  await expect(
    retainCaseDirectoryFilter(
      session,
      "en",
      randomUUID(),
      { q: malformed, party: malformed, purpose: malformed, nextAction: malformed },
      false,
    ),
  ).resolves.toBe(false);
  expect(jar.values.size).toBe(0);
});
