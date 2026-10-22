import { describe, expect, it } from "vitest";
import { localInputValue, readLocalInput, resolveLocalTime } from "./time";

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

describe("datetime-local values read in the agency zone (UI11, ux-spec §18.5)", () => {
  const sofia = "Europe/Sofia";

  it("reads summer and winter wall times with the offset Sofia had then", () => {
    expect(readLocalInput("2026-10-02T11:00", sofia)).toEqual({
      ok: true,
      instant: "2026-10-02T08:00:00.000Z",
      offset: "+03:00",
      repeated: false,
    });
    expect(readLocalInput("2026-12-02T11:00", sofia)).toEqual({
      ok: true,
      instant: "2026-12-02T09:00:00.000Z",
      offset: "+02:00",
      repeated: false,
    });
  });

  it("rejects the spring-forward gap and keeps the minutes either side of it", () => {
    // 2026-03-29: 03:00 EET becomes 04:00 EEST.
    expect(readLocalInput("2026-03-29T03:30", sofia)).toEqual({
      ok: false,
      reason: "nonexistent_local_time",
    });
    expect(readLocalInput("2026-03-29T03:00", sofia)).toMatchObject({
      ok: false,
      reason: "nonexistent_local_time",
    });
    expect(readLocalInput("2026-03-29T02:59", sofia)).toMatchObject({
      instant: "2026-03-29T00:59:00.000Z",
      offset: "+02:00",
    });
    expect(readLocalInput("2026-03-29T04:00", sofia)).toMatchObject({
      instant: "2026-03-29T01:00:00.000Z",
      offset: "+03:00",
    });
  });

  it("rejects the repeated autumn hour for a commitment, or takes its first occurrence", () => {
    // 2026-10-25: 04:00 EEST becomes 03:00 EET, so 03:00–03:59 happens twice.
    expect(readLocalInput("2026-10-25T03:30", sofia)).toEqual({
      ok: false,
      reason: "ambiguous_local_time",
    });
    expect(readLocalInput("2026-10-25T03:30", sofia, "first")).toEqual({
      ok: true,
      instant: "2026-10-25T00:30:00.000Z",
      offset: "+03:00",
      repeated: true,
    });
    expect(readLocalInput("2026-10-25T02:59", sofia)).toMatchObject({
      instant: "2026-10-24T23:59:00.000Z",
      repeated: false,
    });
    expect(readLocalInput("2026-10-25T04:00", sofia)).toMatchObject({
      instant: "2026-10-25T02:00:00.000Z",
      offset: "+02:00",
      repeated: false,
    });
  });

  it("reads a wall time in a zone other than the agency's", () => {
    expect(readLocalInput("2026-10-02T11:00", "Europe/London")).toMatchObject({
      instant: "2026-10-02T10:00:00.000Z",
      offset: "+01:00",
    });
    expect(readLocalInput("2026-10-02T11:00", "America/New_York")).toMatchObject({
      instant: "2026-10-02T15:00:00.000Z",
      offset: "-04:00",
    });
  });

  it("rejects invalid calendar minutes and seconds instead of normalising them", () => {
    for (const value of [
      "",
      "2026-02-30T10:00",
      "2026-10-20T25:00",
      "2026-10-20T10:60",
      "2026-10-20 10:00",
      "2026-10-20T10:00:60",
      "2026-10-20T10:00+03:00",
      "2026-10-20T10:00Z",
    ])
      expect(readLocalInput(value, sofia)).toEqual({ ok: false, reason: "invalid_local_time" });
  });

  it("prefills a datetime-local control with the wall time in the zone, both sides of DST", () => {
    expect(localInputValue("2026-10-02T08:00:00.000Z", sofia)).toBe("2026-10-02T11:00");
    expect(localInputValue(new Date("2026-12-02T09:00:00Z"), sofia)).toBe("2026-12-02T11:00");
    expect(localInputValue("2026-10-25T00:30:00Z", sofia)).toBe("2026-10-25T03:30");
    expect(localInputValue("2026-10-25T01:30:00Z", sofia)).toBe("2026-10-25T03:30");
    expect(localInputValue("2026-12-31T22:30:00Z", sofia)).toBe("2027-01-01T00:30");
    expect(localInputValue(null, sofia)).toBe("");
    expect(localInputValue("not a date", sofia)).toBe("");
    const value = localInputValue("2026-07-01T09:00:00Z", sofia);
    expect(readLocalInput(value, sofia)).toMatchObject({ instant: "2026-07-01T09:00:00.000Z" });
  });
});
