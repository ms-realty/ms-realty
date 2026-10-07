// O03 / O03L candidate wording (Figma 18:732, 20:1055). C02's projection is the only source of
// a refusal reason and a match basis; the browser suite covers the real queries and grants.
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/server/auth/sessions";
import type {
  InquiryCaseBlockReason,
  listInquiryCaseCandidates,
} from "@/server/cases/inquiry-link";
import { InquiryCaseLink, InquiryLinkScreen } from "./inquiry-link";
import { inquiryLinkCopy } from "./inquiry-link-copy";

const mocked = vi.hoisted(() => ({ candidates: vi.fn(), read: vi.fn() }));
vi.mock("@/db/client", () => ({
  getDb: () => ({
    transaction: (run: (tx: unknown) => unknown) => run({ execute: async () => undefined }),
  }),
}));
vi.mock("@/server/cases/queries", () => ({ listInquiryCaseCandidates: mocked.candidates }));
vi.mock("@/server/work/queries", () => ({ readInquiry: mocked.read }));
vi.mock("@/server/operations", () => ({ findOperation: vi.fn() }));
vi.mock("./inquiry-link-actions", () => ({ linkInquiryAction: vi.fn() }));
vi.mock("@/ui/form/server", () => ({
  isIssuedFormOperation: () => true,
  initialFormState: (_scope: string, values: unknown, expectedRevision: number) => ({
    operationId: "operation-one",
    responseId: "render-one",
    expectedRevision,
    values,
    outcome: { kind: "idle" },
  }),
}));

type Detail = Parameters<typeof InquiryCaseLink>[0]["detail"];
type Candidate = Awaited<ReturnType<typeof listInquiryCaseCandidates>>[number];

const session = { account: { kind: "staff", id: "staff-one" } } as Session;
const inquiryId = "inquiry-one";
// Owned, linkable and with no visible task: nothing here could explain a refusal by itself.
const detail = {
  inquiry: {
    id: inquiryId,
    reference: "RQ-ONE",
    state: "assigned",
    version: 3,
    ownerId: "staff-one",
    partyId: "party-one",
    caseId: null,
  },
  tasks: [],
  canRespond: true,
  canCreateCase: false,
} as unknown as Detail;

// Typed as C02's own row, so a contract change fails here before it reaches the browser suite.
const candidate = (id: string, patch: Partial<Candidate> = {}): Candidate => ({
  id,
  reference: `CS-${id}`,
  version: 2,
  title: `Synthetic case ${id}`,
  kind: "buyer",
  stage: "needs_agreed",
  matchBasis: "contact_route",
  partyLabel: null,
  canLink: true,
  blockReason: null,
  ...patch,
});
const blocked = (id: string, blockReason: InquiryCaseBlockReason, patch: Partial<Candidate> = {}) =>
  candidate(id, { canLink: false, blockReason, ...patch });

async function renderSection(rows: Candidate[], locale = "bg") {
  mocked.candidates.mockResolvedValue(rows);
  render(await InquiryCaseLink({ locale, session, detail }));
  return (id: string) => {
    const row = document.querySelector<HTMLElement>(`[data-case-candidate="${id}"]`);
    if (!row) throw new Error(`Missing candidate ${id}`);
    return row;
  };
}

afterEach(cleanup);

describe("O03 Case candidates", () => {
  const copy = inquiryLinkCopy("bg");

  it("words each Case from C02's own reason, never from the tasks or guards it can see", async () => {
    const row = await renderSection([
      blocked("a", "task_case_conflict"),
      blocked("b", "case_permission"),
      blocked("c", "task_permission"),
      candidate("d"),
    ]);
    for (const [id, reason] of [
      ["a", copy.reasons.task_case_conflict],
      ["b", copy.reasons.case_permission],
      ["c", copy.reasons.task_permission],
    ] as const) {
      expect(row(id)).toHaveTextContent(`${copy.notLinkable} · ${reason}`);
      expect(within(row(id)).queryByRole("link")).not.toBeInTheDocument();
    }
    expect(within(row("d")).getByRole("link")).toHaveAttribute(
      "href",
      `/bg/inquiries/${inquiryId}/link?case=d`,
    );
    expect(row("d")).not.toHaveTextContent(copy.notLinkable);
  });

  it.each(["inquiry_owner", "inquiry_state", "inquiry_permission", "staff_unavailable"] as const)(
    "says the inquiry-wide %s reason once above the candidates",
    async (reason) => {
      const row = await renderSection([blocked("a", reason), blocked("b", reason)]);
      expect(screen.getAllByText(copy.reasons[reason])).toHaveLength(1);
      for (const id of ["a", "b"]) {
        expect(row(id)).toHaveTextContent(copy.notLinkable);
        expect(row(id)).not.toHaveTextContent(copy.reasons[reason]);
      }
    },
  );

  it("names the Party only for an exact same-Party match", async () => {
    const row = await renderSection([
      candidate("party", { matchBasis: "party", partyLabel: "Synthetic Party" }),
      candidate("unnamed", { matchBasis: "party" }),
      // Never sent by C02; a contact route must still name no one.
      candidate("route", { partyLabel: "Synthetic Leak" }),
    ]);
    expect(row("party")).toHaveTextContent("Същата страна: Synthetic Party");
    expect(within(row("party")).getByText("Synthetic Party").tagName).toBe("BDI");
    expect(row("unnamed")).toHaveTextContent(copy.basisPartyUnnamed);
    expect(row("route")).toHaveTextContent(copy.basisContact);
    expect(row("route")).not.toHaveTextContent("Synthetic Leak");
  });
});

describe("O03L review", () => {
  it("shows C02's basis and refusal instead of the link form", async () => {
    const copy = inquiryLinkCopy("en");
    mocked.read.mockResolvedValue(detail);
    mocked.candidates.mockResolvedValue([
      blocked("case-one", "staff_unavailable", {
        matchBasis: "party",
        partyLabel: "Synthetic Party",
      }),
    ]);
    render(await InquiryLinkScreen({ locale: "en", session, inquiryId, caseId: "case-one" }));
    expect(screen.getByText(copy.factBasis).nextElementSibling).toHaveTextContent(
      "Same party: Synthetic Party",
    );
    expect(screen.getByText(copy.reasons.staff_unavailable)).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.submit })).not.toBeInTheDocument();
  });
});

it.each(["bg", "en", "ru"])(
  "%s words every C02 reason apart and keeps the neutral one taskless",
  (locale) => {
    const { reasons, basisParty, basisContact } = inquiryLinkCopy(locale);
    const texts = Object.values(reasons);
    expect(texts.every(Boolean)).toBe(true);
    expect(new Set(texts).size).toBe(texts.length);
    // inquiry_permission also covers a task the viewer cannot see.
    expect(reasons.inquiry_permission).not.toMatch(/task|задач/i);
    expect(basisParty).toContain("{party}");
    expect(basisContact).not.toContain("{party}");
  },
);
