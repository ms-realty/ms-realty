import { getDb } from "@/db/client";
import { type WorkflowField, WorkflowForm } from "@/features/cases/form";
import type { Session } from "@/server/auth/sessions";
import { readTaskHandover } from "@/server/work/handover";
import { initialFormState } from "@/ui/form/server";
import { taskHandoverAction } from "./actions";
import { workCopy } from "./copy";
import { taskHandoverCopy } from "./handover-copy";

export async function TaskHandoverScreen({
  locale,
  session,
  id,
}: {
  locale: string;
  session: Session;
  id: string;
}) {
  const { task, receivers, pendingName } = await readTaskHandover(getDb(), session, id);
  const c = taskHandoverCopy(locale),
    path = `/${locale}/tasks/${id}`;
  function form(intent: "request" | "accept" | "cancel", label: string) {
    const state = initialFormState(
      `work.handover.${id}`,
      { action: intent, receiverId: task.pendingOwnerId ?? "", reason: "", reviewed: "" },
      task.version,
    );
    const fields: WorkflowField[] = [
      { name: "action", label: "action", type: "hidden" },
      {
        name: "receiverId",
        label: c.receiver,
        type: intent === "request" ? "select" : "hidden",
        options: [
          { value: "", label: "—" },
          ...receivers.map((r) => ({ value: r.id, label: r.name })),
        ],
        required: true,
      },
      { name: "reason", label: c.reason, type: "textarea", required: true },
      { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
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
  return (
    <section className="space-y-4 rounded-card border border-border p-5">
      <h2 className="text-subheading font-semibold">{c.title}</h2>
      <p>{c.lead}</p>
      {task.pendingOwnerId ? (
        <>
          <p>
            {c.pending}: {pendingName}
          </p>
          {task.pendingOwnerId === session.actor.id ? form("accept", c.accept) : null}
          <section className="space-y-3 border-t border-border pt-4">
            <h3 className="font-semibold">{c.cancel}</h3>
            {form("cancel", c.cancel)}
          </section>
        </>
      ) : receivers.length ? (
        form("request", c.request)
      ) : (
        <p>{c.none}</p>
      )}
    </section>
  );
}
