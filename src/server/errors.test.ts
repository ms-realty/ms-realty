import { describe, expect, it } from "vitest";

import { AppError, errorStatus, toErrorBody } from "./errors";

// Architecture §5.1 error result.
describe("toErrorBody", () => {
  it("carries code, safe message, field errors, retryability, correlation id and outcome", () => {
    const error = new AppError("validation_failed", {
      fieldErrors: { email: ["invalid_email"] },
      detail: "zod said: <internal>",
    });
    const body = toErrorBody(error, "corr-12345678");
    expect(body).toEqual({
      code: "VALIDATION_FAILED",
      message: "Some details need attention.",
      fieldErrors: { email: ["invalid_email"] },
      retryable: false,
      correlationId: "corr-12345678",
      outcome: "not_applied",
    });
    expect(JSON.stringify(body)).not.toContain("internal");
  });

  it("hides unexpected errors behind internal_error with an unknown outcome", () => {
    const body = toErrorBody(new Error("password=hunter2 at db.ts:12"), "corr-1");
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", retryable: true, outcome: "unknown" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(errorStatus(new Error("x"))).toBe(500);
  });

  it("includes retry-after and conflict snapshots when present", () => {
    expect(toErrorBody(new AppError("rate_limited", { retryAfterSeconds: 30 }), "c")).toMatchObject(
      {
        retryAfterSeconds: 30,
        retryable: true,
      },
    );
    expect(
      toErrorBody(new AppError("version_conflict", { current: { version: 4 } }), "c"),
    ).toMatchObject({ current: { version: 4 }, outcome: "not_applied" });
  });

  it.each([
    ["validation_failed", "VALIDATION_FAILED"],
    ["forbidden", "NOT_AUTHORIZED"],
    ["version_conflict", "REVISION_CONFLICT"],
    ["approval_stale", "APPROVAL_STALE"],
    ["publication_ineligible", "PUBLICATION_INELIGIBLE"],
    ["listing_unavailable", "LISTING_UNAVAILABLE"],
    ["rate_limited", "RATE_LIMITED"],
    ["unavailable", "DEPENDENCY_UNAVAILABLE"],
    ["outcome_unknown", "OUTCOME_UNKNOWN"],
    ["idempotency_key_reused", "IDEMPOTENCY_KEY_REUSED"],
  ] as const)("%s travels as the §5.1 code %s", (code, wire) => {
    expect(toErrorBody(new AppError(code), "c").code).toBe(wire);
  });
});
