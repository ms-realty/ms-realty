import { DiscoveryPage } from "@/features/discovery/page";
import { workCopy } from "@/features/work/copy";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
import { aiCopy } from "./copy";
import { entryCopy } from "./entry-copy";
import type { readAssistanceEntry } from "./entry-loader";

type Entry = Awaited<ReturnType<typeof readAssistanceEntry>>;
const link = "font-semibold text-accent underline underline-offset-4";
export function AssistanceEntry({
  locale,
  entry,
  providerEnabled,
}: {
  locale: string;
  entry: Entry;
  providerEnabled: boolean;
}) {
  const copy = entryCopy(locale);
  const ai = aiCopy(locale);
  const work = workCopy(locale);
  const path = `/${locale}/operations/assistance`;
  const pageHref = `${path}?view=${entry.view}`;
  const tasks = [
    {
      href: "locale",
      title: copy.locale,
      help: copy.localeHelp,
      available: entry.access.localeDrafts,
    },
    {
      href: "intake",
      title: copy.intake,
      help: copy.intakeHelp,
      available: entry.access.intakeDrafts,
    },
  ].filter((task) => task.available);
  return (
    <DiscoveryPage>
      <header className="space-y-4">
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <p className="max-w-reading">{copy.lead}</p>
        <p className="max-w-reading text-text-muted">{copy.boundary}</p>
      </header>
      {!providerEnabled ? <Notice tone="info" title={ai.disabled} /> : null}
      {!entry.access.inquiryDrafts && !tasks.length ? <p>{copy.unavailable}</p> : null}
      {entry.access.inquiryDrafts ? (
        <section
          aria-labelledby="butler-inquiry-task"
          className="space-y-5 rounded-card border border-border bg-surface p-4 sm:p-6"
        >
          <div className="space-y-2">
            <h2 id="butler-inquiry-task" className="text-subheading font-semibold">
              {copy.inquiry}
            </h2>
            <p>{copy.inquiryHelp}</p>
          </div>
          <nav aria-label={work.inbox} className="flex flex-wrap gap-x-5 gap-y-3">
            {(["all", "unassigned", "mine", "awaiting", "review"] as const).map((view) => (
              <a
                key={view}
                className={link}
                href={`${path}?view=${view}`}
                aria-current={entry.view === view ? "page" : undefined}
              >
                {work[view]}
              </a>
            ))}
          </nav>
          {entry.choices.length ? (
            <form action={path} method="get" className="flex min-w-0 flex-col items-start gap-4">
              <div className="w-full max-w-reading space-y-2">
                <label htmlFor="butler-inquiry-source" className="block font-semibold">
                  {copy.source}
                </label>
                <select
                  id="butler-inquiry-source"
                  name="source"
                  required
                  defaultValue=""
                  aria-describedby="butler-source-help"
                  className={`${controlClass} min-w-0 max-w-full`}
                >
                  <option value="" disabled>
                    {copy.choose}
                  </option>
                  {entry.choices.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.reference} · {copy.purposes[choice.purpose]} ·{" "}
                      {choice.locale.toUpperCase()}
                    </option>
                  ))}
                </select>
                <p id="butler-source-help" className="text-compact text-text-muted">
                  {copy.sourceHelp}
                </p>
              </div>
              <button
                type="submit"
                className={buttonClass("primary", "max-w-full whitespace-normal")}
              >
                {copy.inspect}
              </button>
            </form>
          ) : (
            <p className="text-text-muted">{copy.empty}</p>
          )}
          <nav aria-label={copy.pages} className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {entry.page > 1 ? (
              <a className={link} href={`${pageHref}&page=${entry.page - 1}`}>
                {work.previous}
              </a>
            ) : null}
            <span className="text-compact text-text-muted">
              {copy.page} {entry.page}
            </span>
            {entry.hasMore ? (
              <a className={link} href={`${pageHref}&page=${entry.page + 1}`}>
                {work.next}
              </a>
            ) : null}
          </nav>
          <a className={link} href={`/${locale}/inquiries?view=${entry.view}`}>
            {copy.manual}
          </a>
        </section>
      ) : entry.access.inquiries ? (
        <div className="space-y-3">
          <p>{copy.manualOnly}</p>
          <a className={link} href={`/${locale}/inquiries`}>
            {copy.manual}
          </a>
        </div>
      ) : null}
      {tasks.length ? (
        <section aria-labelledby="butler-other-tasks" className="space-y-5">
          <h2 id="butler-other-tasks" className="text-subheading font-semibold">
            {copy.other}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {tasks.map((task) => (
              <div
                key={task.href}
                className="space-y-3 rounded-card border border-border p-4 sm:p-6"
              >
                <h3 className="font-semibold">
                  <a className={link} href={`${path}/${task.href}`}>
                    {task.title}
                  </a>
                </h3>
                <p className="text-compact text-text-muted">{task.help}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {entry.access.inventory ? (
        <a className={link} href={`/${locale}/inventory`}>
          {copy.inventory}
        </a>
      ) : null}
    </DiscoveryPage>
  );
}
