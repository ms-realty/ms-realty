import { randomUUID } from "node:crypto";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { type PublicLocale, publicLocales } from "@/domain/ids";
import { privacyRequestKinds, privacyRequestMachine } from "@/domain/privacy";
import type { Session } from "@/server/auth/sessions";
import { wireCode } from "@/server/errors";
import { privateReceipt } from "@/server/privacy/native";
import { getPreferences, preferencePurposes } from "@/server/privacy/preferences";
import {
  clientPrivacyRequests,
  listStaffPrivacyRequests,
  privacyOwners,
  privacyQueuePath,
  privacyQueueQuery,
} from "@/server/privacy/requests";
import type { NormalizedSearch } from "@/server/search/search";
import { controlClass } from "@/ui/field-class";
import { Notice } from "@/ui/notice";
import { privacyCopy, privacyLabel } from "./copy";
import { Area, Check, Envelope, Submit, TextField } from "./forms";
import { ReviewEnvelope } from "./review-envelope";

type Query = { error?: string; receipt?: string; after?: string; before?: string };
function Frame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  // A minmax(0, 1fr) column: a native select's longest option must not widen the page.
  return (
    <div className="mx-auto grid w-full min-w-0 max-w-4xl grid-cols-1 gap-6 px-gutter py-8">
      <h1 className="text-title font-semibold">{title}</h1>
      <p>{lead}</p>
      {children}
    </div>
  );
}
async function Result({
  query,
  locale,
  session,
}: {
  query: Query;
  locale: string;
  session: Session;
}) {
  const c = privacyCopy(locale);
  const receipt = await privateReceipt(getDb(), session, query.receipt);
  return (
    <>
      {receipt ? (
        <Notice tone="success">
          {c.receipt}: <bdi>{receipt}</bdi>
        </Notice>
      ) : null}
      {query.error ? (
        <Notice tone="error">
          {query.error === wireCode("version_conflict") ? c.conflict : c.error}
        </Notice>
      ) : null}
    </>
  );
}

export function SearchEditor({
  locale,
  subscription,
  termsVersionId,
}: {
  locale: string;
  subscription: Awaited<ReturnType<typeof getPreferences>>["subscriptions"][number];
  termsVersionId: string;
}) {
  const c = privacyCopy(locale);
  const current = subscription.criteria as NormalizedSearch | null;
  return (
    <details>
      <summary className="cursor-pointer underline">{c.editSearch}</summary>
      <form action={`/${locale}/preferences/submit`} method="post" className="mt-4 grid gap-4">
        <Envelope intent="edit_search" id={subscription.id} version={subscription.version} />
        <input type="hidden" name="termsVersionId" value={termsVersionId} />
        <label className="grid gap-1">
          {c.searchPurpose}
          <select
            name="searchPurpose"
            className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
            defaultValue={current?.criteria?.purpose ?? "sale"}
          >
            <option value="sale">{c.sale}</option>
            <option value="long_term_rent">{c.rent}</option>
          </select>
        </label>
        <TextField name="q" label={c.query} value={current?.q ?? ""} />
        <TextField
          name="maxPrice"
          label={c.maxPrice}
          type="number"
          step="0.01"
          value={
            current?.criteria?.price?.max === undefined
              ? ""
              : String(current.criteria.price.max / 100)
          }
        />
        <TextField name="timezone" label={c.timezone} value={subscription.timezone} required />
        <label className="grid gap-1">
          {c.frequency}
          <select
            name="frequency"
            className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
            defaultValue={subscription.frequency ?? "daily"}
          >
            <option value="daily">{c.daily}</option>
            <option value="weekly">{c.weekly}</option>
          </select>
        </label>
        <Check name="confirmed">{c.consent}</Check>
        <Submit>{c.saveSearch}</Submit>
      </form>
    </details>
  );
}

