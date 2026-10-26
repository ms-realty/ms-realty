import { inventoryCopy, optionLabel } from "@/features/inventory/copy";
import type { ImportReceipt } from "@/server/import-review/contracts";
import { buttonClass } from "@/ui/button-class";
import { controlClass, labelClass } from "@/ui/field-class";
import { dataReviewCopy } from "./copy";
import { staffImportCommandAction } from "./execute-actions";
import { importExecutionCopy } from "./execution-copy";

function Envelope({ receipt, intent }: { receipt: ImportReceipt; intent: string }) {
  return (
    <>
      <input type="hidden" name="id" value={receipt.id} />
      <input type="hidden" name="operationKey" value={receipt.operationKey} />
      <input type="hidden" name="expectedVersion" value={receipt.version} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}
export function ImportReceiptView({
  locale,
  receipt,
  problem,
}: {
  locale: string;
  receipt: ImportReceipt;
  problem?: string;
}) {
  const copy = importExecutionCopy(locale),
    source = dataReviewCopy(locale).imports,
    labels = inventoryCopy(locale).labels;
  const review = receipt.state === "review";
  const selected = receipt.rows.filter((row) => row.selected);
  const pending = selected.filter((row) => row.outcome === "pending").length;
  const reversible = selected.filter((row) => row.outcome === "applied" && !row.reversal).length;
  const post = staffImportCommandAction.bind(null, locale);
  const href = `/${locale}/operations/imports?review=${receipt.id}`;
  const issueText = (code: string) =>
    copy.issues[code as keyof typeof copy.issues] ??
    source.issues[code.split(":")[0] as keyof typeof source.issues] ??
    copy.failed;
  const workingValue = (value: string | null) =>
    value
      ?.replace(
        /^(known|unknown|not_supplied|not_applicable|withheld|conflicting):/u,
        (_, state: string) => `${optionLabel(state, locale)}:`,
      )
      .replace(
        /\((living|usable|built|gross_floor|total|land)\)$/u,
        (_, basis: string) => `(${optionLabel(basis, locale)})`,
      ) || "—";
  return (
    <section className="grid min-w-0 gap-6" data-import-receipt={receipt.id}>
      {problem ? (
        <div role="alert" className="rounded-panel border border-error p-4 text-error">
          {problem === "review" ? copy.failed : copy.unknown}
        </div>
      ) : null}
      <p className="rounded-panel border border-border bg-subtle p-4 font-semibold">
        {copy.boundary}
      </p>
      <h2 className="text-heading font-semibold">
        {review ? copy.review : copy.result} · {receipt.reference}
      </h2>
      <p role="status" className="font-semibold">
        {copy.states[receipt.state]}
      </p>
      <p className="break-all">{receipt.filename}</p>
      <details className="rounded-panel border border-border p-4" open={review}>
        <summary className="min-h-control cursor-pointer py-2 font-semibold">
          {copy.technical}
        </summary>
        <dl className="grid min-w-0 gap-3 pt-3">
          <div>
            <dt className="font-semibold">{copy.operation}</dt>
            <dd className="break-all">{receipt.operationKey}</dd>
          </div>
          <div>
            <dt className="font-semibold">{copy.digest}</dt>
            <dd className="break-all">{receipt.digest}</dd>
          </div>
          {receipt.selectionDigest ? (
            <div>
              <dt className="font-semibold">{copy.selection}</dt>
              <dd className="break-all">{receipt.selectionDigest}</dd>
            </div>
          ) : null}
          {Object.entries(receipt.context).map(([field, value]) => (
            <div key={field}>
              <dt className="font-semibold">{labels[field as keyof typeof labels]}</dt>
              <dd>{field === "region" ? value : optionLabel(value, locale)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <form action={post} className="grid min-w-0 gap-5">
        <Envelope receipt={receipt} intent="review" />
        <input type="hidden" name="digest" value={receipt.digest} />
        <input type="hidden" name="planDigest" value={receipt.planDigest} />
        {review ? <p>{copy.subset}</p> : null}
        {receipt.rows.map((row) => (
          <article
            key={row.number}
            className="grid min-w-0 gap-4 rounded-panel border border-border p-4"
            data-import-row={row.number}
          >
            <h3 className="break-all font-semibold">
              {source.row} {row.number} · {row.reference}
            </h3>
            <p>{copy.classifications[row.classification]}</p>
            {!review ? (
              <p data-row-outcome>{row.selected ? copy.outcomes[row.outcome] : copy.notSelected}</p>
            ) : null}
            {row.reversal ? (
              <p className="font-semibold">
                {copy.reversals[row.reversal]} {row.reversalCode ? issueText(row.reversalCode) : ""}
              </p>
            ) : null}
            {row.errorCode ? <p className="text-error">{issueText(row.errorCode)}</p> : null}
            {row.issues.length ? (
              <ul className="list-inside list-disc space-y-2">
                {row.issues.map((issue) => (
                  <li key={issue}>{issueText(issue)}</li>
                ))}
              </ul>
            ) : null}
            {row.resultVersion ? (
              <p>
                {inventoryCopy(locale).revision}: {row.resultVersion}
              </p>
            ) : null}
            {row.receiptId ? (
              <p className="break-all">
                {inventoryCopy(locale).operation}: {row.receiptId}
              </p>
            ) : null}
            {review && !row.issues.length ? (
              <label className="flex min-h-control items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  name="selected"
                  value={row.number}
                  className="size-5 shrink-0"
                />
                {copy.select} {row.number} · {row.reference}
              </label>
            ) : null}
            <details className="min-w-0" open={review && !row.issues.length}>
              <summary className="min-h-control cursor-pointer py-2 font-semibold underline underline-offset-4">
                {source.original}
              </summary>
              <dl className="grid min-w-0 gap-4 pt-3">
                {(row.fields.length
                  ? row.fields
                  : Object.entries(row.values).map(([field, incoming]) => ({
                      field: field as keyof typeof source.fields,
                      incoming,
                      current: null,
                      proposed: null,
                      decision: false,
                    }))
                ).map((field) => (
                  <div key={field.field} className="grid min-w-0 gap-3 border-b border-border pb-4">
                    <dt className="font-semibold">{source.fields[field.field]}</dt>
                    <dd className="grid min-w-0 gap-3 md:grid-cols-3">
                      <div className="min-w-0">
                        <p className="text-muted">{copy.current}</p>
                        <p className="whitespace-pre-wrap break-all">
                          {workingValue(field.current)}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted">{copy.incoming}</p>
                        <p className="whitespace-pre-wrap break-all" data-import-original>
                          {field.incoming ?? "—"}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-muted">{copy.proposed}</p>
                        <p className="whitespace-pre-wrap break-all">
                          {workingValue(field.proposed)}
                        </p>
                      </div>
                    </dd>
                    {field.decision ? (
                      <dd className="grid gap-2">
                        {review ? (
                          <>
                            <label
                              className={labelClass}
                              htmlFor={`choice-${row.number}-${field.field}`}
                            >
                              {copy.choice} {row.number} · {source.fields[field.field]}
                            </label>
                            <select
                              className={controlClass}
                              id={`choice-${row.number}-${field.field}`}
                              name={`choice.${row.number}.${field.field}`}
                              defaultValue=""
                            >
                              <option value="">{copy.choose}</option>
                              <option value="keep">{copy.keep}</option>
                              <option value="source">{copy.source}</option>
                            </select>
                          </>
                        ) : row.selected ? (
                          <p>
                            {row.choices[field.field as keyof typeof row.choices] === "source"
                              ? copy.source
                              : copy.keep}
                          </p>
                        ) : null}
                      </dd>
                    ) : null}
                    {!review && row.selected ? (
                      <dd className="min-w-0">
                        <p className="text-muted">{copy.accepted}</p>
                        <p className="whitespace-pre-wrap break-all">
                          {workingValue(
                            field.decision &&
                              row.choices[field.field as keyof typeof row.choices] !== "source"
                              ? field.current
                              : field.proposed,
                          )}
                        </p>
                      </dd>
                    ) : null}
                  </div>
                ))}
              </dl>
            </details>
            {(row.issues.includes("draft_manual") ||
              row.issues.includes("location_manual") ||
              row.outcome === "applied" ||
              row.errorCode) &&
            /^MS-\d{5,10}$/u.test(row.reference) ? (
              <a
                className="min-h-control py-2 font-semibold text-link underline underline-offset-4"
                href={`/${locale}/inventory/${row.reference}`}
              >
                {copy.manual} · {row.reference}
              </a>
            ) : null}
          </article>
        ))}
        {review ? (
          <>
            <label className="flex min-h-control items-start gap-3">
              <input
                className="mt-1 size-5 shrink-0"
                type="checkbox"
                name="confirmed"
                value="reviewed"
                required
              />
              {copy.confirm}
            </label>
            <button className={buttonClass()} type="submit">
              {copy.seal}
            </button>
          </>
        ) : null}
      </form>
      {!review && receipt.state !== "cancelled" && pending > 0 ? (
        <form action={post} className="grid gap-4 rounded-panel border border-border p-4">
          <Envelope receipt={receipt} intent="execute" />
          <p>{copy.executeHint}</p>
          <button type="submit" className={buttonClass()}>
            {copy.execute} · {pending}
          </button>
        </form>
      ) : null}
      {receipt.state !== "cancelled" && (review || pending > 0) ? (
        <form action={post} className="grid gap-4 rounded-panel border border-border p-4">
          <Envelope receipt={receipt} intent="cancel" />
          <label className="flex min-h-control items-start gap-3">
            <input
              className="mt-1 size-5 shrink-0"
              type="checkbox"
              name="confirmed"
              value="reviewed"
              required
            />
            {copy.stopConfirm}
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            {copy.stop}
          </button>
        </form>
      ) : null}
      {reversible > 0 ? (
        <form action={post} className="grid gap-4 rounded-panel border border-border p-4">
          <Envelope receipt={receipt} intent="reverse" />
          <p>{copy.reverseHint}</p>
          <label className="flex min-h-control items-start gap-3">
            <input
              className="mt-1 size-5 shrink-0"
              type="checkbox"
              name="confirmed"
              value="reviewed"
              required
            />
            {copy.reverseConfirm}
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            {copy.reverse} · {reversible}
          </button>
        </form>
      ) : null}
      <a
        className="min-h-control py-2 font-semibold text-link underline underline-offset-4"
        href={href}
      >
        {copy.refresh}
      </a>
      <a
        className="min-h-control py-2 font-semibold text-link underline underline-offset-4"
        href={`/${locale}/operations/imports`}
      >
        {source.back}
      </a>
    </section>
  );
}
