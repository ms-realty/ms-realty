// O03L/O03LR (Figma 20:1055 / 25:2228, 20:1175 / 25:2279): one route reviews the link to an
// existing Case (`?case=`) and shows the actor's own recorded result or status (`?key=`).
export type InquiryLinkValues = { caseId: string; expectedCaseVersion: string };

export const inquiryLinkFields = ["caseId", "expectedCaseVersion"] as const;

/** Signed form scope for the operation key; the server command still checks every version. */
export const inquiryLinkScope = (inquiryId: string) => `case.link_inquiry.${inquiryId}`;

export function inquiryLinkHref(
  locale: string,
  inquiryId: string,
  target: { caseId: string } | { key: string },
) {
  const query =
    "caseId" in target
      ? `case=${encodeURIComponent(target.caseId)}`
      : `key=${encodeURIComponent(target.key)}`;
  return `/${locale}/inquiries/${inquiryId}/link?${query}`;
}
