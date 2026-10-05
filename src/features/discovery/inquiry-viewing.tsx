import type { ViewingPreferences } from "@/domain/viewing-preferences";
import type { PublicLocale } from "@/i18n/config";
import { controlClass, fieldClass } from "@/ui/field-class";
import type { FormController } from "@/ui/form/form";
import { FormField } from "@/ui/form/form-field";
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
  const select = (
    name: keyof InquiryValues,
    label: string,
    options: readonly (readonly [string, string])[],
  ) => {
    const field = form.field(name);
    return (
      <div className={fieldClass} key={name}>
        <label htmlFor={field.id} className="font-semibold">
          {label}
        </label>
        <select
          id={field.id}
          name={name}
          value={field.value}
          disabled={field.readOnly}
          onChange={field.onChange}
          className={controlClass}
          aria-invalid={Boolean(field.error) || undefined}
          aria-describedby={field.error ? `${field.id}-error` : undefined}
        >
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
        {field.error ? (
          <p id={`${field.id}-error`} className="text-error">
            {field.error}
          </p>
        ) : null}
      </div>
    );
  };
  const window = (index: number) => {
    const fields = viewingWindowFields[index];
    if (!fields) return null;
    const choices = [
      ["", c.automatic],
      ["earlier", c.earlier],
      ["later", c.later],
    ] as const;
    return (
      <fieldset key={index} className="min-w-0 space-y-4">
        <legend className="font-semibold">
          {c.window} {index + 1}
        </legend>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <FormField
            {...form.field(fields.start)}
            type="datetime-local"
            label={`${c.start} ${index + 1}`}
            optionalLabel={copy.optional}
            dir="ltr"
          />
          <FormField
            {...form.field(fields.end)}
            type="datetime-local"
            label={`${c.end} ${index + 1}`}
            optionalLabel={copy.optional}
            dir="ltr"
          />
        </div>
        <details
          open={Boolean(
            form.values[fields.startChoice] ||
              form.values[fields.endChoice] ||
              form.field(fields.start).error ||
              form.field(fields.end).error,
          )}
          className="space-y-3"
        >
          <summary className="cursor-pointer py-2 text-dense underline">
            {c.clockChoice} {index + 1}
          </summary>
          <p className="text-dense text-text-muted">{c.clockHint}</p>
          {select(fields.startChoice, `${c.start} ${index + 1} · ${c.clockChoice}`, choices)}
          {select(fields.endChoice, `${c.end} ${index + 1} · ${c.clockChoice}`, choices)}
        </details>
      </fieldset>
    );
  };
  return (
    <fieldset className="min-w-0 space-y-5 rounded-panel border border-divider p-4">
      <legend className="px-1 text-heading font-semibold">{c.title}</legend>
      <p>{c.note}</p>
      {select("viewingFormat", c.format, [
        ["", c.noPreference],
        ["in_person", c.inPerson],
      ])}
      <FormField
        {...form.field("viewingTimezone")}
        label={c.timezone}
        hint={c.timezoneHint}
        maxLength={100}
        required
        dir="ltr"
      />
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
            <bdi>{input.timezone}</bdi>
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">{c.window}</dt>
          <dd>
            {input.windows.length ? (
              <ol className="space-y-2">
                {input.windows.map((window, index) => (
                  <li key={viewingWindowFields[index]?.start}>
                    <span>{index + 1}. </span>
                    <bdi>{window.startsAtLocal.replace("T", " ")}</bdi>
                    {window.startOccurrence ? ` (${c[window.startOccurrence]})` : ""} –{" "}
                    <bdi>{window.endsAtLocal.replace("T", " ")}</bdi>
                    {window.endOccurrence ? ` (${c[window.endOccurrence]})` : ""}
                  </li>
                ))}
              </ol>
            ) : (
              c.noPreference
            )}
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
