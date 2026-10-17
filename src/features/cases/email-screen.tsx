import "server-only";
import { getDb } from "@/db/client";
import { calendarEmailFile } from "@/server/appointments/calendar-contract";
import { caseEmailWorkbench } from "@/server/cases/email";
import { emailRecipient } from "@/server/cases/email-contract";
import { readCaseInboundEmails } from "@/server/inbound/service";
import { inboundCopy } from "../inbound/copy";
import { privateRead } from "../work/screens";
import { caseCopy } from "./copy";
import { caseEmailCopy } from "./email-copy";
import {
  BoundWorkflowForm,
  type ScreenProps,
  WorkflowPage,
  WorkflowSection,
  workflowLink,
} from "./screens";

export async function CaseEmailScreen(props: ScreenProps & { id: string }) {
  const view = await privateRead(() => caseEmailWorkbench(getDb(), props.session, props.id));
  const incoming = await readCaseInboundEmails(getDb(), props.session, props.id),
    inbound = inboundCopy(props.locale);
  const c = caseEmailCopy(props.locale),
    path = `/${props.locale}/cases/${props.id}/email`;
  return (
    <WorkflowPage {...props} title={`${c.title} · ${view.record.reference}`}>
      <a className={workflowLink} href={`/${props.locale}/cases/${props.id}`}>
        {c.back}
      </a>
      {!view.enabled ? <p role="status">{c.disabled}</p> : null}
      <WorkflowSection title={c.draft}>
        <p>{c.immutable}</p>
        <p>{c.separateDrafts}</p>
        {view.documentOptions.length ? <p>{c.fileBoundary}</p> : null}
        {view.recipients.length ? (
          <BoundWorkflowForm
            {...props}
            command="emailDraft"
            id={props.id}
            revision={view.record.version}
            path={path}
            submit={c.save}
            values={{ subscriptionIds: view.recipients[0]?.subscriptionId ?? "" }}
            fields={[
              {
                name: "subscriptionIds",
                label: c.recipients,
                type: "checkbox-group",
                required: true,
                options: view.recipients.map((r) => ({
                  value: r.subscriptionId,
                  label: r.address,
                })),
              },
              {
                name: "appointmentId",
                label: c.calendar,
                type: "select",
                options: [
                  { value: "", label: c.noCalendar },
                  ...view.calendarOptions.map((a) => ({
                    value: a.id,
                    label: `${a.reference} · ${a.state === "cancelled" ? "CANCEL" : "REQUEST"} · ${new Intl.DateTimeFormat(props.locale, { timeZone: "Europe/Sofia", dateStyle: "medium", timeStyle: "short" }).format(a.confirmedStartsAt ?? new Date())} Europe/Sofia`,
                  })),
                ],
              },
              ...(view.documentOptions.length
                ? [
                    {
                      name: "documentVersionIds",
                      label: c.files,
                      type: "checkbox-group" as const,
                      options: view.documentOptions.map((file) => ({
                        value: file.versionId,
                        label: `${file.fileName} · v${file.versionNumber} · ${file.byteSize} B · ${view.recipients
                          .filter((r) => r.partyId === file.partyId)
                          .map((r) => r.address)
                          .join(", ")}`,
                      })),
                    },
                  ]
                : []),
              { name: "subject", label: c.subject, required: true },
              { name: "body", label: c.body, type: "textarea", required: true },
            ]}
          />
        ) : (
          <p>{c.noRecipients}</p>
        )}
      </WorkflowSection>
      <WorkflowSection title={c.history}>
        {view.items.length === 50 ? <p>{c.limited}</p> : null}
        {!view.items.length ? (
          <p>{c.empty}</p>
        ) : (
          view.items.map(({ message, content, reviewHash, approvedAt }) => {
            const recipient = emailRecipient.array().safeParse(message.recipients);
            return (
              <article
                key={message.id}
                data-message-id={message.id}
                className="space-y-4 border-t border-border py-5"
              >
                <h3 className="font-semibold">{content?.subject ?? message.subject}</h3>
                <p>{message.state === "draft" ? c.draftState : c[message.state]}</p>
                <p>
                  {content?.documents?.length
                    ? c.fileReview
                    : content?.calendar
                      ? `Email · appointment.ics`
                      : c.channel}
                </p>
                {content?.documents?.length ? (
                  <section aria-label={c.fileReview} className="space-y-3">
                    <h4 className="font-semibold">{c.fileReview}</h4>
                    <p>{c.fileBoundary}</p>
                    <ul className="space-y-3">
                      {content.documents.map((file) => (
                        <li key={file.versionId}>
                          <a
                            className={workflowLink}
                            href={`/api/files/private/document/${file.versionId}`}
                          >
                            {file.fileName}
                          </a>
                          <p>
                            v{file.versionNumber} · {file.byteSize} B · {file.contentType}
                          </p>
                          <p className="break-all text-compact">SHA-256: {file.sha256}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {content?.calendar ? (
                  <section aria-label={c.calendarReview} className="space-y-3">
                    <h4 className="font-semibold">
                      {c.calendarReview} · {content.calendar.reference}
                    </h4>
                    <p>
                      {content.calendar.cancelled ? "CANCEL" : "REQUEST"} ·{" "}
                      {new Intl.DateTimeFormat(props.locale, {
                        timeZone: "Europe/Sofia",
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(content.calendar.startsAt))}{" "}
                      –{" "}
                      {new Intl.DateTimeFormat(props.locale, {
                        timeZone: "Europe/Sofia",
                        timeStyle: "short",
                      }).format(new Date(content.calendar.endsAt))}{" "}
                      Europe/Sofia
                    </p>
                    <p>{c.calendarBoundary}</p>
                    <details>
                      <summary className="cursor-pointer underline">{c.calendarRaw}</summary>
                      <pre className="whitespace-pre-wrap break-all text-compact">
                        {calendarEmailFile(content.calendar, content.recipient.address)}
                      </pre>
                    </details>
                  </section>
                ) : null}
                <dl className="space-y-2 break-words">
                  <div>
                    <dt className="font-semibold">{c.recipient}</dt>
                    <dd>
                      <bdi>
                        {content?.recipient.address ??
                          (recipient.success
                            ? recipient.data.map((r) => r.address).join(", ")
                            : "—")}
                      </bdi>
                    </dd>
                  </div>
                  {content ? (
                    <>
                      <div>
                        <dt className="font-semibold">{c.from}</dt>
                        <dd>
                          <bdi>{content.from}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt className="font-semibold">{c.reply}</dt>
                        <dd>
                          <bdi>{content.replyTo}</bdi>
                        </dd>
                      </div>
                    </>
                  ) : null}
                </dl>
                <p className="whitespace-pre-wrap break-words">{content?.body ?? message.body}</p>
                {content && ((message.state === "draft" && view.enabled) || approvedAt) ? (
                  (view.canSend && reviewHash) || approvedAt ? (
                    <section aria-label={c.review}>
                      <BoundWorkflowForm
                        {...props}
                        command="emailApprove"
                        nativeIdentity={`email-approve:${message.id}`}
                        id={props.id}
                        revision={view.record.version}
                        path={path}
                        submit={c.queue}
                        receipt={
                          approvedAt
                            ? {
                                title: caseCopy(props.locale).saved,
                                reference: view.record.reference,
                                recordedAt: {
                                  dateTime: approvedAt.toISOString(),
                                  label: `${new Intl.DateTimeFormat(props.locale === "bg" ? "bg-BG" : props.locale === "ru" ? "ru-RU" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Sofia" }).format(approvedAt)} Europe/Sofia`,
                                },
                                nextStep:
                                  message.state === "draft" ? c.draftState : c[message.state],
                                destination: { href: path, label: caseCopy(props.locale).back },
                              }
                            : undefined
                        }
                        values={{
                          messageId: message.id,
                          messageVersion: String(message.version),
                          reviewHash: reviewHash ?? "",
                        }}
                        fields={[
                          { name: "messageId", label: "", type: "hidden" },
                          { name: "messageVersion", label: "", type: "hidden" },
                          { name: "reviewHash", label: "", type: "hidden" },
                          {
                            name: "reviewed",
                            label: content.documents?.length
                              ? c.fileApproval
                              : content.calendar
                                ? c.calendarQueueReview
                                : c.reviewed,
                            type: "checkbox",
                            required: true,
                          },
                        ]}
                      />
                    </section>
                  ) : (
                    <p>{c.blocked}</p>
                  )
                ) : null}
              </article>
            );
          })
        )}
      </WorkflowSection>
      <WorkflowSection title={inbound.title}>
        <p>{inbound.assigned}</p>
        {incoming.length ? (
          incoming.map((item) => (
            <article key={item.id} className="space-y-3 border-t border-border py-4">
              <h3 className="font-semibold">{item.subject}</h3>
              <p>
                {inbound.from}: <bdi>{item.sender}</bdi>
              </p>
              <p>
                {inbound.party}: {item.participant}
              </p>
              <p className="whitespace-pre-wrap break-words" dir="auto">
                {item.body}
              </p>
            </article>
          ))
        ) : (
          <p>{inbound.empty}</p>
        )}
      </WorkflowSection>
    </WorkflowPage>
  );
}
