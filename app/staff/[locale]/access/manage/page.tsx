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
import { settingsResourceKeys, settingsResources } from "@/domain/settings-resources";
import { absenceCopy } from "@/features/absence/copy";
import { WorkflowTime } from "@/features/cases/screens";
import {
  accessErrorMessage,
  capabilityLabel,
  identityCopy,
  roleLabel,
} from "@/features/identity/copy";
import { grantManagementCopy } from "@/features/identity/grant-copy";
import { managementCopy, staffRoleLabel } from "@/features/identity/management-copy";
import { settingsResourceLabel, settingsScopeCopy } from "@/features/identity/settings-scope-copy";
import { StaffSettingsFrame } from "@/features/identity/staff-settings-frame";
import { offboardingCopy } from "@/features/offboarding/copy";
import { workCopy } from "@/features/work/copy";
import { isPublicLocale, isStaffLocale, localeEndonyms } from "@/i18n/config";
import { listStaffGrants } from "@/server/auth/grants";
import { staffRoles } from "@/server/auth/invitations";
import { requireStaffPage } from "@/server/auth/pages";
import { isFresh } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import { caseVisibility } from "@/server/cases/shared";
import { buttonClass } from "@/ui/button-class";
import { cx } from "@/ui/cx";
import { controlClass, labelClass, textareaClass } from "@/ui/field-class";
import { NativeForm } from "@/ui/form/native-form";
import { Notice } from "@/ui/notice";
import { TechnicalDetails } from "@/ui/technical-details";

