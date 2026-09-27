import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { caseParticipants, operations, parties, proposalRevisions, proposals } from "@/db/schema";
import { can } from "@/server/authz";
import { caseFor } from "@/server/cases/shared";
import { assertCaseAgreementReady } from "@/server/compliance/agreement-gate";
import { caseProcessWorkbench, restrictedCaseRegister } from "@/server/compliance/commands";
import { listCaseDocuments } from "@/server/documents/case";
import { isAppError } from "@/server/errors";
import { initialFormState } from "@/ui/form/server";
import { type WorkflowField, WorkflowForm } from "../cases/form";
import {
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTime,
  workflowLink,
} from "../cases/screens";
import { privateRead } from "../work/screens";
import { processAction } from "./actions";
import { type ProcessBinding, processFields, processPath, processScope } from "./contract";

export function processCopy(locale: string) {
  const s = (bg: string, ru: string, en: string) =>
    locale === "bg" ? bg : locale === "ru" ? ru : en;
  return {
    title: s("Договори и проверки", "Договоры и проверки", "Agreements and checks"),
    lead: s(
      "Работим само по предоставена и утвърдена политика. Приложението не удостоверява законност или завършена сделка.",
      "Работа ведётся по предоставленной и утверждённой политике. Приложение не удостоверяет законность или завершение сделки.",
      "Use a supplied, approved operating policy. This application does not certify legal sufficiency or a completed transaction.",
    ),
    documents: s("Документи по случая", "Документы дела", "Case documents"),
    policy: s("Утвърждаване на политика", "Утверждение политики", "Approve an operating policy"),
    policyHint: s(
      "Въведете само условията от проверения документ. Всеки ред изисква собствено доказателство и посочен специалист.",
      "Введите условия из проверенного документа. Для каждого пункта нужны доказательство и указанный специалист.",
      "Transcribe the reviewed policy. Each item requires its own evidence and a named professional.",
    ),
    choose: s("Изберете", "Выберите", "Choose"),
    save: s("Запис", "Записать", "Record"),
    refresh: s("Обновяване", "Обновить", "Refresh"),
    status: s("Резултат от операцията", "Результат операции", "Operation result"),
    review: s("Проверка на предложението", "Проверка предложения", "Proposal review"),
    start: s("Започване на проверка", "Начать проверку", "Start review"),
    approve: s("Потвърждаване на проверката", "Подтвердить проверку", "Approve reviewed evidence"),
    recorded: s("Записана проверка", "Проверка записана", "Review recorded"),
    ready: s(
      "Текущите доказателства позволяват следваща стъпка",
      "Текущие доказательства допускают следующий шаг",
      "Current evidence permits the next step",
    ),
    blocked: s(
      "Нужни са текущи проверени доказателства",
      "Нужны действующие проверенные доказательства",
      "Current reviewed evidence is required",
    ),
    agreement: s("Договор за услуга", "Договор на услуги", "Service agreement"),
    revoke: s("Оттегляне на доказателството", "Отозвать доказательство", "Revoke evidence"),
    commission: s(
      "Външна фактура за комисиона",
      "Внешний счёт на комиссию",
      "External commission invoice",
    ),
    noPolicies: s(
      "Няма утвърдена политика. Първо качете и прегледайте документа.",
      "Утверждённой политики нет. Сначала загрузите и проверьте документ.",
      "No approved policy. Upload and review the supplied document first.",
    ),
    time: s("Часова зона Europe/Sofia", "Часовой пояс Europe/Sofia", "Time zone: Europe/Sofia"),
    yes: s("Да", "Да", "Yes"),
    no: s("Не", "Нет", "No"),
    policies: s("Утвърдени политики", "Утверждённые политики", "Approved policies"),
    restricted: s("Ограничен регистър", "Ограниченный реестр", "Restricted register"),
    restrictedHint: s(
      "Само за изрично упълномощени служители. Записът не изпраща съобщение до орган или клиент. Външните действия се извършват и потвърждават от отговорния човек.",
      "Только для явно уполномоченных сотрудников. Запись не отправляет сообщение ведомству или клиенту. Внешние действия выполняет и подтверждает ответственный человек.",
      "For explicitly authorized staff. Recording does not send a report to an authority or a client. The responsible person performs and confirms any external action.",
    ),
    pendingReport: s(
      "Няма записано външно потвърждение",
      "Внешнее подтверждение не записано",
      "No external confirmation recorded",
    ),
    fields: {
      note: s("Ограничена бележка", "Закрытая заметка", "Restricted note"),
      externalReference: s("Външен номер", "Внешний номер", "External reference"),
      reportedAt: s(
        "Потвърдено външно действие на",
        "Подтверждённое внешнее действие",
        "External action confirmed at",
      ),
      title: s("Име на политиката", "Название политики", "Policy title"),
      documentVersionId: s("Проверен документ", "Проверенный документ", "Reviewed document"),
      country: s("Държава", "Страна", "Country"),
      transaction: s("Вид сделка", "Вид сделки", "Transaction"),
      participantCategory: s(
        "Категория по утвърдената политика",
        "Категория по утверждённой политике",
        "Category under the approved policy",
      ),
      transactionItems: s(
        "Проверки на сделката — по една на ред",
        "Проверки сделки — по одной на строку",
        "Transaction checks, one per line",
      ),
      partyItems: s(
        "Проверки на всяка страна — по една на ред",
        "Проверки каждой стороны — по одной на строку",
        "Checks for each party, one per line",
      ),
      withdrawalDays: s(
        "Срок за отказ по политиката, дни",
        "Срок отказа по политике, дни",
        "Policy withdrawal period, days",
      ),
      expressStartRequired: s(
        "Политиката изисква изрично искане за начало",
        "Политика требует явного запроса на начало",
        "Policy requires an express start request",
      ),
      retentionDays: s(
        "Съхранение по политиката, дни",
        "Хранение по политике, дни",
        "Policy retention period, days",
      ),
      professionalName: s(
        "Отговорен специалист",
        "Ответственный специалист",
        "Responsible professional",
      ),
      validUntil: s("Валидно до", "Действительно до", "Valid until"),
      proposalRevisionId: s(
        "Точна версия на предложението",
        "Точная редакция предложения",
        "Exact proposal revision",
      ),
      policyId: s("Утвърдена политика", "Утверждённая политика", "Approved policy"),
      dueAt: s("Срок за преглед", "Срок проверки", "Review due"),
      result: s("Резултат", "Результат", "Result"),
      reason: s("Основание", "Основание", "Reason"),
      evidenceVersionId: s("Доказателство", "Доказательство", "Evidence"),
      partyId: s("Клиент", "Клиент", "Client"),
      channel: s("Начин на сключване", "Способ заключения", "Agreement channel"),
      signedAt: s("Подписан на", "Подписан", "Signed at"),
      withdrawalInformedAt: s(
        "Информиран за отказ на",
        "Информирован об отказе",
        "Withdrawal information given at",
      ),
      expressStartRequestedAt: s(
        "Изрично поискал начало на",
        "Явно запросил начало",
        "Express start requested at",
      ),
      expressStartEvidenceVersionId: s(
        "Доказателство за искането",
        "Доказательство запроса",
        "Start request evidence",
      ),
      commissionBasis: s("Основание за комисионата", "Основание комиссии", "Commission basis"),
      commissionPayerPartyId: s("Платец на комисионата", "Плательщик комиссии", "Commission payer"),
      agreementId: s("Договор", "Договор", "Agreement"),
      amountMinor: s("Сума в евроцентове", "Сумма в евроцентах", "Amount in euro cents"),
      invoiceReference: s(
        "Номер на външна фактура",
        "Номер внешнего счёта",
        "External invoice reference",
      ),
    },
    values: {
      sale: s("Продажба", "Продажа", "Sale"),
      rent: s("Дългосрочен наем", "Долгосрочная аренда", "Long-term rent"),
      eu: s("ЕС", "ЕС", "EU"),
      non_eu: s("Извън ЕС", "Не из ЕС", "Non-EU"),
      mixed: s("Смесена", "Смешанная", "Mixed"),
      unknown: s("Неустановена", "Не установлена", "Not established"),
      accepted: s("Прието за тази цел", "Принято для этой цели", "Accepted for this purpose"),
      blocked: s(
        "Нужни са още доказателства",
        "Нужны дополнительные доказательства",
        "More evidence required",
      ),
      not_applicable: s(
        "Неприложимо по политиката",
        "Не применимо по политике",
        "Not applicable under policy",
      ),
      on_premises: s("В офиса", "В офисе", "On premises"),
      distance: s("Дистанционно", "Дистанционно", "Distance"),
      off_premises: s("Извън офиса", "Вне офиса", "Off premises"),
    },
  };
}

