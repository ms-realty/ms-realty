import { workflowLabel } from "@/i18n/workflow-labels";
import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currencyCodes } from "@/domain/ids";
import { isPublicLocale } from "@/i18n/config";
import { formatExactMoney, formatMoneyInput } from "@/i18n/money";
import { moneyCopy } from "@/i18n/money-copy";
import { readCase } from "@/server/cases/queries";
import { caseFor } from "@/server/cases/shared";
import { isAppError } from "@/server/errors";
import { findOperation } from "@/server/operations";
import { listProposals, proposalContext, readProposal } from "@/server/proposals/queries";
import { buttonClass } from "@/ui/button-class";
import { initialFormState, isIssuedFormOperation } from "@/ui/form/server";
import { TechnicalDetails } from "@/ui/technical-details";
import { caseCopy } from "../cases/copy";
import { type WorkflowField, WorkflowForm } from "../cases/form";
import {
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTime,
  workflowLink,
} from "../cases/screens";
import { privateRead } from "../work/screens";
import { proposalAction } from "./actions";
import {
  type ProposalCommand,
  proposalEnhancementField,
  proposalFields,
  proposalScope,
  proposalStatus,
  proposalTypes,
} from "./contract";
import { proposalCopy } from "./copy";
import { counterofferCopy } from "./counteroffer-copy";

