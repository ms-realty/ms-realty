import { describe, expect, it } from "vitest";
import { processLocalInstant } from "./local-time";

describe("operating-policy local time", () => {
  it("uses Sofia's seasonal offset without depending on the server timezone", () => {
    expect(processLocalInstant("2026-07-15T12:00")).toBe("2026-07-15T09:00:00.000Z");
    expect(processLocalInstant("2026-12-15T12:00")).toBe("2026-12-15T10:00:00.000Z");
  });
  it("rejects nonexistent, repeated and malformed local instants", () => {
    for (const value of [
      "2026-03-29T03:30",
      "2026-10-25T03:30",
      "2026-02-30T12:00",
      "invalid",
      "2026-10-01T12:00Z",
    ])
      expect(processLocalInstant(value)).toBe("");
  });
});
