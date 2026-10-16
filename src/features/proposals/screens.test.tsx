import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publicLocales } from "@/domain/ids";
import { formatMoneyInput } from "@/i18n/money";
import { moneyCopy } from "@/i18n/money-copy";
import type { Session } from "@/server/auth/sessions";
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
    const details = container.querySelector("details");
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
  },
);

it.each(["current", "intact", "canRespond"] as const)(
  "keeps the client counteroffer unavailable when %s is false",
  async (condition) => {
    reads.proposal.mockResolvedValue({ ...view(), [condition]: false });
    const { container } = render(
      await ProposalScreen({ locale: "en", session: session("client"), id: "proposal-one" }),
    );
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Amount (BGN)" })).not.toBeInTheDocument();
  },
);
