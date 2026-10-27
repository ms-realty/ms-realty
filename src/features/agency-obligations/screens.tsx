import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { caseParticipants, documents, documentVersions, listings, parties } from "@/db/schema";
import { readAgencyOperation } from "@/server/agency-obligations/commands";
import { listPartnerTerms, readPartnerTerms } from "@/server/agency-obligations/partner-terms";
import {
  listCaseReviews,
  readCaseReview,
  reviewConsentPolicy,
} from "@/server/agency-obligations/reviews";
import { propertyWorkFor } from "@/server/appointments/property-work";
import { localReturnPath } from "@/server/auth/pages";
import type { Session } from "@/server/auth/sessions";
import { can } from "@/server/authz";
import { listCases } from "@/server/cases/queries";
import { caseFor, liveParticipation } from "@/server/cases/shared";
import { getEnv } from "@/server/config/env";
import { listContent, readContentWorkbench } from "@/server/content/commands";
import { contentBody } from "@/server/content/public";
import { AppError, isAppError } from "@/server/errors";
import { documentAccess } from "@/server/files/access";
import { liveStaff } from "@/server/work/shared";
import { controlClass, labelClass } from "@/ui/field-class";
import type { FormValues } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { type WorkflowField, WorkflowForm } from "../cases/form";
import { WorkflowTime, workflowLink } from "../cases/screens";
import { StaffPage, StaffPanel, StaffToolbar } from "../shell/staff-ui";
import { Pagination } from "../work/screens";
import { agencyAction } from "./actions";
import {
  type AgencyCommand,
  agencyCommands,
  agencyFields,
  agencyReceiptPath,
  agencyScope,
} from "./contract";
import { agencyCopy, caseReviewCopy } from "./copy";
import { type PartnerEntryContext, partnerEntryPath } from "./partner-context";
import { partnerChoices, readPartnerChoice } from "./partner-picker";

type Props = { locale: string; session: Session };
const rootPath = (locale: string) => `/${locale}/operations/agency`;
export function AgencyForm({
  locale,
  command,
  id,
  path,
  fields,
  values = {},
  revision = null,
  submit,
}: {
  locale: string;
  command: AgencyCommand;
  id: string;
  path: string;
  fields: WorkflowField[];
  values?: FormValues;
  revision?: number | null;
  submit?: string;
}) {
  const copy = agencyCopy(locale),
    scope = agencyScope(command, id);
  const state = initialFormState(
    scope,
    Object.fromEntries(agencyFields[command].map((field) => [field, values[field] ?? ""])),
    revision,
  );
  return (
    <WorkflowForm
      locale={locale}
      initialState={state}
      nativeIdentity={`${scope}:${values.decision ?? ""}`}
      fields={fields}
      action={agencyAction.bind(null, locale, command, id)}
      path={path}
      status={{
        href: agencyReceiptPath(locale, command, id, state.operationId),
        label: command === "clientConsent" ? caseReviewCopy(locale).status : copy.status,
      }}
      submit={submit ?? copy.save}
    />
  );
}
function EvidenceEditor({
  creating,
  title,
  children,
}: {
  creating: boolean;
  title: string;
  children: ReactNode;
}) {
  return creating ? (
    children
  ) : (
    <details className="min-w-0 rounded-control border border-divider bg-surface p-4">
      <summary className="min-h-control cursor-pointer py-3 font-semibold text-action">
        {title}
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}
function validateEntry(draft?: string, caseId?: string, partyId?: string) {
  for (const id of [draft, caseId, partyId])
    if (id && !z.uuid().safeParse(id).success) throw new AppError("not_found");
}
function reviewed(locale: string): WorkflowField {
  return { name: "reviewed", type: "checkbox", label: agencyCopy(locale).reviewed, required: true };
}
function decisionLabel(action: string, copy: ReturnType<typeof agencyCopy>) {
  return (
    {
      saved: copy.save,
      accept: copy.accept,
      revoke: copy.revoke,
      prepared: copy.newReview,
      verified: copy.verify,
      consent_granted: copy.granted,
      consent_refused: copy.refused,
      consent_withdrawn: copy.withdrawn,
    }[action] ?? copy.history
  );
}
function hidden(name: string): WorkflowField {
  return { name, label: "", type: "hidden" };
}
function select(
  name: string,
  label: string,
  options: { value: string; label: string }[],
  required = true,
): WorkflowField {
  return { name, label, type: "select", options, required };
}
async function documentChoices(session: Session, caseId?: string, purpose?: string) {
  const db = getDb();
  const rows = await db
    .select({ doc: documents, file: documentVersions })
    .from(documents)
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.documentId, documents.id),
        eq(documentVersions.versionNumber, documents.currentVersionNumber),
      ),
    )
    .where(
      and(
        caseId ? eq(documents.caseId, caseId) : undefined,
        purpose ? eq(documents.purpose, purpose) : undefined,
        eq(documentVersions.state, "reviewed"),
      ),
    )
    .orderBy(desc(documents.createdAt));
  const visible = [];
  for (const row of rows) {
    try {
      await documentAccess(db, session, row.file.id);
      if (row.doc.caseId) await caseFor(db, session, row.doc.caseId);
      visible.push({
        value: row.file.id,
        label: `${row.doc.reference} · ${row.file.fileName} · ${row.file.versionNumber}`,
      });
    } catch (error) {
      if (!isAppError(error) || !["not_found", "forbidden"].includes(error.code)) throw error;
    }
    if (visible.length === 50) break;
  }
  return visible;
}