function ProcessForm({
  locale,
  binding,
  fields,
  revision = null,
  values = {},
  submit,
}: {
  locale: string;
  binding: ProcessBinding;
  fields: WorkflowField[];
  revision?: number | null;
  values?: Record<string, string>;
  submit?: string;
}) {
  const c = processCopy(locale),
    basePath = processPath(locale, binding.caseId),
    path = `${basePath}${binding.command === "suspicion" ? "/restricted" : ""}`;
  const initial = initialFormState(
    processScope(binding),
    Object.fromEntries(processFields[binding.command].map((name) => [name, values[name] ?? ""])),
    revision,
  );
  return (
    <WorkflowForm
      locale={locale}
      initialState={initial}
      fields={fields}
      action={processAction.bind(null, locale, binding)}
      path={path}
      status={{
        href: `${basePath}/operations?key=${encodeURIComponent(initial.operationId)}`,
        label: c.status,
      }}
      submit={submit ?? c.save}
    />
  );
}

export async function ProcessScreen(props: ScreenProps & { id: string }) {
  const db = getDb(),
    c = processCopy(props.locale),
    { id } = props;
  const view = await privateRead(() => caseProcessWorkbench(db, props.session, id));
  const files = await listCaseDocuments(db, props.session, id);
  const offered = await db
    .select({ proposal: proposals, revision: proposalRevisions })
    .from(proposals)
    .innerJoin(
      proposalRevisions,
      and(
        eq(proposalRevisions.proposalId, proposals.id),
        eq(proposalRevisions.revisionNumber, proposals.activeRevisionNumber),
      ),
    )
    .where(eq(proposals.caseId, id));
  const participants = await db
    .select({ partyId: caseParticipants.partyId })
    .from(caseParticipants)
    .where(eq(caseParticipants.caseId, id));
  const partyIds = [
    ...new Set([...participants.map((p) => p.partyId), ...view.reviews.flatMap((r) => r.partyIds)]),
  ];
  const names = partyIds.length
    ? await db
        .select({ id: parties.id, name: parties.displayName })
        .from(parties)
        .where(inArray(parties.id, partyIds))
    : [];
  const blank = { value: "", label: c.choose };
  const opts = (values: string[]) => [
    blank,
    ...values.map((value) => ({ value, label: c.values[value as keyof typeof c.values] ?? value })),
  ];
  const policies = [
    blank,
    ...view.policies
      .filter((p) => p.validUntil > new Date())
      .map((p) => ({
        value: p.id,
        label: `${p.title} · ${p.country} · ${c.values[p.transaction as "sale"]} · ${c.values[p.participantCategory as "eu"]}`,
      })),
  ];
  const documents = (purpose: string) => [
    blank,
    ...files.documents
      .filter(
        ({ document, file }) =>
          document.purpose === purpose &&
          file.state === "reviewed" &&
          file.reviewType === "accepted_for_purpose",
      )
      .map(({ document, file }) => ({
        value: file.id,
        label: `${document.reference} · v${file.versionNumber} · ${file.fileName}`,
      })),
  ];
  const people = [
    blank,
    ...names
      .filter((p) => view.participants.some((link) => link.partyId === p.id))
      .map((p) => ({ value: p.id, label: p.name })),
  ];
  const field = (
    name: keyof typeof c.fields,
    type: WorkflowField["type"] = "text",
    options?: WorkflowField["options"],
    required = true,
  ): WorkflowField => ({
    name,
    label: c.fields[name],
    type,
    required,
    ...(options ? { options } : {}),
    ...(type === "datetime-local" ? { hint: c.time } : {}),
  });
  const bind = (command: ProcessBinding["command"], rest = {}): ProcessBinding => ({
    caseId: id,
    command,
    ...rest,
  });
  return (
    <WorkflowPage {...props} title={`${c.title} · ${view.record.reference}`}>
      <p>{c.lead}</p>
      <nav className="flex flex-wrap gap-5">
        {(await can(db, props.session.actor, "compliance.suspicion", {
          type: "case",
          id,
          audience: "internal",
        })) ? (
          <a className={workflowLink} href={`${processPath(props.locale, id)}/restricted`}>
            {c.restricted}
          </a>
        ) : null}
        <a className={workflowLink} href={`/${props.locale}/cases/${id}/documents`}>
          {c.documents}
        </a>
        <a className={workflowLink} href={processPath(props.locale, id)}>
          {c.refresh}
        </a>
      </nav>
      {view.policies.length === 0 ? <p>{c.noPolicies}</p> : null}
      {view.policies.length > 0 &&
      (await can(db, props.session.actor, "claim.approve", {
        type: "process_policy",
        audience: "internal",
      })) ? (
        <WorkflowSection title={c.policies}>
          {view.policies.map((policy) => (
            <details key={policy.id} className="space-y-4">
              <summary className="cursor-pointer font-semibold">{policy.title}</summary>
              <p>
                {policy.professionalName} · {policy.country}
              </p>
              <WorkflowTime value={policy.validUntil} locale={props.locale} />
              <ProcessForm
                locale={props.locale}
                binding={bind("revoke", { kind: "policy", targetId: policy.id })}
                fields={[field("reason", "textarea")]}
                submit={c.revoke}
              />
            </details>
          ))}
        </WorkflowSection>
      ) : null}
      {(await can(db, props.session.actor, "claim.approve", {
        type: "process_policy",
        audience: "internal",
      })) ? (
        <WorkflowSection title={c.policy}>
          <p>{c.policyHint}</p>
          <ProcessForm
            locale={props.locale}
            binding={bind("policy")}
            fields={[
              field("title"),
              field("documentVersionId", "select", documents("process_policy")),
              field("country", "select", [
                blank,
                { value: "BG", label: "България" },
                { value: "GR", label: "Ελλάδα" },
              ]),
              field("transaction", "select", opts(["sale", "rent"])),
              field("participantCategory", "select", opts(["eu", "non_eu", "mixed", "unknown"])),
              field("transactionItems", "textarea"),
              field("partyItems", "textarea"),
              field("withdrawalDays", "number"),
              field("retentionDays", "number"),
              field("expressStartRequired", "select", [
                blank,
                { value: "true", label: c.yes },
                { value: "false", label: c.no },
              ]),
              field("professionalName"),
              field("validUntil", "datetime-local"),
            ]}
          />
        </WorkflowSection>
      ) : null}
      <WorkflowSection title={c.agreement}>
        <ProcessForm
          locale={props.locale}
          binding={bind("agreement")}
          fields={[
            field("partyId", "select", people),
            field("policyId", "select", policies),
            field("documentVersionId", "select", documents("service_agreement")),
            field("channel", "select", opts(["on_premises", "distance", "off_premises"])),
            field("signedAt", "datetime-local"),
            field("withdrawalInformedAt", "datetime-local", undefined, false),
            field("expressStartRequestedAt", "datetime-local", undefined, false),
            field("expressStartEvidenceVersionId", "select", documents("express_start"), false),
            field("commissionBasis", "textarea"),
            field("commissionPayerPartyId", "select", people),
            field("validUntil", "datetime-local"),
          ]}
        />
        {view.agreements.map((a) => (
          <div key={a.id} className="space-y-3 border-t border-border pt-4">
            <p>
              {names.find((p) => p.id === a.partyId)?.name} · {a.commissionBasis}
            </p>
            <WorkflowTime value={a.signedAt} locale={props.locale} />
            {a.revokedAt ? (
              <p>{a.revocationReason}</p>
            ) : (
              <ProcessForm
                locale={props.locale}
                binding={bind("revoke", { kind: "agreement", targetId: a.id })}
                fields={[field("reason", "textarea")]}
                submit={c.revoke}
              />
            )}
          </div>
        ))}
      </WorkflowSection>
      <WorkflowSection title={c.start}>
        <ProcessForm
          locale={props.locale}
          binding={bind("start")}
          revision={view.record.version}
          fields={[
            field("proposalRevisionId", "select", [
              blank,
              ...offered.map(({ proposal, revision }) => ({
                value: revision.id,
                label: `${proposal.reference} · v${revision.revisionNumber}`,
              })),
            ]),
            field("policyId", "select", policies),
            field("participantCategory", "select", opts(["eu", "non_eu", "mixed", "unknown"])),
            field("dueAt", "datetime-local"),
          ]}
        />
      </WorkflowSection>
      {
        await Promise.all(
          view.reviews.map(async (review) => {
            const policy = view.policies.find((p) => p.id === review.policyId);
            let ready = false;
            try {
              if (!review.invalidatedAt) {
                await assertCaseAgreementReady(db, id, {
                  proposalRevisionId: review.proposalRevisionId,
                });
                ready = true;
              }
            } catch (error) {
              if (!isAppError(error) || error.code !== "transition_denied") throw error;
            }
            return (
              <WorkflowSection
                key={review.id}
                title={`${c.review} · ${policy?.title ?? c.blocked}`}
              >
                <p>{ready ? c.ready : c.blocked}</p>
                {review.approvedAt ? (
                  <p>
                    {c.recorded}: <WorkflowTime value={review.approvedAt} locale={props.locale} />
                  </p>
                ) : null}
                {review.invalidatedAt ? (
                  <p>{review.invalidationReason}</p>
                ) : (
                  <>
                    {view.items
                      .filter((i) => i.reviewId === review.id)
                      .map((item) => (
                        <details
                          key={item.id}
                          className="space-y-4 rounded-card border border-border p-4"
                        >
                          <summary>
                            {policy?.items.find((i) => i.code === item.code)?.label ?? item.code}
                            {item.partyScope
                              ? ` · ${names.find((p) => p.id === item.partyScope)?.name ?? item.partyScope}`
                              : ""}
                          </summary>
                          <ProcessForm
                            locale={props.locale}
                            binding={bind("item", {
                              reviewId: review.id,
                              code: item.code,
                              partyScope: item.partyScope,
                            })}
                            revision={review.version}
                            values={{
                              result: item.result === "pending" ? "" : item.result,
                              reason: item.reason ?? "",
                              professionalName: item.professionalName ?? "",
                              evidenceVersionId: item.evidenceVersionId ?? "",
                            }}
                            fields={[
                              field(
                                "result",
                                "select",
                                opts(
                                  policy?.items.find((i) => i.code === item.code)
                                    ?.allowNotApplicable
                                    ? ["accepted", "not_applicable", "blocked"]
                                    : ["accepted", "blocked"],
                                ),
                              ),
                              field("reason", "textarea"),
                              field("evidenceVersionId", "select", documents("case_check"), false),
                              field("professionalName", "text", undefined, false),
                              field("validUntil", "datetime-local"),
                            ]}
                          />
                        </details>
                      ))}
                    <ProcessForm
                      locale={props.locale}
                      binding={bind("approve", { reviewId: review.id })}
                      revision={review.version}
                      fields={[]}
                      submit={c.approve}
                    />
                    <ProcessForm
                      locale={props.locale}
                      binding={bind("revoke", { kind: "review", targetId: review.id })}
                      fields={[field("reason", "textarea")]}
                      submit={c.revoke}
                    />
                  </>
                )}
              </WorkflowSection>
            );
          }),
        )
      }
      <WorkflowSection title={c.commission}>
        <ProcessForm
          locale={props.locale}
          binding={bind("commission")}
          fields={[
            field("agreementId", "select", [
              blank,
              ...view.agreements
                .filter((a) => !a.revokedAt)
                .map((a) => ({
                  value: a.id,
                  label: `${names.find((p) => p.id === a.partyId)?.name ?? "—"} · ${a.commissionBasis}`,
                })),
            ]),
            field("amountMinor", "number"),
            field("invoiceReference"),
          ]}
        />
        {view.commissions.map((record) => (
          <p key={record.id}>
            {new Intl.NumberFormat(props.locale, {
              style: "currency",
              currency: record.currency,
            }).format(record.amountMinor / 100)}{" "}
            · {record.invoiceReference}
          </p>
        ))}
      </WorkflowSection>
    </WorkflowPage>
  );
}

