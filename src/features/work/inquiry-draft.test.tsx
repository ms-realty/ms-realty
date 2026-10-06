import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FormAction, FormState } from "@/ui/form/contract";
import type { ContactValues, TriageValues } from "./actions";
import { contactCopy } from "./contact-copy";
import { ContactForm } from "./contact-form";
import { workCopy } from "./copy";
import { TriageForm } from "./forms";
import { InquiryDraftBoundary, InquiryDraftReconciliation } from "./inquiry-draft";
import type { InquiryDraftOwner } from "./inquiry-draft-storage";
import { claimInquiryDraftOwner, readInquiryDraft } from "./inquiry-draft-storage";
import { browserInquiryReference, inquiryReferenceCookie } from "./inquiry-reference";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const contact = contactCopy("en"),
  work = workCopy("en");
const owner = (): InquiryDraftOwner => ({
  id: "actor-one-session-one",
  expiresAt: Date.now() + 60_000,
});
const initial = (key = "a"): FormState<ContactValues> => ({
  operationId: `${key.repeat(43)}.${"a".repeat(32)}`,
  expectedRevision: 2,
  responseId: key,
  outcome: { kind: "idle" },
  values: {
    contactChoice: "method:1",
    result: "unanswered",
    contactedAt: "",
    note: "",
    nextAction: "",
    dueAt: "",
    promisedToClient: "",
    reviewed: "",
  },
});
const triageInitial = (): FormState<TriageValues> => ({
  ...initial("t"),
  outcome: { kind: "idle" },
  values: { state: "contact_unreachable", reason: "", duplicateOfInquiryId: "" },
});
const idle: FormAction<ContactValues> = async (state) => state;
function Forms({
  id = "one",
  draftOwner,
  action = idle,
  state = initial(),
}: {
  id?: string;
  draftOwner: InquiryDraftOwner;
  action?: FormAction<ContactValues>;
  state?: FormState<ContactValues>;
}) {
  return (
    <>
      <ContactForm
        locale="en"
        id={id}
        draftOwner={draftOwner}
        action={action}
        initialState={state}
        contact={{ id: "method", version: 1, kind: "email", value: "synthetic@example.test" }}
      />
      <TriageForm
        locale="en"
        id={id}
        draftOwner={draftOwner}
        action={async (value) => value}
        initialState={triageInitial()}
        states={["contact_unreachable", "resolved_without_case"]}
      />
    </>
  );
}
beforeEach(() => {
  router.push.mockClear();
  claimInquiryDraftOwner({ id: "expired-test", expiresAt: 0 });
  sessionStorage.clear();
  for (const cookie of document.cookie.split("; ")) {
    const name = cookie.split("=")[0];
    if (name?.startsWith("msr_inquiry_"))
      // biome-ignore lint/suspicious/noDocumentCookie: Reset only test-created native references.
      document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
});
afterEach(() => {
  cleanup();
  claimInquiryDraftOwner({ id: "expired-test", expiresAt: 0 });
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("O02/O03 inquiry drafts", () => {
  it("restores each inquiry's contact note and triage reason after switching away and returning", async () => {
    const draftOwner = owner(),
      user = userEvent.setup();
    const first = render(<Forms draftOwner={draftOwner} />);
    await user.type(screen.getByLabelText(contact.note), "First contact note retained in this tab");
    await user.type(screen.getByLabelText(work.reason), "First triage reason retained in this tab");
    first.unmount();
    const second = render(<Forms id="two" draftOwner={draftOwner} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue("");
    expect(screen.getByLabelText(work.reason)).toHaveValue("");
    await user.type(screen.getByLabelText(contact.note), "Second inquiry's private note");
    second.unmount();
    render(<Forms draftOwner={draftOwner} state={initial("b")} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue(
      "First contact note retained in this tab",
    );
    expect(screen.getByLabelText(work.reason)).toHaveValue(
      "First triage reason retained in this tab",
    );
    expect(document.querySelector('input[name="_operationId"]')).toHaveValue(
      initial("b").operationId,
    );
  });

  it.each([
    ["actor-two-session-one", false],
    ["actor-one-session-two", false],
    ["actor-two-session-one", true],
    ["actor-one-session-two", true],
  ] as const)(
    "removes the old private draft across owner change to %s (storage disabled: %s), including return",
    async (id, disabled) => {
      if (disabled)
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("Storage disabled");
        });
      const draftOwner = owner(),
        user = userEvent.setup();
      const mounted = render(<Forms draftOwner={draftOwner} />);
      await user.type(screen.getByLabelText(contact.note), "Private text for the former session");
      mounted.rerender(<Forms draftOwner={{ ...draftOwner, id }} />);
      expect(screen.getByLabelText(contact.note)).toHaveValue("");
      mounted.rerender(<Forms draftOwner={draftOwner} />);
      expect(screen.getByLabelText(contact.note)).toHaveValue("");
    },
  );

  it("clears only the confirmed form's retained draft, leaving its unsent triage reason", async () => {
    const draftOwner = owner(),
      user = userEvent.setup();
    const action: FormAction<ContactValues> = async (state) => ({
      ...state,
      responseId: "confirmed",
      outcome: {
        kind: "confirmed",
        receipt: {
          title: work.changeSaved,
          reference: "RQ-SYNTHETIC",
          recordedAt: { dateTime: new Date().toISOString(), label: "Just now" },
          nextStep: "Review the inquiry",
          destination: { href: "/en/inquiries/one", label: work.openRecord },
        },
      },
    });
    const mounted = render(<Forms draftOwner={draftOwner} action={action} />);
    await user.type(screen.getByLabelText(contact.note), "Confirmed contact note");
    await user.type(screen.getByLabelText(work.reason), "Unsent triage reason");
    await user.click(screen.getByRole("button", { name: contact.submit }));
    expect(await screen.findByRole("heading", { name: work.changeSaved })).toBeVisible();
    expect(
      browserInquiryReference(inquiryReferenceCookie(draftOwner.id, "one", "contact")),
    ).toBeNull();
    expect(readInquiryDraft(draftOwner, "one", "contact", initial())).toBeNull();
    mounted.unmount();
    render(<Forms draftOwner={draftOwner} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue("");
    expect(screen.getByLabelText(work.reason)).toHaveValue("Unsent triage reason");
  });

  it("retains an in-flight operation and returns to status without issuing another command", async () => {
    const draftOwner = owner(),
      user = userEvent.setup();
    let finish!: (state: FormState<ContactValues>) => void;
    const action = vi.fn<FormAction<ContactValues>>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const mounted = render(<Forms draftOwner={draftOwner} action={action} />);
    await user.type(screen.getByLabelText(contact.note), "Contact whose acknowledgment is pending");
    await user.click(screen.getByRole("button", { name: contact.submit }));
    mounted.unmount();
    render(<Forms draftOwner={draftOwner} state={initial("b")} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue(
      "Contact whose acknowledgment is pending",
    );
    expect(screen.getByLabelText(contact.note)).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: contact.submit })).toBeNull();
    expect(screen.getByRole("link", { name: work.statusLink })).toHaveAttribute(
      "href",
      `/en/inquiries/one/operations?type=contact&key=${initial().operationId}`,
    );
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish(initial()));
  });

  it("adopts edits to server-rendered controls before hydration over the older local draft", async () => {
    const draftOwner = owner();
    const first = render(<Forms draftOwner={draftOwner} />);
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Older retained note" },
    });
    first.unmount();
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<Forms draftOwner={draftOwner} />);
    const note = container.querySelector<HTMLTextAreaElement>('textarea[name="note"]');
    if (!note) throw new Error("Missing server-rendered contact note");
    note.value = "Entered before hydration";
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Forms draftOwner={draftOwner} />);
      });
      expect(screen.getByLabelText(contact.note)).toHaveValue("Entered before hydration");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it.each(["succeeded", "failed"] as const)(
    "releases an unresolved operation after its authorized server reconciliation is %s",
    async (outcome) => {
      const draftOwner = owner(),
        user = userEvent.setup();
      let finish!: (state: FormState<ContactValues>) => void;
      const action: FormAction<ContactValues> = () =>
        new Promise((resolve) => {
          finish = resolve;
        });
      const mounted = render(<Forms draftOwner={draftOwner} action={action} />);
      await user.type(screen.getByLabelText(contact.note), "Pending note to reconcile");
      await user.click(screen.getByRole("button", { name: contact.submit }));
      mounted.unmount();
      const status = render(
        <InquiryDraftReconciliation
          owner={draftOwner}
          id="one"
          kind="contact"
          operationId={initial().operationId}
          outcome={outcome}
        />,
      );
      status.unmount();
      render(<Forms draftOwner={draftOwner} />);
      expect(screen.getByLabelText(contact.note)).toHaveValue(
        outcome === "failed" ? "Pending note to reconcile" : "",
      );
      expect(screen.getByRole("button", { name: contact.submit })).toBeEnabled();
      await act(async () => finish(initial()));
    },
  );

  it("asks before a full navigation would discard a draft when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    render(<Forms draftOwner={owner()} />);
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Cannot save this private draft" },
    });
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
  });

  it("retains dirty forms through SPA unmounts when storage fails and protects a later full unload", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    const draftOwner = owner();
    const mounted = render(
      <>
        <Forms draftOwner={draftOwner} />
        <a href="/en/today">Sidebar destination</a>
      </>,
    );
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Private contact draft" },
    });
    fireEvent.change(screen.getByLabelText(work.reason), {
      target: { value: "Private triage draft" },
    });
    const nextHandler = vi.fn((event: Event) => event.preventDefault());
    document.addEventListener("click", nextHandler);
    try {
      fireEvent.click(screen.getByRole("link", { name: "Sidebar destination" }));
      expect(nextHandler).toHaveBeenCalledOnce();
      mounted.unmount();
      const leaving = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(leaving);
      expect(leaving.defaultPrevented).toBe(true);
      render(<Forms draftOwner={draftOwner} state={initial("b")} />);
      expect(screen.getByLabelText(contact.note)).toHaveValue("Private contact draft");
      expect(screen.getByLabelText(work.reason)).toHaveValue("Private triage draft");
    } finally {
      document.removeEventListener("click", nextHandler);
    }
  });

  it("drops memory drafts and full-unload protection when the owning session expires", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    const draftOwner = owner();
    const mounted = render(<Forms draftOwner={draftOwner} />);
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Expired private note" },
    });
    mounted.unmount();
    claimInquiryDraftOwner({ ...draftOwner, expiresAt: 0 });
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(false);
    render(<Forms draftOwner={draftOwner} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue("");
  });

  it("reconciles a server-verified terminal marker before a returning form restores its draft", async () => {
    const draftOwner = owner(),
      user = userEvent.setup();
    let finish!: (state: FormState<ContactValues>) => void;
    const mounted = render(
      <Forms
        draftOwner={draftOwner}
        action={() =>
          new Promise((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    await user.type(screen.getByLabelText(contact.note), "Pending before native resolution");
    await user.click(screen.getByRole("button", { name: contact.submit }));
    mounted.unmount();
    render(
      <>
        <InquiryDraftBoundary
          owner={draftOwner}
          resolutions={[
            { id: "one", kind: "contact", key: initial().operationId, status: "succeeded" },
          ]}
        />
        <Forms draftOwner={draftOwner} />
      </>,
    );
    expect(screen.getByLabelText(contact.note)).toHaveValue("");
    expect(screen.getByRole("button", { name: contact.submit })).toBeEnabled();
    await act(async () => finish(initial()));
  });
});
