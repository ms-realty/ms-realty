import { describe, expect, it } from "vitest";

import { AppError, errorStatus, toErrorBody } from "./errors";

// Spec §19.2 Error view model.
describe("toErrorBody", () => {
  it("carries code, safe message, field errors, retryability, correlation id and outcome", () => {
    const error = new AppError("validation_failed", {
      fieldErrors: { email: ["invalid_email"] },
      detail: "zod said: <internal>",
    });
    const body = toErrorBody(error, "corr-12345678");
    expect(body).toEqual({
      code: "validation_failed",
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
    expect(body).toMatchObject({ code: "internal_error", retryable: true, outcome: "unknown" });
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
});
