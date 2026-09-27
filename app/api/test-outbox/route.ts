// Local browser-test receipt viewer: impossible to enable for any non-loopback origin.
import { getEnv, isLoopbackOrigin } from "@/server/config/env";
import { hostContextOf } from "@/server/http/request";
import { testOutbox } from "@/server/jobs/web";
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
  const messages = testOutbox().sent.filter((message) => templates.includes(message.template));
  return Response.json(
    { messages },
    { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
