import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publicLocales } from "@/domain/ids";
import { formatMoneyInput } from "@/i18n/money";
import { moneyCopy } from "@/i18n/money-copy";
import type { Session } from "@/server/auth/sessions";
import type { FormState } from "@/ui/form/contract";
import { initialFormState } from "@/ui/form/server";
import { caseCopy } from "../cases/copy";
import { proposalEnhancementField, proposalScope, proposalStatus } from "./contract";
import { proposalCopy } from "./copy";
import { counterofferCopy } from "./counteroffer-copy";
import { ProposalScreen } from "./screens";

const reads = vi.hoisted(() => ({ proposal: vi.fn(), context: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => "synthetic-db" }));
vi.mock("@/server/proposals/queries", () => ({
  readProposal: reads.proposal,
  proposalContext: reads.context,
  listProposals: vi.fn(),
}));
vi.mock("./actions", () => ({ proposalAction: async () => {} }));
vi.mock("@/ui/form/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/form/server")>();
  return { ...actual, initialFormState: vi.fn(actual.initialFormState) };
});

const session = (kind: "staff" | "client") => ({ account: { kind } }) as Session;
const view = () => ({
  proposal: {
    id: "proposal-one",
    reference: "SYNTHETIC-PROPOSAL",
    version: 4,
    caseId: "case-one",
    interestId: "interest-one",
  },
  revision: {
    id: "revision-one",
    number: 1,
    state: "awaiting_response",
    amountMinor: Number.MAX_SAFE_INTEGER,
    currency: "BGN",
    period: "total",
    paymentBasis: "Synthetic payment terms",
    deadlineAt: new Date("2026-10-25T18:30:00+02:00"),
    conditions: [],
    inclusions: [],
    parties: [
      { partyId: "primary-party", name: "Synthetic buyer", role: "buyer" },
      { partyId: "additional-party", name: "Synthetic co-buyer", role: "co_buyer" },
    ],
  },
  current: true,
  intact: true,
  canRespond: true,
  expired: false,
  source: null,
  responses: [],
  history: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  reads.proposal.mockResolvedValue(view());
  reads.context.mockResolvedValue({
    buyers: [{ partyId: "primary-party", name: "Synthetic buyer" }],
  });
});
afterEach(cleanup);

it.each(publicLocales)(
  "discloses the client %s counteroffer with exact source money and bound parties",
  async (locale) => {
    const { container } = render(
      await ProposalScreen({ locale, session: session("client"), id: "proposal-one" }),
    );
    const copy = counterofferCopy(locale);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      proposalCopy(locale).detailTitle,
    );
    expect(container.querySelector("[data-workflow-reference]")).toHaveTextContent(
      "SYNTHETIC-PROPOSAL",
    );
    const details = screen.getByLabelText(`${moneyCopy(locale).amount} (BGN)`).closest("details");
    expect(details?.open).toBe(false);
    expect(details?.querySelector("summary")).toHaveTextContent(copy.open);
    expect(screen.getByLabelText(`${moneyCopy(locale).amount} (BGN)`)).not.toBeVisible();
    if (!details?.querySelector("summary")) throw new Error("Missing counteroffer disclosure");
    await userEvent.click(details.querySelector("summary") as HTMLElement);
    expect(screen.getByRole("textbox", { name: `${moneyCopy(locale).amount} (BGN)` })).toHaveValue(
      formatMoneyInput(locale, Number.MAX_SAFE_INTEGER, "BGN"),
    );
    expect(screen.getByRole("button", { name: copy.submit })).toBeVisible();
    const form = details.querySelector("form");
    const posted = new FormData(form ?? undefined);
    expect(posted.get("revisionId")).toBe("revision-one");
    expect(posted.get("clientPartyId")).toBe("primary-party");
    expect(posted.get("additionalPartyIds")).toBe("additional-party");
    expect(posted.get("currency")).toBe("BGN");
    expect(posted.get(proposalEnhancementField)).toBe("yes");
    expect(
      container.querySelector(`form input[name="${proposalEnhancementField}"]`)?.closest("details"),
    ).toBe(details);
    expect(container.querySelector("[data-proposal-revision] bdi")).toHaveTextContent(
      /91.*BGN|BGN.*91/,
    );
  },
);

