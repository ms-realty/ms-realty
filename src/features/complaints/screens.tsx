import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { operations } from "@/db/schema";
import { localParts } from "@/server/appointments/time";
import type { Session } from "@/server/auth/sessions";
import {
  complaintChannels,
  complaintOperator,
  complaintOwners,
  complaintStates,
  listComplaints,
  readComplaint,
} from "@/server/complaints/service";
import { initialFormState } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { type WorkflowField, WorkflowForm } from "../cases/form";
import { WorkflowTime, workflowLink } from "../cases/screens";
import { DiscoveryPage } from "../discovery/page";
import { complaintAction } from "./actions";
import { type ComplaintCommand, complaintFields, complaintScope } from "./contract";
import { complaintCopy } from "./copy";

type Props = { locale: string; session: Session };
function localInput(date: Date) {
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function RegisterForm({
  locale,
  command,
  id = "new",
  fields,
  values = {},
  revision = null,
}: {
  locale: string;
  command: ComplaintCommand;
  id?: string;
  fields: WorkflowField[];
  values?: Record<string, string>;
  revision?: number | null;
}) {
  const c = complaintCopy(locale),
    common = caseCopy(locale),
    path = `/${locale}/operations/complaints${command === "review" ? `/${id}` : ""}`;
  const initial = initialFormState(
    complaintScope(command, id),
    Object.fromEntries(complaintFields[command].map((n) => [n, values[n] ?? ""])),
    revision,
  );
  return (
    <WorkflowForm
      locale={locale}
      initialState={initial}
      fields={fields}
      action={complaintAction.bind(null, locale, command, id)}
      path={path}
      status={{
        href: `/${locale}/operations/complaints/receipt?key=${encodeURIComponent(initial.operationId)}`,
        label: common.status,
      }}
      submit={c[command]}
    />
  );
}
function ownerField(locale: string, owners: { id: string; name: string }[]): WorkflowField {
  return {
    name: "ownerId",
    label: complaintCopy(locale).ownerId,
    type: "select",
    required: true,
    options: owners.map((o) => ({ value: o.id, label: o.name })),
  };
}
export async function ComplaintList({
  locale,
  session,
  state,
  after,
}: Props & { state?: string; after?: string }) {
  const db = getDb(),
    c = complaintCopy(locale),
    page = await listComplaints(db, session, state, after),
    owners = await complaintOwners(db, session);
  const path = `/${locale}/operations/complaints`;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{c.title}</h1>
      <p>{c.lead}</p>
      <nav aria-label={c.state} className="flex flex-wrap gap-4">
        <a className={workflowLink} href={path}>
          {c.all}
        </a>
        {complaintStates.map((s) => (
          <a key={s} className={workflowLink} href={`${path}?state=${s}`}>
            {c[s]}
          </a>
        ))}
      </nav>
      <section aria-label={c.queue} className="space-y-4">
        {!page.rows.length ? (
          <p>{c.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {page.rows.map((row) => (
              <li key={row.id} className="space-y-2 py-4">
                <a className={workflowLink} href={`${path}/${row.id}`}>
                  {row.reference}
                </a>
                <p>
                  {c[row.state as keyof typeof c]} ·{" "}
                  {page.names.find((o) => o.id === row.ownerId)?.name ?? "—"}
                </p>
                <p>
                  {c.dueAt}: <WorkflowTime value={row.dueAt} locale={locale} />{" "}
                  {row.state !== "resolved" && row.dueAt < new Date() ? c.overdue : null}
                </p>
                <p className="break-words">{row.sourceReference}</p>
              </li>
            ))}
          </ul>
        )}
        {page.next ? (
          <a
            className={workflowLink}
            href={`${path}?state=${encodeURIComponent(state ?? "")}&after=${page.next}`}
          >
            {c.more}
          </a>
        ) : null}
      </section>
      <section aria-label={c.create} className="space-y-4 border-t border-border pt-6">
        <h2 className="text-section font-semibold">{c.create}</h2>
        <RegisterForm
          locale={locale}
          command="create"
          values={{
            ownerId: session.actor.id,
            channel: "email",
            receivedAt: localInput(new Date()),
          }}
          fields={[
            {
              name: "channel",
              label: c.channel,
              type: "select",
              required: true,
              options: complaintChannels.map((s) => ({ value: s, label: c[s] })),
            },
            { name: "sourceReference", label: c.sourceReference, required: true },
            { name: "description", label: c.description, type: "textarea", required: true },
            { name: "receivedAt", label: c.receivedAt, type: "datetime-local", required: true },
            ownerField(locale, owners),
            { name: "dueAt", label: c.dueAt, type: "datetime-local", required: true },
            { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
          ]}
        />
      </section>
    </DiscoveryPage>
  );
}
export async function ComplaintDetail({
  locale,
  session,
  id,
  before,
}: Props & { id: string; before?: string }) {
  const db = getDb(),
    c = complaintCopy(locale),
    { row, reviews, names, next } = await readComplaint(db, session, id, before),
    owners = await complaintOwners(db, session);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">
        {c.title} · {row.reference}
      </h1>
      <a className={workflowLink} href={`/${locale}/operations/complaints`}>
        {c.queue}
      </a>
      <p>{c.lead}</p>
      <dl className="space-y-3">
        <div>
          <dt className="font-semibold">{c.channel}</dt>
          <dd>{c[row.channel as keyof typeof c]}</dd>
        </div>
        <div>
          <dt className="font-semibold">{c.state}</dt>
          <dd>{c[row.state as keyof typeof c]}</dd>
        </div>
        <div>
          <dt className="font-semibold">{c.sourceReference}</dt>
          <dd className="break-words">{row.sourceReference}</dd>
        </div>
        <div>
          <dt className="font-semibold">{c.receivedAt}</dt>
          <dd>
            <WorkflowTime value={row.receivedAt} locale={locale} />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{c.description}</dt>
          <dd className="whitespace-pre-wrap break-words">{row.description}</dd>
        </div>
      </dl>
      <section aria-label={c.review} className="space-y-4 border-t border-border pt-6">
        <h2 className="text-section font-semibold">{c.review}</h2>
        <RegisterForm
          locale={locale}
          command="review"
          id={id}
          revision={row.version}
          values={{
            ownerId: row.ownerId,
            dueAt: localInput(row.dueAt),
            state: row.state,
            outcome: row.outcome,
          }}
          fields={[
            ownerField(locale, owners),
            { name: "dueAt", label: c.dueAt, type: "datetime-local", required: true },
            {
              name: "state",
              label: c.state,
              type: "select",
              required: true,
              options: (row.state === "resolved"
                ? (["resolved", "open"] as const)
                : complaintStates
              ).map((s) => ({ value: s, label: c[s] })),
            },
            { name: "note", label: c.note, type: "textarea", required: true },
            { name: "outcome", label: c.outcome, type: "textarea" },
            { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
          ]}
        />
      </section>
      <section aria-label={c.history} className="space-y-4 border-t border-border pt-6">
        <h2 className="text-section font-semibold">{c.history}</h2>
        {reviews.length === 50 ? <p>{c.limited}</p> : null}
        <ol className="space-y-6">
          {reviews.map((review) => (
            <li key={review.id} className="space-y-2">
              <p>
                {review.version} · {c[review.state as keyof typeof c]} ·{" "}
                <WorkflowTime value={review.createdAt} locale={locale} />
              </p>
              <p>
                {c.ownerId}: {names.find((o) => o.id === review.ownerId)?.name ?? "—"}
              </p>
              <p>
                {c.recordedBy}: {names.find((o) => o.id === review.reviewedById)?.name ?? "—"}
              </p>
              <p>
                {c.dueAt}: <WorkflowTime value={review.dueAt} locale={locale} />
              </p>
              <p className="whitespace-pre-wrap break-words">
                {review.note === "received" && review.version === 1 ? c.received : review.note}
              </p>
              {review.outcome ? (
                <p className="whitespace-pre-wrap break-words">{review.outcome}</p>
              ) : null}
            </li>
          ))}
        </ol>
        {next ? (
          <a
            className={workflowLink}
            href={`/${locale}/operations/complaints/${id}?before=${next}`}
          >
            {c.more}
          </a>
        ) : null}
      </section>
    </DiscoveryPage>
  );
}
export async function ComplaintReceipt({
  locale,
  session,
  operationKey,
}: Props & { operationKey: string }) {
  const db = getDb();
  await complaintOperator(db, session);
  const [row] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, session.actor.id),
        eq(operations.idempotencyKey, operationKey),
        inArray(operations.operationType, ["complaint.create", "complaint.review"]),
      ),
    );
  if (!row) notFound();
  const outcome = z
      .object({ id: z.uuid(), reference: z.string(), state: z.enum(complaintStates) })
      .safeParse(row.outcome),
    c = caseCopy(locale);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">
        {row.status === "succeeded" && outcome.success ? c.saved : c.status}
      </h1>
      <p role="status">
        {row.status === "succeeded" && outcome.success
          ? outcome.data.reference
          : row.status === "failed"
            ? c.statusFailed
            : c.statusUnknown}
      </p>
      <WorkflowTime value={row.completedAt} locale={locale} />
      <a
        className={workflowLink}
        href={`/${locale}/operations/complaints${row.status === "succeeded" && outcome.success ? `/${outcome.data.id}` : ""}`}
      >
        {c.back}
      </a>
    </DiscoveryPage>
  );
}
