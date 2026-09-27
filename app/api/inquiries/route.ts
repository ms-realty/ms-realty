// P11 inquiry intake (architecture §6.1, §19.3 "Public submission"; F06; AT10, AT11, AT13).
//
// GET issues a logical submission key for an enhanced form and makes sure the browser holds a
// receipt session. POST receives one inquiry: JSON from the enhanced client (201, or 200 for a
// reconciled retry, with the receipt), or an ordinary form post without JavaScript, answered
// with POST/Redirect/GET to the receipt page P12. No contact detail or free text ever enters a
// URL; a failed form post redirects back with the submission key and a §5.1 error code only.

import { getDb } from "@/db/client";
import { isPublicLocale, sourceLocale } from "@/domain/ids";
import { readCookie } from "@/server/auth/cookies";
import { getEnv } from "@/server/config/env";
import { AppError, isAppError, wireCode } from "@/server/errors";
import {
  assertSameOrigin,
  clientIpFrom,
  correlationIdFrom,
  errorResponse,
} from "@/server/http/request";
import {
  isIssuedSubmissionKey,
  issueSubmissionKey,
  newReceiptSession,
  receiptCookieName,
  receiptSetCookie,
  submitInquiry,
  validReceiptSession,
} from "@/server/inquiries/intake";

const maxBodyBytes = 16_384;

function receiptSession(request: Request) {
  const env = getEnv();
  const existing = validReceiptSession(
    readCookie(request.headers.get("cookie"), receiptCookieName(env)),
  );
  return { token: existing ?? newReceiptSession(), isNew: existing === null };
}

function responseHeaders(correlationId: string, session: { token: string; isNew: boolean }) {
  const headers = new Headers({ "cache-control": "no-store", "x-correlation-id": correlationId });
  if (session.isNew) headers.append("set-cookie", receiptSetCookie(getEnv(), session.token));
  return headers;
}

export function GET(request: Request): Response {
  const correlationId = correlationIdFrom(request.headers);
  const session = receiptSession(request);
  return Response.json(
    { submissionKey: issueSubmissionKey() },
    { headers: responseHeaders(correlationId, session) },
  );
}

/** The fields of the server-rendered form, in the shape the JSON client sends. */
function formInput(form: URLSearchParams): Record<string, unknown> {
  const field = (name: string) => form.get(name) ?? undefined;
  const checked = (name: string) => ["on", "true", "1"].includes(form.get(name) ?? "");
  return {
    submissionKey: field("submissionKey"),
    purpose: field("purpose"),
    locale: field("locale"),
    name: field("name"),
    contact: { kind: field("contactKind"), value: field("contactValue") },
    message: field("message"),
    listingReference: field("listingReference"),
    callbackWindow: field("callbackWindow"),
    privacyNotice: checked("privacyNotice"),
    marketingOptIn: checked("marketingOptIn"),
    website: field("website"),
  };
}

function seeOther(path: string, headers: Headers): Response {
  headers.set("location", new URL(path, getEnv().hosts.public).toString());
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request): Promise<Response> {
  const correlationId = correlationIdFrom(request.headers);
  const isForm = (request.headers.get("content-type") ?? "").startsWith(
    "application/x-www-form-urlencoded",
  );
  let input: Record<string, unknown> = {};
  const session = receiptSession(request);
  try {
    assertSameOrigin(request.headers, getEnv().hosts.public);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > maxBodyBytes) {
      throw new AppError("validation_failed", { fieldErrors: { form: ["too_large"] } });
    }
    if (isForm) {
      input = formInput(new URLSearchParams(raw));
    } else {
      try {
        input = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new AppError("validation_failed", { fieldErrors: { form: ["invalid_json"] } });
      }
    }
    const result = await submitInquiry(getDb(), input, {
      ip: clientIpFrom(request.headers),
      receiptSession: session.token,
      correlationId,
    });
    const headers = responseHeaders(correlationId, session);
    if (isForm) {
      const { locale, receiptId } = result.receipt;
      return seeOther(`/${locale}/requests/${receiptId}`, headers);
    }
    return Response.json(
      { receipt: result.receipt, operationId: result.operationId },
      { status: result.replayed ? 200 : 201, headers },
    );
  } catch (error) {
    if (!isForm) return errorResponse(error, correlationId);
    if (!isAppError(error)) console.error(`[${correlationId}] unhandled error`, error);
    // Never a receipt-looking page: back to the form with the same logical key, so a retry
    // stays the same submission, and the outcome code (e.g. OUTCOME_UNKNOWN) only.
    const locale =
      typeof input.locale === "string" && isPublicLocale(input.locale)
        ? input.locale
        : sourceLocale;
    const key =
      typeof input.submissionKey === "string" && isIssuedSubmissionKey(input.submissionKey)
        ? input.submissionKey
        : issueSubmissionKey();
    const code = isAppError(error) ? wireCode(error.code) : wireCode("internal_error");
    const query = new URLSearchParams({ submission: key, error: code });
    return seeOther(`/${locale}/inquire?${query}`, responseHeaders(correlationId, session));
  }
}