export async function ClientPrivacyScreen({
  locale,
  session,
  query,
}: {
  locale: string;
  session: Session;
  query: Query;
}) {
  const c = privacyCopy(locale);
  const requests = await clientPrivacyRequests(getDb(), session);
  return (
    <Frame title={c.privacy} lead={c.lead}>
      <Result query={query} locale={locale} session={session} />
      <form
        method="post"
        action={`/${locale}/privacy/submit`}
        className="grid gap-4 rounded-panel border border-divider bg-surface p-5"
      >
        <Envelope intent="request" />
        <label className="grid gap-1">
          {c.type}
          <select
            name="kind"
            className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
          >
            {privacyRequestKinds.map((kind) => (
              <option key={kind} value={kind}>
                {privacyLabel(locale, kind)}
              </option>
            ))}
          </select>
        </label>
        <p>{c.scopeHelp}</p>
        <Area name="description" label={c.scope} required />
        <Check name="confirmed">{c.confirm}</Check>
        <Submit>{c.submit}</Submit>
      </form>
      <h2 className="text-section font-semibold">{c.history}</h2>
      {!requests.length ? <p>{c.empty}</p> : null}
      {requests.map((request) => (
        <article className="grid gap-2 rounded-panel border border-divider p-5" key={request.id}>
          <h3 className="font-semibold">
            <bdi>{request.reference}</bdi> · {privacyLabel(locale, request.kind)}
          </h3>
          <p>{privacyLabel(locale, request.state)}</p>
          <p>{request.description}</p>
          <p>
            {c.owner}: {request.ownerName}
          </p>
          <p>
            {request.dueAt ? `${c.due}: ${request.dueAt.toISOString().slice(0, 10)}` : c.awaiting}
          </p>
        </article>
      ))}
      <a className="underline" href={`/${locale}/preferences`}>
        {c.prefsLink}
      </a>
    </Frame>
  );
}