export async function AgencyIndex(props: Props) {
  const db = getDb(),
    copy = agencyCopy(props.locale);
  await liveStaff(db, props.session);
  const [partners, reviews] = await Promise.all([
    listPartnerTerms(db, props.session),
    listCaseReviews(db, props.session),
  ]);
  return (
    <StaffPage title={copy.title} lead={copy.lead}>
      <StaffToolbar>
        <a className={workflowLink} href={`${rootPath(props.locale)}/partners/new`}>
          {copy.newPartner}
        </a>
        <a className={workflowLink} href={`${rootPath(props.locale)}/reviews/new`}>
          {copy.newReview}
        </a>
        <a className={workflowLink} href={`/${props.locale}/content`}>
          {copy.cms}
        </a>
      </StaffToolbar>
      <StaffPanel title={copy.partners}>
        <p>{copy.qualified}</p>
        {!partners.length ? (
          <p>{copy.empty}</p>
        ) : (
          <ul className="divide-y divide-divider">
            {partners.map(({ row, party, current }) => (
              <li key={row.id} className="space-y-2 py-4">
                <a className={workflowLink} href={`${rootPath(props.locale)}/partners/${row.id}`}>
                  {party.displayName} · {row.sourceVersion}
                </a>
                <p>{current ? copy.current : copy.held}</p>
                <p className="break-words">{row.purpose}</p>
              </li>
            ))}
          </ul>
        )}
      </StaffPanel>
      <StaffPanel title={copy.reviews}>
        <p>{copy.privacy}</p>
        {!reviews.length ? (
          <p>{copy.empty}</p>
        ) : (
          <ul className="divide-y divide-divider">
            {reviews.map(({ row }) => (
              <li key={row.id} className="space-y-2 py-4">
                <a className={workflowLink} href={`${rootPath(props.locale)}/reviews/${row.id}`}>
                  {row.publicName}
                </a>
                <p>{copy[row.consentState as "unknown"]}</p>
              </li>
            ))}
          </ul>
        )}
      </StaffPanel>
      <p className="text-text-muted">{copy.limited}</p>
    </StaffPage>
  );
}

