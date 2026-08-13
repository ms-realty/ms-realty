import { renderProviderWebhookResponse } from "../../../../production/lib/provider-webhooks.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  return renderProviderWebhookResponse(request, { provider: "viber" });
}