it.each(["bg", "en", "ru"] as const)(
  "keeps staff %s revision entry directly visible",
  async (locale) => {
    render(await ProposalScreen({ locale, session: session("staff"), id: "proposal-one" }));
    const amount = screen.getByRole("textbox", { name: `${moneyCopy(locale).amount} (BGN)` });
    expect(amount.closest("details")).toBeNull();
    expect(amount).toBeVisible();
    expect(document.querySelector(`input[name="${proposalEnhancementField}"]`)).toBeNull();
  },
);

it("renders the native counteroffer hint empty before hydration", async () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    await ProposalScreen({ locale: "en", session: session("client"), id: "proposal-one" }),
  );
  const input = container.querySelector<HTMLInputElement>(
    `input[name="${proposalEnhancementField}"]`,
  );
  expect(input).toHaveValue("");
  expect(input?.closest("details")?.open).toBe(false);
  const form = input?.form;
  expect(form).not.toBeNull();
  const data = new FormData(form ?? undefined);
  expect(data.getAll(proposalEnhancementField)).toEqual([""]);
  expect(data.get("revisionId")).toBe("revision-one");
});

it.each(["current", "intact", "canRespond"] as const)(
  "keeps the client counteroffer unavailable when %s is false",
  async (condition) => {
    reads.proposal.mockResolvedValue({ ...view(), [condition]: false });
    const { container } = render(
      await ProposalScreen({ locale: "en", session: session("client"), id: "proposal-one" }),
    );
    expect(container.querySelector('input[name="amount"]')).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Amount (BGN)" })).not.toBeInTheDocument();
  },
);

it.each(["unknown", "confirmed"] as const)(
  "keeps a restored %s counteroffer visible after its committed revision hides client commands",
  async (kind) => {
    reads.proposal.mockResolvedValue({ ...view(), current: false, canRespond: false });
    const copy = caseCopy("en");
    const status = proposalStatus("en", "revise", "proposal-one", "original-operation");
    const returned: FormState<Record<string, string>> = {
      operationId: "original-operation",
      expectedRevision: 4,
      responseId: "original-response",
      reconciliation: { href: status, label: copy.status },
      values: {
        revisionId: "revision-one",
        clientPartyId: "primary-party",
        additionalPartyIds: "additional-party",
        amount: "119,000.03",
        currency: "GBP",
        period: "total",
        paymentBasis: "Exact entered payment basis",
        conditions: "Exact entered condition",
        inclusions: "Exact entered inclusion",
        deadline: view().revision.deadlineAt.toISOString(),
        reason: "Exact entered explanation",
      },
      outcome:
        kind === "unknown"
          ? {
              kind,
              code: "OUTCOME_UNKNOWN",
              message: copy.statusUnknown,
              status: { href: status, label: copy.status },
            }
          : {
              kind,
              receipt: {
                title: copy.saved,
                reference: "SYNTHETIC-PROPOSAL",
                recordedAt: { dateTime: "2026-10-16T12:00:00Z", label: "Recorded time" },
                nextStep: copy.nextStep,
                destination: { href: "/en/proposals/proposal-one", label: copy.back },
              },
            },
    };
    // Native restoration belongs to the revise identity, independent of the other retained
    // decision hooks. The page's fresh read has already lost revise eligibility.
    const fresh = vi.mocked(initialFormState).getMockImplementation();
    if (!fresh) throw new Error("Missing initial form implementation");
    await vi.mocked(initialFormState).withImplementation(
      (scope, values, revision) =>
        scope === proposalScope("revise", "proposal-one")
          ? returned
          : fresh(scope, values, revision),
      async () => {
        render(
          await ProposalScreen({ locale: "en", session: session("client"), id: "proposal-one" }),
        );
      },
    );
    if (kind === "unknown") {
      expect(screen.getByLabelText("Amount (GBP)")).toHaveValue("119,000.03");
      expect(screen.getByLabelText("Amount (GBP)")).toHaveAttribute("readonly");
      expect(screen.getByDisplayValue("Exact entered explanation")).toBeVisible();
      expect(screen.getByRole("link", { name: copy.status })).toHaveAttribute("href", status);
      expect(document.querySelector('[name="_operationId"]')).toHaveValue("original-operation");
    } else {
      expect(screen.getByRole("heading", { name: copy.saved })).toBeVisible();
      expect(screen.getByRole("link", { name: copy.back })).toHaveAttribute(
        "href",
        "/en/proposals/proposal-one",
      );
    }
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  },
);
