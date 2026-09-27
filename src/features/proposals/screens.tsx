import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { currencyCodes } from "@/domain/ids";
import { displayLocale, isPublicLocale } from "@/i18n/config";
import { readCase } from "@/server/cases/queries";
import { caseFor } from "@/server/cases/shared";
import { isAppError } from "@/server/errors";
import { findOperation } from "@/server/operations";
import { listProposals, proposalContext, readProposal } from "@/server/proposals/queries";
import { deadlineInput } from "@/server/proposals/terms";
import { initialFormState, isIssuedFormOperation } from "@/ui/form/server";
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
  proposalFields,
  proposalScope,
  proposalStatus,
  proposalTypes,
} from "./contract";
import { proposalCopy } from "./copy";

function ProposalForm(
  props: ScreenProps & {
    command: ProposalCommand;
    id: string;
    version: number;
    fields: WorkflowField[];
    values?: Record<string, string>;
    path: string;
    label: string;
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
      status={{
        href: proposalStatus(props.locale, props.command, props.id, initial.operationId),
        label: caseCopy(props.locale).status,
      }}
      submit={props.label}
    />
  );
}
function termFields(locale: string): WorkflowField[] {
  const c = proposalCopy(locale);
  return [
    { name: "amount", label: c.amount, required: true },
    {
      name: "currency",
      label: c.currency,
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
    { name: "deadline", label: c.deadline, hint: caseCopy(locale).offsetHint, required: true },
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
        {c.revision} {row.number} · <strong>{c[row.state]}</strong>
      </p>
      <p className="text-subheading font-semibold">
        <bdi>
          {new Intl.NumberFormat(isPublicLocale(locale) ? displayLocale(locale) : "en-GB", {
            style: "currency",
            currency: row.currency,
          }).format(row.amountMinor / 100)}
        </bdi>{" "}
        · {row.period === "month" ? c.month : c.total}
      </p>
      <p>
        {c.paymentBasis}: {row.paymentBasis}
      </p>
      <p>
        {c.deadline}: <WorkflowTime value={row.deadlineAt} locale={locale} />
      </p>
      <h3 className="font-semibold">{c.parties}</h3>
      <ul>
        {row.parties.map((p) => (
          <li key={p.partyId}>
            {p.name} · {p.role.replaceAll("_", " ")}
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
  const path = `/${props.locale}/proposals/${view.proposal.id}`;
  const common = { ...props, id: view.proposal.id, version: view.proposal.version, path };
  const hidden: WorkflowField[] = [{ name: "revisionId", label: "", type: "hidden" }];
  const revisionValues = { revisionId: row.id };
  const buyer = row.parties.find((p) => ["buyer", "co_buyer", "tenant"].includes(p.role));
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
    <WorkflowPage {...props} title={view.proposal.reference}>
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
        <p>
          {view.source.reference} · {c.source} {view.source.revision}
        </p>
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
                <WorkflowTime value={response.at} locale={props.locale} />
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
      {view.current &&
      view.intact &&
      (view.canRespond || (staff && row.state !== "agreed_for_next_step")) ? (
        <WorkflowSection title={staff ? c.revise : c.counter}>
          <ProposalForm
            {...common}
            command="revise"
            label={staff ? c.revise : c.counter}
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
              ...termFields(props.locale),
              { name: "reason", label: c.reason, type: "textarea", required: true },
            ]}
            values={{
              ...revisionValues,
              clientPartyId: buyer?.partyId ?? "",
              amount: (row.amountMinor / 100).toFixed(2),
              currency: row.currency,
              period: row.period,
              paymentBasis: row.paymentBasis,
              conditions: row.conditions.join("\n"),
              inclusions: row.inclusions.join("\n"),
              deadline: deadlineInput(row.deadlineAt),
            }}
          />
        </WorkflowSection>
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
      <a className={workflowLink} href={href}>
        {c.back}
      </a>
    </WorkflowPage>
  );
}
