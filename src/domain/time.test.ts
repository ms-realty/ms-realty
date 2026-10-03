import { describe, expect, it } from "vitest";
import { resolveLocalTime } from "./time";

describe("local times in an IANA zone (architecture §4.2)", () => {
  it("AT31: resolves an ordinary local time to its UTC instant", () => {
    expect(resolveLocalTime("2026-10-02T11:00", "Europe/Sofia")).toEqual({
      outcome: "resolved",
      instant: "2026-10-02T08:00:00.000Z",
    });
  });

  it("AT31: rejects a local time inside the spring-forward gap", () => {
    // Sofia moves from 03:00 to 04:00 on 2026-03-29.
    expect(resolveLocalTime("2026-03-29T03:30", "Europe/Sofia")).toEqual({
      outcome: "nonexistent",
    });
  });

  it("AT31: an ambiguous fall-back time needs an explicit choice", () => {
    // Sofia repeats 03:00–04:00 on 2026-10-25.
    expect(resolveLocalTime("2026-10-25T03:30", "Europe/Sofia")).toEqual({
      outcome: "ambiguous",
      candidates: ["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"],
    });
    expect(resolveLocalTime("2026-10-25T03:30", "Europe/Sofia", "later")).toEqual({
      outcome: "resolved",
      instant: "2026-10-25T01:30:00.000Z",
    });
  });
});
