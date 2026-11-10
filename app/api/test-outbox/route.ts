// Local browser-test receipt viewer: impossible to enable for any non-loopback origin.
import { getEnv, isLoopbackOrigin } from "@/server/config/env";
import { hostContextOf } from "@/server/http/request";
import { testOutbox } from "@/server/jobs/web";
import { dealNoticeTemplate } from "@/server/notifications/events";
import { renderDealNotice } from "@/server/notifications/template";

export async function GET(request: Request) {
  const env = getEnv();
  const context = hostContextOf(request.headers, env);
  if (
    !env.testOutbox ||
    !Object.values(env.hosts).every(isLoopbackOrigin) ||
    (context !== "staff" && context !== "client")
  )
    return new Response(null, { status: 404 });
  const templates =
    context === "staff"
      ? ["auth.staff_enrolment", "auth.staff_recovery"]
      : ["auth.email_link", "auth.client_invitation"];
  const messages = testOutbox()
    .sent.filter(
      (message) =>
        templates.includes(message.template) ||
        (message.template === dealNoticeTemplate &&
          (message.params.recipient as { kind?: unknown } | undefined)?.kind === context),
    )
    .map((message) =>
      message.template === dealNoticeTemplate
        ? {
            ...message,
            // What the email provider would receive, so a browser test can read the calendar file.
            rendered: renderDealNotice(message, {
              hosts: env.hosts,
              from: env.email.from ?? "Test outbox <outbox@example.test>",
            }),
          }
        : message,
    );
  return Response.json(
    { messages },
    { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
