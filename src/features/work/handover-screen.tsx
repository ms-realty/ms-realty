import { type WorkflowField, WorkflowForm } from "@/features/cases/form";
import { isPublicLocale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";
import type { Session } from "@/server/auth/sessions";
import type { readTaskHandover } from "@/server/work/handover";
import { buttonClass } from "@/ui/button-class";
import { initialFormState } from "@/ui/form/server";
import { Notice } from "@/ui/notice";
import { taskHandoverAction } from "./actions";
import { workCopy } from "./copy";
import { taskHandoverCopy } from "./handover-copy";

type Intent = "request" | "accept" | "decline" | "cancel";
const fill = (template: string, names: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => names[key] ?? "");

/** W03: receiver accepts with their own step and review time, or declines with a reason;
 * the sender sees the request, can withdraw it with a reason, and reads the latest decision. */
export function TaskHandoverScreen({
  locale,
  session,
  id,
  view,
}: {
  locale: string;
  session: Session;
  id: string;
  view: Awaited<ReturnType<typeof readTaskHandover>>;
}) {
  const { task, ownerName, receivers, pendingName, latestDecision } = view;
  const c = taskHandoverCopy(locale),
    path = `/${locale}/tasks/${id}`;
  const owner = ownerName ?? "",
    receiver = pendingName ?? "",
    actor = latestDecision?.actorName ?? "";
  const when = (instant: string) => formatDateTime(isPublicLocale(locale) ? locale : "bg", instant);

  function form(intent: Intent, label: string) {
    const state = initialFormState(
      `work.handover.${id}`,
      {
        action: intent,
        receiverId: intent === "request" ? "" : (task.pendingOwnerId ?? ""),
        reason: "",
        reviewed: "",
        nextAction: "",
        dueAt: "",
      },
      task.version,
    );
    const hidden = (name: string): WorkflowField => ({ name, label: name, type: "hidden" });
    const fields: WorkflowField[] =
      intent === "accept"
        ? [
            hidden("action"),
            hidden("receiverId"),
            { name: "nextAction", label: c.nextAction, required: true },
            {
              name: "dueAt",
              label: c.reviewAt,
              type: "datetime-local",
              hint: c.acceptRule,
              required: true,
            },
          ]
        : intent === "request"
          ? [
              hidden("action"),
              {
                name: "receiverId",
                label: c.receiver,
                type: "select",
                options: [
                  { value: "", label: "—" },
                  ...receivers.map((r) => ({ value: r.id, label: r.name })),
                ],
                required: true,
              },
              { name: "reason", label: c.reason, type: "textarea", required: true },
              { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
            ]
          : [
              hidden("action"),
              hidden("receiverId"),
              {
                name: "reason",
                label: intent === "decline" ? c.declineReason : c.withdrawReason,
                type: "textarea",
                required: true,
              },
            ];
    return (
      <WorkflowForm
        locale={locale}
        path={path}
        fields={fields}
        initialState={state}
        action={taskHandoverAction.bind(null, locale, id)}
        status={{
          href: `${path}/operations?type=handover&key=${encodeURIComponent(state.operationId)}`,
          label: workCopy(locale).statusLink,
        }}
        submit={label}
      />
    );
  }

  // A disclosure keeps the second, rarer path one native step away, with or without JavaScript.
  function step(summary: string, effect: string, body: React.ReactNode) {
    return (
      <details className="space-y-3">
        <summary className={buttonClass("secondary", "w-fit cursor-pointer")}>{summary}</summary>
        <p className="text-text-muted">{effect}</p>
        {body}
      </details>
    );
  }

  const decision = latestDecision ? (
    <dl className="grid gap-2">
      <div>
        <dt className="font-semibold">{fill(c.reasonFrom, { actor })}</dt>
        <dd className="wrap-anywhere">{latestDecision.reason}</dd>
      </div>
      <div>
        <dt className="font-semibold">{c.workWith}</dt>
        <dd>{owner}</dd>
      </div>
      <div>
        <dt className="font-semibold">{c.recorded}</dt>
        <dd>
          {actor} · <time dateTime={latestDecision.at}>{when(latestDecision.at)}</time>
        </dd>
      </div>
    </dl>
  ) : null;

  const mine = task.ownerId === session.actor.id;
  let body: React.ReactNode;
  if (task.pendingOwnerId === session.actor.id) {
    // O23HR / O23HRD: the receiver's offer, accept and decline.
    body = (
      <>
        <h2 className="text-subheading font-semibold">{fill(c.receiverTitle, { owner })}</h2>
        <dl className="grid gap-2">
          <div>
            <dt className="font-semibold">{c.from}</dt>
            <dd>{owner}</dd>
          </div>
          <div>
            <dt className="font-semibold">{c.handedOver}</dt>
            <dd className="wrap-anywhere">{task.title}</dd>
          </div>
        </dl>
        <p className="text-text-muted">{c.acceptEffect}</p>
        {form("accept", c.acceptWork)}
        {step(c.declineOpen, fill(c.declineEffect, { owner }), form("decline", c.sendDecline))}
      </>
    );
  } else if (task.pendingOwnerId) {
    // O23HP / O23HPC: the sender waits and may withdraw with a reason (the server lets only the
    // requester withdraw).
    body = (
      <>
        <h2 className="text-subheading font-semibold">{c.title}</h2>
        <Notice tone="info" title={fill(c.pendingAlert, { receiver })} />
        {step(c.withdrawOpen, fill(c.withdrawEffect, { receiver }), form("cancel", c.withdrawOpen))}
      </>
    );
  } else if (latestDecision?.kind === "cancelled" && !mine) {
    // O23HRX: the receiver's view of a withdrawn offer; nothing to do.
    body = (
      <>
        <h2 className="text-subheading font-semibold">{c.withdrawnForMe}</h2>
        <p>{fill(c.withdrawnForMeNote, { actor })}</p>
        {decision}
      </>
    );
  } else {
    // O23HPD / O23HPX, then O23H/O23HC: the owner (or a manager) reads the last decision and
    // may offer the work again.
    body = (
      <>
        {latestDecision?.kind === "declined" ? (
          <>
            <h2 className="text-subheading font-semibold">{fill(c.declinedTitle, { actor })}</h2>
            {decision}
            <p>{c.declinedNext}</p>
          </>
        ) : latestDecision?.kind === "cancelled" ? (
          <>
            <h2 className="text-subheading font-semibold">{c.withdrawnByMe}</h2>
            <p>{c.withdrawnByMeNote}</p>
            {decision}
          </>
        ) : null}
        <h3 className="font-semibold">{c.offerTitle}</h3>
        <p className="text-text-muted">{c.lead}</p>
        {receivers.length ? form("request", c.request) : <p>{c.none}</p>}
      </>
    );
  }

  return (
    <section className="min-w-0 space-y-4 rounded-card border border-border p-5 wrap-anywhere">
      {body}
    </section>
  );
}
