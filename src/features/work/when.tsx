import { agencyTimeZone, isPublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import { workCopy } from "./copy";

/** A recorded instant on the agency's clock, or the explicit "no date" wording. */
export function When({
  date,
  locale,
  zone = agencyTimeZone,
}: {
  date: Date | null;
  locale: string;
  /** A time kept in another zone shows that zone's clock and names it. */
  zone?: string;
}) {
  return date ? (
    <time dateTime={date.toISOString()} className="tabular-nums">
      {formatDateTime(isPublicLocale(locale) ? locale : "bg", date, {
        timeZone: zone,
        zoneLabel: zone !== agencyTimeZone,
      })}
    </time>
  ) : (
    <span>{workCopy(locale).noDate}</span>
  );
}
