import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { operations } from "@/db/schema";
import { absenceAction } from "@/features/absence/action";
import { absenceCopy } from "@/features/absence/copy";
import { absenceReferenceCookie } from "@/features/absence/reference";
import { caseCopy } from "@/features/cases/copy";
import { WorkflowForm } from "@/features/cases/form";
import { WorkflowTime, workflowLink } from "@/features/cases/screens";
import { AccessFrame } from "@/features/identity/access-frame";
import { PrivatePageGuard } from "@/features/identity/private-page-guard";
import { offboardingCopy } from "@/features/offboarding/copy";
import { coverageCopy } from "@/features/work/coverage-copy";
import { isStaffLocale } from "@/i18n/config";
import { readStaffAbsence } from "@/server/auth/absence";
import { readOffboardingWork } from "@/server/auth/offboarding-work";
import { requireStaffPage } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import { isAppError } from "@/server/errors";
import { initialFormState, isIssuedFormOperation } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ receipt?: string; review?: string; workPage?: string }>;
}) {
  const { locale, id } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale),
    db = getDb(),
    path = `/${locale}/access/absence/${id}`;
  if (!(await can(db, session.actor, "access.grant"))) notFound();
  if (!isFresh(session)) redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  const { person, retained } = await readStaffAbsence(db, session, id).catch((error) => {
      if (isAppError(error) && error.code === "not_found") notFound();
      throw error;
    }),
    c = offboardingCopy(locale),
    a = absenceCopy(locale),
    planned = Boolean(person.absenceFrom && person.absenceFrom > new Date());
  const query = await searchParams;
  const requestedPage =
    typeof query.workPage === "string" && /^[1-9]\d{0,3}$/.test(query.workPage)
      ? Number(query.workPage)
      : 1;
  const work = await readOffboardingWork(db, session, id, requestedPage);
  const workPath = (page: number) =>
    `${path}?workPage=${page}${query.receipt ? `&receipt=${encodeURIComponent(query.receipt)}` : ""}`;
  const referenceCookie = absenceReferenceCookie(session.actor.id, id);
  const pendingReference = (await cookies()).get(referenceCookie)?.value;
  if (
    !query.receipt &&
    pendingReference &&
    isIssuedFormOperation(`staff.absence:${id}`, pendingReference)
  )
    redirect(`${path}?receipt=${encodeURIComponent(pendingReference)}`);
  const [receipt] =
    typeof query.receipt === "string"
      ? await db
          .select({ id: operations.id, outcome: operations.outcome, status: operations.status })
          .from(operations)
          .where(
            and(
              eq(operations.operationType, "access.staff.absence"),
              eq(operations.actorKind, "staff"),
              eq(operations.actorId, session.actor.id),
              eq(operations.idempotencyKey, query.receipt),
            ),
          )
          .limit(1)
      : [];
  const confirmed =
    receipt?.status === "succeeded" &&
    (receipt.outcome as { principalId?: string })?.principalId === id;
  // The signature binds even a failed receipt (which has no result record) to this target.
  const notApplied =
    receipt?.status === "failed" &&
    typeof query.receipt === "string" &&
    isIssuedFormOperation(`staff.absence:${id}`, query.receipt);
  const reviewing = notApplied && query.review === "1";
  const initial = initialFormState(
    `staff.absence:${id}`,
    {
      mode: person.absenceFrom ? "return" : "schedule",
      startsAt: "",
      reviewAt: "",
      reason: "",
      reviewed: "",
    },
    person.version,
  );
  return (
    <PrivatePageGuard locale={locale} verification={randomUUID()}>
      <AccessFrame title={a.title} lead={a.lead} standalone>
        <p className="font-semibold break-words">
          {person.name} · {person.email}
        </p>
        <section className="space-y-3" aria-label={a.title}>
          <h2 className="text-subheading font-semibold">
            {person.absenceFrom ? (planned ? a.planned : a.absent) : a.available}
          </h2>
          {person.absenceFrom ? (
            <p>
              {a.startsRecorded}: <WorkflowTime value={person.absenceFrom} locale={locale} />
            </p>
          ) : null}
          {person.reviewAt ? (
            <p>
              {a.reviewRecorded}: <WorkflowTime value={person.reviewAt} locale={locale} />
            </p>
          ) : null}
          {person.reviewAt && person.reviewAt < new Date() ? (
            <Notice tone="warning">{a.overdue}</Notice>
          ) : null}
          <a href={`/${locale}/coverage`} className={workflowLink}>
            {coverageCopy(locale).title}
          </a>
        </section>
        {confirmed ? (
          <Notice tone="success">
            {a.recorded}: <bdi>{receipt.id}</bdi>
          </Notice>
        ) : null}
        {notApplied ? (
          <Notice tone="error">
            <p>{a.notApplied}</p>
            <p className="break-all">
              <bdi>{receipt.id}</bdi>
            </p>
            {!reviewing ? (
              <a
                className={workflowLink}
                href={`${path}?receipt=${encodeURIComponent(query.receipt ?? "")}&review=1`}
              >
                {c.reviewAgain}
              </a>
            ) : null}
          </Notice>
        ) : query.receipt && !confirmed ? (
          <Notice tone="warning">
            <p>{caseCopy(locale).statusUnknown}</p>
            <p className="break-all">
              <bdi>{query.receipt}</bdi>
            </p>
            <a
              className={workflowLink}
              href={`${path}?receipt=${encodeURIComponent(query.receipt)}`}
            >
              {caseCopy(locale).status}
            </a>
          </Notice>
        ) : null}
        <section className="space-y-3">
          <h2 className="text-subheading font-semibold">{c.retained}</h2>
          <p>{a.manager}</p>
          <dl>
            {(["keys", "cases", "tasks", "inquiries"] as const).map((k) => (
              <div key={k} className="flex justify-between gap-4">
                <dt>{c[k]}</dt>
                <dd>{retained[k]}</dd>
              </div>
            ))}
          </dl>
          {(await can(db, session.actor, "key.manage")) ? (
            <a className={workflowLink} href={`/${locale}/operations/keys?state=checked_out`}>
              {c.keys}
            </a>
          ) : null}
        </section>
        <section className="space-y-4">
          <h2 className="text-subheading font-semibold">{c.work}</h2>
          <p>{c.workScope}</p>
          {(["keys", "cases", "tasks", "inquiries"] as const).map((kind) =>
            work[kind].length ? (
              <section key={kind} className="space-y-2">
                <h3 className="font-semibold">{c[kind]}</h3>
                <ul className="space-y-2">
                  {work[kind].map((row) => (
                    <li key={row.id} className="break-words">
                      <a
                        className={workflowLink}
                        href={`/${locale}/${kind === "keys" ? "operations/keys" : kind}/${row.id}`}
                      >
                        {"reference" in row ? row.reference : row.title}
                        {"reference" in row && "title" in row ? ` · ${row.title}` : ""}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {!work.keys.length &&
          !work.cases.length &&
          !work.tasks.length &&
          !work.inquiries.length ? (
            <p>{c.noWork}</p>
          ) : null}
          <nav className="flex flex-wrap gap-4" aria-label={c.work}>
            {work.page > 1 ? (
              <a className={workflowLink} href={workPath(work.page - 1)}>
                {c.previous}
              </a>
            ) : null}
            {work.hasMore ? (
              <a className={workflowLink} href={workPath(work.page + 1)}>
                {c.next}
              </a>
            ) : null}
          </nav>
        </section>
        {query.receipt && !confirmed && !reviewing ? null : person.state !== "active" ? (
          <p>{c.ended}</p>
        ) : (
          <WorkflowForm
            locale={locale}
            initialState={initial}
            pendingReferenceCookie={referenceCookie}
            action={absenceAction.bind(null, locale, id)}
            path={path}
            status={{
              href: `${path}?receipt=${encodeURIComponent(initial.operationId)}`,
              label: caseCopy(locale).status,
            }}
            submit={person.absenceFrom ? (planned ? a.cancel : a.return) : a.schedule}
            fields={[
              { name: "mode", label: "", type: "hidden" },
              ...(!person.absenceFrom
                ? [
                    {
                      name: "startsAt",
                      label: a.starts,
                      hint: a.startsHint,
                      type: "datetime-local" as const,
                    },
                    {
                      name: "reviewAt",
                      label: a.review,
                      hint: a.reviewHint,
                      type: "datetime-local" as const,
                      required: true,
                    },
                  ]
                : []),
              {
                name: "reason",
                label: a.reason,
                hint: a.reasonHint,
                type: "textarea",
                required: true,
              },
              { name: "reviewed", label: a.reviewed, type: "checkbox", required: true },
            ]}
          />
        )}
        <a href={`/${locale}/access/manage`} className={workflowLink}>
          {c.back}
        </a>
      </AccessFrame>
    </PrivatePageGuard>
  );
}
