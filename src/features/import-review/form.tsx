"use client";
import { useActionState } from "react";
import { importFields } from "@/server/import-review/csv";
import { controlClass, fieldClass, labelClass } from "@/ui/field-class";
import { dataReviewCopy } from "./copy";
import type { ImportReviewState } from "./state";

const button =
  "min-h-control rounded-control bg-accent px-5 py-3 font-semibold text-on-accent disabled:opacity-60";
export function ImportReviewForm({
  locale,
  action,
  initialState,
}: {
  locale: string;
  action: (previous: ImportReviewState, form: FormData) => Promise<ImportReviewState>;
  initialState: ImportReviewState;
}) {
  const [state, submit, pending] = useActionState(
    action,
    initialState,
    `/${locale}/operations/imports`,
  );
  const copy = dataReviewCopy(locale).imports;
  const source = state.source;
  const problems = state.rows?.filter((row) => row.issues.length) ?? [];
  return (
    <section data-import-review className="grid min-w-0 gap-6">
      {state.error ? (
        <div role="alert" className="rounded-panel border border-error p-4 text-error">
          <p>{copy.failure}</p>
          <p>{state.error === "failure" ? copy.format : copy.errors[state.error]}</p>
        </div>
      ) : null}
      <p className="rounded-panel border border-border bg-subtle p-4 font-semibold">
        {copy.boundary}
      </p>
      {source ? (
        <>
          <p className="break-all font-semibold">{source.filename}</p>
          {state.stage === "mapping" ? (
            <form action={submit} className="grid gap-6">
              <h2 className="text-h2 font-semibold">{copy.mapping}</h2>
              <p>{copy.mappingHint}</p>
              <input type="hidden" name="intent" value="check" />
              <input type="hidden" name="source" value={source.token} />
              <div className="grid gap-4 md:grid-cols-2">
                {importFields.map((field) => (
                  <div className={fieldClass} key={field}>
                    <label htmlFor={`column-${field}`} className={labelClass}>
                      {copy.fields[field]}
                    </label>
                    <select
                      id={`column-${field}`}
                      name={`column.${field}`}
                      className={controlClass}
                      defaultValue={source.mapping[field] ?? ""}
                      required={field === "reference" || field === "title"}
                      disabled={pending}
                    >
                      <option value="">{copy.skip}</option>
                      {source.document.headers.map((header, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: a source column's fixed position is its identity, including duplicate headers.
                        <option key={index} value={index}>
                          {index + 1} · {header || copy.column}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <details className="min-w-0 rounded-panel border border-border p-4">
                <summary className="min-h-control cursor-pointer py-2 font-semibold">
                  {copy.sample}
                </summary>
                <dl className="grid gap-3 pt-4">
                  {source.document.rows[0]?.cells.map((value, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: CSV source columns retain their fixed positions throughout this preview.
                    <div key={index} className="min-w-0">
                      <dt className="font-semibold">
                        {index + 1} · {source.document.headers[index] ?? copy.column}
                      </dt>
                      <dd className="whitespace-pre-wrap break-all">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
              <button type="submit" className={button} disabled={pending}>
                {pending ? copy.pending : copy.check}
              </button>
            </form>
          ) : (
            <section className="grid min-w-0 gap-5" data-import-problems>
              <h2 className="text-h2 font-semibold">{copy.problems}</h2>
              <dl className="flex flex-wrap gap-6">
                <div>
                  <dt>{copy.checked}</dt>
                  <dd className="text-h2 font-semibold">{state.rows?.length ?? 0}</dd>
                </div>
                <div>
                  <dt>{copy.problemCount}</dt>
                  <dd className="text-h2 font-semibold">{problems.length}</dd>
                </div>
              </dl>
              <p>{copy.limited}</p>
              {!problems.length ? (
                <p role="status">{copy.clean}</p>
              ) : (
                problems.map((row) => (
                  <article
                    key={row.number}
                    data-source-row={row.number}
                    className="grid min-w-0 gap-3 rounded-panel border border-warning p-4"
                  >
                    <h3 className="font-semibold">
                      {copy.row} {row.number} ·{" "}
                      <span className="break-all">{row.values.reference || "—"}</span>
                    </h3>
                    <ul className="list-inside list-disc space-y-2">
                      {row.issues.map((issue) => (
                        <li key={`${issue.code}:${issue.field ?? issue.column ?? "row"}`}>
                          {issue.field
                            ? `${copy.fields[issue.field]}: `
                            : issue.column !== undefined
                              ? `${copy.column} ${issue.column + 1}: `
                              : ""}
                          {copy.issues[issue.code]}
                        </li>
                      ))}
                    </ul>
                    <details>
                      <summary className="min-h-control cursor-pointer py-2 font-semibold underline underline-offset-4">
                        {copy.details}
                      </summary>
                      <h4 className="py-3 font-semibold">{copy.original}</h4>
                      <dl className="grid min-w-0 gap-3">
                        {row.cells.map((value, index) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: source cells are identified by immutable CSV column positions.
                          <div key={index} className="min-w-0">
                            <dt className="font-semibold">
                              {index + 1} · {source.document.headers[index] ?? copy.column}
                            </dt>
                            <dd className="whitespace-pre-wrap break-all" data-source-value>
                              {value || "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </article>
                ))
              )}
            </section>
          )}
          <a
            className="min-h-control py-2 font-semibold text-link underline underline-offset-4"
            href={`/${locale}/operations/imports`}
          >
            {copy.back}
          </a>
        </>
      ) : (
        <form action={submit} className="grid gap-5">
          <p id="csv-format">{copy.format}</p>
          <input type="hidden" name="intent" value="upload" />
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="csv-file">
              {copy.file}
            </label>
            <input
              id="csv-file"
              className={controlClass}
              type="file"
              accept=".csv,text/csv"
              name="file"
              required
              disabled={pending}
              aria-describedby="csv-format"
            />
          </div>
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="csv-delimiter">
              {copy.delimiter}
            </label>
            <select
              id="csv-delimiter"
              name="delimiter"
              className={controlClass}
              defaultValue=","
              disabled={pending}
            >
              <option value=",">{copy.comma}</option>
              <option value=";">{copy.semicolon}</option>
            </select>
          </div>
          <button type="submit" className={button} disabled={pending}>
            {pending ? copy.pending : copy.choose}
          </button>
        </form>
      )}
    </section>
  );
}
