import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import type { ComponentProps } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cases, operations, principals, staffMemberships } from "@/db/schema";
import { capabilities } from "@/domain/capabilities";
import { publicLocales } from "@/domain/ids";
import { participantRoles } from "@/domain/parties";
import { AccessFrame, SignOutForm } from "@/features/identity/access-frame";
import { accessErrorMessage, identityCopy, roleLabel } from "@/features/identity/copy";
import { grantManagementCopy } from "@/features/identity/grant-copy";
import { managementCopy, staffRoleLabel } from "@/features/identity/management-copy";
import { PrivatePageGuard } from "@/features/identity/private-page-guard";
import { offboardingCopy } from "@/features/offboarding/copy";
import { isStaffLocale } from "@/i18n/config";
import { listStaffGrants } from "@/server/auth/grants";
import { staffRoles } from "@/server/auth/invitations";
import { requireStaffPage } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import { buttonClass } from "@/ui/button-class";
import { Notice } from "@/ui/notice";

const field =
  "mt-1 block w-full min-w-0 max-w-full min-h-control rounded-control border border-border bg-surface px-3 py-2";
// Linux WebKit includes native option paint in document overflow. The padded containment
// keeps the native control and its outer 3px/2px focus ring without widening the page.
function AccessSelect(props: ComponentProps<"select">) {
  return (
    <span className="block -m-1.5 p-1.5 [contain:paint]">
      <select {...props} />
    </span>
  );
}

