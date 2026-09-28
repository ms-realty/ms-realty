import "server-only";
import { getDb } from "@/db/client";
import { caseEmailWorkbench } from "@/server/cases/email";
import { emailRecipient } from "@/server/cases/email-contract";
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
        {view.recipients.length ? (
          <BoundWorkflowForm
            {...props}
            command="emailDraft"
            id={props.id}
            revision={view.record.version}
            path={path}
            submit={c.save}
            values={{ subscriptionId: view.recipients[0]?.subscriptionId ?? "" }}
            fields={[
              {
                name: "subscriptionId",
                label: c.recipient,
                type: "select",
                required: true,
                options: view.recipients.map((r) => ({
                  value: r.subscriptionId,
                  label: r.address,
                })),
              },
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
              <article key={message.id} className="space-y-4 border-t border-border py-5">
                <h3 className="font-semibold">{content?.subject ?? message.subject}</h3>
                <p>{message.state === "draft" ? c.draftState : c[message.state]}</p>
                <p>{c.channel}</p>
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
                          { name: "reviewed", label: c.reviewed, type: "checkbox", required: true },
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
    </WorkflowPage>
  );
}
