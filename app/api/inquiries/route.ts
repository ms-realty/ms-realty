// P11 inquiry submission (spec F06, §19.2, §19.4, A16-A19). POST a JSON inquiry with a
// client-generated operationId; 201 returns the receipt, 200 the same receipt for a retry of
// that submission, errors the §19.2 error body. Resending the same body with the same id is
// how a timed-out submission is reconciled.
import { getEnv } from "@/server/config/env";
import { AppError } from "@/server/errors";
import { route } from "@/server/http/next";
import { assertSameOrigin, clientIpFrom } from "@/server/http/request";
import { submitInquiry } from "@/server/inquiries/intake";

const maxBodyBytes = 16_384;

export const POST = route(async (request, ctx) => {
  assertSameOrigin(request.headers, getEnv().appOrigin);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBodyBytes) {
    throw new AppError("validation_failed", { fieldErrors: { form: ["too_large"] } });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AppError("validation_failed", { fieldErrors: { form: ["invalid_json"] } });
  }
  const receipt = await submitInquiry(ctx.db, body, {
    ip: clientIpFrom(request.headers),
    correlationId: ctx.correlationId,
  });
  return Response.json(
    { receipt },
    { status: receipt.replayed ? 200 : 201, headers: { "cache-control": "no-store" } },
  );
});