export default async function ManagePage({
  params,
  searchParams,
}: PageProps<"/staff/[locale]/access/manage">) {
  const { locale } = await params;
  if (!isStaffLocale(locale)) notFound();
  const session = await requireStaffPage(locale);
  const db = getDb();
  const c = managementCopy(locale);
  if (!(await can(db, session.actor, "access.grant")))
    return <AccessFrame title={c.title} lead={c.denied} standalone />;
  if (!isFresh(session))
    redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/access/manage`)}`);
  const allMembers = await db
    .select({ id: principals.id, name: principals.displayName, email: principals.email })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(
      and(
        eq(principals.kind, "staff"),
        eq(principals.status, "active"),
        eq(staffMemberships.state, "active"),
      ),
    );
  const members = allMembers.filter((member) => member.id !== session.account.id);
  const formerMembers = await db
    .select({ id: principals.id, name: principals.displayName, email: principals.email })
    .from(principals)
    .innerJoin(staffMemberships, eq(staffMemberships.principalId, principals.id))
    .where(and(eq(principals.kind, "staff"), eq(staffMemberships.state, "ended")))
    .orderBy(desc(staffMemberships.endedAt))
    .limit(50);

  const currentGrants = await listStaffGrants(db, session);
  const grantCopy = grantManagementCopy(locale);
  const availableCases = await db
    .select({ id: cases.id, reference: cases.reference, title: cases.title })
    .from(cases)
    .limit(200);
  const query = await searchParams;
  const receiptId = z.uuid().safeParse(query.receipt);
  const [receipt] = receiptId.success
    ? await db
        .select({ id: operations.id })
        .from(operations)
        .where(
          and(
            eq(operations.id, receiptId.data),
            eq(operations.actorKind, "staff"),
            eq(operations.actorId, session.account.id),
            eq(operations.status, "succeeded"),
            inArray(operations.operationType, [
              "access.capability.grant",
              "access.capability.revoke",
            ]),
          ),
        )
        .limit(1)
    : [];
  const shared = identityCopy(locale);
  const error = typeof query.error === "string" ? accessErrorMessage(shared, query.error) : null;
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const person = (
    <>
      <label className="block min-w-0">
        {c.name}
        <input name="displayName" className={field} maxLength={120} required autoComplete="name" />
      </label>
      <label className="block min-w-0">
        {c.email}
        <input
          name="email"
          className={field}
          type="email"
          maxLength={254}
          required
          autoComplete="email"
          dir="ltr"
        />
      </label>
    </>
  );
  return (
    <PrivatePageGuard locale={locale} verification={randomUUID()}>
      <AccessFrame title={c.title} lead={c.lead} standalone>
        {typeof query.saved === "string" ? <Notice tone="success">{c.success}</Notice> : null}
        {receipt ? (
          <Notice tone="success">
            {grantCopy.receipt}: <bdi>{receipt.id}</bdi>
          </Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
          <h2 className="text-section font-semibold">{c.staffTitle}</h2>
          <form
            method="post"
            action={`/${locale}/access/manage/submit`}
            className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
          >
            {hidden("staff")}
            {person}
            <label htmlFor="staff-invitation-role" className="block min-w-0">
              {c.role}
              <AccessSelect
                id="staff-invitation-role"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                name="role"
                defaultValue="assigned_broker"
              >
                {staffRoles.map((role) => (
                  <option key={role} value={role}>
                    {staffRoleLabel(locale, role)}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <button type="submit" className={buttonClass()}>
              {c.invite}
            </button>
          </form>
        </section>
        <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
          <h2 className="text-section font-semibold">{offboardingCopy(locale).title}</h2>
          <ul className="space-y-3">
            {members.map((member) => (
              <li key={member.id}>
                <a
                  className="block min-h-control break-words underline"
                  href={`/${locale}/access/offboard/${member.id}`}
                >
                  {member.name} · {member.email}
                </a>
              </li>
            ))}
          </ul>
        </section>
        <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
          {formerMembers.length ? (
            <>
              <h2 className="text-section font-semibold">{offboardingCopy(locale).former}</h2>
              <ul className="space-y-3">
                {formerMembers.map((member) => (
                  <li key={member.id}>
                    <a
                      className="block min-h-control break-words underline"
                      href={`/${locale}/access/offboard/${member.id}`}
                    >
                      {member.name} · {member.email}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <h2 className="text-section font-semibold">{c.recoveryTitle}</h2>
          <p>{c.recoveryNote}</p>
          <form
            method="post"
            action={`/${locale}/access/manage/submit`}
            className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
          >
            {hidden("recovery")}
            <label htmlFor="recovery-principal" className="block min-w-0">
              {c.member}
              <AccessSelect
                id="recovery-principal"
                name="principalId"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                required
                defaultValue=""
              >
                <option value="" disabled>
                  {c.choose}
                </option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} — {member.email}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <label className="block min-w-0">
              {c.evidence}
              <textarea
                className={field}
                name="verificationNote"
                minLength={10}
                maxLength={500}
                required
              />
            </label>
            <label className="flex gap-3 items-start">
              <input className="mt-1" type="checkbox" name="confirmed" value="yes" required />
              {c.confirm}
            </label>
            <button type="submit" className={buttonClass("destructive")} disabled={!members.length}>
              {c.recover}
            </button>
          </form>
        </section>
        <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
          <h2 className="text-section font-semibold">{c.clientTitle}</h2>
          <form
            method="post"
            action={`/${locale}/access/manage/submit`}
            className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
          >
            {hidden("client")}
            {person}
            <label htmlFor="client-invitation-principal" className="block min-w-0">
              {c.case}
              <AccessSelect
                id="client-invitation-principal"
                name="caseId"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                required
                defaultValue=""
              >
                <option value="" disabled>
                  {c.choose}
                </option>
                {availableCases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.reference} — {item.title}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <label htmlFor="client-invitation-role" className="block min-w-0">
              {c.participant}
              <AccessSelect
                id="client-invitation-role"
                name="role"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                defaultValue="collaborator"
              >
                {participantRoles.map((role) => (
                  <option value={role} key={role}>
                    {roleLabel(locale, role)}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <button type="submit" className={buttonClass()} disabled={!availableCases.length}>
              {c.invite}
            </button>
          </form>
        </section>
        <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
          <h2 className="text-section font-semibold">{grantCopy.title}</h2>
          <p>{grantCopy.lead}</p>
          <form
            method="post"
            action={`/${locale}/access/manage/submit`}
            className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
          >
            {hidden("grant")}
            <input type="hidden" name="operationId" value={randomUUID()} />
            <label htmlFor="capability-principal" className="block min-w-0">
              {c.member}
              <AccessSelect
                id="capability-principal"
                name="principalId"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                required
              >
                {allMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} — {member.email}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <label htmlFor="capability-choice" className="block min-w-0">
              {grantCopy.capability}
              <AccessSelect
                id="capability-choice"
                name="capability"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                defaultValue="document.review"
              >
                {capabilities.map((capability) => (
                  <option key={capability} value={capability}>
                    {capability}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <label htmlFor="capability-record-type" className="block min-w-0">
              {grantCopy.scope}
              <AccessSelect
                id="capability-record-type"
                name="recordType"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                defaultValue=""
              >
                <option value="">{grantCopy.global}</option>
                {(["document", "listing", "property", "case"] as const).map((type) => (
                  <option key={type} value={type}>
                    {grantCopy[type]}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <label className="block min-w-0">
              {grantCopy.recordId}
              <input name="recordId" className={field} maxLength={36} />
            </label>
            <label htmlFor="capability-locale" className="block min-w-0">
              {grantCopy.locale}
              <AccessSelect
                id="capability-locale"
                name="grantLocale"
                className={`${field} h-control overflow-hidden text-ellipsis`}
                defaultValue=""
              >
                <option value="">{grantCopy.allLocales}</option>
                {publicLocales.map((value) => (
                  <option key={value} value={value}>
                    {value.toUpperCase()}
                  </option>
                ))}
              </AccessSelect>
            </label>
            <label className="block min-w-0">
              {grantCopy.expires}
              <input name="expiresAt" type="date" className={field} />
            </label>
            <label className="block min-w-0">
              {grantCopy.reason}
              <textarea name="reason" className={field} minLength={10} maxLength={1000} required />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmed" value="yes" required />
              {grantCopy.confirmation}
            </label>
            <button type="submit" className={buttonClass()}>
              {grantCopy.grant}
            </button>
          </form>
          <h3 className="font-semibold">{grantCopy.existing}</h3>
          {currentGrants.map(({ grant, name }) => (
            <form
              key={grant.id}
              method="post"
              action={`/${locale}/access/manage/submit`}
              className="grid min-w-0 grid-cols-1 gap-3 rounded-panel border border-divider p-4"
            >
              {hidden("revoke-grant")}
              <input type="hidden" name="operationId" value={randomUUID()} />
              <input type="hidden" name="grantId" value={grant.id} />
              <input type="hidden" name="expectedRevision" value={grant.version} />
              <p>
                <strong>{name}</strong> ·{" "}
                {grant.capability ??
                  (grant.role
                    ? staffRoleLabel(locale, grant.role as Parameters<typeof staffRoleLabel>[1])
                    : "")}{" "}
                · {grant.recordType ?? grantCopy.global}
                {grant.recordId ? ` · ${grant.recordId}` : ""}
                {grant.locales?.length ? ` · ${grant.locales.join(", ")}` : ""}
              </p>
              <p>{grant.reason}</p>
              <label className="block min-w-0">
                {grantCopy.reason}
                <textarea
                  name="reason"
                  className={field}
                  minLength={10}
                  maxLength={1000}
                  required
                />
              </label>
              <button type="submit" className={buttonClass("destructive")}>
                {grantCopy.revoke}
              </button>
            </form>
          ))}
        </section>
        <a href={`/${locale}/today`} className="text-action underline">
          {c.back}
        </a>
        <SignOutForm action={`/${locale}/access/signout`} label={shared.signOut} />
      </AccessFrame>
    </PrivatePageGuard>
  );
}