export async function ProcessReceipt(props: ScreenProps & { id: string; operationKey: string }) {
  const db = getDb(),
    c = processCopy(props.locale);
  await privateRead(() => caseFor(db, props.session, props.id));
  const rows = await db
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.actorKind, "staff"),
        eq(operations.actorId, props.session.account.id),
        eq(operations.idempotencyKey, props.operationKey),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row?.operationType.startsWith("compliance.")) notFound();
  const capability =
    row.operationType === "compliance.suspicion.record"
      ? "compliance.suspicion"
      : "compliance.review";
  if (
    !(await can(db, props.session.actor, capability, {
      type: "case",
      id: props.id,
      audience: "internal",
    }))
  )
    notFound();
  const outcome = row.outcome as { caseId?: string; id?: string } | null;
  if (row.status === "succeeded" && outcome?.caseId && outcome.caseId !== props.id) notFound();
  return (
    <WorkflowPage {...props} title={c.status}>
      <p role="status">{row.status === "succeeded" ? c.recorded : c.blocked}</p>
      <WorkflowTime value={row.completedAt} locale={props.locale} />
      <a
        className={workflowLink}
        href={`${processPath(props.locale, props.id)}${capability === "compliance.suspicion" ? "/restricted" : ""}`}
      >
        {capability === "compliance.suspicion" ? c.restricted : c.title}
      </a>
    </WorkflowPage>
  );
}

