// P12 receipt reconciliation (architecture §6.1; AT10, AT11). Answers whether this browser's
// submission was accepted: acceptance state, reference and time only, never the contact details
// or message. It needs the receipt-session cookie that submitted it; a key or public reference
// alone gets the same not-found as a submission that never arrived.
import { getDb } from "@/db/client";
import { readCookie } from "@/server/auth/cookies";
import { getEnv } from "@/server/config/env";
import { correlationIdFrom, errorResponse } from "@/server/http/request";
import {
  readInquiryReceipt,
  receiptCookieName,
  validReceiptSession,
} from "@/server/inquiries/intake";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ submission: string }> },
): Promise<Response> {
  const correlationId = correlationIdFrom(request.headers);
  try {
    const { submission } = await params;
    const receiptSession = validReceiptSession(
      readCookie(request.headers.get("cookie"), receiptCookieName(getEnv())),
    );
    const receipt = await readInquiryReceipt(getDb(), {
      submissionKey: decodeURIComponent(submission),
      receiptSession,
    });
    return Response.json(
      { receipt },
      { headers: { "cache-control": "no-store", "x-correlation-id": correlationId } },
    );
  } catch (error) {
    return errorResponse(error, correlationId);
  }
}
