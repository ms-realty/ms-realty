import { resolveLocalTime } from "@/domain/time";
import type { ViewingPreferences } from "@/domain/viewing-preferences";
import { agencyTimeZone, type PublicLocale } from "@/i18n/config";
import { formatDateTimeRange, timeZoneLabel } from "@/i18n/format";
import { timeCopy } from "@/i18n/time-copy";
import { DateTimeField } from "@/ui/date-time-field";
import { controlClass, errorClass, fieldClass, labelClass } from "@/ui/field-class";
import type { FormController } from "@/ui/form/form";
import { discoveryCopy } from "./copy";
import type { InquiryValues } from "./inquiry-state";
import { viewingCopy } from "./viewing-copy";
import { viewingWindowFields } from "./viewing-fields";

export function ViewingPreferenceFields({
  form,
  locale,
}: {
  form: FormController<InquiryValues>;
  locale: PublicLocale;
}) {
  const c = viewingCopy(locale),
    copy = discoveryCopy(locale);
  const format = form.field("viewingFormat");
  // M-065: times are on the agency's clock, named in words by each field; a repeated autumn
  // hour takes its first occurrence and the field says so, so there is no zone or clock choice.
  const window = (index: number) => {
    const fields = viewingWindowFields[index];
    if (!fields) return null;
    return (
      <fieldset key={index} className="min-w-0 space-y-4">
        <legend className="font-semibold">
          {c.window} {index + 1}
        </legend>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {([fields.start, fields.end] as const).map((name, position) => (
            <DateTimeField
              key={name}
              {...form.field(name)}
              locale={locale}
              timeZone={agencyTimeZone}
              localValue
              repeatedHour="first"
              label={`${position === 0 ? c.start : c.end} ${index + 1}`}
              optionalLabel={copy.optional}
            />
          ))}
        </div>
      </fieldset>
    );
  };
  return (
    <fieldset className="min-w-0 space-y-5 rounded-panel border border-divider p-4">
      <legend className="px-1 text-heading font-semibold">{c.title}</legend>
      <p>{c.note}</p>
      <div className={fieldClass} data-invalid={format.error ? "true" : undefined}>
        <label htmlFor={format.id} className={labelClass}>
          {c.format}
        </label>
        <select
          id={format.id}
          name="viewingFormat"
          value={format.value}
          disabled={format.readOnly}
          onChange={format.onChange}
          className={controlClass}
          aria-invalid={Boolean(format.error) || undefined}
          aria-describedby={format.error ? `${format.id}-error` : undefined}
        >
          <option value="">{c.noPreference}</option>
          <option value="in_person">{c.inPerson}</option>
        </select>
        {format.error ? (
          <p id={`${format.id}-error`} className={errorClass}>
            {format.error}
          </p>
        ) : null}
      </div>
      {window(0)}
      <details
        open={viewingWindowFields
          .slice(1)
          .some((fields) =>
            Object.values(fields).some((name) =>
              Boolean(form.values[name] || form.field(name).error),
            ),
          )}
        className="space-y-5"
      >
        <summary className="cursor-pointer py-2 font-semibold underline">{c.extraWindows}</summary>
        {window(1)}
        {window(2)}
      </details>
    </fieldset>
  );
}

export function ViewingPreferenceSummary({
  input,
  locale,
}: {
  input: ViewingPreferences;
  locale: PublicLocale;
}) {
  const c = viewingCopy(locale);
  // The form takes the first of a repeated hour; say so where the visitor reviews it.
  const firstTaken = input.windows.some(
    (window) => window.startOccurrence === "earlier" || window.endOccurrence === "earlier",
  );
  return (
    <section
      className="min-w-0 space-y-3 rounded-panel border border-divider p-4 wrap-anywhere"
      aria-label={c.title}
    >
      <h3 className="font-semibold">{c.title}</h3>
      <p className="text-dense">{c.note}</p>
      <dl className="space-y-3">
        <div>
          <dt className="text-text-muted">{c.format}</dt>
          <dd>{input.format === "in_person" ? c.inPerson : c.noPreference}</dd>
        </div>
        <div>
          <dt className="text-text-muted">{c.timezone}</dt>
          <dd>
            <bdi>{timeZoneLabel(locale, input.timezone)}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">{c.window}</dt>
          <dd>
            {input.windows.length ? (
              <ol className="space-y-2">
                {input.windows.map((window, index) => {
                  const start = resolveLocalTime(
                    window.startsAtLocal,
                    input.timezone,
                    window.startOccurrence,
                  );
                  const end = resolveLocalTime(
                    window.endsAtLocal,
                    input.timezone,
                    window.endOccurrence,
                  );
                  return (
                    <li key={viewingWindowFields[index]?.start}>
                      <span>{index + 1}. </span>
                      {start.outcome === "resolved" && end.outcome === "resolved" ? (
                        <time dateTime={start.instant} className="tabular-nums">
                          {formatDateTimeRange(locale, start.instant, end.instant, {
                            timeZone: input.timezone,
                          })}
                        </time>
                      ) : (
                        "—"
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              c.noPreference
            )}
            {firstTaken ? (
              <p className="mt-2 text-dense text-text-muted">{timeCopy(locale).repeatedFirst}</p>
            ) : null}
          </dd>
        </div>
        {input.accessNeeds ? (
          <div>
            <dt className="text-text-muted">{c.accessNeeds}</dt>
            <dd className="whitespace-pre-wrap">{input.accessNeeds}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