export async function RestrictedProcessScreen(props: ScreenProps & { id: string }) {
  const db = getDb(),
    c = processCopy(props.locale);
  const view = await privateRead(() => restrictedCaseRegister(db, props.session, props.id));
  const names = view.partyIds.length
    ? await db
        .select({ id: parties.id, name: parties.displayName })
        .from(parties)
        .where(inArray(parties.id, view.partyIds))
    : [];
  const blank = { value: "", label: c.choose };
  return (
    <WorkflowPage {...props} title={`${c.restricted} · ${view.record.reference}`}>
      <p>{c.restrictedHint}</p>
      <WorkflowSection title={c.restricted}>
        <ProcessForm
          locale={props.locale}
          binding={{ command: "suspicion", caseId: props.id }}
          fields={[
            {
              name: "partyId",
              label: c.fields.partyId,
              type: "select",
              required: true,
              options: [blank, ...names.map((p) => ({ value: p.id, label: p.name }))],
            },
            {
              name: "policyId",
              label: c.fields.policyId,
              type: "select",
              required: true,
              options: [
                blank,
                ...view.policies
                  .filter((p) => p.validUntil > new Date())
                  .map((p) => ({ value: p.id, label: p.title })),
              ],
            },
            { name: "note", label: c.fields.note, type: "textarea", required: true },
            { name: "externalReference", label: c.fields.externalReference },
            {
              name: "reportedAt",
              label: c.fields.reportedAt,
              type: "datetime-local",
              hint: c.time,
            },
          ]}
        />
      </WorkflowSection>
      {view.reports.map((report) => (
        <WorkflowSection
          title={names.find((p) => p.id === report.partyId)?.name ?? c.restricted}
          key={report.id}
        >
          <p className="whitespace-pre-wrap">{report.note}</p>
          {report.reportedAt ? (
            <p>
              {report.externalReference} ·{" "}
              <WorkflowTime value={report.reportedAt} locale={props.locale} />
            </p>
          ) : (
            <p>{c.pendingReport}</p>
          )}
          <WorkflowTime value={report.createdAt} locale={props.locale} />
        </WorkflowSection>
      ))}
    </WorkflowPage>
  );
}
