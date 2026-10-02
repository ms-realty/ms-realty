import { describe, expect, it } from "vitest";
import { workerHealth } from "./operations";

describe("O27 release-bound queue progress", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  it("distinguishes missing, expired, other build and unbound progress from current", () => {
    expect(workerHealth(undefined, "release", now).state).toBe("missing");
    const row = { buildSha: "release", completedAt: new Date(now.getTime() - 60000) };
    expect(workerHealth(row, "release", now).state).toBe("current");
    expect(workerHealth(row, "different", now)).toMatchObject({
      state: "stale",
      reason: "other_build",
    });
    expect(workerHealth(row, undefined, now)).toMatchObject({
      state: "stale",
      reason: "build_unbound",
    });
    expect(
      workerHealth({ ...row, completedAt: new Date(now.getTime() - 180001) }, "release", now).state,
    ).toBe("stale");
    expect(
      workerHealth({ ...row, completedAt: new Date(now.getTime() + 31000) }, "release", now).state,
    ).toBe("stale");
  });
});
