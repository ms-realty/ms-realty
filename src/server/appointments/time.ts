// Explicit local offset disambiguates the autumn fold; round-trip rejects the spring gap.
export const appointmentTimezone = "Europe/Sofia";
export function localParts(instant: Date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: appointmentTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(instant)
      .map(({ type, value }) => [type, value]),
  );
}
export function sofiaInstant(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00)?\+0[23]:00$/.test(value)) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === value.slice(0, 16) ? date : null;
}
export function inServiceHours(start: Date, end: Date, value: unknown): boolean {
  const first = localParts(start);
  const last = localParts(end);
  if (first.day !== last.day || first.month !== last.month || first.year !== last.year)
    return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const hours = (value as Record<string, unknown>)[first.weekday?.toLowerCase() ?? ""];
  if (
    !Array.isArray(hours) ||
    hours.length !== 2 ||
    !hours.every((v) => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v))
  )
    return false;
  return `${first.hour}:${first.minute}` >= hours[0] && `${last.hour}:${last.minute}` <= hours[1];
}

const escapeText = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", "")
    .replaceAll("\n", "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
const stamp = (date: Date) => `${date.toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}Z`;
function fold(line: string): string {
  const chunks: string[] = [];
  let current = "";
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > 73) {
      chunks.push(current);
      current = ` ${char}`;
    } else current += char;
  }
  chunks.push(current);
  return chunks.join("\r\n");
}
/** UTC instants avoid device-local ambiguity. UID is stable; sequence is the committed one. */
export function calendarFile(input: {
  uid: string;
  sequence: number;
  reference: string;
  start: Date;
  end: Date;
  cancelled: boolean;
  updatedAt: Date;
  invitation?: { organizer: string; attendee: string };
}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MS Realty//Agency appointments//EN",
    `METHOD:${input.cancelled ? "CANCEL" : input.invitation ? "REQUEST" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(input.uid)}`,
    `SEQUENCE:${input.sequence}`,
    `DTSTAMP:${stamp(input.updatedAt)}`,
    `DTSTART:${stamp(input.start)}`,
    `DTEND:${stamp(input.end)}`,
    `SUMMARY:${escapeText(`MS Realty · ${input.reference}`)}`,
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
  ];
  if (input.invitation) {
    lines.push(
      `ORGANIZER:mailto:${escapeText(input.invitation.organizer)}`,
      `ATTENDEE${input.cancelled ? "" : ";RSVP=TRUE;PARTSTAT=NEEDS-ACTION"}:mailto:${escapeText(input.invitation.attendee)}`,
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
