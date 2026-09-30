// P11 inquiry intake (architecture §6.1, §19.3 "Public submission"; F06; AT10, AT11, AT13).
//
// GET issues a logical submission key for an enhanced form and makes sure the browser holds a
// receipt session. POST receives one inquiry: JSON from the enhanced client (201, or 200 for a
// reconciled retry, with the receipt), or an ordinary form post without JavaScript, answered
// with POST/Redirect/GET to the receipt page P12. No contact detail or free text ever enters a
// URL; a failed form post returns only the submission key, safe public selection and a §5.1 error code.

import { getDb } from "@/db/client";
import { isPublicLocale, isUuid, parseReference, sourceLocale } from "@/domain/ids";
import { parseComparisonReferences, parseSelectedListingsJson } from "@/domain/inquiry-selection";
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
  for (const name of new Set(form.keys())) {
    if (form.getAll(name).length > 1)
      throw new AppError("validation_failed", { fieldErrors: { [name]: ["ambiguous"] } });
  }
  const field = (name: string) => form.get(name) ?? undefined;
  const rawSelection = field("selectedListings");
  const selectedListings = rawSelection ? parseSelectedListingsJson(rawSelection) : undefined;
  if (selectedListings === null)
    throw new AppError("validation_failed", { fieldErrors: { selectedListings: ["invalid"] } });
  const rawComparison = field("comparisonReferences");
  const comparisonReferences = rawComparison ? parseComparisonReferences(rawComparison) : undefined;
  if (comparisonReferences === null)
    throw new AppError("validation_failed", { fieldErrors: { comparisonReferences: ["invalid"] } });
  const checked = (name: string) => ["on", "true", "1"].includes(form.get(name) ?? "");
  return {
    submissionKey: field("submissionKey"),
    purpose: field("purpose"),
    locale: field("locale"),
    name: field("name"),
    contact: { kind: field("contactKind"), value: field("contactValue") },
    message: field("message"),
    listingReference: field("listingReference"),
    observedManifestId: field("observedManifestId"),
    selectedListings,
    comparisonReferences,
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
  let nativeFields: URLSearchParams | null = null;
  const session = receiptSession(request);
  try {
    assertSameOrigin(request.headers, getEnv().hosts.public);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > maxBodyBytes) {
      throw new AppError("validation_failed", { fieldErrors: { form: ["too_large"] } });
    }
    if (isForm) {
      // Preserve bounded recovery identity before a malformed/duplicated field can throw.
      nativeFields = new URLSearchParams(raw);
      input = formInput(nativeFields);
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
    const single = (name: string) =>
      nativeFields?.getAll(name).length === 1 ? nativeFields.get(name) : null;
    const rawLocale = single("locale");
    const locale = rawLocale && isPublicLocale(rawLocale) ? rawLocale : sourceLocale;
    const originalKey = single("submissionKey");
    const key =
      originalKey && isIssuedSubmissionKey(originalKey) ? originalKey : issueSubmissionKey();
    const headers = responseHeaders(correlationId, session);
    // An uncertain result or reused key must reconcile this same operation, never offer a
    // fresh idle form. The status page independently checks the original receipt capability.
    if (
      !isAppError(error) ||
      error.outcome === "unknown" ||
      error.code === "idempotency_key_reused" ||
      error.code === "not_found"
    ) {
      return seeOther(`/${locale}/requests/${key}`, headers);
    }
    const query = new URLSearchParams({ submission: key, error: wireCode(error.code) });
    const rawSelection = single("selectedListings");
    const selected = rawSelection ? parseSelectedListingsJson(rawSelection) : null;
    const rawComparison = single("comparisonReferences");
    const comparison = rawComparison ? parseComparisonReferences(rawComparison) : null;
    const rawReference = single("listingReference");
    const reference = rawReference ? parseReference(rawReference) : null;
    const manifest = single("observedManifestId");
    const purpose = single("purpose");
    const contextFields = [
      "selectedListings",
      "comparisonReferences",
      "listingReference",
      "observedManifestId",
      "purpose",
    ];
    const invalidContext =
      contextFields.some((name) => (nativeFields?.getAll(name).length ?? 0) > 1) ||
      Boolean(rawSelection && !selected) ||
      Boolean(rawComparison && !comparison) ||
      Boolean(selected && (rawReference || manifest || comparison || purpose !== "question")) ||
      Boolean(rawReference && reference?.kind !== "listing") ||
      Boolean(manifest && (!isUuid(manifest) || !rawReference)) ||
      Boolean(comparison && (!reference || !comparison.includes(reference.reference))) ||
      Object.keys(error.fieldErrors ?? {}).some((name) =>
        contextFields.some((field) => name === field || name.startsWith(`${field}.`)),
      );
    if (selected) query.set("selection", JSON.stringify(selected));
    if (comparison) query.set("comparisonReferences", comparison.join(","));
    if (reference?.kind === "listing") query.set("reference", reference.reference);
    if (manifest && isUuid(manifest)) query.set("manifest", manifest);
    if (
      purpose &&
      [
        "question",
        "callback",
        "seller_consultation",
        "landlord_consultation",
        "viewing_request",
      ].includes(purpose)
    )
      query.set("purpose", purpose);
    // Do not repair an ambiguous request into a different valid intent on the visitor's behalf.
    if (invalidContext) query.set("context", "invalid");
    return seeOther(`/${locale}/inquire?${query}`, headers);
  }
}
