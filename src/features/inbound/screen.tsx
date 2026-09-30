import "server-only";
import { getDb } from "@/db/client";
import type { Session } from "@/server/auth/sessions";
import { listCases, readCase } from "@/server/cases/queries";
import { listInboundEmails, readInboundEmail } from "@/server/inbound/service";
import type { ReceivedEmail } from "@/server/jobs/resend-receiving";
import { buttonClass } from "@/ui/button-class";
import { controlClass } from "@/ui/field-class";
import { issueFormOperation } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { InboundAttachments } from "./attachments";
import { inboundCopy } from "./copy";
import { inboundDraft, inboundReceipt, inboundScope } from "./native";

const frame = "mx-auto grid min-w-0 max-w-4xl gap-6 px-gutter py-8 break-words";
export async function InboundList({
  locale,
  session,
  query,
}: {
  locale: string;
  session: Session;
  query: { state?: string; after?: string };
}) {
  const c = inboundCopy(locale),
    data = await listInboundEmails(getDb(), session, query);
  return (
    <div className={frame}>
      <h1 className="text-title font-semibold">{c.title}</h1>
      <p>{c.lead}</p>
      <nav aria-label={c.state} className="flex flex-wrap gap-4">
        {(["triage", "assigned", "rejected"] as const).map((state) => (
          <a
            key={state}
            className="underline"
            aria-current={data.state === state ? "page" : undefined}
            href={`/${locale}/operations/inbound?state=${state}`}
          >
            {c[state]}
          </a>
        ))}
      </nav>
      {data.records.length ? (
        <ul className="space-y-4">
          {data.records.map((row) => (
            <li className="rounded-control border border-border p-4" key={row.id}>
              <a className="underline" href={`/${locale}/operations/inbound/${row.id}`}>
                <bdi>{row.subject || c.review}</bdi>
              </a>
              <p>
                <bdi>{row.sender}</bdi>
              </p>
              <p>{c[row.state as "triage" | "assigned" | "rejected"]}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{c.empty}</p>
      )}
      {data.next ? (
        <a
          className="underline"
          href={`/${locale}/operations/inbound?state=${data.state}&after=${data.next}`}
        >
          {c.next}
        </a>
      ) : null}
      {data.waiting.length ? (
        <Notice tone="info">
          {c.waiting}: {data.waiting.length}
        </Notice>
      ) : null}
    </div>
  );
}
export async function InboundDetail({
  locale,
  session,
  id,
  query,
}: {
  locale: string;
  session: Session;
  id: string;
  query: { q?: string; case?: string; receipt?: string; importReceipt?: string; error?: string };
}) {
  const db = getDb(),
    c = inboundCopy(locale),
    row = await readInboundEmail(db, session, id);
  const receipt = await inboundReceipt(db, session, id, query.receipt);
  const choices = row.state === "triage" ? await listCases(db, session, query.q ?? "") : [];
  const draft = await inboundDraft(session, id);
  const selectedId = query.case ?? draft?.caseId;
  const selected = selectedId ? await readCase(db, session, selectedId) : null;
  const base = `/${locale}/operations/inbound/${id}`;
  const attachments = row.attachments as ReceivedEmail["attachments"];
  return (
    <div className={frame}>
      <h1 className="text-title font-semibold">{c.review}</h1>
      <a className="underline" href={`/${locale}/operations/inbound`}>
        {c.back}
      </a>
      <p>{c.lead}</p>
      {query.error ? (
        <div role="alert">
          <Notice tone="error">{c.error}</Notice>
        </div>
      ) : null}
      {receipt ? (
        <div role="status">
          <Notice tone="success">
            {c.receipt}: <bdi data-inbound-receipt>{receipt}</bdi>
          </Notice>
        </div>
      ) : null}
      <p>
        {c.state}: <strong>{c[row.state as "triage" | "assigned" | "rejected"]}</strong>
      </p>
      <article className="grid min-w-0 gap-4 rounded-control border border-border p-4">
        <p>
          {c.from}: <bdi>{row.sender}</bdi>
        </p>
        <h2 className="text-subheading font-semibold">
          {c.subject}: <bdi>{row.subject}</bdi>
        </h2>
        <h3>{c.body}</h3>
        <pre className="min-w-0 whitespace-pre-wrap break-words font-sans" dir="auto">
          {row.body || c.noText}
        </pre>
        {row.htmlOmitted ? <p>{c.omitted}</p> : null}
        <p>{c.auth}</p>
        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(row.authentication)}</pre>
        {attachments.length ? (
          <section>
            <h3>{c.attachments}</h3>
            <ul>
              {attachments.map((a) => (
                <li key={a.id}>
                  <bdi>{a.filename ?? "—"}</bdi> · <bdi>{a.contentType}</bdi>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
      {row.caseId ? (
        <a className="underline" href={`/${locale}/cases/${row.caseId}`}>
          {c.caseLink}
        </a>
      ) : null}
      {row.state === "assigned" && row.caseId && attachments.length ? (
        <InboundAttachments
          session={session}
          locale={locale}
          id={id}
          caseId={row.caseId}
          receipt={query.importReceipt}
        />
      ) : null}
      {row.state === "triage" ? (
        <>
          <form method="get" action={base} className="grid min-w-0 gap-3">
            <label htmlFor="inbound-search">{c.search}</label>
            <input
              id="inbound-search"
              name="q"
              type="search"
              className={controlClass}
              defaultValue={query.q ?? ""}
              maxLength={120}
            />
            <button type="submit" className={buttonClass("secondary")}>
              {c.searchAction}
            </button>
          </form>
          <form method="get" action={base} className="grid min-w-0 gap-3">
            <input type="hidden" name="q" value={query.q ?? ""} />
            <label htmlFor="inbound-case">{c.select}</label>
            <select
              id="inbound-case"
              className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
              name="case"
              defaultValue={selected?.record.id ?? ""}
              required
            >
              <option value="">—</option>
              {choices.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.reference} · {item.title}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonClass("secondary")}>
              {c.choose}
            </button>
          </form>
          {row.suggestedCaseId && choices.some((item) => item.id === row.suggestedCaseId) ? (
            <p>
              {c.suggestion}:{" "}
              <a className="underline" href={`${base}?case=${row.suggestedCaseId}`}>
                {choices.find((item) => item.id === row.suggestedCaseId)?.reference}
              </a>
            </p>
          ) : null}
          <form method="post" action={`${base}/submit`} className="grid min-w-0 gap-4">
            <input
              type="hidden"
              name="operationId"
              value={issueFormOperation(`${inboundScope}:${id}`)}
            />
            <input type="hidden" name="expectedVersion" value={row.version} />
            {selected ? (
              <>
                <p>
                  {c.case}:{" "}
                  <strong>
                    {selected.record.reference} · {selected.record.title}
                  </strong>
                </p>
                <input type="hidden" name="caseId" value={selected.record.id} />
                <input type="hidden" name="caseVersion" value={selected.record.version} />
                <div className="grid min-w-0 gap-2">
                  <label htmlFor="inbound-party">{c.party}</label>
                  <select
                    id="inbound-party"
                    className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                    name="partyId"
                    defaultValue={draft?.partyId ?? ""}
                  >
                    <option value="">—</option>
                    {selected.participants.map((p) => (
                      <option key={p.id} value={p.partyId}>
                        {p.name} · {p.role}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
            <div className="grid gap-2">
              <label htmlFor="inbound-reason">{c.reason}</label>
              <textarea
                id="inbound-reason"
                className={controlClass}
                name="reason"
                required
                minLength={10}
                maxLength={500}
                defaultValue={draft?.reason ?? ""}
                rows={4}
              />
            </div>
            <label className="flex items-start gap-3">
              <input
                className="mt-1 size-5 shrink-0"
                type="checkbox"
                name="reviewed"
                value="yes"
                required
              />
              <span>{c.reviewed}</span>
            </label>
            <p>{c.boundary}</p>
            <div className="flex flex-wrap gap-3">
              {selected && row.body?.trim() ? (
                <button type="submit" className={buttonClass()} name="decision" value="assign">
                  {c.assign}
                </button>
              ) : null}
              <button
                type="submit"
                className={buttonClass("secondary")}
                name="decision"
                value="reject"
              >
                {c.reject}
              </button>
            </div>
          </form>
        </>
      ) : (
        <p>{row.decisionNote}</p>
      )}
    </div>
  );
}
