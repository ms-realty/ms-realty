/** Entry navigation carries record context only, never a supplied terms draft. */
export type PartnerEntryContext = {
  draft?: string;
  caseId?: string;
  partyId?: string;
  returnTo?: string;
  page?: number;
};
export function partnerEntryPath(locale: string, context: PartnerEntryContext, id = "new") {
  const query = new URLSearchParams();
  if (context.draft) query.set("draft", context.draft);
  if (context.caseId) query.set("case", context.caseId);
  if (context.partyId) query.set("party", context.partyId);
  if (context.returnTo) query.set("returnTo", context.returnTo);
  if (context.page && context.page > 1) query.set("page", String(context.page));
  return `/${locale}/operations/agency/partners/${id}${query.size ? `?${query}` : ""}`;
}
