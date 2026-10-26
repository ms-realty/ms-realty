import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { StaffPage, StaffPanel, staffUi } from "@/features/shell/staff-ui";
import type { Session } from "@/server/auth/sessions";
import {
  effortCategories,
  effortReasons,
  effortScope,
  readEffortOperation,
  readTaskEffort,
} from "@/server/work/effort";
import { buttonClass } from "@/ui/button-class";
import { isIssuedFormOperation, issueFormOperation } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { effortCopy } from "./effort-copy";
import { privateRead } from "./screens";

export async function EffortScreen({
  locale,
  session,
  id,
  search,
}: {
  locale: string;
  session: Session;
  id: string;
  search: Record<string, string | undefined>;
}) {
  const t = effortCopy(locale),
    path = `/${locale}/tasks/${id}/effort`;
  const view = await privateRead(() => readTaskEffort(getDb(), session, id));
  const action = search.action === "void" ? "void" : "record";
  const scope = effortScope(session.account.id, id, action);
  if (!search.operation || !isIssuedFormOperation(scope, search.operation)) {
    const query = new URLSearchParams({
      operation: issueFormOperation(effortScope(session.account.id, id, "record")),
    });
    for (const k of ["category", "minutes", "reason"] as const)
      if (search[k]) query.set(k, search[k].slice(0, 30));
    redirect(`${path}?${query}`);
  }
  const operation = await privateRead(() =>
    readEffortOperation(getDb(), session, id, action, search.operation as string),
  );
  const mayEnter = operation.state === "absent";
  const clock = new Intl.DateTimeFormat(
    locale === "ru" ? "ru-RU" : locale === "en" ? "en-GB" : "bg-BG",
    { timeZone: "Europe/Sofia", dateStyle: "short", timeStyle: "short" },
  );
  const retry = new URLSearchParams();
  for (const k of ["category", "minutes", "reason"] as const)
    if (search[k]) retry.set(k, search[k].slice(0, 30));
  return (
    <StaffPage
      title={t.title}
      lead={view.task.title}
      actions={
        <a className={buttonClass("tertiary", staffUi.action)} href={`/${locale}/tasks/${id}`}>
          {t.back}
        </a>
      }
    >
      <p className={staffUi.reading}>{t.about}</p>
      {!mayEnter ? (
        <div className="my-5 space-y-3">
          <Notice
            tone={
              operation.state === "succeeded"
                ? "success"
                : operation.state === "failed"
                  ? "error"
                  : "info"
            }
          >
            {operation.state === "succeeded"
              ? t.confirmed
              : operation.state === "failed"
                ? t.failed
                : operation.state === "outcome_unknown"
                  ? t.unknown
                  : t.pending}
          </Notice>
          <a
            className={buttonClass("secondary", staffUi.action)}
            href={`${path}?${new URLSearchParams({ operation: search.operation, action })}`}
          >
            {t.refresh}
          </a>
          {["succeeded", "failed"].includes(operation.state) ? (
            <a className={buttonClass("tertiary", staffUi.action)} href={`${path}?${retry}`}>
              {t.newEntry}
            </a>
          ) : null}
        </div>
      ) : (
        <StaffPanel title={t.record} className="my-5">
          {search.error ? <Notice tone="error">{t.failed}</Notice> : null}
          <form method="post" action={`${path}/submit`} className={staffUi.form}>
            <input type="hidden" name="operationId" value={search.operation} />
            <input type="hidden" name="action" value="record" />
            <input type="hidden" name="expectedVersion" value={view.task.version} />
            <div className={staffUi.formGrid}>
              <div className={staffUi.field}>
                <label htmlFor="effort-category">{t.category}</label>
                <select
                  className={staffUi.control}
                  id="effort-category"
                  name="category"
                  defaultValue={search.category === "reentry" ? "reentry" : "correction"}
                >
                  {effortCategories.map((k) => (
                    <option key={k} value={k}>
                      {t.categories[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={staffUi.field}>
                <label htmlFor="effort-minutes">{t.minutes}</label>
                <input
                  className={staffUi.control}
                  id="effort-minutes"
                  name="minutes"
                  type="number"
                  min="1"
                  max="480"
                  step="1"
                  required
                  defaultValue={search.minutes ?? ""}
                  aria-describedby="effort-hint"
                />
              </div>
            </div>
            <div className={staffUi.field}>
              <label htmlFor="effort-reason">{t.reason}</label>
              <select
                className={staffUi.control}
                id="effort-reason"
                name="reason"
                defaultValue={
                  effortReasons.includes(search.reason as (typeof effortReasons)[number])
                    ? search.reason
                    : "facts"
                }
              >
                {effortReasons.map((k) => (
                  <option key={k} value={k}>
                    {t.reasons[k]}
                  </option>
                ))}
              </select>
            </div>
            <p className={staffUi.hint} id="effort-hint">
              {t.hint}
            </p>
            <div className={staffUi.actions}>
              <button className={buttonClass("primary", staffUi.action)} type="submit">
                {t.record}
              </button>
            </div>
          </form>
        </StaffPanel>
      )}
      <StaffPanel title={t.history}>
        {view.entries.length ? (
          <ul className="divide-y divide-divider">
            {view.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="space-y-1">
                  <p className="font-semibold">
                    {t.categories[entry.category as keyof typeof t.categories]} ·{" "}
                    <data value={entry.minutes ?? 0}>{entry.minutes}</data>{" "}
                    {t.minutes.toLowerCase()}
                  </p>
                  <p className={staffUi.hint}>
                    {t.reasons[entry.reason as keyof typeof t.reasons]} · {t.recordedAt}{" "}
                    <time dateTime={entry.createdAt.toISOString()}>
                      {clock.format(entry.createdAt)}
                    </time>{" "}
                    (Europe/Sofia)
                  </p>
                  {entry.voided ? <p className={staffUi.hint}>{t.excluded}</p> : null}
                </div>
                {!entry.voided ? (
                  <form method="post" action={`${path}/submit`}>
                    <input
                      type="hidden"
                      name="operationId"
                      value={issueFormOperation(effortScope(session.account.id, id, "void"))}
                    />
                    <input type="hidden" name="expectedVersion" value={view.task.version} />
                    <input type="hidden" name="action" value="void" />
                    <input type="hidden" name="entryId" value={entry.id} />
                    <button type="submit" className={buttonClass("tertiary", staffUi.action)}>
                      {t.void}
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={staffUi.reading}>{t.empty}</p>
        )}
      </StaffPanel>
    </StaffPage>
  );
}