function ProposalForm(
  props: ScreenProps & {
    command: ProposalCommand;
    id: string;
    version: number;
    fields: WorkflowField[];
    values?: Record<string, string>;
    path: string;
    label: string;
    disclosure?: string;
    commandAvailable?: boolean;
  },
) {
  const initial = initialFormState(
    proposalScope(props.command, props.id),
    Object.fromEntries(
      proposalFields[props.command].map((name) => [name, props.values?.[name] ?? ""]),
    ),
    props.version,
  );
  return (
    <WorkflowForm
      locale={props.locale}
      action={proposalAction.bind(
        null,
        props.session.account.kind,
        props.locale,
        props.command,
        props.id,
      )}
      initialState={initial}
      fields={props.fields}
      path={props.path}
      nativeIdentity={proposalScope(props.command, props.id)}
      commandAvailable={props.commandAvailable}
      status={{
        href: proposalStatus(props.locale, props.command, props.id, initial.operationId),
        label: caseCopy(props.locale).status,
      }}
      submit={props.label}
      disclosure={props.disclosure}
      enhancementField={
        props.session.account.kind === "client" && props.command === "revise"
          ? proposalEnhancementField
          : undefined
      }
    />
  );
}
function termFields(locale: string): WorkflowField[] {
  const c = proposalCopy(locale);
  const money = moneyCopy(isPublicLocale(locale) ? locale : "bg");
  return [
    {
      name: "amount",
      label: money.amount,
      type: "money",
      currencyField: "currency",
      required: true,
    },
    {
      name: "currency",
      label: money.currency,
      type: "select",
      required: true,
      options: currencyCodes.map((value) => ({ value, label: value })),
    },
    {
      name: "period",
      label: c.period,
      type: "select",
      required: true,
      options: [
        { value: "total", label: c.total },
        { value: "month", label: c.month },
      ],
    },
    { name: "paymentBasis", label: c.paymentBasis, type: "textarea", required: true },
    { name: "conditions", label: c.conditions, type: "textarea" },
    { name: "inclusions", label: c.inclusions, type: "textarea" },
    { name: "deadline", label: c.deadline, type: "datetime-local", required: true },
  ];
}
export async function ProposalIndexScreen(props: ScreenProps & { caseId?: string }) {
  const c = proposalCopy(props.locale);
  const rows = await privateRead(() => listProposals(getDb(), props.session, props.caseId));
  return (
    <WorkflowPage {...props} title={c.title}>
      <p>{c.boundary}</p>
      {rows.length ? (
        <>
          <p>{c.bounded}</p>
          <ul className="space-y-4">
            {rows.map((row) => (
              <li key={row.id}>
                <a className={workflowLink} href={`/${props.locale}/proposals/${row.id}`}>
                  <bdi>{row.reference}</bdi>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{c.empty}</p>
      )}
    </WorkflowPage>
  );
}
export async function NewProposalScreen(
  props: ScreenProps & { caseId: string; interestId: string },
) {
  if (!z.uuid().safeParse(props.caseId).success || !z.uuid().safeParse(props.interestId).success)
    notFound();
  const c = proposalCopy(props.locale),
    copy = caseCopy(props.locale);
  const view = await privateRead(() => readCase(getDb(), props.session, props.caseId));
  let context: Awaited<ReturnType<typeof proposalContext>>;
  try {
    context = await proposalContext(getDb(), props.session, props.caseId, props.interestId);
  } catch (error) {
    if (isAppError(error) && ["transition_denied", "listing_unavailable"].includes(error.code))
      return (
        <WorkflowPage {...props} title={c.create}>
          <p>{copy.transition}</p>
          <a className={workflowLink} href={`/${props.locale}/cases/${props.caseId}`}>
            {copy.back}
          </a>
        </WorkflowPage>
      );
    if (isAppError(error) && ["not_found", "forbidden"].includes(error.code)) notFound();
    throw error;
  }
  const path = `/${props.locale}/proposals/new?case=${props.caseId}&interest=${props.interestId}`;
  return (
    <WorkflowPage {...props} title={`${c.create} · ${context.listingReference}`}>
      <p>{c.boundary}</p>
      <p>
        {c.seller}: {context.seller.name}
      </p>
      <ProposalForm
        {...props}
        command="create"
        id={props.caseId}
        version={view.record.version}
        path={path}
        label={c.prepare}
        fields={[
          { name: "interestId", label: "", type: "hidden" },
          {
            name: "clientPartyId",
            label: c.buyer,
            type: "select",
            required: true,
            options: context.buyers.map((p) => ({ value: p.partyId, label: p.name })),
          },
          {
            name: "additionalPartyIds",
            label: c.additionalParties,
            hint: c.additionalHint,
            type: "checkbox-group",
            options: context.buyers.map((p) => ({ value: p.partyId, label: p.name })),
          },
          ...termFields(props.locale),
        ]}
        values={{
          interestId: props.interestId,
          clientPartyId: context.buyers[0]?.partyId ?? "",
          currency: "EUR",
          period: context.purpose === "sale" ? "total" : "month",
        }}
      />
    </WorkflowPage>
  );
}
type Revision = Awaited<ReturnType<typeof readProposal>>["revision"];
function Terms({ row, locale }: { row: Revision; locale: string }) {
  const c = proposalCopy(locale);
  return (
    <div className="space-y-3" data-proposal-revision={row.number}>
      <p>
        <strong>{c[row.state]}</strong>
      </p>
      <TechnicalDetails locale={locale}>
        {c.revision} {row.number}
      </TechnicalDetails>
      <p className="text-subheading font-semibold">
        <bdi>
          {formatExactMoney(isPublicLocale(locale) ? locale : "bg", row.amountMinor, row.currency)}
        </bdi>{" "}
        · {row.period === "month" ? c.month : c.total}
      </p>
      <p>
        {c.paymentBasis}: {row.paymentBasis}
      </p>
      <p>
        {c.deadline}: <WorkflowTime value={row.deadlineAt} locale={locale} zoneLabel />
      </p>
      <h3 className="font-semibold">{c.parties}</h3>
      <ul>
        {row.parties.map((p) => (
          <li key={p.partyId}>
            {p.name} · {workflowLabel(p.role, locale)}
          </li>
        ))}
      </ul>
      {row.conditions.length ? (
        <div>
          <h3 className="font-semibold">{c.conditions}</h3>
          <ul className="list-disc ps-5">
            {row.conditions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {row.inclusions.length ? (
        <div>
          <h3 className="font-semibold">{c.inclusions}</h3>
          <ul className="list-disc ps-5">
            {row.inclusions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
export async function ProposalScreen(props: ScreenProps & { id: string }) {
  const view = await privateRead(() => readProposal(getDb(), props.session, props.id));
  const c = proposalCopy(props.locale),
    copy = caseCopy(props.locale),
    row = view.revision,
    staff = props.session.account.kind === "staff";
  const counter = counterofferCopy(isPublicLocale(props.locale) ? props.locale : "bg");
  const path = `/${props.locale}/proposals/${view.proposal.id}`;
  const common = { ...props, id: view.proposal.id, version: view.proposal.version, path };
  const hidden: WorkflowField[] = [{ name: "revisionId", label: "", type: "hidden" }];
  const revisionValues = { revisionId: row.id };
  const buyer = row.parties.find((p) => ["buyer", "co_buyer", "tenant"].includes(p.role));
  const canRevise =
    view.current &&
    view.intact &&
    (view.canRespond || (staff && row.state !== "agreed_for_next_step"));
  let buyers = [{ partyId: buyer?.partyId ?? "", name: buyer?.name ?? "" }];
  if (staff && view.proposal.interestId) {
    try {
      buyers = (
        await proposalContext(
          getDb(),
          props.session,
          view.proposal.caseId,
          view.proposal.interestId,
        )
      ).buyers;
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }
  return (
    <WorkflowPage {...props} title={c.detailTitle} reference={view.proposal.reference}>
      <p>{c.boundary}</p>
      <a
        className={workflowLink}
        href={`/${props.locale}/${staff ? "cases" : "overview"}/${view.proposal.caseId}`}
      >
        {copy.cases}
      </a>
      {!view.current ? <p role="status">{c.notCurrent}</p> : null}
      {view.expired ? <p role="status">{c.expiredNotice}</p> : null}
      {!view.intact || view.source?.changed ? <p role="status">{c.changed}</p> : null}
      {view.source ? (
        <div>
          <p>{view.source.reference}</p>
          <TechnicalDetails locale={props.locale}>
            {c.source} {view.source.revision}
          </TechnicalDetails>
        </div>
      ) : null}
      <WorkflowSection title={c.terms}>
        <Terms row={row} locale={props.locale} />
      </WorkflowSection>
      <WorkflowSection title={c.responses}>
        {view.responses.length ? (
          <ul className="space-y-4">
            {view.responses.map((response) => (
              <li key={response.partyId}>
                <p>
                  {row.parties.find((p) => p.partyId === response.partyId)?.name} ·{" "}
                  {response.decision === "agree"
                    ? c.agree
                    : response.decision === "decline"
                      ? c.declined
                      : c.countered}
                </p>
                <p>{response.reason}</p>
                <WorkflowTime
                  value={response.at}
                  locale={props.locale}
                  zoneLabel={props.session.account.kind === "client"}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p>{c.noResponses}</p>
        )}
        {row.state === "awaiting_response" && view.responses.some((r) => r.decision === "agree") ? (
          <p>{c.pending}</p>
        ) : null}
      </WorkflowSection>
      {staff && view.current && view.intact ? (
        <div className="space-y-6">
          {row.state === "draft" && !view.expired ? (
            <WorkflowSection title={c.review}>
              <ProposalForm
                {...common}
                command="review"
                fields={[
                  ...hidden,
                  { name: "reviewed", label: c.reviewCheck, type: "checkbox", required: true },
                  { name: "reason", label: c.reason, type: "textarea" },
                ]}
                values={revisionValues}
                label={c.review}
              />
            </WorkflowSection>
          ) : null}
          {row.state === "reviewed" && !view.expired ? (
            <WorkflowSection title={c.submit}>
              <ProposalForm
                {...common}
                command="submit"
                fields={[
                  ...hidden,
                  { name: "reviewed", label: c.submitCheck, type: "checkbox", required: true },
                  { name: "reason", label: c.reason, type: "textarea" },
                ]}
                values={revisionValues}
                label={c.submit}
              />
            </WorkflowSection>
          ) : null}
          {["draft", "reviewed", "submitted", "awaiting_response"].includes(row.state) ? (
            <WorkflowSection title={c.withdraw}>
              <ProposalForm
                {...common}
                command="withdraw"
                fields={[
                  ...hidden,
                  { name: "reason", label: c.reason, type: "textarea", required: true },
                ]}
                values={revisionValues}
                label={c.withdraw}
              />
            </WorkflowSection>
          ) : null}
          {row.state === "awaiting_response" && view.expired ? (
            <ProposalForm
              {...common}
              command="expire"
              fields={hidden}
              values={revisionValues}
              label={c.expire}
            />
          ) : null}
        </div>
      ) : null}
      {view.canRespond ? (
        <WorkflowSection title={c.response}>
          <p>{c.responseNote}</p>
          <ProposalForm
            {...common}
            command="decide"
            fields={[
              ...hidden,
              {
                name: "state",
                label: c.response,
                type: "select",
                required: true,
                options: [
                  { value: "", label: "—" },
                  { value: "agreed_for_next_step", label: c.agree },
                  { value: "declined", label: c.decline },
                ],
              },
              { name: "reason", label: c.reason, type: "textarea", required: true },
            ]}
            values={revisionValues}
            label={c.record}
          />
        </WorkflowSection>
      ) : null}
      {canRevise || !staff ? (
        // Keep the client hook mounted when a committed counteroffer makes the visible
        // submitted revision historical. Only a restored response can reveal this form.
        <section
          className={
            canRevise ? "space-y-4 rounded-card border border-border bg-surface p-5" : undefined
          }
        >
          {canRevise ? (
            <h2 className="text-subheading font-semibold">{staff ? c.revise : counter.open}</h2>
          ) : null}
          <ProposalForm
            {...common}
            command="revise"
            commandAvailable={canRevise}
            label={staff ? c.revise : counter.submit}
            disclosure={staff ? undefined : counter.open}
            fields={[
              ...hidden,
              staff
                ? {
                    name: "clientPartyId",
                    label: c.buyer,
                    type: "select",
                    required: true,
                    options: buyers.map((p) => ({ value: p.partyId, label: p.name })),
                  }
                : { name: "clientPartyId", label: "", type: "hidden" },
              staff
                ? {
                    name: "additionalPartyIds",
                    label: c.additionalParties,
                    hint: c.additionalHint,
                    type: "checkbox-group",
                    options: buyers.map((p) => ({ value: p.partyId, label: p.name })),
                  }
                : { name: "additionalPartyIds", label: "", type: "hidden" },
              ...termFields(props.locale),
              { name: "reason", label: c.reason, type: "textarea", required: true },
            ]}
            values={{
              ...revisionValues,
              clientPartyId: buyer?.partyId ?? "",
              additionalPartyIds: row.parties
                .filter(
                  (p) =>
                    ["buyer", "co_buyer", "tenant"].includes(p.role) &&
                    p.partyId !== buyer?.partyId,
                )
                .map((p) => p.partyId)
                .join("\n"),
              amount: formatMoneyInput(
                isPublicLocale(props.locale) ? props.locale : "bg",
                row.amountMinor,
                row.currency,
              ),
              currency: row.currency,
              period: row.period,
              paymentBasis: row.paymentBasis,
              conditions: row.conditions.join("\n"),
              inclusions: row.inclusions.join("\n"),
              deadline: row.deadlineAt.toISOString(),
            }}
          />
        </section>
      ) : null}
      {view.history.length ? (
        <WorkflowSection title={c.history}>
          {view.history.map((previous) => (
            <details key={previous.id} className="rounded-control border border-border p-4">
              <summary className="cursor-pointer font-semibold">
                {c.revision} {previous.number} · {c[previous.state]}
              </summary>
              <Terms row={previous} locale={props.locale} />
            </details>
          ))}
        </WorkflowSection>
      ) : null}
    </WorkflowPage>
  );
}
export async function ProposalStatusScreen(
  props: ScreenProps & {
    command?: string | string[];
    id?: string | string[];
    keyValue?: string | string[];
  },
) {
  if (
    typeof props.command !== "string" ||
    !Object.hasOwn(proposalTypes, props.command) ||
    typeof props.id !== "string" ||
    typeof props.keyValue !== "string"
  )
    notFound();
  const command = props.command as ProposalCommand,
    id = props.id;
  if (!isIssuedFormOperation(proposalScope(command, id), props.keyValue)) notFound();
  if (command === "create")
    await privateRead(() => caseFor(getDb(), props.session, id, "proposal.manage"));
  else await privateRead(() => readProposal(getDb(), props.session, id));
  const receipt = await findOperation(
      getDb(),
      props.session.actor,
      proposalTypes[command],
      props.keyValue,
    ),
    c = caseCopy(props.locale);
  const outcome = z.object({ id: z.uuid() }).safeParse(receipt?.outcome);
  const href =
    receipt?.status === "succeeded" && outcome.success
      ? `/${props.locale}/proposals/${outcome.data.id}`
      : command === "create"
        ? `/${props.locale}/cases/${id}`
        : `/${props.locale}/proposals/${id}`;
  return (
    <WorkflowPage {...props} title={c.status}>
      <p>
        {!receipt
          ? c.statusAbsent
          : receipt.status === "succeeded"
            ? c.statusSaved
            : receipt.status === "failed"
              ? c.statusFailed
              : c.statusUnknown}
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {receipt && receipt.status !== "succeeded" && receipt.status !== "failed" ? (
          <a
            className={buttonClass("primary")}
            href={proposalStatus(props.locale, command, id, props.keyValue)}
          >
            {c.checkAgain}
          </a>
        ) : null}
        <a className={buttonClass("secondary")} href={href}>
          {c.back}
        </a>
      </div>
    </WorkflowPage>
  );
}
