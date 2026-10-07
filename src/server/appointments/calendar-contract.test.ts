import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { type CalendarSnapshot, calendarEmailFile, senderAddress } from "./calendar-contract";

const value: CalendarSnapshot = {
  kind: "appointment_calendar",
  appointmentId: randomUUID(),
  appointmentVersion: 2,
  caseId: randomUUID(),
  reference: "AP-2026-000001",
  uid: "stable@appointments.example.test",
  sequence: 1,
  startsAt: "2027-01-15T08:00:00.000Z",
  endsAt: "2027-01-15T09:00:00.000Z",
  updatedAt: "2026-09-29T00:00:00.000Z",
  cancelled: false,
  organizer: "organizer@example.test",
};
it("creates a one-recipient REQUEST and matching higher-sequence CANCEL without asserting attendance", () => {
  const first = calendarEmailFile(value, "recipient@example.test"),
    cancelled = calendarEmailFile(
      { ...value, sequence: 2, cancelled: true },
      "recipient@example.test",
    );
  expect(first).toContain("METHOD:REQUEST\r\n");
  expect(first).toContain("ORGANIZER:mailto:organizer@example.test\r\n");
  expect(first).toContain(
    "ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:recipient@example.test\r\n",
  );
  expect(first).not.toContain("PARTSTAT=ACCEPTED");
  expect(cancelled).toContain("METHOD:CANCEL\r\n");
  for (const text of [first, cancelled])
    expect(text).toContain("UID:stable@appointments.example.test\r\n");
  expect(cancelled).toContain("SEQUENCE:2\r\n");
  expect(cancelled).toContain("STATUS:CANCELLED\r\n");
  expect(cancelled).not.toContain("RSVP=TRUE");
});
it("escapes textual ICS injection, folds UTF-8 lines and rejects mail-header injection", () => {
  const text = calendarEmailFile(
    { ...value, reference: `AP-1\r\nLOCATION:private ${"Б".repeat(40)}` },
    "recipient@example.test",
  );
  expect(text).not.toContain("\r\nLOCATION:");
  expect(text.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  expect(() => calendarEmailFile(value, "recipient@example.test\r\nATTENDEE:bad")).toThrow();
  expect(senderAddress("Agency <ORGANIZER@example.test>")).toBe("organizer@example.test");
  expect(senderAddress("Agency\r\nBcc: bad <organizer@example.test>")).toBeNull();
});