export async function PreferencesScreen({
  locale,
  session,
  query,
}: {
  locale: PublicLocale;
  session: Session;
  query: Query;
}) {
  const c = privacyCopy(locale);
  const data = await getPreferences(getDb(), session, locale);
  const preferences = data.party.contactPreferences as {
    timezone?: string;
    channel?: string;
    contactWindow?: string;
  };
  const verified = data.contacts.filter(
    (contact) => contact.kind === "email" && contact.verification === "verified",
  );
  const action = `/${locale}/preferences/submit`;
  return (
    <Frame title={c.preferences} lead={c.contactLead}>
      <Result query={query} locale={locale} session={session} />
      <section className="grid gap-3">
        <h2 className="text-section font-semibold">{c.contacts}</h2>
        {data.contacts.map((contact) => (
          <p key={contact.id}>
            <bdi>{contact.value}</bdi> ·{" "}
            {contact.verification === "verified" ? c.verified : c.unverified}
          </p>
        ))}
        {!verified.length ? (
          <>
            <p>{c.noContact}</p>
            <a
              className="underline"
              href={`/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/preferences`)}`}
            >
              {c.reverify}
            </a>
          </>
        ) : null}
      </section>
      <form
        method="post"
        action={action}
        className="grid gap-4 rounded-panel border border-divider bg-surface p-5"
      >
        <Envelope intent="contact" version={data.party.version} />
        <label className="grid gap-1">
          {c.language}
          <select
            className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
            name="preferredLocale"
            defaultValue={data.party.preferredLocale ?? locale}
          >
            {publicLocales.map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <TextField
          name="timezone"
          label={c.timezone}
          value={preferences.timezone ?? "Europe/Sofia"}
          required
        />
        <label className="grid gap-1">
          {c.channel}
          <select
            name="channel"
            className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
            defaultValue={preferences.channel ?? "email"}
          >
            <option value="email">{c.email}</option>
            <option value="phone">{c.phone}</option>
          </select>
        </label>
        <TextField name="contactWindow" label={c.window} value={preferences.contactWindow} />
        <Submit>{c.save}</Submit>
      </form>
      <h2 className="text-section font-semibold">{c.purposeChoices}</h2>
      {preferencePurposes.map((purpose) => {
        const terms = data.terms[purpose];
        return (
          <section
            key={purpose}
            className="grid gap-4 rounded-panel border border-divider bg-surface p-5"
          >
            <h3 className="font-semibold">{privacyLabel(locale, purpose)}</h3>
            {terms ? (
              <details>
                <summary className="cursor-pointer underline">
                  {c.terms}: {terms.title}
                </summary>
                {terms.paragraphs.map((text) => (
                  <p key={text} className="mt-3">
                    {text}
                  </p>
                ))}
              </details>
            ) : (
              <p>{c.noTerms}</p>
            )}
            {terms && verified.length ? (
              <form action={action} method="post" className="grid gap-4">
                <Envelope intent="opt_in" />
                <input type="hidden" name="purpose" value={purpose} />
                <input type="hidden" name="termsVersionId" value={terms.version.id} />
                <label className="grid gap-1">
                  {c.email}
                  <select
                    name="contactMethodId"
                    className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                  >
                    {verified.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.value}
                      </option>
                    ))}
                  </select>
                </label>
                <TextField
                  name="timezone"
                  label={c.timezone}
                  value={preferences.timezone ?? "Europe/Sofia"}
                  required
                />
                {purpose === "search_alerts" ? (
                  <>
                    <label className="grid gap-1">
                      {c.searchPurpose}
                      <select
                        name="searchPurpose"
                        className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                      >
                        <option value="sale">{c.sale}</option>
                        <option value="long_term_rent">{c.rent}</option>
                      </select>
                    </label>
                    <TextField name="q" label={c.query} />
                    <TextField name="maxPrice" label={c.maxPrice} type="number" step="0.01" />
                    <label className="grid gap-1">
                      {c.frequency}
                      <select
                        name="frequency"
                        className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                      >
                        <option value="daily">{c.daily}</option>
                        <option value="weekly">{c.weekly}</option>
                      </select>
                    </label>
                  </>
                ) : null}
                <Check name="confirmed">
                  {purpose === "service_updates" ? c.serviceChoice : c.consent}
                </Check>
                <Submit>{purpose === "service_updates" ? c.enableService : c.optIn}</Submit>
              </form>
            ) : null}
          </section>
        );
      })}
      {!data.subscriptions.length ? <p>{c.none}</p> : null}
      {data.subscriptions.map((subscription) => (
        <section
          key={subscription.id}
          className="grid gap-3 rounded-panel border border-divider p-5"
        >
          <h3 className="font-semibold">
            {privacyLabel(locale, subscription.purpose)} ·{" "}
            {privacyLabel(locale, subscription.state)}
          </h3>
          {subscription.criteriaSummary ? <p>{subscription.criteriaSummary}</p> : null}
          <p>{subscription.timezone}</p>
          {subscription.purpose === "search_alerts" &&
          ["active", "paused"].includes(subscription.state) &&
          data.terms.search_alerts ? (
            <SearchEditor
              locale={locale}
              subscription={subscription}
              termsVersionId={data.terms.search_alerts.version.id}
            />
          ) : null}
          <div className="flex flex-wrap gap-3">
            {subscription.state !== "withdrawn"
              ? (subscription.state === "active"
                  ? ["paused", "withdrawn"]
                  : subscription.state === "paused"
                    ? ["active", "withdrawn"]
                    : ["withdrawn"]
                ).map((state) => (
                  <form key={state} action={action} method="post">
                    <Envelope
                      intent="subscription"
                      id={subscription.id}
                      version={subscription.version}
                    />
                    <input type="hidden" name="state" value={state} />
                    <Submit>
                      {state === "paused" ? c.pause : state === "active" ? c.resume : c.withdraw}
                    </Submit>
                  </form>
                ))
              : null}
          </div>
        </section>
      ))}
      <a className="underline" href={`/${locale}/privacy`}>
        {c.privacyLink}
      </a>
    </Frame>
  );
}

const queueLink = "inline-flex min-h-11 items-center underline";

export async function StaffPrivacyScreen({
  locale,
  session,
  query,
}: {
  locale: string;
  session: Session;
  query: Query;
}) {
  const c = privacyCopy(locale);
  const requested = {
    ...(query.after ? { after: query.after } : {}),
    ...(query.before ? { before: query.before } : {}),
  };
  // A stale or edited position falls back to the newest page instead of a dead end.
  const position = privacyQueueQuery.safeParse(requested).success ? requested : {};
  const page = await listStaffPrivacyRequests(getDb(), session, position);
  const { rows } = page;
  // The submit route returns to the same page after the review or a reauthentication.
  const search = privacyQueuePath(locale, position).split("?")[1];
  const submitPath = `/${locale}/operations/privacy/submit${search ? `?${search}` : ""}`;
  const owners = await privacyOwners(getDb());
  return (
    <Frame title={c.operations} lead={c.staffLead}>
      <Result query={query} locale={locale} session={session} />
      {!rows.length ? <p>{c.empty}</p> : null}
      {rows.map(({ record, partyName, ownerName }) => {
        const scope = record.scope as { description?: string; policyReference?: string };
        const next = privacyRequestMachine.transitions[record.state];
        return (
          <section
            // Keyed by staff member too: another member never inherits a dirty review.
            key={`${record.id}:${session.account.id}`}
            className="grid min-w-0 grid-cols-1 gap-4 rounded-panel border border-divider bg-surface p-5 wrap-anywhere"
          >
            <h2 className="text-section font-semibold">
              <bdi>{record.reference}</bdi>
              {partyName ? ` · ${partyName}` : null}
            </h2>
            <p>
              {privacyLabel(locale, record.kind)} · {privacyLabel(locale, record.state)}
            </p>
            <p>{scope.description}</p>
            <p>
              {c.owner}: {ownerName}
            </p>
            <p>
              {record.dueAt ? `${c.due}: ${record.dueAt.toISOString().slice(0, 10)}` : c.awaiting}
            </p>
            {next.length ? (
              <form method="post" action={submitPath} className="grid min-w-0 grid-cols-1 gap-4">
                <ReviewEnvelope
                  id={record.id}
                  version={record.version}
                  operationId={randomUUID()}
                  actorId={session.account.id}
                  restoredLabel={c.restoredReview}
                />
                {/* A wrapping label would add the chosen option to the select's accessible name. */}
                <div className="grid gap-1">
                  <label htmlFor={`${record.id}-to`}>{c.state}</label>
                  <select
                    id={`${record.id}-to`}
                    name="to"
                    className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                  >
                    {next.map((state) => (
                      <option key={state} value={state}>
                        {privacyLabel(locale, state)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <label htmlFor={`${record.id}-owner`}>{c.owner}</label>
                  <select
                    id={`${record.id}-owner`}
                    name="responsibleId"
                    className={`${controlClass} min-w-0 max-w-full overflow-hidden text-ellipsis`}
                    defaultValue={record.responsibleId ?? ""}
                  >
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </select>
                </div>
                <TextField name="policyReference" label={c.policy} value={scope.policyReference} />
                <TextField
                  name="dueAt"
                  label={c.due}
                  type="date"
                  value={record.dueAt?.toISOString().slice(0, 10)}
                />
                <Check name="identityReviewed" required={false}>
                  {c.identity}
                </Check>
                <Area name="legalHoldReason" label={c.hold} value={record.legalHoldReason ?? ""} />
                <Area
                  name="legalHoldDisposition"
                  label={c.disposition}
                  value={record.legalHoldDisposition ?? ""}
                />
                <Check name="holdResolved" required={false}>
                  {c.resolved}
                </Check>
                <Area
                  name="completionEvidence"
                  label={c.completion}
                  value={record.completionEvidence ?? ""}
                />
                <Area name="rejectionReason" label={c.rejection} />
                <Check name="confirmed">{c.reviewed}</Check>
                <Submit>{c.record}</Submit>
              </form>
            ) : null}
          </section>
        );
      })}
      {page.previous || page.next || search ? (
        <nav aria-label={c.queueNavigation} className="flex flex-wrap gap-x-6">
          {search ? (
            <a className={queueLink} href={privacyQueuePath(locale)}>
              {c.latest}
            </a>
          ) : null}
          {page.previous ? (
            <a className={queueLink} href={privacyQueuePath(locale, { before: page.previous })}>
              {c.previous}
            </a>
          ) : null}
          {page.next ? (
            <a className={queueLink} href={privacyQueuePath(locale, { after: page.next })}>
              {c.next}
            </a>
          ) : null}
        </nav>
      ) : null}
    </Frame>
  );
}
