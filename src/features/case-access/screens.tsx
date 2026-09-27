import "server-only";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { isFresh } from "@/server/auth/sessions";
import { caseAccessWorkbench } from "@/server/cases/access-requests";
import { findOperation } from "@/server/operations";
import { initialFormState } from "@/ui/form/server";
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
import { caseAccessAction } from "./actions";
import {
  type AccessBinding,
  accessFields,
  accessOperationType,
  accessPath,
  accessScope,
} from "./contract";
import { caseAccessCopy } from "./copy";

function AccessForm({
  locale,
  binding,
  revision,
  fields,
  submit,
}: {
  locale: string;
  binding: AccessBinding;
  revision: number;
  fields: WorkflowField[];
  submit: string;
}) {
  const initial = initialFormState(
      accessScope(binding),
      Object.fromEntries(accessFields[binding.command].map((f) => [f, ""])),
      revision,
    ),
    path = accessPath(locale, binding.host, binding.caseId);
  return (
    <WorkflowForm
      locale={locale}
      initialState={initial}
      fields={fields}
      action={caseAccessAction.bind(null, locale, binding)}
      path={path}
      submit={submit}
      status={{
        href: `${path}?command=${binding.command}&key=${encodeURIComponent(initial.operationId)}`,
        label: caseAccessCopy(locale).refresh,
      }}
    />
  );
}
export async function CaseAccessScreen(
  props: ScreenProps & { id: string; query: Record<string, string | string[] | undefined> },
) {
  const { locale, session, id, query } = props,
    staff = session.actor.kind === "staff",
    host = staff ? "staff" : "client",
    c = caseAccessCopy(locale),
    cc = caseCopy(locale),
    path = accessPath(locale, host, id),
    db = getDb();
  if (staff && !isFresh(session))
    redirect(`/${locale}/access/reauth?returnTo=${encodeURIComponent(path)}`);
  const view = await privateRead(() => caseAccessWorkbench(db, session, id));
  const command =
    typeof query.command === "string" && Object.hasOwn(accessFields, query.command)
      ? (query.command as AccessBinding["command"])
      : null;
  const receipt =
    command && typeof query.key === "string"
      ? await findOperation(db, session.actor, accessOperationType(command), query.key)
      : null;
  const base = { caseId: id, host } as const;
  const roleLabel = (role: string) => c.roles[role as keyof typeof c.roles] ?? role;
  return (
    <WorkflowPage {...props} title={`${c.title} · ${view.case.reference}`}>
      <p>{staff ? c.staffLead : c.lead}</p>
      {query.key ? (
        <section role="status" className="space-y-2">
          <h2 className="font-semibold">
            {receipt?.status === "succeeded"
              ? cc.statusSaved
              : receipt?.status === "failed"
                ? cc.conflict
                : cc.statusUnknown}
          </h2>
          {receipt ? <p>{receipt.operationId}</p> : null}
        </section>
      ) : null}
      <div className="flex flex-wrap gap-5">
        <a className={workflowLink} href={`${path}?refresh=${randomUUID()}`}>
          {c.refresh}
        </a>
        <a className={workflowLink} href={`/${locale}/${staff ? "cases" : "overview"}/${id}`}>
          {c.back}
        </a>
      </div>
      <WorkflowSection title={c.roster}>
        <ul className="space-y-6">
          {view.roster.participants.map((p) => (
            <li key={p.id} className="space-y-3">
              <h3 className="font-semibold">
                {p.displayName} · {roleLabel(p.role)}
              </h3>
              {"state" in p ? <p>{c.states[p.state]}</p> : null}
              <p>
                {p.accessExpiresAt ? (
                  <>
                    <span>{c.expires}: </span>
                    <WorkflowTime locale={locale} value={p.accessExpiresAt} />
                  </>
                ) : (
                  c.noExpiry
                )}
              </p>
              {staff && "state" in p && p.state !== "revoked" ? (
                <AccessForm
                  locale={locale}
                  binding={{ ...base, command: "revoke", targetId: p.id }}
                  revision={view.case.version}
                  submit={c.revoke}
                  fields={[{ name: "reason", label: c.reason, type: "textarea", required: true }]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </WorkflowSection>
      {view.canRequest ? (
        <>
          <WorkflowSection title={c.invite}>
            <AccessForm
              locale={locale}
              binding={{ ...base, command: "invite" }}
              revision={view.case.version}
              submit={c.invite}
              fields={[
                { name: "targetEmail", label: c.email, required: true },
                { name: "targetName", label: c.name, required: true },
                {
                  name: "requestedRole",
                  label: c.role,
                  type: "select",
                  required: true,
                  options: [
                    { value: "", label: "—" },
                    ...["collaborator", "adviser", "guest", "specialist"].map((value) => ({
                      value,
                      label: roleLabel(value),
                    })),
                  ],
                },
                { name: "reason", label: c.reason, type: "textarea", required: true },
              ]}
            />
          </WorkflowSection>
          <WorkflowSection title={c.remove}>
            <AccessForm
              locale={locale}
              binding={{ ...base, command: "remove" }}
              revision={view.case.version}
              submit={c.remove}
              fields={[
                {
                  name: "targetParticipantId",
                  label: c.target,
                  type: "select",
                  required: true,
                  options: [
                    { value: "", label: "—" },
                    ...view.roster.participants.map((p) => ({
                      value: p.id,
                      label: `${p.displayName} · ${roleLabel(p.role)}`,
                    })),
                  ],
                },
                { name: "reason", label: c.reason, type: "textarea", required: true },
              ]}
            />
          </WorkflowSection>
        </>
      ) : null}
      {staff && "pendingInvitations" in view.roster && view.roster.pendingInvitations.length ? (
        <WorkflowSection title={c.pendingInvites}>
          <ul className="space-y-4">
            {view.roster.pendingInvitations.map((p) => (
              <li key={p.id}>
                <p>
                  {p.displayName} · {roleLabel(p.role)}
                </p>
                <p>{c.noAccess}</p>
                <p>
                  {c.invitationExpiry}:{" "}
                  <WorkflowTime locale={locale} value={p.invitationExpiresAt} />
                </p>
                {p.accessExpiresAt ? (
                  <p>
                    {c.expires}: <WorkflowTime locale={locale} value={p.accessExpiresAt} />
                  </p>
                ) : (
                  <p>{c.noExpiry}</p>
                )}
              </li>
            ))}
          </ul>
        </WorkflowSection>
      ) : null}
      <WorkflowSection title={c.requests}>
        {!view.requests.length ? <p>{c.empty}</p> : null}
        <ul className="space-y-8">
          {view.requests.map((r) => (
            <li key={r.id} className="space-y-3 border-t border-border pt-4">
              <h3 className="font-semibold">
                {r.kind === "invite" ? c.invite : c.remove} ·{" "}
                {r.targetName ??
                  view.roster.participants.find((p) => p.id === r.targetParticipantId)
                    ?.displayName ??
                  c.target}
              </h3>
              <p>{c.states[r.state]}</p>
              {r.state === "approved" && r.kind === "invite" ? <p>{c.approvedHint}</p> : null}
              {r.targetEmail ? <p>{r.targetEmail}</p> : null}
              {r.requestedRole ? <p>{roleLabel(r.requestedRole)}</p> : null}
              <p>
                {c.reason}: {r.reason}
              </p>
              {r.clientOutcome ? (
                <p>
                  {c.outcome}: {r.clientOutcome}
                </p>
              ) : null}
              {r.state === "pending" ? (
                <AccessForm
                  locale={locale}
                  binding={{ ...base, command: staff ? "decide" : "withdraw", targetId: r.id }}
                  revision={r.version}
                  submit={staff ? c.save : c.withdraw}
                  fields={[
                    ...(staff
                      ? [
                          {
                            name: "decision",
                            label: c.decision,
                            type: "select" as const,
                            required: true,
                            options: [
                              { value: "", label: "—" },
                              { value: "approve", label: c.approve },
                              { value: "decline", label: c.decline },
                            ],
                          },
                          ...(r.kind === "invite"
                            ? [
                                {
                                  name: "accessExpiresAt",
                                  label: c.expires,
                                  type: "datetime-local" as const,
                                  hint: c.expiryHint,
                                },
                              ]
                            : []),
                        ]
                      : []),
                    { name: "clientOutcome", label: c.outcome, type: "textarea", required: true },
                  ]}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </WorkflowSection>
    </WorkflowPage>
  );
}
