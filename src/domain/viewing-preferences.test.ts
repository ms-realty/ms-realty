import { describe, expect, it } from "vitest";
import { pastViewingWindows, viewingPreferencesSchema } from "./viewing-preferences";

const preferences = (start = "2030-04-01T10:00", end = "2030-04-01T11:00") => ({
  version: 1,
  provenance: "self_declared",
  timezone: "Europe/Sofia",
  windows: [{ startsAtLocal: start, endsAtLocal: end }],
});

describe("visitor viewing preferences", () => {
  it("preserves the entered order and does not imply an appointment", () => {
    const parsed = viewingPreferencesSchema.parse({
      ...preferences(),
      windows: [
        { startsAtLocal: "2030-04-02T10:00", endsAtLocal: "2030-04-02T11:00" },
        { startsAtLocal: "2030-04-01T10:00", endsAtLocal: "2030-04-01T11:00" },
      ],
      accessNeeds: "Step-free access, please.",
    });
    expect(parsed.windows.map((window) => window.startsAtLocal)).toEqual([
      "2030-04-02T10:00",
      "2030-04-01T10:00",
    ]);
    expect(parsed).not.toHaveProperty("confirmedStartsAt");
    expect(parsed.accessNeeds).toBe("Step-free access, please.");
  });

  it("rejects impossible dates, reversed windows, fixed offsets and unsupported formats", () => {
    for (const input of [
      preferences("2030-02-30T10:00", "2030-02-30T11:00"),
      preferences("2030-04-01T11:00", "2030-04-01T10:00"),
      { ...preferences(), timezone: "Mars/Olympus" },
      { ...preferences(), timezone: "+02:00" },
      { ...preferences(), format: "video" },
      { ...preferences(), windows: Array(4).fill(preferences().windows[0]) },
    ])
      expect(viewingPreferencesSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a daylight-saving gap and requires a choice in a repeated hour", () => {
    expect(
      viewingPreferencesSchema.safeParse(preferences("2030-03-31T03:30", "2030-03-31T04:30"))
        .success,
    ).toBe(false);
    const repeated = preferences("2030-10-27T03:15", "2030-10-27T03:45");
    expect(viewingPreferencesSchema.safeParse(repeated).success).toBe(false);
    expect(
      viewingPreferencesSchema.safeParse({
        ...repeated,
        windows: [{ ...repeated.windows[0], startOccurrence: "earlier", endOccurrence: "later" }],
      }).success,
    ).toBe(true);
    expect(
      viewingPreferencesSchema.safeParse({
        ...repeated,
        windows: [{ ...repeated.windows[0], startOccurrence: "later", endOccurrence: "earlier" }],
      }).success,
    ).toBe(false);
  });

  it("keeps a historical preference readable after its proposed start passes", () => {
    const input = viewingPreferencesSchema.parse(preferences());
    expect(pastViewingWindows(input, Date.parse("2030-04-01T06:59:59Z"))).toEqual([]);
    expect(pastViewingWindows(input, Date.parse("2030-04-01T07:00:00Z"))).toEqual([0]);
    expect(viewingPreferencesSchema.safeParse(input).success).toBe(true);
  });
});
