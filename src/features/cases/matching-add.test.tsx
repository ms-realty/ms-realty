import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import { type MatchAddProps, MatchAddWorkbench } from "./matching-add";
import { addText, matchingCopy } from "./matching-copy";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const c = matchingCopy("en");
const text = addText(c, { object: "Alex", subject: "Alex", start: "Alex" }, "MS-00912");
const review = (briefRevision = 2) =>
  JSON.stringify({
    briefRevision,
    manifestId: "8f6d1c2e-1c1b-4f6f-9a43-3f3c1f5f6e11",
    availability: "available",
    violated: [],
    unconfirmed: [],
    reviewed: true,
  });
const issued = (operationId: string, briefRevision = 2): FormState<FormValues> => ({
  operationId,
  expectedRevision: 4,
  responseId: `issued-${operationId}`,
  values: { reference: "MS-00912", explanation: "", matchReview: review(briefRevision) },
  outcome: { kind: "idle" },
});
const frame = (canAdd = true) => ({
  title: text.checkTitle,
  body: <p>Synthetic check body</p>,
  actions: <a href="/en/list">{text.backToList}</a>,
  next: "Review the explanation for the client and add MS-00912 to their list.",
  canAdd,
});
const props = (action: FormAction<FormValues>, overrides: Partial<MatchAddProps> = {}) =>
  ({
    action,
    initialState: issued("issued-key"),
    renderId: "render-1",
    permalink: "/en/cases/case-1/matching?property=MS-00912",
    nativeIdentity: "workflow.interest.case-1:MS-00912",
    localeTag: "en-GB",
    reference: "MS-00912",
    fresh: frame(),
    stale: null,
    header: <p>Synthetic property header</p>,
    current: {
      briefRevision: 2,
      manifestId: "8f6d1c2e-1c1b-4f6f-9a43-3f3c1f5f6e11",
      availability: "available",
      violated: [],
      unconfirmed: [],
    },
    listHref: "/en/cases/case-1/matching?revision=2",
    recheckHref: "/en/cases/case-1/matching?property=MS-00912&revision=2",
    added: {
      property: "Property MS-00912 · Synthetic apartment · €105,000",
      dealHref: "/en/cases/case-1",
      recordedBy: null,
      next: null,
    },
    text,
    ...overrides,
  }) satisfies MatchAddProps;
const confirmed = (state: FormState<FormValues>, data: FormData): FormState<FormValues> => ({
  ...state,
  responseId: "added",
  values: {
    reference: String(data.get("reference")),
    explanation: String(data.get("explanation")),
    matchReview: String(data.get("matchReview")),
  },
  outcome: {
    kind: "confirmed",
    receipt: {
      title: "Change recorded",
      reference: "CS-2026-000001",
      recordedAt: { dateTime: "2026-10-06T08:12:00.000Z", label: "6 Oct 2026, 11:12 Europe/Sofia" },
      nextStep: "",
      destination: { href: "/en/cases/case-1", label: "Open" },
    },
  },
});
const explain = (value = "Bright two-room flat close to the centre.") =>
  fireEvent.change(screen.getByRole("textbox", { name: /Explanation for the client/ }), {
    target: { value },
  });
const add = () => fireEvent.click(screen.getByRole("button", { name: text.submit }));

beforeEach(() => {
  refresh.mockClear();
  Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
});
afterEach(cleanup);

