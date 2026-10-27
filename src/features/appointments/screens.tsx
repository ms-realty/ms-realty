import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import { appointmentMachine } from "@/domain/appointment";
import { isPublicLocale } from "@/i18n/config";
import { workflowCopy } from "@/i18n/workflow-copy";
import { type CalendarData, readCalendar } from "@/server/appointments/calendar";
import { listAppointments, readAppointment } from "@/server/appointments/service";
import { isAppError } from "@/server/errors";
import { Notice } from "@/ui/notice";
import { agencyCopy } from "../agency-obligations/copy";
import { workflowScope } from "../cases/contract";
import { caseCopy } from "../cases/copy";
import { caseEmailCopy } from "../cases/email-copy";
import {
  AppointmentList,
  BoundWorkflowForm,
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  WorkflowTimeRange,
  workflowLink,
} from "../cases/screens";
import { StaffPage } from "../shell/staff-ui";
import { ContactActions } from "../work/contact-actions";
import { coverageCopy } from "../work/coverage-copy";
import { privateRead } from "../work/screens";
import { staffWorkflowCopy } from "../work/workflow-completion-copy";
import calendarStyles from "./calendar.module.css";
import { type CalendarSearch, parseCalendarQuery } from "./calendar-period";
import { CalendarView } from "./calendar-view";
import { hostHandoverCopy } from "./host-copy";
import { AppointmentListingContext } from "./listing-context";
/** The client journey retains its relationship-scoped list in every public locale. */
export async function ClientCalendarScreen(props: ScreenProps) {
  const c = caseCopy(props.locale);
  const rows = await privateRead(() => listAppointments(getDb(), props.session));
  return (
    <WorkflowPage {...props} title={c.calendar}>
      <p>{c.requestNote}</p>
      <p>{c.calendarBounded}</p>
      <AppointmentList {...props} rows={rows} />
    </WorkflowPage>
  );
}

