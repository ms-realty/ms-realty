import "server-only";
import { getDb } from "@/db/client";
import { type CaseStage, caseStageTransitions, stagesByKind } from "@/domain/case";
import { lifecycleView } from "@/server/cases/lifecycle";
import { sellerBindingOptions } from "@/server/cases/owner-preview";
import { privateRead } from "../work/screens";
import type { WorkflowField } from "./form";
import { lifecycleCopy } from "./lifecycle-copy";
import { ownerPreviewCopy } from "./owner-preview-copy";
import {
  BoundWorkflowForm,
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTime,
  workflowLink,
} from "./screens";

export async function LifecycleScreen(props: ScreenProps & { id: string }) {
  const view = await privateRead(() => lifecycleView(getDb(), props.session, props.id)),
    row = view.row,
    c = lifecycleCopy(props.locale),
    path = `/${props.locale}/cases/${row.id}/continuity`;
  const bindingOptions = await sellerBindingOptions(getDb(), props.session, props.id),
    ownerCopy = ownerPreviewCopy(props.locale);
  const common = { ...props, id: row.id, revision: row.version, path };
  const reason: WorkflowField = {
    name: "reason",
    label: c.reason,
    type: "textarea",
    required: true,
  };
  const hidden = (name: string): WorkflowField => ({ name, label: name, type: "hidden" });
  const stages = stagesByKind[row.kind].filter(
    (s) =>
      caseStageTransitions(row.kind).machine.check(row.stage as CaseStage, s).outcome === "allowed",
  );
  const completionFields: WorkflowField[] = [
    { name: "completionEvidenceId", label: c.evidence },
    { name: "outcome", label: c.outcome, type: "textarea" },
    { name: "handover", label: c.handoverStatus, type: "textarea" },
    { name: "retention", label: c.retention, type: "textarea" },
    { name: "aftercare", label: c.aftercare, type: "textarea" },
  ];
  return (
    <WorkflowPage {...props} title={`${c.title} · ${row.reference}`}>
      <a className={workflowLink} href={`/${props.locale}/cases/${row.id}`}>
        {c.back}
      </a>
      <p>{c.boundary}</p>
      {bindingOptions.length && row.disposition === "active" ? (
        <WorkflowSection title={ownerCopy.binding}>
          <BoundWorkflowForm
            {...common}
            command="sellerBind"
            fields={[
              {
                name: "instructionId",
                label: ownerCopy.instruction,
                type: "select",
                required: true,
                options: [
                  { value: "", label: "—" },
                  ...bindingOptions.map((o) => ({ value: o.id, label: o.label })),
                ],
              },
              reason,
              { name: "reviewed", label: ownerCopy.bindCheck, type: "checkbox", required: true },
            ]}
            submit={ownerCopy.bind}
          />
        </WorkflowSection>
      ) : null}
      <dl className="grid grid-cols-2 gap-3">
        {[
          [c.openTasks, view.openTasks],
          [c.appointments, view.appointments],
          [c.proposals, view.proposals],
          [c.documents, view.documentCount],
          [c.approvals, view.approvalCount],
          [c.messages, view.recentMessages],
        ].map(([label, count]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      {row.disposition !== "closed" ? (
        <WorkflowSection title={c.handover}>
          {row.pendingOwnerId ? <p>{c.pending}</p> : null}
          {view.canAccept ? (
            <BoundWorkflowForm
              {...common}
              command="handover"
              fields={[
                hidden("action"),
                hidden("receiverId"),
                hidden("snapshotHash"),
                reason,
                { name: "reviewed", label: c.review, type: "checkbox", required: true },
              ]}
              values={{
                action: "accept",
                receiverId: props.session.account.id,
                snapshotHash: view.snapshotHash,
              }}
              submit={c.accept}
            />
          ) : null}
          {view.receivers.length ? (
            <BoundWorkflowForm
              {...common}
              command="handover"
              fields={[
                hidden("action"),
                hidden("snapshotHash"),
                {
                  name: "receiverId",
                  label: c.receiver,
                  type: "select",
                  required: true,
                  options: [
                    { value: "", label: "—" },
                    ...view.receivers.map((r) => ({ value: r.id, label: r.name })),
                  ],
                },
                reason,
                { name: "reviewed", label: c.review, type: "checkbox", required: true },
              ]}
              values={{ action: "request", snapshotHash: view.snapshotHash }}
              submit={c.request}
            />
          ) : (
            <p>{c.noReceivers}</p>
          )}
          {row.pendingOwnerId ? (
            <BoundWorkflowForm
              {...common}
              command="handover"
              fields={[
                hidden("action"),
                hidden("receiverId"),
                hidden("snapshotHash"),
                reason,
                { name: "reviewed", label: c.review, type: "checkbox", required: true },
              ]}
              values={{
                action: "cancel",
                receiverId: row.pendingOwnerId,
                snapshotHash: view.snapshotHash,
              }}
              submit={c.cancel}
            />
          ) : null}
        </WorkflowSection>
      ) : null}
      {row.disposition === "active" && stages.length ? (
        <WorkflowSection title={c.stage}>
          <p>{c.stageBlocked}</p>
          <p>{c.completionNote}</p>
          <BoundWorkflowForm
            {...common}
            command="stage"
            fields={[
              {
                name: "stage",
                label: c.target,
                type: "select",
                required: true,
                options: [
                  { value: "", label: "—" },
                  ...stages.map((stage) => ({ value: stage, label: stage.replaceAll("_", " ") })),
                ],
              },
              reason,
              ...(stages.some((s) => ["completed", "completion_handover", "concluded"].includes(s))
                ? completionFields
                : []),
            ]}
            submit={c.recordStage}
          />
        </WorkflowSection>
      ) : null}
      <WorkflowSection title={c.disposition}>
        <BoundWorkflowForm
          {...common}
          command="disposition"
          fields={[
            {
              name: "state",
              label: c.state,
              type: "select",
              required: true,
              options: [
                { value: "", label: "—" },
                ...(["active", "paused", "closed"] as const)
                  .filter((s) => s !== row.disposition)
                  .map((state) => ({
                    value: state,
                    label: state === "active" ? c.active : state === "paused" ? c.pause : c.closed,
                  })),
              ],
            },
            reason,
            { name: "waitingOn", label: c.waiting, type: "textarea" },
            { name: "reviewAt", label: c.reviewAt, type: "datetime-local" },
            { name: "outcome", label: c.outcome, type: "textarea" },
            { name: "retention", label: c.retention, type: "textarea" },
            { name: "aftercare", label: c.aftercare, type: "textarea" },
            { name: "nextAction", label: c.next },
            { name: "dueAt", label: c.due, type: "datetime-local" },
          ]}
          submit={c.recordDisposition}
        />
      </WorkflowSection>
      <WorkflowSection title={c.history}>
        {view.history.map((entry) => (
          <article key={entry.id} className="space-y-2 border-b border-rule py-4">
            <p>
              {entry.from?.replaceAll("_", " ")} → {entry.to.replaceAll("_", " ")}
            </p>
            <p>{entry.reason}</p>
            <WorkflowTime value={entry.at} locale={props.locale} />
          </article>
        ))}
      </WorkflowSection>
    </WorkflowPage>
  );
}