describe("O07 add", () => {
  it("shows added only from the readback, with the recorded time in Europe/Sofia", async () => {
    const action = vi.fn<FormAction<FormValues>>(async (state, data) => confirmed(state, data));
    const view = render(<MatchAddWorkbench {...props(action)} />);
    explain();
    add();
    expect(
      await screen.findByRole("heading", { name: "MS-00912 is on the client's list" }),
    ).toBeVisible();
    const sent = action.mock.calls[0]?.[1];
    expect(sent?.get("_operationId")).toBe("issued-key");
    expect(sent?.get("_intent")).toBe("submit");
    expect(sent?.get("reference")).toBe("MS-00912");
    expect(JSON.parse(String(sent?.get("matchReview")))).toMatchObject({
      briefRevision: 2,
      reviewed: true,
    });
    expect(screen.getByText("Bright two-room flat close to the centre.")).toBeVisible();
    expect(screen.getByText("6 October 2026, 11:12 · Europe/Sofia")).toBeVisible();
    // The refresh runs in an effect after the frame commits.
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // The recorder is shown once a server read after the add names it, never guessed.
    view.rerender(
      <MatchAddWorkbench
        {...props(action, {
          renderId: "render-2",
          added: {
            ...props(action).added,
            recordedBy: "Maria D.",
            dealHref: "/en/cases/case-1#interest-i1",
          },
        })}
      />,
    );
    expect(screen.getByText("Maria D. · 6 October 2026, 11:12 · Europe/Sofia")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open MS-00912 in the deal" })).toHaveAttribute(
      "href",
      "/en/cases/case-1#interest-i1",
    );
  });

  it("never claims an add when the command refuses the reviewed check", async () => {
    const action = vi.fn<FormAction<FormValues>>(async (state, data) => ({
      ...state,
      operationId: "fresh-after-validation",
      responseId: "refused",
      values: {
        reference: "MS-00912",
        explanation: String(data.get("explanation")),
        matchReview: "",
      },
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: "Review the highlighted details.",
        fieldErrors: { matchReview: ["Check this value."] },
      },
    }));
    render(<MatchAddWorkbench {...props(action)} />);
    explain();
    add();
    expect(await screen.findByText(text.reviewRejected)).toBeVisible();
    expect(screen.getByText(text.statusNotAdded)).toBeVisible();
    expect(screen.queryByText(/is on the client's list/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: text.submit })).not.toBeInTheDocument();
  });

  it("keeps the explanation and sends nothing while offline, then sends the same request", async () => {
    const action = vi.fn<FormAction<FormValues>>(async (state, data) => confirmed(state, data));
    render(<MatchAddWorkbench {...props(action)} />);
    explain();
    Object.defineProperty(window.navigator, "onLine", { value: false, configurable: true });
    add();
    expect(await screen.findByRole("alert")).toHaveTextContent(text.offlineAlert);
    expect(screen.getByText(text.statusNotSent)).toBeVisible();
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /Explanation for the client/ })).toHaveValue(
      "Bright two-room flat close to the centre.",
    );
    Object.defineProperty(window.navigator, "onLine", { value: true, configurable: true });
    fireEvent.click(screen.getByRole("button", { name: text.retry }));
    await screen.findByRole("heading", { name: "MS-00912 is on the client's list" });
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0]?.[1].get("_operationId")).toBe("issued-key");
  });

  it("after a lost response checks the same request and never mints a new key", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let lose = true;
    const action = vi.fn<FormAction<FormValues>>(async (state, data) => {
      if (lose) {
        lose = false;
        throw new Error("transport lost");
      }
      return confirmed(state, data);
    });
    render(<MatchAddWorkbench {...props(action)} />);
    explain();
    add();
    expect(
      await screen.findByRole("heading", { name: "We do not know yet whether MS-00912 was added" }),
    ).toBeVisible();
    expect(screen.getByText(text.unknownAlert)).toBeVisible();
    expect(screen.queryByRole("button", { name: text.submit })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: text.checkSame }));
    await screen.findByRole("heading", { name: "MS-00912 is on the client's list" });
    const [first, second] = action.mock.calls.map(([, data]) => data);
    expect(second?.get("_operationId")).toBe(first?.get("_operationId"));
    expect(second?.get("explanation")).toBe(first?.get("explanation"));
    expect(second?.get("matchReview")).toBe(first?.get("matchReview"));
  });

  it("names what changed in a conflict and rechecks with the kept explanation and a fresh key", async () => {
    const action = vi.fn<FormAction<FormValues>>(async (state, data) => ({
      ...state,
      responseId: "conflict",
      values: {
        reference: "MS-00912",
        explanation: String(data.get("explanation")),
        matchReview: String(data.get("matchReview")),
      },
      outcome: { kind: "conflict", code: "REVISION_CONFLICT", message: "Changed" },
    }));
    const view = render(<MatchAddWorkbench {...props(action)} />);
    explain();
    add();
    await screen.findByRole("heading", { name: text.conflictTitle });
    expect(screen.queryByText(text.conflict.brief)).not.toBeInTheDocument();
    // The next server read: what the client wants is now revision 3 and a new key is issued.
    act(() =>
      view.rerender(
        <MatchAddWorkbench
          {...props(action, {
            renderId: "render-2",
            initialState: issued("fresh-key", 3),
            current: {
              briefRevision: 3,
              manifestId: "8f6d1c2e-1c1b-4f6f-9a43-3f3c1f5f6e11",
              availability: "available",
              violated: [],
              unconfirmed: [],
            },
          })}
        />,
      ),
    );
    expect(screen.getByText(text.conflict.brief)).toBeVisible();
    expect(screen.getByText(text.statusNotAdded)).toBeVisible();
    expect(screen.queryByText(/is on the client's list/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(text.conflict.recheck));
    const recheck = screen.getByRole("group");
    expect(
      within(recheck).getByRole("textbox", { name: /Explanation for the client/ }),
    ).toHaveValue("Bright two-room flat close to the centre.");
    expect(recheck.querySelector('input[name="_operationId"]')).toHaveValue("fresh-key");
    expect(
      JSON.parse(
        String(recheck.querySelector<HTMLInputElement>('input[name="matchReview"]')?.value),
      ),
    ).toMatchObject({ briefRevision: 3 });
  });

  it("opens an older list's link on the refresh frame, without an add", () => {
    const action = vi.fn<FormAction<FormValues>>();
    render(
      <MatchAddWorkbench
        {...props(action, {
          stale: {
            title: text.checkTitle,
            body: <p>{c.stale.alertSince}</p>,
            actions: <a href="/en/cases/case-1/matching">{c.stale.refresh}</a>,
            next: c.next.stale,
            canAdd: false,
          },
        })}
      />,
    );
    expect(screen.getByRole("link", { name: c.stale.refresh })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: text.submit })).not.toBeInTheDocument();
  });

  it("sends nothing twice: the button is unavailable while the add is in flight", async () => {
    let finish: (() => void) | undefined;
    const action = vi.fn<FormAction<FormValues>>(
      (state, data) =>
        new Promise((resolve) => {
          finish = () => resolve(confirmed(state, data));
        }),
    );
    render(<MatchAddWorkbench {...props(action)} />);
    explain();
    add();
    const sending = await screen.findByRole("button", { name: text.sending });
    expect(sending).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText(text.sendingNote)).toBeVisible();
    fireEvent.click(sending);
    expect(action).toHaveBeenCalledOnce();
    await act(async () => finish?.());
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "MS-00912 is on the client's list" }),
      ).toBeVisible(),
    );
  });
});
