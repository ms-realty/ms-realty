import type { CaseIndexQuery } from "@/server/cases/index-query";
import { containsSearchControl } from "@/server/search/controls";

export const caseDirectoryKeys = [
  "q",
  "view",
  "purpose",
  "party",
  "partyId",
  "kind",
  "stage",
  "disposition",
  "owner",
  "nextAction",
  "actionState",
  "size",
  "cursor",
  "filter",
] as const;
type Key = (typeof caseDirectoryKeys)[number];
export type CaseDirectoryValues = Partial<Record<Key, string>>;
export type CaseDirectoryParams = Record<string, string | string[] | undefined>;
export const caseDirectorySearchLimit = 120;

/** URL values remain untrusted: queryCaseIndex validates every filter after reauthorizing. */
export function caseDirectoryState(raw: CaseDirectoryParams, staffId: string) {
  const values: CaseDirectoryValues = {};
  let shortened = false;
  for (const key of caseDirectoryKeys) {
    const field = raw[key];
    let value = Array.isArray(field) ? field[0] : field;
    if (value === undefined || value === "") continue;
    if (["q", "purpose", "party", "nextAction"].includes(key)) {
      // Do not trim or truncate away a control and turn an invalid search into All.
      if (!containsSearchControl(value)) {
        value = value.trim();
        shortened ||= value.length > caseDirectorySearchLimit;
        value = value.slice(0, caseDirectorySearchLimit);
      } else {
        // Retain the invalid criterion without allowing its control to be truncated away.
        value = "\u0000";
      }
    }
    if (value) values[key] = value;
  }
  if (values.view === "all") delete values.view;
  const input: CaseIndexQuery = {
    collection: (values.view ?? "all") as CaseIndexQuery["collection"],
    search: values.q ?? "",
    purpose: values.purpose,
    party: values.party,
    partyId: values.partyId,
    kind: values.kind as CaseIndexQuery["kind"],
    stage: values.stage as CaseIndexQuery["stage"],
    disposition: values.disposition as CaseIndexQuery["disposition"],
    ownerId: values.owner === "me" ? staffId : values.owner,
    nextAction: values.nextAction,
    nextActionState: values.actionState as CaseIndexQuery["nextActionState"],
    pageSize: values.size === undefined ? 25 : Number(values.size),
    cursor: values.cursor,
  };
  const filtered = [
    "q",
    "purpose",
    "party",
    "partyId",
    "kind",
    "stage",
    "disposition",
    "owner",
    "nextAction",
    "actionState",
  ].some((key) => Boolean(values[key as Key]));
  return { values, input, shortened, filtered };
}

/** Changing any scope/filter starts at the first page. Only the next-page link sets cursor. */
export function caseDirectoryHref(
  locale: string,
  current: CaseDirectoryValues,
  changes: CaseDirectoryValues = {},
) {
  const values = { ...current, cursor: undefined, ...changes };
  const query = new URLSearchParams();
  for (const key of caseDirectoryKeys) {
    const value = values[key];
    // Text never enters new navigation, including values read from an old q URL.
    if (["q", "purpose", "party", "nextAction"].includes(key)) continue;
    if (value && !(key === "view" && value === "all")) query.set(key, value);
  }
  return `/${locale}/cases${query.size ? `?${query}` : ""}`;
}
