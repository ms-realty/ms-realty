import { workCopy } from "./copy";

/** A recorded instant with its zone named, or the explicit "no date" wording. */
export function When({
  date,
  locale,
  zone = "UTC",
}: {
  date: Date | null;
  locale: string;
  zone?: string;
}) {
  return date ? (
    <time dateTime={date.toISOString()}>
      {new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(date)}{" "}
      {zone}
    </time>
  ) : (
    <span>{workCopy(locale).noDate}</span>
  );
}
