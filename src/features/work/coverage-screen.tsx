import "server-only";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { readCoverage } from "@/server/work/coverage";
import { caseCopy } from "../cases/copy";
import { workCopy } from "./copy";
import { coverageCopy } from "./coverage-copy";
import { Page, Pagination, When } from "./screens";

export async function CoverageScreen({
  locale,
  session,
  page,
}: {
  locale: string;
  session: Session;
  page: number;
}) {
  const queue = await readCoverage(getDb(), session, page);
  const c = coverageCopy(locale),
    common = workCopy(locale);
  return (
    <Page title={c.title} locale={locale}>
      <p>{c.lead}</p>
      {(["cases", "tasks", "inquiries", "appointments", "keys"] as const).map((kind) => (
        <section key={kind} aria-labelledby={`coverage-${kind}`} className="space-y-4">
          <h2 id={`coverage-${kind}`} className="text-subheading font-semibold">
            {c[kind]}
          </h2>
          {kind === "keys" ? <p>{c.keyNote}</p> : null}
          {kind === "appointments" ? <p>{c.appointmentNote}</p> : null}
          {queue[kind].length ? (
            <ul className="divide-y divide-border rounded-card border border-border">
              {queue[kind].map((row) => (
                <li key={row.id} className="space-y-2 p-4">
                  <a
                    className="font-semibold text-accent underline underline-offset-4"
                    href={`/${locale}/${kind === "keys" ? "operations/keys" : kind === "appointments" ? "calendar" : kind}/${row.id}`}
                  >
                    {"title" in row ? row.title : row.reference}
                  </a>
                  <p>
                    {kind === "keys" ? c.holder : kind === "appointments" ? c.host : c.owner}:{" "}
                    {row.ownerName ?? common.noOwner}
                  </p>
                  <p>
                    {kind === "appointments" ? c.starts : common.followUp}:{" "}
                    <When date={row.dueAt} locale={locale} />
                  </p>
                  {"state" in row ? <p>{caseCopy(locale)[row.state]}</p> : null}
                  {"promisedToClient" in row && row.promisedToClient ? (
                    <p className="font-semibold">{c.promise}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>{common.empty}</p>
          )}
        </section>
      ))}
      <Pagination {...queue} href={`/${locale}/coverage`} locale={locale} />
    </Page>
  );
}
