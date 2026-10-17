import { getDb } from "@/db/client";
import { AppError } from "@/server/errors";
import { correlationIdFrom, errorResponse } from "@/server/http/request";
import { receiveResendWebhook } from "@/server/jobs/resend-inbox";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request.headers);
  try {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new AppError("unavailable");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("validation_failed");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 128 * 1024) {
          await reader.cancel();
          throw new AppError("validation_failed");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
    const result = await receiveResendWebhook(getDb(), raw, request.headers, secret);
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "private, no-store", "X-Correlation-Id": correlationId },
    });
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