export async function PartnerScreen(props: Props & PartnerEntryContext & { id: string }) {
  const db = getDb(),
    copy = agencyCopy(props.locale),
    creating = props.id === "new";
  await liveStaff(db, props.session);
  validateEntry(
    props.draft,
    props.caseId,
    "partyId" in props ? (props.partyId as string) : undefined,
  );
  const context = {
    ...props,
    returnTo:
      localReturnPath(props.returnTo, "staff", props.locale) ??
      (props.caseId ? `/${props.locale}/cases/${props.caseId}` : undefined),
  };
  if (creating && !props.draft)
    redirect(partnerEntryPath(props.locale, { ...context, draft: randomUUID() }));
  if (creating && !props.partyId) {
    const choices = await partnerChoices(db, props.session, props.page ?? 1, props.caseId);
    const list = (rows: { id: string; name: string; reference?: string | null }[]) => (
      <ul className="divide-y divide-divider">
        {rows.map((party) => (
          <li
            key={party.id}
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3"
          >
            <div className="min-w-0">
              <a
                className={`${workflowLink} inline-flex min-h-control items-center break-words`}
                href={partnerEntryPath(props.locale, { ...context, partyId: party.id })}
              >
                {party.name}
              </a>
              {party.reference ? (
                <p className="text-dense text-text-muted">{party.reference}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    );
    return (
      <StaffPage
        title={copy.pickCounterparty}
        lead={copy.pickerLead}
        actions={
          <a className={workflowLink} href={context.returnTo ?? rootPath(props.locale)}>
            {context.returnTo ? copy.returnToRecord : copy.back}
          </a>
        }
      >
        {choices.currentCase && choices.caseChoices.length ? (
          <StaffPanel
            title={copy.caseCounterparties}
            lead={`${choices.currentCase.reference} · ${choices.currentCase.title}`}
          >
            {list(choices.caseChoices)}
          </StaffPanel>
        ) : null}
        <StaffPanel title={copy.fields.counterpartyPartyId}>
          <p className="text-dense text-text-muted">
            {copy.counterpartyPage} {choices.page}
          </p>
          <Pagination
            {...choices}
            href={partnerEntryPath(props.locale, { ...context, page: undefined })}
            locale={props.locale}
          />
          {choices.rows.length ? list(choices.rows) : <p>{copy.noEligibleContacts}</p>}
        </StaffPanel>
      </StaffPage>
    );
  }
  const detail = creating ? null : await readPartnerTerms(db, props.session, props.id);
  const row = detail?.row,
    id = row?.id ?? (props.draft as string);
  const caseRows = await listCases(db, props.session);
  const caseOptions = caseRows.map(({ id, reference, title }) => ({ id, reference, title }));
  const currentCase = row?.caseId ?? props.caseId;
  const selectedCase = currentCase ? (await caseFor(db, props.session, currentCase)).row : null;
  if (selectedCase && !caseOptions.some((candidate) => candidate.id === selectedCase.id))
    caseOptions.push(selectedCase);
  const selected = detail
    ? { id: detail.party.id, name: detail.party.displayName }
    : await readPartnerChoice(db, props.session, props.partyId as string, currentCase ?? undefined);
  const contactOptions = [{ value: selected.id, label: selected.name }];
  const docs = await documentChoices(props.session, currentCase ?? undefined);
  const fields = copy.fields,
    path = partnerEntryPath(
      props.locale,
      creating ? { ...context, draft: id, partyId: selected.id } : { returnTo: context.returnTo },
      creating ? "new" : id,
    );
  const values = row
    ? Object.fromEntries(
        agencyFields.partnerSave.map((key) => [
          key,
          key === "acceptedAt" || key === "validUntil"
            ? (row[key]?.toISOString() ?? "")
            : String(row[key as keyof typeof row] ?? ""),
        ]),
      )
    : {
        caseId: props.caseId ?? "",
        counterpartyPartyId: props.partyId ?? "",
        relationship: "referral",
      };
  return (
    <StaffPage
      title={copy.partners}
      lead={copy.qualified}
      actions={
        <a className={workflowLink} href={context.returnTo ?? rootPath(props.locale)}>
          {context.returnTo ? copy.returnToRecord : copy.back}
        </a>
      }
    >
      {detail ? (
        <Notice tone={detail.current ? "success" : "warning"}>
          {detail.current ? copy.current : copy.held}
        </Notice>
      ) : null}
      {detail ? (
        <StaffPanel title={detail.party.displayName}>
          <p>
            {copy.owner}: {detail.ownerName}
          </p>
          <p className="mt-2 font-semibold">{detail.row.purpose}</p>
          <p className="mt-2 break-words">
            {detail.row.sourceReference} · {detail.row.sourceVersion}
          </p>
          <p className="mt-4 whitespace-pre-wrap">{detail.row.termsText}</p>
          <p className="mt-4">
            {fields.acceptedAt}:{" "}
            <WorkflowTime value={detail.row.acceptedAt} locale={props.locale} />
          </p>
          <p>
            {fields.validUntil}:{" "}
            <WorkflowTime value={detail.row.validUntil} locale={props.locale} />
          </p>
          {detail.row.unknowns ? <Notice tone="warning">{detail.row.unknowns}</Notice> : null}
        </StaffPanel>
      ) : null}
      <EvidenceEditor creating={creating} title={copy.revise}>
        <StaffPanel title={copy.source} lead={copy.sourceHint}>
          <AgencyForm
            {...props}
            id={id}
            command="partnerSave"
            path={path}
            revision={row?.version ?? null}
            values={values}
            fields={[
              select(
                "caseId",
                fields.caseId,
                [
                  { value: "", label: copy.noCase },
                  ...caseOptions.map((c) => ({
                    value: c.id,
                    label: `${c.reference} · ${c.title}`,
                  })),
                ],
                false,
              ),
              select("counterpartyPartyId", fields.counterpartyPartyId, [...contactOptions]),
              select(
                "relationship",
                fields.relationship,
                ["partner", "referral"].map((key) => ({
                  value: key,
                  label: copy[key as "partner"],
                })),
              ),
              { name: "purpose", label: fields.purpose, type: "textarea", required: true },
              { name: "sourceReference", label: fields.sourceReference, required: true },
              { name: "sourceVersion", label: fields.sourceVersion, required: true },
              { name: "termsText", label: fields.termsText, type: "textarea", required: true },
              select(
                "documentVersionId",
                fields.documentVersionId,
                [{ value: "", label: copy.noDocument }, ...docs],
                false,
              ),
              { name: "acceptedReference", label: fields.acceptedReference },
              { name: "acceptedAt", label: fields.acceptedAt, type: "datetime-local" },
              { name: "validUntil", label: fields.validUntil, type: "datetime-local" },
              { name: "unknowns", label: fields.unknowns, type: "textarea" },
              { ...reviewed(props.locale), label: copy.termsReviewed },
            ]}
          />
        </StaffPanel>
      </EvidenceEditor>
      {row ? (
        <EvidenceEditor creating={!detail?.current} title={copy.revoke}>
          <StaffPanel title={detail?.current ? copy.revoke : copy.accept}>
            <AgencyForm
              {...props}
              id={id}
              command="partnerDecision"
              path={path}
              revision={row.version}
              values={{
                expectedHash: row.termsHash,
                action: detail?.current ? "revoke" : "accept",
                professionalName: row.professionalName ?? "",
              }}
              fields={[
                hidden("expectedHash"),
                select("action", fields.action, [
                  { value: "accept", label: copy.accept },
                  { value: "revoke", label: copy.revoke },
                ]),
                { name: "professionalName", label: fields.professionalName },
                { name: "note", label: fields.note, type: "textarea", required: true },
                reviewed(props.locale),
              ]}
            />
          </StaffPanel>
        </EvidenceEditor>
      ) : null}
      {detail ? (
        <StaffPanel title={copy.historyRecent}>
          <ol className="space-y-3">
            {detail.history.map((h) => (
              <li key={h.id}>
                <p>
                  {decisionLabel(h.action, copy)} ·{" "}
                  <WorkflowTime value={h.createdAt} locale={props.locale} />
                </p>
                <details>
                  <summary>{copy.source}</summary>
                  <p className="break-words">
                    {String((h.snapshot as { sourceReference?: string }).sourceReference ?? "")} ·{" "}
                    {String((h.snapshot as { sourceVersion?: string }).sourceVersion ?? "")}
                  </p>
                  <p className="whitespace-pre-wrap break-words">
                    {String((h.snapshot as { termsText?: string }).termsText ?? "")}
                  </p>
                </details>
              </li>
            ))}
          </ol>
        </StaffPanel>
      ) : null}
    </StaffPage>
  );
}

export async function StaffReviewScreen(
  props: Props & { id: string; draft?: string; caseId?: string },
) {
  const db = getDb(),
    copy = agencyCopy(props.locale),
    creating = props.id === "new";
  await liveStaff(db, props.session);
  validateEntry(
    props.draft,
    props.caseId,
    "partyId" in props ? (props.partyId as string) : undefined,
  );
  if (creating && !props.draft)
    redirect(
      `${rootPath(props.locale)}/reviews/new?draft=${randomUUID()}${props.caseId ? `&case=${props.caseId}` : ""}`,
    );
  const detail = creating ? null : await readCaseReview(db, props.session, props.id),
    row = detail?.row;
  if (row && !("caseId" in row)) throw new AppError("not_found");
  const id = row?.id ?? (props.draft as string),
    caseId = row?.caseId ?? props.caseId;
  const caseRows = await listCases(db, props.session);
  const completed = caseRows.filter((r) =>
    ["completed", "completion_handover", "concluded"].includes(r.stage),
  );
  const currentCaseRecord = caseId ? (await caseFor(db, props.session, caseId)).row : null;
  const authors = caseId
    ? await db
        .select({ id: parties.id, name: parties.displayName })
        .from(caseParticipants)
        .innerJoin(parties, eq(parties.id, caseParticipants.partyId))
        .where(
          and(
            eq(caseParticipants.caseId, caseId),
            liveParticipation(),
            inArray(caseParticipants.role, ["buyer", "co_buyer", "tenant", "seller", "landlord"]),
            isNull(parties.mergedIntoPartyId),
          ),
        )
    : [];
  const content = await listContent(db, props.session),
    contentOptions = [];
  for (const page of content.rows.filter((p) => p.kind === "review")) {
    if (
      !(await can(db, props.session.actor, "content.edit", {
        type: "content_page",
        id: page.id,
        locale: "bg",
        audience: "internal",
      }))
    )
      continue;
    const current = await readContentWorkbench(db, props.session, page.id),
      body = contentBody.parse(current.current.body);
    if (current.current.reviewedAt && body.paragraphs.length === 2)
      contentOptions.push({
        value: current.current.id,
        pageId: page.id,
        label: `${body.title} · ${page.slug} · ${current.current.versionNumber}`,
      });
  }
  const path = creating
    ? `${rootPath(props.locale)}/reviews/new?draft=${id}${caseId ? `&case=${caseId}` : ""}`
    : `${rootPath(props.locale)}/reviews/${id}`;
  const docs = caseId ? await documentChoices(props.session, caseId, "review_consent") : [];
  const sourcePageId = row
    ? contentOptions.find((option) => option.value === row.contentPageVersionId)?.pageId
    : null;
  return (
    <StaffPage
      title={copy.reviews}
      lead={creating ? copy.reviewHint : copy.privacy}
      actions={
        <a className={workflowLink} href={rootPath(props.locale)}>
          {copy.back}
        </a>
      }
    >
      <StaffToolbar>
        <a
          className={workflowLink}
          href={`/${props.locale}/content${sourcePageId ? `/${sourcePageId}` : creating ? "/new" : ""}`}
        >
          {copy.cms}
        </a>
        {caseId ? (
          <a className={workflowLink} href={`/${props.locale}/cases/${caseId}/documents`}>
            {copy.documents}
          </a>
        ) : null}
        {row ? (
          <a
            className={workflowLink}
            href={`${getEnv().hosts.client}/${props.locale}/reviews/${id}`}
          >
            {copy.client}
          </a>
        ) : null}
      </StaffToolbar>
      {creating ? (
        <form
          method="get"
          action={`${rootPath(props.locale)}/reviews/new`}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="draft" value={id} />
          <label className={labelClass}>
            {copy.fields.caseId}
            <select name="case" className={controlClass} defaultValue={caseId ?? ""} required>
              <option value="">{copy.choose}</option>
              {completed.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.reference} · {r.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={workflowLink}>
            {copy.open}
          </button>
        </form>
      ) : null}
      {row ? (
        <StaffPanel title={copy.source}>
          <p className="mb-4">
            {currentCaseRecord?.reference} · {currentCaseRecord?.title}
          </p>
          <ReviewWording row={row} />
          <p className="mt-4 font-semibold">{copy[row.consentState as "unknown"]}</p>
          {row.verifiedHash ? (
            <p>
              {copy.verificationRecorded} ·{" "}
              {detail && "verifierName" in detail ? detail.verifierName : null} ·{" "}
              <WorkflowTime value={row.verifiedAt} locale={props.locale} /> ·{" "}
              {copy.publicationSeparate}
            </p>
          ) : (
            <p>{copy.held}</p>
          )}
        </StaffPanel>
      ) : null}
      {caseId ? (
        <EvidenceEditor creating={creating} title={copy.revise}>
          <StaffPanel title={copy.newReview}>
            <AgencyForm
              {...props}
              command="reviewSave"
              id={id}
              path={path}
              revision={row?.version ?? null}
              values={{
                caseId,
                authorPartyId: row?.authorPartyId ?? "",
                contentPageVersionId: row?.contentPageVersionId ?? "",
                displayChoice: row?.displayChoice ?? "anonymous",
              }}
              fields={[
                hidden("caseId"),
                select("authorPartyId", copy.fields.authorPartyId, [
                  { value: "", label: copy.choose },
                  ...authors.map((p) => ({ value: p.id, label: p.name })),
                ]),
                select("contentPageVersionId", copy.fields.contentPageVersionId, [
                  { value: "", label: copy.choose },
                  ...contentOptions,
                ]),
                select("displayChoice", copy.fields.displayChoice, [
                  { value: "anonymous", label: copy.anonymous },
                  { value: "name", label: copy.name },
                ]),
                reviewed(props.locale),
              ]}
            />
          </StaffPanel>
        </EvidenceEditor>
      ) : (
        <p>{copy.manual}</p>
      )}
      {row ? (
        <>
          <EvidenceEditor creating={false} title={copy.documentConsent}>
            <StaffPanel title={copy.documentConsent}>
              <p>{copy.manual}</p>
              <AgencyForm
                {...props}
                command="reviewDocumentConsent"
                id={id}
                path={path}
                revision={row.version}
                values={{ expectedHash: row.bindingHash, policyVersionId: "", decision: "refused" }}
                fields={[
                  hidden("expectedHash"),
                  hidden("policyVersionId"),
                  select(
                    "decision",
                    copy.fields.decision,
                    ["refused", "withdrawn", "granted"].map((d) => ({
                      value: d,
                      label: copy[d as "refused"],
                    })),
                  ),
                  select(
                    "documentVersionId",
                    copy.fields.documentVersionId,
                    [{ value: "", label: copy.choose }, ...docs],
                    false,
                  ),
                  {
                    name: "sourceReference",
                    label: copy.fields.sourceReferenceConsent,
                    required: true,
                  },
                  reviewed(props.locale),
                ]}
              />
            </StaffPanel>
          </EvidenceEditor>
          {row.consentState === "granted" && !row.verifiedHash ? (
            <StaffPanel title={copy.verify}>
              <AgencyForm
                {...props}
                command="reviewVerify"
                id={id}
                path={path}
                revision={row.version}
                values={{ expectedHash: row.bindingHash }}
                fields={[
                  hidden("expectedHash"),
                  { name: "note", label: copy.fields.note, type: "textarea", required: true },
                  reviewed(props.locale),
                ]}
              />
            </StaffPanel>
          ) : null}
          <StaffPanel title={copy.historyRecent}>
            <ol className="space-y-2">
              {detail?.history.map((h) => (
                <li key={h.id}>
                  {decisionLabel(h.action, copy)} ·{" "}
                  <WorkflowTime value={h.createdAt} locale={props.locale} />
                </li>
              ))}
            </ol>
          </StaffPanel>
        </>
      ) : null}
    </StaffPage>
  );
}

export function ReviewWording({
  row,
}: {
  row: { publicName: string; reviewText: string; verificationStatement: string };
}) {
  return (
    <div lang="bg" className="space-y-4 break-words">
      <p className="font-semibold">{row.publicName}</p>
      <blockquote className="whitespace-pre-wrap">{row.reviewText}</blockquote>
      <p className="whitespace-pre-wrap">{row.verificationStatement}</p>
    </div>
  );
}
export async function ClientReviews(props: Props & { id?: string }) {
  const db = getDb(),
    copy = caseReviewCopy(props.locale);
  if (!props.id) {
    const records = await listCaseReviews(db, props.session);
    return (
      <section className="space-y-6">
        <h1 className="text-title font-semibold">{copy.title}</h1>
        <p>{copy.lead}</p>
        {records.length ? (
          <ul>
            {records.map(({ row }) => (
              <li key={row.id}>
                <a className={workflowLink} href={`/${props.locale}/reviews/${row.id}`}>
                  {row.publicName}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>{copy.empty}</p>
        )}
      </section>
    );
  }
  const { row } = await readCaseReview(db, props.session, props.id),
    policy = await reviewConsentPolicy(db);
  return (
    <section className="mx-auto max-w-reading space-y-6">
      <h1 className="text-title font-semibold">{copy.title}</h1>
      <p>{copy.lead}</p>
      <ReviewWording row={row} />
      <p>
        {copy.state}: <bdi>{row.consentState}</bdi>
      </p>
      {policy ? (
        <div lang="bg" className="space-y-3">
          <h2 className="text-section font-semibold">{policy.title}</h2>
          {policy.paragraphs.map((p) => (
            <p key={p} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
        </div>
      ) : (
        <Notice tone="warning">{copy.held}</Notice>
      )}
      {([...(policy ? ["granted"] : []), "refused", "withdrawn"] as const).map((decision) => (
        <AgencyForm
          key={decision}
          {...props}
          command="clientConsent"
          id={row.id}
          path={`/${props.locale}/reviews/${row.id}`}
          revision={row.version}
          submit={
            copy[decision === "granted" ? "grant" : decision === "refused" ? "refuse" : "withdraw"]
          }
          values={{
            expectedHash: row.bindingHash,
            policyVersionId: policy?.version.id ?? "",
            decision,
          }}
          fields={[
            hidden("expectedHash"),
            hidden("policyVersionId"),
            hidden("decision"),
            { name: "reviewed", type: "checkbox", label: copy.reviewed, required: true },
          ]}
        />
      ))}
      <a className={workflowLink} href={`/${props.locale}/reviews`}>
        {copy.back}
      </a>
    </section>
  );
}

export async function PhotographyScreen(props: Props & { reference: string }) {
  const db = getDb(),
    copy = agencyCopy(props.locale);
  await liveStaff(db, props.session);
  const [listing] = await db
    .select()
    .from(listings)
    .where(eq(listings.reference, props.reference.toUpperCase()));
  if (!listing) throw new AppError("not_found");
  const context = await propertyWorkFor(db, props.session, {
    listingId: listing.id,
    propertyId: listing.propertyId,
  });
  return (
    <StaffPage
      title={copy.photo}
      reference={listing.reference}
      lead={copy.photoLead}
      actions={
        <a className={workflowLink} href={`/${props.locale}/inventory/${listing.reference}`}>
          {context.property.reference}
        </a>
      }
    >
      <StaffPanel title={copy.photo}>
        <AgencyForm
          {...props}
          command="photography"
          id={listing.id}
          path={`/${props.locale}/inventory/${listing.reference}/photography`}
          revision={listing.version}
          fields={[
            {
              name: "preferredWindow",
              label: copy.fields.preferredWindow,
              type: "textarea",
              required: true,
            },
            {
              name: "photographyScope",
              label: copy.fields.photographyScope,
              type: "textarea",
              required: true,
            },
            { name: "reviewed", label: copy.scopeReviewed, type: "checkbox", required: true },
          ]}
        />
        <p>{copy.manual}</p>
      </StaffPanel>
    </StaffPage>
  );
}

export async function AgencyReceipt(
  props: Props & { command: string; id: string; operationKey: string },
) {
  if (!Object.hasOwn(agencyCommands, props.command)) throw new AppError("not_found");
  const command = props.command as AgencyCommand,
    result = await readAgencyOperation(
      getDb(),
      props.session,
      command,
      props.id,
      props.operationKey,
    ),
    copy = agencyCopy(props.locale),
    client = caseReviewCopy(props.locale);
  const href =
    command === "clientConsent"
      ? `/${props.locale}/reviews/${props.id}`
      : result?.photoId
        ? `/${props.locale}/calendar/${result.photoId}`
        : result?.recordId
          ? `${rootPath(props.locale)}/${command.startsWith("partner") ? "partners" : "reviews"}/${props.id}`
          : rootPath(props.locale);
  const body = (
    <>
      <p role="status">
        {!result
          ? command === "clientConsent"
            ? client.unresolved
            : copy.statusMissing
          : result.status === "succeeded"
            ? copy.succeeded
            : result.status === "failed"
              ? copy.failed
              : copy.pending}
      </p>
      <a className={workflowLink} href={href}>
        {command === "clientConsent" ? client.back : copy.open}
      </a>
      <a
        className={workflowLink}
        href={agencyReceiptPath(props.locale, command, props.id, props.operationKey)}
      >
        {command === "clientConsent" ? client.status : copy.status}
      </a>
    </>
  );
  return command === "clientConsent" ? (
    <section className="space-y-6">
      <h1 className="text-title font-semibold">{client.status}</h1>
      {body}
    </section>
  ) : (
    <StaffPage title={copy.status}>{body}</StaffPage>
  );
}
