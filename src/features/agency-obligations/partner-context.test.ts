import { expect, it } from "vitest";
import { partnerEntryPath } from "./partner-context";

it("carries only chooser record context through paging, selection and the native return path", () => {
  const context = {
    draft: "10000000-0000-4000-8000-000000000001",
    caseId: "10000000-0000-4000-8000-000000000002",
    partyId: "10000000-0000-4000-8000-000000000003",
    page: 3,
    returnTo: "/en/cases/10000000-0000-4000-8000-000000000002",
    termsText: "Synthetic private terms must never become navigation",
    purpose: "Synthetic private scope",
    sourceReference: "Synthetic private source",
  };
  const path = partnerEntryPath("en", context),
    url = new URL(path, "http://localhost");
  expect([...url.searchParams.keys()]).toEqual(["draft", "case", "party", "returnTo", "page"]);
  expect(url.searchParams.get("returnTo")).toBe(context.returnTo);
  expect(path).not.toContain("Synthetic");
  const next = new URL(
    partnerEntryPath("en", { ...context, partyId: undefined, page: 4 }),
    "http://localhost",
  );
  expect(next.searchParams.get("draft")).toBe(context.draft);
  expect(next.searchParams.get("case")).toBe(context.caseId);
  expect(next.searchParams.has("party")).toBe(false);
});
