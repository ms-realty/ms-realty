// O02 search state shared by the Server Action and its form. The term is echoed only into the
// POST response and the input value; nothing here builds a URL from it.
import type { InquiryRowView } from "./inquiry-row";

export const searchTermLimit = 120;

export type InquirySearchState = {
  responseId: string;
  /** The submitted text, so a native POST response keeps it in the input. */
  q: string;
  outcome:
    | { kind: "idle" }
    | { kind: "invalid"; message: string }
    | { kind: "failed"; message: string }
    | { kind: "results"; rows: InquiryRowView[]; page: number; hasMore: boolean };
};

export const initialInquirySearch: InquirySearchState = {
  responseId: "initial",
  q: "",
  outcome: { kind: "idle" },
};

/** Keys of copy.queue, so each problem has exactly one worded message. */
export type SearchProblem = "searchBlank" | "searchShort" | "searchLong";

/** The same bounds searchInquiries enforces: a trimmed 2–120 characters, pages 1–10000. */
export function readInquirySearch(data: FormData): {
  q: string;
  page: number;
  problem: SearchProblem | null;
} {
  const raw = data.get("q");
  const q = typeof raw === "string" ? raw : "";
  const term = q.trim();
  const requested = Number(data.get("page"));
  return {
    q,
    page: Number.isSafeInteger(requested) && requested >= 1 && requested <= 10000 ? requested : 1,
    problem: !term
      ? "searchBlank"
      : term.length < 2
        ? "searchShort"
        : term.length > searchTermLimit
          ? "searchLong"
          : null,
  };
}
