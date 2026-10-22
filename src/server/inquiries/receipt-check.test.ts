import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/errors";
import { getEnv } from "../config/env";
import { issuedCheckCode, issueSubmissionKey, receiptCheckAttempted } from "./intake";

vi.mock("../config/env", async (original) => {
  const actual = await original<typeof import("../config/env")>();
  return { ...actual, getEnv: vi.fn(actual.getEnv) };
});

describe("P12 receiptCheckAttempted", () => {
  it("treats a missing, foreign or mismatched receipt session as not checked", () => {
    expect(receiptCheckAttempted(new AppError("not_found"))).toBe(false);
  });
  it("treats any other failure as an attempted check with an unknown result", () => {
    expect(receiptCheckAttempted(new AppError("unavailable"))).toBe(true);
    expect(receiptCheckAttempted(new Error("connection reset"))).toBe(true);
  });
});

describe("P12 issuedCheckCode", () => {
  it("names an issued key and nothing for a forged one", () => {
    const key = issueSubmissionKey();
    expect(issuedCheckCode(key)).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(issuedCheckCode(`${key.slice(0, 44)}${"0".repeat(32)}`)).toBeNull();
    expect(issuedCheckCode("not-a-key")).toBeNull();
  });
  it("yields no code when key verification cannot run", () => {
    const key = issueSubmissionKey();
    vi.mocked(getEnv).mockImplementationOnce(() => {
      throw new Error("AUTH_SECRET is not configured");
    });
    expect(issuedCheckCode(key)).toBeNull();
  });
});