export async function CalendarScreen(props: ScreenProps & { search?: CalendarSearch }) {
  const c = caseCopy(props.locale);
  const { query, adjusted } = parseCalendarQuery(props.search);
  let data: CalendarData | null = null;
  try {
    data = await privateRead(() => readCalendar(getDb(), props.session, query));
  } catch (error) {
    // Preserve authentication/access routing. Read failures keep the user's filters and never
    // become a reassuring empty calendar or an availability result.
    unstable_rethrow(error);
    if (
      isAppError(error) &&
      ["unauthenticated", "forbidden", "not_found", "step_up_required"].includes(error.code)
    )
      throw error;
    console.error(
      "[O08] calendar unavailable:",
      isAppError(error) ? error.code : error instanceof Error ? error.name : typeof error,
    );
  }
  return (
    <StaffPage title={c.calendar} className={calendarStyles.pageLayout}>
      <CalendarView locale={props.locale} query={query} data={data} adjusted={adjusted} />
    </StaffPage>
  );
}
function SecondaryAppointmentTask({
  folded,
  title,
  children,
}: {
  folded: boolean;
  title: string;
  children: ReactNode;
}) {
  return folded ? children : <WorkflowSection title={title}>{children}</WorkflowSection>;
}
export async function AppointmentScreen(props: ScreenProps & { id: string }) {
  const locale = isPublicLocale(props.locale) ? props.locale : "bg";
  const detail = await privateRead(() => readAppointment(getDb(), props.session, props.id, locale));
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
  const photography = row.purpose === "photography",
    photoCopy = agencyCopy(props.locale);
  // Keep the exact form hook mounted after a native confirmation removes eligibility.
  // ActionForm hides a fresh unavailable form while restoring its recorded response.
  const arrangement =
    canArrange || photography ? (
      <section
        className={
          canArrange ? "space-y-4 rounded-card border border-border bg-surface p-5" : undefined
        }
      >
        <BoundWorkflowForm
          {...props}
          command="arrange"
          id={row.id}
          revision={row.version}
          path={path}
          commandAvailable={canArrange}
          intro={
            <>
              <h2 className="text-subheading font-semibold">
                {photography ? photoCopy.arrangePhoto : c.arrangement}
              </h2>
              <p>{photography ? photoCopy.photoArrangeHint : c.policyNote}</p>
            </>
          }
          fields={[
            {
              name: "action",
              label: c.action,
              type: "select",
              required: true,
              options: [
                { value: "", label: c.action },
                ...(row.state !== "proposed" ? [{ value: "propose", label: c.propose }] : []),
                { value: "confirm", label: c.confirm },
              ],
            },
            { name: "startsAt", label: c.start, type: "datetime-local", required: true },
            { name: "endsAt", label: c.end, type: "datetime-local", required: true },
            { name: "bufferMinutes", label: c.buffer, type: "number", required: true },
            { name: "propertyAccessConfirmed", label: c.access, type: "checkbox" },
            { name: "externalBusyChecked", label: c.external, type: "checkbox" },
            { name: "accessNotes", label: c.logistics, type: "textarea" },
          ]}
          values={{
            action: "",
            bufferMinutes: "30",
          }}
          submit={c.change}
        />
      </section>
    ) : null;
  return (
    <WorkflowPage
      {...props}
      title={row.purpose === "photography" ? agencyCopy(props.locale).photo : c.appointmentTitle}
      reference={row.reference}
    >
      {photography ? (
        <div className="space-y-3 text-dense">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p data-testid="appointment-state" className="font-semibold">
              {c[row.state]}
            </p>
            <p>
              {c.owned}: {row.hostName ?? "—"}
            </p>
          </div>
          {detail.propertyWork ? (
            <p>
              <a
                className={workflowLink}
                href={`/${props.locale}/inventory/${detail.propertyWork.listingReference}`}
              >
                {detail.propertyWork.propertyReference} · {detail.propertyWork.listingReference}
              </a>
            </p>
          ) : null}
          <p className="text-text-muted">{photoCopy.photoBoundary}</p>
          {windows.success && windows.data.length ? (
            <p>
              {c.preferredWindow}: {windows.data.map((window) => window.text).join(" · ")}
            </p>
          ) : null}
          {row.photographyScope ? (
            <details>
              <summary className="min-h-control cursor-pointer py-2 font-semibold text-action">
                {photoCopy.fields.photographyScope}
              </summary>
              <p>{photoCopy.photoLead}</p>
              <p className="mt-2 whitespace-pre-wrap">{row.photographyScope}</p>
            </details>
          ) : null}
        </div>
      ) : (
        <p data-testid="appointment-state" className="font-semibold">
          {c[row.state]}
        </p>
      )}
      {row.confirmedStartsAt ? (
        <WorkflowSection
          title={
            ["cancelled", "completed", "no_show"].includes(row.state)
              ? c.previousTime
              : c.confirmedTime
          }
        >
          <WorkflowTimeRange
            start={row.confirmedStartsAt}
            end={row.confirmedEndsAt}
            locale={props.locale}
            zoneLabel={props.session.account.kind === "client"}
          />
          {row.accessNotes ? <p className="whitespace-pre-wrap">{row.accessNotes}</p> : null}
          <p>{c.calendarNote}</p>
          {detail.canDownload ? (
            <a className={workflowLink} href={`${path}/calendar`} download>
              {c.download}
            </a>
          ) : null}
        </WorkflowSection>
      ) : null}
      {staff && detail.staffContext ? (
        <section className="space-y-3">
          {detail.staffContext.contacts.length ? (
            <>
              <h2 className="text-subheading font-semibold">
                {staffWorkflowCopy(props.locale).contacts}
              </h2>
              {[...new Set(detail.staffContext.contacts.map((contact) => contact.partyId))].map(
                (partyId) => (
                  <div key={partyId} className="space-y-2">
                    <p className="font-semibold">
                      {
                        detail.staffContext?.contacts.find((contact) => contact.partyId === partyId)
                          ?.name
                      }
                    </p>
                    <ContactActions
                      locale={props.locale}
                      methods={
                        detail.staffContext?.contacts.filter(
                          (contact) => contact.partyId === partyId,
                        ) ?? []
                      }
                    />
                  </div>
                ),
              )}
            </>
          ) : null}
          {detail.staffContext.location ? (
            <>
              <p>
                <bdi>{detail.staffContext.location.address}</bdi>
              </p>
              <a
                className="inline-flex min-h-control items-center rounded-control border border-border px-3 py-2 font-semibold text-link"
                href={`https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: detail.staffContext.location.address })}`}
                target="_blank"
                rel="noreferrer"
              >
                {staffWorkflowCopy(props.locale).openMap}
              </a>
            </>
          ) : null}
        </section>
      ) : null}
      {row.proposedStartsAt &&
      ["proposed", "reschedule_requested"].includes(row.state) &&
      (row.proposedStartsAt.getTime() !== row.confirmedStartsAt?.getTime() ||
        row.proposedEndsAt?.getTime() !== row.confirmedEndsAt?.getTime()) ? (
        <WorkflowSection title={c.proposedTime}>
          <WorkflowTimeRange
            start={row.proposedStartsAt}
            end={row.proposedEndsAt}
            locale={props.locale}
            zoneLabel={props.session.account.kind === "client"}
          />
        </WorkflowSection>
      ) : null}
      <AppointmentListingContext listing={detail.listing} locale={locale} />
      {staff && detail.needsCoverage ? (
        <Notice tone="warning">
          <a href={`/${props.locale}/coverage`} className={workflowLink}>
            {coverageCopy(props.locale).appointments}
          </a>
          <p>{coverageCopy(props.locale).appointmentNote}</p>
        </Notice>
      ) : null}
      {!photography ? (
        <p>
          {c.owned}: {row.hostName ?? "—"}
        </p>
      ) : null}

      {row.caseId ? (
        <nav
          className="flex flex-wrap gap-4"
          aria-label={workflowCopy(props.locale, "viewing").links}
        >
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
      {!photography && windows.success && windows.data.length ? (
        <WorkflowSection title={c.preferredWindow}>
          <ul>
            {windows.data.map((window) => (
              <li key={window.text}>{window.text}</li>
            ))}
          </ul>
        </WorkflowSection>
      ) : null}
      {photography ? arrangement : null}
      {staff && detail.hostOffer ? (
        <SecondaryAppointmentTask folded={photography} title={hostCopy.pending}>
          {detail.canWithdrawHost ? (
            <BoundWorkflowForm
              {...props}
              command="appointmentHostHandover"
              nativeIdentity={`${workflowScope("appointmentHostHandover", row.id)}:cancel`}
              id={row.id}
              revision={row.version}
              path={path}
              disclosure={photography ? hostCopy.pending : undefined}
              intro={
                <>
                  <p>{detail.hostOffer.name}</p>
                  <p className="whitespace-pre-wrap">{detail.hostOffer.note}</p>
                  {!detail.hostOffer.current ? (
                    <Notice tone="warning">{hostCopy.stale}</Notice>
                  ) : null}
                </>
              }
              values={{ action: "cancel" }}
              fields={[
                { name: "action", label: "", type: "hidden" },
                { name: "reason", label: hostCopy.reason, type: "textarea", required: true },
                {
                  name: "reviewed",
                  label: hostCopy.withdrawReviewed,
                  type: "checkbox",
                  required: true,
                },
              ]}
              submit={hostCopy.withdraw}
            />
          ) : (
            <div className="space-y-4">
              <p>{detail.hostOffer.name}</p>
              <p className="whitespace-pre-wrap">{detail.hostOffer.note}</p>
              {!detail.hostOffer.current ? <Notice tone="warning">{hostCopy.stale}</Notice> : null}
            </div>
          )}
        </SecondaryAppointmentTask>
      ) : null}
      {staff && detail.canOfferHost ? (
        <SecondaryAppointmentTask folded={photography} title={hostCopy.offerTitle}>
          {detail.hostReceivers.length ? (
            <BoundWorkflowForm
              {...props}
              command="appointmentHostHandover"
              nativeIdentity={`${workflowScope("appointmentHostHandover", row.id)}:request`}
              id={row.id}
              revision={row.version}
              path={path}
              disclosure={photography ? hostCopy.offerTitle : undefined}
              intro={<p>{hostCopy.offerLead}</p>}
              values={{ action: "request" }}
              fields={[
                { name: "action", label: "", type: "hidden" },
                {
                  name: "receiverId",
                  label: hostCopy.receiver,
                  type: "select",
                  required: true,
                  options: detail.hostReceivers.map((person) => ({
                    value: person.id,
                    label: person.name,
                  })),
                },
                { name: "reason", label: hostCopy.reason, type: "textarea", required: true },
                {
                  name: "reviewed",
                  label: hostCopy.offerReviewed,
                  type: "checkbox",
                  required: true,
                },
              ]}
              submit={hostCopy.offerSubmit}
            />
          ) : photography ? (
            <details className="rounded-control border border-border p-4">
              <summary className="min-h-control cursor-pointer font-semibold">
                {hostCopy.offerTitle}
              </summary>
              <p>{hostCopy.offerLead}</p>
              <Notice tone="info">{hostCopy.none}</Notice>
            </details>
          ) : (
            <>
              <p>{hostCopy.offerLead}</p>
              <Notice tone="info">{hostCopy.none}</Notice>
            </>
          )}
        </SecondaryAppointmentTask>
      ) : null}
      {staff && detail.canAcceptHost ? (
        <SecondaryAppointmentTask folded={photography} title={hostCopy.title}>
          <BoundWorkflowForm
            {...props}
            command="appointmentHost"
            id={row.id}
            revision={row.version}
            path={path}
            disclosure={photography ? hostCopy.title : undefined}
            intro={
              <>
                <p>{detail.needsCoverage ? hostCopy.lead : hostCopy.plannedLead}</p>
                {detail.reservedInterval ? (
                  <p>
                    {hostCopy.reserved}:{" "}
                    <WorkflowTimeRange
                      start={detail.reservedInterval.startsAt}
                      end={detail.reservedInterval.endsAt}
                      locale={props.locale}
                    />
                  </p>
                ) : null}
              </>
            }
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
        </SecondaryAppointmentTask>
      ) : null}
      {row.purpose !== "photography" ? arrangement : null}
      {(detail.canRespond && targets.length) || photography ? (
        <SecondaryAppointmentTask
          folded={photography}
          title={photography ? photoCopy.photoActions : c.change}
        >
          <BoundWorkflowForm
            {...props}
            command="appointment"
            id={row.id}
            revision={row.version}
            path={path}
            commandAvailable={Boolean(detail.canRespond && targets.length)}
            disclosure={photography ? photoCopy.photoActions : undefined}
            fields={[
              {
                name: "state",
                label: c.action,
                type: "select",
                required: true,
                options: [
                  { value: "", label: c.action },
                  ...targets.map((value) => ({
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
                ],
              },
              { name: "reason", label: c.reason, type: "textarea", required: true },
            ]}
            values={{ state: "" }}
            submit={c.change}
          />
        </SecondaryAppointmentTask>
      ) : null}
      {row.cancelReason || row.outcomeNote ? <p>{row.cancelReason ?? row.outcomeNote}</p> : null}
    </WorkflowPage>
  );
}