const field = cx("block min-w-0 max-w-full", controlClass);
const writingField = cx("block min-w-0 max-w-full", textareaClass);
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
    return <StaffSettingsFrame locale={locale} session={session} title={c.title} lead={c.denied} />;
  if (!isFresh(session))
    redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(`/${locale}/access/manage`)}`);
  const allMembers = await db
    .select({
      id: principals.id,
      name: principals.displayName,
      email: principals.email,
      absenceFrom: staffMemberships.absenceFrom,
      reviewAt: staffMemberships.absenceReviewAt,
    })
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

  const query = await searchParams;
  const grantPage =
    typeof query.grantsPage === "string" && /^[1-9]\d*$/.test(query.grantsPage)
      ? Number(query.grantsPage)
      : 1;
  const grantSearch =
    typeof query.grantsSearch === "string" ? query.grantsSearch.trim().slice(0, 254) : "";
  const currentGrants = await listStaffGrants(db, session, {
    page: Number.isSafeInteger(grantPage) && grantPage <= 10000 ? grantPage : 1,
    search: grantSearch,
  });
  const grantCopy = grantManagementCopy(locale);
  const settingsCopy = settingsScopeCopy(locale);
  const directoryCopy =
    locale === "bg"
      ? {
          search: "Търсене на текущи права по име или имейл",
          apply: "Търсене",
          empty: "Няма съвпадащи текущи права.",
        }
      : locale === "ru"
        ? {
            search: "Поиск текущих прав по имени или адресу почты",
            apply: "Найти",
            empty: "Нет подходящих текущих прав.",
          }
        : {
            search: "Search current grants by name or email",
            apply: "Search",
            empty: "No matching current grants.",
          };
  const availableCases = await db
    .select({ id: cases.id, reference: cases.reference, title: cases.title })
    .from(cases)
    .where(await caseVisibility(db, session))
    .limit(200);
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
  const grantHref = (page: number) => {
    const parameters = new URLSearchParams({ grantsPage: String(page) });
    if (currentGrants.search) parameters.set("grantsSearch", currentGrants.search);
    if (receipt) parameters.set("receipt", receipt.id);
    if (typeof query.saved === "string") parameters.set("saved", query.saved);
    return `/${locale}/access/manage?${parameters}#current-staff-grants`;
  };
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
      <label className="grid min-w-0 grid-cols-1 gap-2">
        <span className={labelClass}>{c.name}</span>
        <input name="displayName" className={field} maxLength={120} required autoComplete="name" />
      </label>
      <label className="grid min-w-0 grid-cols-1 gap-2">
        <span className={labelClass}>{c.email}</span>
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
    <StaffSettingsFrame locale={locale} session={session} title={c.title} lead={c.lead}>
      {typeof query.saved === "string" ? <Notice tone="success">{c.success}</Notice> : null}
      {receipt ? (
        <Notice tone="success">
          {grantCopy.receipt}: <bdi>{receipt.id}</bdi>
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <section className="min-w-0 space-y-4">
        <h2 className="text-section font-semibold">{absenceCopy(locale).title}</h2>
        <ul className="space-y-4">
          {allMembers.map((member) => (
            <li key={member.id} className="min-w-0 break-words">
              <a
                className="block min-h-control underline"
                href={`/${locale}/access/absence/${member.id}`}
              >
                {member.name} · {member.email}
              </a>
              <p>
                {member.absenceFrom
                  ? member.absenceFrom > new Date()
                    ? absenceCopy(locale).planned
                    : absenceCopy(locale).absent
                  : absenceCopy(locale).available}
              </p>
              {member.reviewAt ? (
                <p>
                  {absenceCopy(locale).reviewRecorded}:{" "}
                  <WorkflowTime value={member.reviewAt} locale={locale} />
                </p>
              ) : null}
              {member.reviewAt && member.reviewAt < new Date() ? (
                <p className="font-semibold text-warning">{absenceCopy(locale).overdue}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
        <h2 className="text-section font-semibold">{c.staffTitle}</h2>
        <NativeForm
          method="post"
          action={`/${locale}/access/manage/submit`}
          className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
        >
          {hidden("staff")}
          {person}
          <label htmlFor="staff-invitation-role" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{c.role}</span>
            <AccessSelect
              id="staff-invitation-role"
              className={`${field} overflow-hidden text-ellipsis`}
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
        </NativeForm>
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
        <NativeForm
          method="post"
          action={`/${locale}/access/manage/submit`}
          className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
        >
          {hidden("recovery")}
          <label htmlFor="recovery-principal" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{c.member}</span>
            <AccessSelect
              id="recovery-principal"
              name="principalId"
              className={`${field} overflow-hidden text-ellipsis`}
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
          <label className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{c.evidence}</span>
            <textarea
              className={writingField}
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
        </NativeForm>
      </section>
      <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
        <h2 className="text-section font-semibold">{c.clientTitle}</h2>
        <NativeForm
          method="post"
          action={`/${locale}/access/manage/submit`}
          className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
        >
          {hidden("client")}
          {person}
          <label htmlFor="client-invitation-principal" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{c.case}</span>
            <AccessSelect
              id="client-invitation-principal"
              name="caseId"
              className={`${field} overflow-hidden text-ellipsis`}
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
          <label htmlFor="client-invitation-role" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{c.participant}</span>
            <AccessSelect
              id="client-invitation-role"
              name="role"
              className={`${field} overflow-hidden text-ellipsis`}
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
        </NativeForm>
      </section>
      <section className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]">
        <h2 className="text-section font-semibold">{grantCopy.title}</h2>
        <p>{grantCopy.lead}</p>
        <NativeForm
          method="post"
          action={`/${locale}/access/manage/submit`}
          className="grid min-w-0 grid-cols-1 gap-4 [overflow-wrap:anywhere]"
        >
          {hidden("grant")}
          <input type="hidden" name="operationId" value={randomUUID()} />
          <label htmlFor="capability-principal" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{c.member}</span>
            <AccessSelect
              id="capability-principal"
              name="principalId"
              className={`${field} overflow-hidden text-ellipsis`}
              required
            >
              {allMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} — {member.email}
                </option>
              ))}
            </AccessSelect>
          </label>
          <label htmlFor="capability-choice" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{grantCopy.capability}</span>
            <AccessSelect
              id="capability-choice"
              name="capability"
              className={`${field} overflow-hidden text-ellipsis`}
              defaultValue="document.review"
            >
              {capabilities.map((capability) => (
                <option key={capability} value={capability}>
                  {capabilityLabel(locale, capability)}
                </option>
              ))}
            </AccessSelect>
          </label>
          <label htmlFor="capability-record-type" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{grantCopy.scope}</span>
            <AccessSelect
              id="capability-record-type"
              name="recordType"
              className={`${field} overflow-hidden text-ellipsis`}
              defaultValue=""
            >
              <option value="">{grantCopy.global}</option>
              {(["document", "listing", "property", "case"] as const).map((type) => (
                <option key={type} value={type}>
                  {grantCopy[type]}
                </option>
              ))}
              <option value="settings">{settingsCopy.settings}</option>
            </AccessSelect>
          </label>
          <label className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{grantCopy.recordId}</span>
            <input name="recordId" className={field} maxLength={36} />
          </label>
          <label htmlFor="capability-settings-resource" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{settingsCopy.resource}</span>
            <AccessSelect
              id="capability-settings-resource"
              name="settingsRecordId"
              className={field}
              defaultValue=""
              aria-describedby="settings-scope-help"
            >
              <option value="">{settingsCopy.choose}</option>
              {settingsResourceKeys.map((key) => (
                <option key={key} value={settingsResources[key]}>
                  {settingsCopy.options[key]}
                </option>
              ))}
            </AccessSelect>
            <span id="settings-scope-help" className="text-dense text-text-muted">
              {settingsCopy.help}
            </span>
          </label>
          <label htmlFor="capability-locale" className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{grantCopy.locale}</span>
            <AccessSelect
              id="capability-locale"
              name="grantLocale"
              className={`${field} overflow-hidden text-ellipsis`}
              defaultValue=""
            >
              <option value="">{grantCopy.allLocales}</option>
              {publicLocales.map((value) => (
                <option key={value} value={value}>
                  {localeEndonyms[value]}
                </option>
              ))}
            </AccessSelect>
          </label>
          <label className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{grantCopy.expires}</span>
            <input name="expiresAt" type="date" className={field} />
          </label>
          <label className="grid min-w-0 grid-cols-1 gap-2">
            <span className={labelClass}>{grantCopy.reason}</span>
            <textarea
              name="reason"
              className={writingField}
              minLength={10}
              maxLength={1000}
              required
            />
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirmed" value="yes" required />
            {grantCopy.confirmation}
          </label>
          <button type="submit" className={buttonClass()}>
            {grantCopy.grant}
          </button>
        </NativeForm>
        <h3 id="current-staff-grants" className="font-semibold">
          {grantCopy.existing}
        </h3>
        <form
          method="get"
          action={`/${locale}/access/manage#current-staff-grants`}
          className="grid min-w-0 gap-3"
        >
          {receipt ? <input type="hidden" name="receipt" value={receipt.id} /> : null}
          {typeof query.saved === "string" ? (
            <input type="hidden" name="saved" value={query.saved} />
          ) : null}
          <label className="grid min-w-0 gap-2">
            <span className={labelClass}>{directoryCopy.search}</span>
            <input
              name="grantsSearch"
              className={field}
              defaultValue={currentGrants.search}
              maxLength={254}
              type="search"
            />
          </label>
          <button type="submit" className={buttonClass()}>
            {directoryCopy.apply}
          </button>
        </form>
        {!currentGrants.rows.length ? <p>{directoryCopy.empty}</p> : null}
        {currentGrants.rows.map(({ grant, name }) => (
          <NativeForm
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
              {grant.capability
                ? capabilityLabel(locale, grant.capability)
                : grant.role
                  ? staffRoleLabel(locale, grant.role)
                  : ""}{" "}
              ·{" "}
              {grant.recordType === "settings"
                ? settingsResourceLabel(locale, grant.recordId)
                : grant.recordType &&
                    ["document", "listing", "property", "case"].includes(grant.recordType)
                  ? grantCopy[grant.recordType as "document" | "listing" | "property" | "case"]
                  : grant.recordType
                    ? grantCopy.scope
                    : grantCopy.global}
              {grant.locales?.length
                ? ` · ${grant.locales.map((value) => (isPublicLocale(value) ? localeEndonyms[value] : grantCopy.locale)).join(", ")}`
                : ""}
            </p>
            <TechnicalDetails locale={locale}>
              <p>
                <bdi>{grant.capability ?? grant.role}</bdi>
              </p>
              <p>
                <bdi>
                  {grant.recordType} {grant.recordId}
                </bdi>
              </p>
              {grant.locales?.length ? (
                <p>
                  <bdi>{grant.locales.join(", ")}</bdi>
                </p>
              ) : null}
            </TechnicalDetails>
            <p>{grant.reason}</p>
            <label className="grid min-w-0 grid-cols-1 gap-2">
              <span className={labelClass}>{grantCopy.reason}</span>
              <textarea
                name="reason"
                className={writingField}
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
            <button type="submit" className={buttonClass("destructive")}>
              {grantCopy.revoke}
            </button>
          </NativeForm>
        ))}
        {currentGrants.page > 1 || currentGrants.hasMore ? (
          <nav aria-label={grantCopy.existing} className="flex flex-wrap gap-6 py-4">
            {currentGrants.page > 1 ? (
              <a className="min-h-control underline" href={grantHref(currentGrants.page - 1)}>
                {workCopy(locale).previous}
              </a>
            ) : null}
            {currentGrants.hasMore ? (
              <a className="min-h-control underline" href={grantHref(currentGrants.page + 1)}>
                {workCopy(locale).next}
              </a>
            ) : null}
          </nav>
        ) : null}
      </section>
      <a href={`/${locale}/today`} className="text-action underline">
        {c.back}
      </a>
    </StaffSettingsFrame>
  );
}
