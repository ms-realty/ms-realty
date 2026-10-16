import { describe, expect, it } from "vitest";
import { offsetInputValue, readDateTimeEntry } from "@/domain/time";
import { formInstant, readTimeFormValues } from "./time";

function native(value: string, occurrence = "", original = "") {
  const data = new FormData();
  data.set("dueAt", value);
  data.set("dueAtWallTime", "yes");
  data.set("dueAtOccurrence", occurrence);
  data.set("dueAtOriginal", original);
  return data;
}
const submit = (data: FormData) => formInstant(readTimeFormValues(data, ["dueAt"]), "dueAt");

describe("UI11 native wall-time action boundary", () => {
  it("preserves typed seconds, including both autumn occurrences", () => {
    expect(submit(native("2026-07-15T12:00:17"))).toBe("2026-07-15T09:00:17.000Z");
    expect(submit(native("2026-12-15T12:00:17"))).toBe("2026-12-15T10:00:17.000Z");
    expect(submit(native("2026-10-25T03:30:42", "earlier"))).toBe("2026-10-25T00:30:42.000Z");
    expect(submit(native("2026-10-25T03:30:42", "later"))).toBe("2026-10-25T01:30:42.000Z");
    expect(() => submit(native("2026-03-29T03:30:42"))).toThrow();
    expect(() => submit(native("2026-10-25T03:30:42"))).toThrow();
  });

  it("preserves finer prefill precision only when an entered second matches", () => {
    const original = "2026-10-25T01:30:42.125Z";
    expect(submit(native("2026-10-25T03:30:42", "later", original))).toBe(original);
    expect(submit(native("2026-10-25T03:30:43", "later", original))).toBe(
      "2026-10-25T01:30:43.000Z",
    );
    expect(offsetInputValue(original, "Europe/Sofia")).toBe("");
  });
  it("stores the agency clock in summer and winter, independently of the server zone", () => {
    expect(submit(native("2026-07-15T12:00"))).toBe("2026-07-15T09:00:00.000Z");
    expect(submit(native("2026-12-15T12:00"))).toBe("2026-12-15T10:00:00.000Z");
  });

  it("rejects impossible and unspecified repeated native times before any command", () => {
    expect(() => submit(native("2026-03-29T03:30"))).toThrow();
    expect(() => submit(native("2026-10-25T03:30"))).toThrow();
    expect(submit(native("2026-10-25T03:30", "earlier"))).toBe("2026-10-25T00:30:00.000Z");
    expect(submit(native("2026-10-25T03:30", "later"))).toBe("2026-10-25T01:30:00.000Z");
  });

  it("keeps a selected occurrence through a failed form response and subsequent native POST", () => {
    const values = readTimeFormValues(native("2026-10-25T03:30", "later"), ["dueAt"]);
    expect(submit(native("2026-10-25T03:30", "later", values.dueAt))).toBe(
      "2026-10-25T01:30:00.000Z",
    );
    expect(offsetInputValue(values.dueAt ?? "", "Europe/Sofia")).toBe("2026-10-25T03:30+02:00");
  });

  it("retains sub-minute precision only while the exact original minute and occurrence match", () => {
    const original = "2026-10-25T01:30:42.125Z";
    expect(submit(native("2026-10-25T03:30", "later", original))).toBe(original);
    expect(submit(native("2026-10-25T03:30", "earlier", original))).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(submit(native("2026-10-25T04:30", "", original))).toBe("2026-10-25T02:30:00.000Z");
  });

  it("rejects duplicate metadata and invalid calendar dates instead of normalising them", () => {
    const duplicate = native("2026-10-25T03:30", "later");
    duplicate.append("dueAtOccurrence", "earlier");
    expect(() => submit(duplicate)).toThrow();
    expect(readDateTimeEntry("2026-02-30T12:00:00Z", "Europe/Sofia")).toEqual({
      ok: false,
      reason: "invalid_local_time",
    });
  });
});
