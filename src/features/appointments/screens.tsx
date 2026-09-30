import "server-only";
import { z } from "zod";
import { getDb } from "@/db/client";
import { appointmentMachine } from "@/domain/appointment";
import { listAppointments, readAppointment } from "@/server/appointments/service";
import { Notice } from "@/ui/notice";
import { caseCopy } from "../cases/copy";
import { caseEmailCopy } from "../cases/email-copy";
import {
  AppointmentList,
  BoundWorkflowForm,
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTime,
  workflowLink,
} from "../cases/screens";
import { coverageCopy } from "../work/coverage-copy";
import { privateRead } from "../work/screens";
import { hostHandoverCopy } from "./host-copy";
export async function CalendarScreen(props: ScreenProps) {
  const c = caseCopy(props.locale);
  const rows = await listAppointments(getDb(), props.session);
  return (
    <WorkflowPage {...props} title={c.calendar}>
      <p>{props.session.account.kind === "staff" ? c.policyNote : c.requestNote}</p>
      <p>{c.calendarBounded}</p>
      <AppointmentList {...props} rows={rows} />
    </WorkflowPage>
  );
}
export async function AppointmentScreen(props: ScreenProps & { id: string }) {
  const detail = await privateRead(() => readAppointment(getDb(), props.session, props.id));
  const { appointment: row } = detail;
  const c = caseCopy(props.locale);
  const staff = props.session.account.kind === "staff";
  const hostCopy = hostHandoverCopy(props.locale);
  const path = `/${props.locale}/${staff ? "calendar" : "appointments"}/${row.id}`;
  const windows = z.array(z.object({ text: z.string() })).safeParse(row.requestedWindows);
  const canArrange =
    detail.canManage && ["requested", "proposed", "reschedule_requested"].includes(row.state);
  const targets = (
    ["reschedule_requested", "cancelled", "completed", "no_show", "declined"] as const
  ).filter(
    (target) =>
      appointmentMachine.check(row.state, target).outcome === "allowed" &&
      (staff || ["reschedule_requested", "cancelled"].includes(target)),
  );
  return (
    <WorkflowPage {...props} title={row.reference}>
      <p data-testid="appointment-state" className="font-semibold">
        {c[row.state]}
      </p>
      {staff && detail.needsCoverage ? (
        <Notice tone="warning">
          <a href={`/${props.locale}/coverage`} className={workflowLink}>
            {coverageCopy(props.locale).appointments}
          </a>
          <p>{coverageCopy(props.locale).appointmentNote}</p>
        </Notice>
      ) : null}
      <p>
        {c.owned}: {row.hostName ?? "—"}
      </p>
      <p>Europe/Sofia</p>
      {row.caseId ? (
        <nav className="flex flex-wrap gap-4" aria-label={c.cases}>
          <a
            className={`${workflowLink} inline-flex min-h-control items-center`}
            href={`/${props.locale}/${staff ? "cases" : "overview"}/${row.caseId}`}
          >
            {c.cases}
          </a>
          {detail.canManage ? (
            <a
              className={`${workflowLink} inline-flex min-h-control items-center`}
              href={`/${props.locale}/cases/${row.caseId}/email`}
            >
              {caseEmailCopy(props.locale).title}
            </a>
          ) : null}
        </nav>
      ) : null}
      {windows.success && windows.data.length ? (
        <WorkflowSection title={c.preferredWindow}>
          <ul>
            {windows.data.map((window) => (
              <li key={window.text}>{window.text}</li>
            ))}
          </ul>
        </WorkflowSection>
      ) : null}
      {row.confirmedStartsAt ? (
        <WorkflowSection
          title={
            ["cancelled", "completed", "no_show"].includes(row.state)
              ? c.previousTime
              : c.confirmedTime
          }
        >
          <WorkflowTime value={row.confirmedStartsAt} locale={props.locale} /> —{" "}
          <WorkflowTime value={row.confirmedEndsAt} locale={props.locale} />
          {row.accessNotes ? <p className="whitespace-pre-wrap">{row.accessNotes}</p> : null}
          <p>{c.calendarNote}</p>
          <a className={workflowLink} href={`${path}/calendar`} download>
            {c.download}
          </a>
        </WorkflowSection>
      ) : null}
      {row.proposedStartsAt ? (
        <WorkflowSection title={c.proposedTime}>
          <WorkflowTime value={row.proposedStartsAt} locale={props.locale} /> —{" "}
          <WorkflowTime value={row.proposedEndsAt} locale={props.locale} />
        </WorkflowSection>
      ) : null}
      {staff && detail.canAcceptHost ? (
        <WorkflowSection title={hostCopy.title}>
          <p>{hostCopy.lead}</p>
          {detail.reservedInterval ? (
            <p>
              {hostCopy.reserved}:{" "}
              <WorkflowTime value={detail.reservedInterval.startsAt} locale={props.locale} /> —{" "}
              <WorkflowTime value={detail.reservedInterval.endsAt} locale={props.locale} />
            </p>
          ) : null}
          <BoundWorkflowForm
            {...props}
            command="appointmentHost"
            id={row.id}
            revision={row.version}
            path={path}
            fields={[
              { name: "reason", label: hostCopy.reason, type: "textarea", required: true },
              {
                name: "propertyAccessConfirmed",
                label: c.access,
                type: "checkbox",
                required: true,
              },
              {
                name: "externalBusyChecked",
                label: hostCopy.external,
                type: "checkbox",
                required: true,
              },
              { name: "reviewed", label: hostCopy.reviewed, type: "checkbox", required: true },
            ]}
            submit={hostCopy.submit}
          />
        </WorkflowSection>
      ) : null}
      {canArrange ? (
        <WorkflowSection title={c.arrangement}>
          <p>{c.policyNote}</p>
          <BoundWorkflowForm
            {...props}
            command="arrange"
            id={row.id}
            revision={row.version}
            path={path}
            fields={[
              {
                name: "action",
                label: c.action,
                type: "select",
                options: [
                  ...(row.state !== "proposed" ? [{ value: "propose", label: c.propose }] : []),
                  { value: "confirm", label: c.confirm },
                ],
              },
              { name: "startsAt", label: c.start, hint: c.offsetHint, required: true },
              { name: "endsAt", label: c.end, hint: c.offsetHint, required: true },
              { name: "bufferMinutes", label: c.buffer, type: "number", required: true },
              { name: "propertyAccessConfirmed", label: c.access, type: "checkbox" },
              { name: "externalBusyChecked", label: c.external, type: "checkbox" },
              { name: "accessNotes", label: c.logistics, type: "textarea" },
            ]}
            values={{
              action: row.state === "proposed" ? "confirm" : "propose",
              bufferMinutes: "30",
            }}
            submit={c.change}
          />
        </WorkflowSection>
      ) : null}
      {detail.canRespond && targets.length ? (
        <WorkflowSection title={c.change}>
          <BoundWorkflowForm
            {...props}
            command="appointment"
            id={row.id}
            revision={row.version}
            path={path}
            fields={[
              {
                name: "state",
                label: c.action,
                type: "select",
                options: targets.map((value) => ({
                  value,
                  label:
                    value === "reschedule_requested"
                      ? c.reschedule
                      : value === "cancelled"
                        ? c.cancel
                        : value === "completed"
                          ? c.complete
                          : value === "no_show"
                            ? c.noShow
                            : c.decline,
                })),
              },
              { name: "reason", label: c.reason, type: "textarea", required: true },
            ]}
            values={{ state: targets[0] ?? "" }}
            submit={c.change}
          />
        </WorkflowSection>
      ) : null}
      {row.cancelReason || row.outcomeNote ? <p>{row.cancelReason ?? row.outcomeNote}</p> : null}
    </WorkflowPage>
  );
}
