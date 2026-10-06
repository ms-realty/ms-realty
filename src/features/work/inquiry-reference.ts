import type { InquiryDraftKind } from "./inquiry-draft-storage";
import type { InboxScope } from "./inquiry-row";

/** An opaque operation reference only; the name fences actor, auth session, record and kind. */
export function inquiryReferenceCookie(ownerId: string, id: string, kind: InquiryDraftKind) {
  return `msr_inquiry_${ownerId}_${id}_${kind}`;
}

export function browserInquiryReference(name: string) {
  try {
    const value = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return parseInquiryReference(value ? decodeURIComponent(value) : undefined);
  } catch {
    return null;
  }
}

export function isInquiryDraftKind(value: unknown): value is InquiryDraftKind {
  return value === "accept" || value === "contact" || value === "triage";
}

export function inquiryOperationType(kind: InquiryDraftKind) {
  return `work.inquiry.${kind}` as const;
}

/** A claimed terminal state is advisory; the server must read the actor's actual receipt. */
export function parseInquiryReference(
  value: string | undefined,
): { status: "pending" | "succeeded" | "failed"; key: string } | null {
  if (!value) return null;
  const parts = value.includes(":") ? value.split(":") : ["pending", value];
  const [status, key] = parts;
  if (
    parts.length !== 2 ||
    (status !== "pending" && status !== "succeeded" && status !== "failed") ||
    !key ||
    !/^[A-Za-z0-9_-]{43}\.[0-9a-f]{32}$/.test(key)
  )
    return null;
  return { status, key };
}

export function inquiryStatusHref(
  locale: string,
  id: string,
  kind: InquiryDraftKind,
  key: string,
  scope: InboxScope = "all",
  page = 1,
) {
  return `/${locale}/inquiries/${id}/operations?type=${kind}&key=${encodeURIComponent(key)}&view=${scope}${page > 1 ? `&page=${page}` : ""}`;
}
