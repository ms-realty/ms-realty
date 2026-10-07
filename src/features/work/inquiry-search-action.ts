"use server";

import { randomUUID } from "node:crypto";
import { isStaffLocale } from "@/i18n/config";
import { requireAuthHost } from "@/server/auth/pages";
import { AppError } from "@/server/errors";
import { action } from "@/server/http/next";
import { searchInquiries } from "@/server/work/queries";
import { workCopy } from "./copy";
import { inquiryRowView } from "./inquiry-row-view";
import {
  type InquirySearchState,
  readInquirySearch,
  searchTermLimit,
} from "./inquiry-search-state";

/**
 * O02 search over the existing searchInquiries read. The personal term arrives in this POST
 * body only; the response carries worded rows and never a URL or redirect that contains it.
 */
export async function searchInquiriesAction(
  locale: string,
  _previous: InquirySearchState,
  data: FormData,
): Promise<InquirySearchState> {
  const copy = workCopy(locale);
  const { q, page, problem } = readInquirySearch(data);
  const response = { responseId: randomUUID(), q: q.slice(0, searchTermLimit) };
  if (problem) return { ...response, outcome: { kind: "invalid", message: copy.queue[problem] } };
  const result = await action(
    async (ctx) => {
      await requireAuthHost("staff");
      if (!isStaffLocale(locale)) throw new AppError("not_found");
      if (!ctx.session) throw new AppError("unauthenticated");
      return searchInquiries(ctx.db, ctx.session, q, page);
    },
    { requireSession: true },
  );
  if (!result.ok)
    return {
      ...response,
      outcome: {
        kind: "failed",
        message:
          result.error.code === "UNAUTHENTICATED"
            ? copy.sessionEnded
            : result.error.code === "NOT_AUTHORIZED" || result.error.code === "NOT_FOUND"
              ? copy.denied
              : copy.queue.searchFailed,
      },
    };
  const now = new Date();
  return {
    ...response,
    outcome: {
      kind: "results",
      rows: result.data.rows.map((row) => inquiryRowView(row, locale, now)),
      page,
      hasMore: result.data.hasMore,
    },
  };
}
