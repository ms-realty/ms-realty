import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { operations } from "@/db/schema";
import type { Session } from "@/server/auth/sessions";
import {
  type CustodyState,
  custodyHolders,
  custodyOperator,
  custodyStates,
  custodyTransitions,
  listKeys,
  readKeys,
} from "@/server/key-custody/service";
import { initialFormState } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { type WorkflowField, WorkflowForm } from "../cases/form";
import { WorkflowTime, workflowLink } from "../cases/screens";
import { DiscoveryPage } from "../discovery/page";
import { custodyAction } from "./actions";
import { type CustodyCommand, custodyFields, custodyScope } from "./contract";
import { custodyCopy } from "./copy";

type Props = { locale: string; session: Session };
function CustodyForm({
  locale,
  command,
  id = "new",
  fields,
  values = {},
  revision = null,
}: {
  locale: string;
  command: CustodyCommand;
  id?: string;
  fields: WorkflowField[];
  values?: Record<string, string>;
  revision?: number | null;
}) {
  const initial = initialFormState(
    custodyScope(command, id),
    Object.fromEntries(custodyFields[command].map((n) => [n, values[n] ?? ""])),
    revision,
  );
  return (
    <WorkflowForm
      locale={locale}
      initialState={initial}
      fields={fields}
      action={custodyAction.bind(null, locale, command, id)}
      path={`/${locale}/operations/keys${command === "receive" ? "" : `/${id}`}`}
      status={{
        href: `/${locale}/operations/keys/receipt?key=${encodeURIComponent(initial.operationId)}`,
        label: caseCopy(locale).status,
      }}
      submit={custodyCopy(locale)[command]}
    />
  );
}
export async function CustodyList({
  locale,
  session,
  state,
  after,
}: Props & { state?: string; after?: string }) {
  const c = custodyCopy(locale),
    path = `/${locale}/operations/keys`,
    page = await listKeys(getDb(), session, state, after);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{c.title}</h1>
      <p>{c.lead}</p>
      <nav className="flex flex-wrap gap-4" aria-label={c.state}>
        <a className={workflowLink} href={path}>
          {c.all}
        </a>
        {[...custodyStates, "overdue" as const].map((s) => (
          <a key={s} className={workflowLink} href={`${path}?state=${s}`}>
            {c[s]}
          </a>
        ))}
      </nav>
      {page.rows.length ? (
        <ul className="divide-y divide-border">
          {page.rows.map(({ key, propertyReference, holderName }) => (
            <li key={key.id} className="space-y-2 py-5">
              <a className={workflowLink} href={`${path}/${key.id}`}>
                <bdi>{key.reference}</bdi> · {key.keyTag}
              </a>
              <p>
                {propertyReference} · {c[key.state as CustodyState]} · {key.quantity}
              </p>
              {holderName ? (
                <p>
                  {c.holderId}: {holderName}
                </p>
              ) : null}
              {key.dueAt ? (
                <p>
                  {c.dueAt}: <WorkflowTime value={key.dueAt} locale={locale} />
                  {key.dueAt.getTime() < Date.now() ? ` · ${c.overdue}` : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{c.empty}</p>
      )}
      {page.next ? (
        <a
          className={workflowLink}
          href={`${path}?${new URLSearchParams({ ...(state ? { state } : {}), after: page.next })}`}
        >
          {c.more}
        </a>
      ) : null}
      <section className="space-y-4">
        <h2 className="text-subheading font-semibold">{c.receive}</h2>
        <CustodyForm
          locale={locale}
          command="receive"
          values={{ quantity: "1" }}
          fields={[
            { name: "propertyReference", label: c.propertyReference, required: true },
            { name: "keyTag", label: c.keyTag, required: true },
            { name: "quantity", label: c.quantity, type: "number", required: true },
            { name: "sourceReference", label: c.sourceReference, required: true },
            { name: "storageLabel", label: c.storageLabel, required: true },
            { name: "note", label: c.note, type: "textarea", required: true },
            { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
          ]}
        />
      </section>
    </DiscoveryPage>
  );
}
export async function CustodyDetail({
  locale,
  session,
  id,
  before,
}: Props & { id: string; before?: string }) {
  const db = getDb(),
    c = custodyCopy(locale),
    { row, propertyReference, events, next, names } = await readKeys(db, session, id, before),
    holders = await custodyHolders(db, session);
  const name = (id: string | null) => names.find((n) => n.id === id)?.name ?? "—",
    choices = custodyTransitions(row.state);
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">
        {row.reference} · {row.keyTag}
      </h1>
      <a className={workflowLink} href={`/${locale}/operations/keys`}>
        {c.title}
      </a>
      <p>{c.lead}</p>
      <dl className="grid min-w-0 gap-3 [overflow-wrap:anywhere] sm:grid-cols-2">
        {[
          [c.propertyReference, propertyReference],
          [c.quantity, row.quantity],
          [c.sourceReference, row.sourceReference],
          [c.state, c[row.state as CustodyState]],
          [c.storageLabel, row.storageLabel ?? "—"],
          [c.holderId, name(row.holderId)],
        ].map(([label, value]) => (
          <div key={String(label)} className="min-w-0">
            <dt className="font-semibold">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {row.dueAt ? (
        <p>
          {c.dueAt}: <WorkflowTime value={row.dueAt} locale={locale} />
          {row.dueAt.getTime() < Date.now() ? ` · ${c.overdue}` : null}
        </p>
      ) : null}
      {choices.length ? (
        <section className="space-y-4">
          <h2 className="text-subheading font-semibold">{c.move}</h2>
          <p>{c.help}</p>
          <CustodyForm
            locale={locale}
            command="move"
            id={id}
            revision={row.version}
            values={{ state: choices[0] ?? "", storageLabel: row.storageLabel ?? "" }}
            fields={[
              {
                name: "state",
                label: c.state,
                type: "select",
                required: true,
                options: choices.map((s) => ({ value: s, label: c[s] })),
              },
              {
                name: "holderId",
                label: c.holderId,
                type: "select",
                options: [
                  { value: "", label: "—" },
                  ...holders.map((h) => ({ value: h.id, label: `${h.name} · ${h.email}` })),
                ],
              },
              { name: "dueAt", label: c.dueAt, type: "datetime-local" },
              { name: "storageLabel", label: c.storageLabel },
              { name: "note", label: c.note, type: "textarea", required: true },
              { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
            ]}
          />
        </section>
      ) : (
        <p>{c.terminal}</p>
      )}
      {row.state === "checked_out" && holders.some((h) => h.id === row.holderId) ? (
        <section className="space-y-4" aria-labelledby="key-deadline-heading">
          <h2 id="key-deadline-heading" className="text-subheading font-semibold">
            {c.amend_deadline}
          </h2>
          <p>{c.deadlineHelp}</p>
          <CustodyForm
            locale={locale}
            command="amend_deadline"
            id={id}
            revision={row.version}
            fields={[
              { name: "dueAt", label: c.dueAt, type: "datetime-local", required: true },
              { name: "note", label: c.deadlineNote, type: "textarea", required: true },
              { name: "reviewed", label: c.deadlineReviewed, type: "checkbox", required: true },
            ]}
          />
        </section>
      ) : null}
      <section className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
        <h2 className="text-subheading font-semibold">{c.history}</h2>
        <ol className="divide-y divide-border">
          {events.map((event) => (
            <li key={event.id} className="space-y-2 py-4">
              {event.operationType === "key.amend_deadline" ? (
                <p className="font-semibold">{c.deadlineChanged}</p>
              ) : null}
              <p>
                <strong>{c[event.state as CustodyState]}</strong> ·{" "}
                <WorkflowTime value={event.createdAt} locale={locale} />
              </p>
              <p>
                {c.recordedBy}: {name(event.recordedById)}
              </p>
              {event.holderId ? (
                <p>
                  {c.holderId}: {name(event.holderId)}
                </p>
              ) : null}
              {event.storageLabel ? (
                <p>
                  {c.storageLabel}: {event.storageLabel}
                </p>
              ) : null}
              {event.dueAt ? (
                <p>
                  {c.dueAt}: <WorkflowTime value={event.dueAt} locale={locale} />
                </p>
              ) : null}
              <p className="whitespace-pre-wrap break-words">{event.note}</p>
            </li>
          ))}
        </ol>
        {next ? (
          <a className={workflowLink} href={`/${locale}/operations/keys/${id}?before=${next}`}>
            {c.more}
          </a>
        ) : null}
      </section>
    </DiscoveryPage>
  );
}
export async function CustodyReceipt({
  locale,
  session,
  operationKey,
}: Props & { operationKey: string }) {
  const db = getDb();
  await custodyOperator(db, session);
  const [row] = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, session.actor.id),
        eq(operations.idempotencyKey, operationKey),
        inArray(operations.operationType, ["key.receive", "key.move", "key.amend_deadline"]),
      ),
    );
  if (!row) notFound();
  const outcome = z
      .object({ id: z.uuid(), reference: z.string(), state: z.enum(custodyStates) })
      .safeParse(row.outcome),
    c = caseCopy(locale),
    success = row.status === "succeeded" && outcome.success;
  return (
    <DiscoveryPage>
      <h1 className="text-title font-semibold">{success ? c.saved : c.status}</h1>
      <p role="status">
        {success
          ? outcome.data.reference
          : row.status === "failed"
            ? c.statusFailed
            : c.statusUnknown}
      </p>
      <WorkflowTime value={row.completedAt} locale={locale} />
      <a
        className={workflowLink}
        href={`/${locale}/operations/keys${success ? `/${outcome.data.id}` : ""}`}
      >
        {c.back}
      </a>
    </DiscoveryPage>
  );
}
