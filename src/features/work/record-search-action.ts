"use server";
import { randomUUID } from "node:crypto";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { action } from "@/server/http/next";
import { searchWorkspace } from "@/server/work/workspace-search";
import { workCopy } from "./copy";
import { readInquirySearch, searchTermLimit } from "./inquiry-search-state";
import type { RecordSearchState } from "./record-search";

export async function recordSearchAction(
  locale: string,
  scope: "all" | "contacts",
  _previous: RecordSearchState,
  data: FormData,
): Promise<RecordSearchState> {
  const copy = workCopy(locale);
  const { q, problem } = readInquirySearch(data);
  const response = { responseId: randomUUID(), q: q.slice(0, searchTermLimit) };
  if (problem || !isStaffLocale(locale))
    return { ...response, error: problem ? copy.queue[problem] : copy.denied };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!ctx.session) throw new Error("Session required");
      return searchWorkspace(ctx.db, ctx.session, q, scope);
    },
    { requireSession: true },
  );
  return result.ok
    ? { ...response, rows: result.data }
    : { ...response, error: copy.queue.searchFailed };
}
