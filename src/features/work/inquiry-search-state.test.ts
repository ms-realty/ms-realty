// O02 search input bounds match searchInquiries before any read runs.
import { describe, expect, it } from "vitest";
import { readInquirySearch } from "./inquiry-search-state";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("readInquirySearch", () => {
  it("names the problem with a blank, short or long term", () => {
    expect(readInquirySearch(form({})).problem).toBe("searchBlank");
    expect(readInquirySearch(form({ q: "   " })).problem).toBe("searchBlank");
    expect(readInquirySearch(form({ q: " a " })).problem).toBe("searchShort");
    expect(readInquirySearch(form({ q: "x".repeat(121) })).problem).toBe("searchLong");
    expect(readInquirySearch(form({ q: ` ${"x".repeat(120)} ` })).problem).toBeNull();
    expect(readInquirySearch(form({ q: " Al " }))).toEqual({ q: " Al ", page: 1, problem: null });
  });

  it("accepts only a whole page number from 1 to 10000", () => {
    expect(readInquirySearch(form({ q: "Al", page: "2" })).page).toBe(2);
    for (const page of ["0", "-1", "1.5", "two", "10001", ""])
      expect(readInquirySearch(form({ q: "Al", page })).page).toBe(1);
  });
});
