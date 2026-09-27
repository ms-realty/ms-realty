import { parseZonedDateTime } from "@internationalized/date";

/** Native datetime-local values have no offset. Use the labelled operating timezone,
 * never the host machine's timezone; reject DST gaps and repeated hours. */
export function processLocalInstant(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  try {
    return parseZonedDateTime(`${value}[Europe/Sofia]`, "reject").toDate().toISOString();
  } catch {
    return "";
  }
}
