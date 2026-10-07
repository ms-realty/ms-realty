import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignOutForm } from "@/features/shell/account";
import type { FormAction, FormState, FormValues } from "@/ui/form/contract";
import type { AcceptValues, ContactValues, TriageValues } from "./actions";
import { contactCopy } from "./contact-copy";
import { ContactForm } from "./contact-form";
import { workCopy } from "./copy";
import { AcceptForm, TriageForm } from "./forms";
import {
  InquiryDraftBoundary,
  InquiryDraftReconciliation,
  SignedOutInquiryDraftBoundary,
} from "./inquiry-draft";
import type { InquiryDraftOwner } from "./inquiry-draft-storage";
import {
  claimInquiryDraftOwner,
  readInquiryDraft,
  retainInquiryDraft,
} from "./inquiry-draft-storage";
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
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

describe("O02/O03 inquiry drafts", () => {
  it.each(["contact", "triage", "accept"] as const)(
    "requires explicit revision review for a restored %s draft, including another navigation",
    async (kind) => {
      const draftOwner = owner(),
        user = userEvent.setup(),
        called = vi.fn();
      const action = async <V extends FormValues>(state: FormState<V>, data: FormData) => {
        called(state, data);
        return state;
      };
      const form = (revision: number) => {
        const state = { ...initial(revision === 2 ? "a" : "b"), expectedRevision: revision };
        if (kind === "contact")
          return (
            <ContactForm
              locale="en"
              id="one"
              draftOwner={draftOwner}
              action={action}
              initialState={state}
              contact={{ id: "method", version: 1, kind: "email", value: "synthetic@example.test" }}
            />
          );
        if (kind === "triage")
          return (
            <TriageForm
              locale="en"
              id="one"
              draftOwner={draftOwner}
              action={action}
              initialState={{ ...triageInitial(), expectedRevision: revision }}
              states={["contact_unreachable", "resolved_without_case"]}
            />
          );
        const accept: FormState<AcceptValues> = {
          ...state,
          values: { nextAction: "", dueAt: "" },
        };
        return (
          <AcceptForm
            locale="en"
            id="one"
            draftOwner={draftOwner}
            action={action}
            initialState={accept}
          />
        );
      };
      const field =
        kind === "contact" ? contact.note : kind === "triage" ? work.reason : work.nextAction;
      const submit =
        kind === "contact" ? contact.submit : kind === "triage" ? work.disposition : work.accept;
      const original = render(form(2));
      await user.type(
        screen.getByLabelText(field),
        "Private entries composed against revision two",
      );
      if (kind === "contact") await user.click(screen.getByLabelText(contact.confirm));
      original.unmount();
      const changed = render(form(3));
      expect(screen.getByText(work.draft.restored).closest('[role="status"]')).toHaveTextContent(
        work.draft.changed,
      );
      expect(screen.getByText("Revision: 2 → 3")).toBeVisible();
      if (kind === "contact") expect(screen.getByLabelText(contact.confirm)).not.toBeChecked();
      await user.click(screen.getByRole("button", { name: submit }));
      expect(called).not.toHaveBeenCalled();
      expect(screen.getByText(work.draft.required)).toBeVisible();
      expect(screen.getByLabelText(work.draft.confirm)).toHaveFocus();
      expect(
        browserInquiryReference(inquiryReferenceCookie(draftOwner.id, "one", kind)),
      ).toBeNull();
      await user.type(screen.getByLabelText(field), " amended before review");
      changed.unmount();
      render(form(3));
      expect(screen.getByLabelText(work.draft.confirm)).not.toBeChecked();
      expect(screen.getByText("Revision: 2 → 3")).toBeVisible();
      await user.click(screen.getByLabelText(work.draft.confirm));
      if (kind === "contact") await user.click(screen.getByLabelText(contact.confirm));
      await user.click(screen.getByRole("button", { name: submit }));
      expect(called).toHaveBeenCalledOnce();
      expect(called.mock.calls[0]?.[0].expectedRevision).toBe(3);
    },
  );

  it.each([false, true])(
    "keeps the pre-hydration control, focus and selection without a differing restore (stored: %s)",
    async (stored) => {
      const draftOwner = owner();
      const note = "Pre-hydration entries keep their caret";
      if (stored) {
        claimInquiryDraftOwner(draftOwner);
        const state = initial();
        retainInquiryDraft(draftOwner, "one", "contact", state, {
          state,
          values: { ...state.values, note },
          pending: false,
        });
      }
      const host = document.createElement("div");
      host.innerHTML = renderToString(<Forms draftOwner={draftOwner} />);
      document.body.append(host);
      const control = host.querySelector<HTMLTextAreaElement>('textarea[name="note"]');
      if (!control) throw new Error("Missing pre-hydration textarea");
      control.value = note;
      control.focus();
      control.setSelectionRange(4, 14, "backward");
      let root!: ReturnType<typeof hydrateRoot>;
      try {
        await act(async () => {
          root = hydrateRoot(host, <Forms draftOwner={draftOwner} />);
        });
        expect(host.querySelector('textarea[name="note"]')).toBe(control);
        expect(control).toHaveFocus();
        expect(control).toHaveValue(note);
        expect([control.selectionStart, control.selectionEnd, control.selectionDirection]).toEqual([
          4,
          14,
          "backward",
        ]);
        if (stored) expect(screen.getByText(work.draft.restored)).toBeVisible();
        else expect(screen.queryByText(work.draft.restored)).toBeNull();
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    },
  );

  it.each([false, true])(
    "announces a restored draft politely without focus theft (unresolved: %s)",
    async (pending) => {
      const draftOwner = owner(),
        state = initial();
      claimInquiryDraftOwner(draftOwner);
      retainInquiryDraft(draftOwner, "one", "contact", state, {
        state,
        values: { ...state.values, note: "Stored private draft" },
        pending,
      });
      const view = (
        <>
          <button type="button">Keep my focus</button>
          <Forms draftOwner={draftOwner} state={initial("b")} />
        </>
      );
      const host = document.createElement("div");
      host.innerHTML = renderToString(view);
      document.body.append(host);
      const focus = screen.getByRole("button", { name: "Keep my focus" });
      focus.focus();
      const focused = vi.spyOn(HTMLElement.prototype, "focus");
      let root!: ReturnType<typeof hydrateRoot>;
      try {
        await act(async () => {
          root = hydrateRoot(host, view);
        });
        expect(screen.getByText(work.draft.restored).closest('[role="status"]')).toHaveTextContent(
          work.draft.local,
        );
        expect(screen.getByLabelText(contact.note)).toHaveValue("Stored private draft");
        expect(focus).toHaveFocus();
        expect(focused).not.toHaveBeenCalled();
        if (pending) {
          expect(screen.getByText(work.form.unknown)).toBeVisible();
          expect(screen.queryByRole("button", { name: contact.submit })).toBeNull();
          expect(document.querySelector('input[name="_operationId"]')).toHaveValue(
            state.operationId,
          );
        }
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    },
  );

  it("clears private drafts before the shared shell's native sign-out handler sees the request", () => {
    const draftOwner = owner(),
      nativeRequest = vi.fn((event: FormEvent) => event.preventDefault());
    const mounted = render(
      <div onSubmit={nativeRequest}>
        <Forms draftOwner={draftOwner} />
        <SignOutForm locale="en" label="Sign out" />
      </div>,
    );
    sessionStorage.setItem("unrelated-preference", "retained");
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Private sign-out draft" },
    });
    const signOut = screen.getByRole("button", { name: "Sign out" }).closest("form");
    if (!signOut) throw new Error("Missing native sign-out form");
    expect(signOut).toHaveAttribute("method", "post");
    fireEvent.submit(signOut);
    expect(nativeRequest).toHaveBeenCalledOnce();
    expect(Object.keys(sessionStorage)).toEqual(["unrelated-preference"]);
    // A stale mounted form or late result cannot reclaim its former session's storage.
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Late former-session edit" },
    });
    expect(Object.keys(sessionStorage)).toEqual(["unrelated-preference"]);
    mounted.unmount();
    render(<Forms draftOwner={draftOwner} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue("");
  });

  it("clears a native sign-out's retained draft on the signed-out page", () => {
    const draftOwner = owner();
    const mounted = render(<Forms draftOwner={draftOwner} />);
    fireEvent.change(screen.getByLabelText(contact.note), {
      target: { value: "Native private draft" },
    });
    mounted.unmount();
    render(<SignedOutInquiryDraftBoundary />);
    expect(sessionStorage.length).toBe(0);
    expect(readInquiryDraft(draftOwner, "one", "contact", initial())).toBeNull();
  });

  it("capture-fences a competing pending reference before marking the form enhanced", async () => {
    const draftOwner = owner(),
      action = vi.fn<FormAction<ContactValues>>(idle),
      assign = vi.fn();
    vi.stubGlobal("location", { protocol: "http:", assign });
    render(<Forms draftOwner={draftOwner} action={action} />);
    const competing = initial("c").operationId;
    // biome-ignore lint/suspicious/noDocumentCookie: Simulate the other tab's opaque pending reference.
    document.cookie = `${inquiryReferenceCookie(draftOwner.id, "one", "contact")}=${competing}; Path=/`;
    const form = screen.getByLabelText(contact.note).closest("form");
    if (!form) throw new Error("Missing contact form");
    await act(async () => fireEvent.submit(form));
    expect(action).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(
      `/en/inquiries/one/operations?type=contact&key=${competing}`,
    );
    expect(form.querySelector('input[name="_inquiryEnhanced"]')).toHaveValue("");
    expect(form.querySelector('input[name="_operationId"]')).toHaveValue(initial().operationId);
  });

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

  it("restores an explicitly authorized missing-receipt retry as editable with the same key", async () => {
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
    await user.type(screen.getByLabelText(contact.note), "Validation response whose body was lost");
    await user.click(screen.getByLabelText(contact.confirm));
    await user.click(screen.getByRole("button", { name: contact.submit }));
    mounted.unmount();
    const recovered = { ...initial(), inquiryRetryOperationId: initial().operationId };
    render(<Forms draftOwner={draftOwner} state={recovered} />);
    expect(screen.getByLabelText(contact.note)).toHaveValue(
      "Validation response whose body was lost",
    );
    expect(screen.getByLabelText(contact.note)).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText(contact.confirm)).not.toBeChecked();
    expect(document.querySelector('input[name="_operationId"]')).toHaveValue(initial().operationId);
    expect(screen.getByRole("button", { name: contact.submit })).toBeEnabled();
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => finish(initial()));
  });

  it("acknowledges the prior terminal failure only after its known response body renders", async () => {
    const draftOwner = owner(),
      user = userEvent.setup();
    const action: FormAction<ContactValues> = async (state, data) => ({
      ...initial("b"),
      values: { ...state.values, note: String(data.get("note") ?? "") },
      inquiryReferenceToAcknowledge: state.operationId,
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: work.validation,
        fieldErrors: { nextAction: [work.invalid] },
      },
    });
    render(<Forms draftOwner={draftOwner} action={action} />);
    await user.type(screen.getByLabelText(contact.note), "Known failure draft remains editable");
    await user.click(screen.getByRole("button", { name: contact.submit }));
    expect(await screen.findByText(work.invalid)).toBeVisible();
    expect(
      browserInquiryReference(inquiryReferenceCookie(draftOwner.id, "one", "contact")),
    ).toBeNull();
    expect(screen.getByLabelText(contact.note)).toHaveValue("Known failure draft remains editable");
    expect(document.querySelector('input[name="_operationId"]')).toHaveValue(
      initial("b").operationId,
    );
  });

  it.each([false, true])(
    "retains edited same-reference recovery values after success-only status (storage disabled: %s)",
    async (disabled) => {
      if (disabled)
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
          throw new Error("Storage disabled");
        });
      const draftOwner = owner();
      const completions: ((state: FormState<ContactValues>) => void)[] = [];
      const pending: FormAction<ContactValues> = () =>
        new Promise((resolve) => completions.push(resolve));
      const original = render(<Forms draftOwner={draftOwner} action={pending} />);
      fireEvent.change(screen.getByLabelText(contact.note), { target: { value: "Original note" } });
      fireEvent.change(screen.getByLabelText(contact.nextAction), {
        target: { value: "Original next action" },
      });
      await act(async () => fireEvent.click(screen.getByRole("button", { name: contact.submit })));
      original.unmount();
      const recovered = { ...initial(), inquiryRetryOperationId: initial().operationId };
      const editing = render(<Forms draftOwner={draftOwner} state={recovered} />);
      fireEvent.change(screen.getByLabelText(contact.note), {
        target: { value: "Corrected note" },
      });
      fireEvent.change(screen.getByLabelText(contact.nextAction), {
        target: { value: "Corrected next action" },
      });
      editing.unmount();
      const retry = render(<Forms draftOwner={draftOwner} state={recovered} action={pending} />);
      expect(screen.getByLabelText(contact.note)).toHaveValue("Corrected note");
      expect(screen.getByLabelText(contact.note)).not.toHaveAttribute("readonly");
      await act(async () => fireEvent.click(screen.getByRole("button", { name: contact.submit })));
      retry.unmount();
      const status = render(
        <InquiryDraftReconciliation
          owner={draftOwner}
          id="one"
          kind="contact"
          operationId={initial().operationId}
          outcome="succeeded"
        />,
      );
      status.unmount();
      render(<Forms draftOwner={draftOwner} state={{ ...initial("b"), expectedRevision: 3 }} />);
      expect(screen.getByLabelText(contact.note)).toHaveValue("Corrected note");
      expect(screen.getByLabelText(contact.nextAction)).toHaveValue("Corrected next action");
      expect(screen.getByLabelText(contact.confirm)).not.toBeChecked();
      expect(document.querySelector('input[name="_operationId"]')).toHaveValue(
        initial("b").operationId,
      );
      await act(async () => {
        for (const finish of completions) finish(initial());
      });
    },
  );

  it("clears edited recovery values when their matching confirmation body is observed", async () => {
    const draftOwner = owner();
    let finish!: (state: FormState<ContactValues>) => void;
    const original = render(
      <Forms
        draftOwner={draftOwner}
        action={() =>
          new Promise((resolve) => {
            finish = resolve;
          })
        }
      />,
    );
    fireEvent.change(screen.getByLabelText(contact.note), { target: { value: "Original note" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: contact.submit })));
    original.unmount();
    await act(async () => finish(initial()));
    const recovered = { ...initial(), inquiryRetryOperationId: initial().operationId };
    const confirmed: FormAction<ContactValues> = async (state, data) => ({
      ...state,
      responseId: "confirmed-correction",
      values: { ...state.values, note: String(data.get("note") ?? "") },
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
    render(<Forms draftOwner={draftOwner} state={recovered} action={confirmed} />);
    fireEvent.change(screen.getByLabelText(contact.note), { target: { value: "Corrected note" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: contact.submit })));
    expect(screen.getByRole("heading", { name: work.changeSaved })).toBeVisible();
    expect(readInquiryDraft(draftOwner, "one", "contact", initial())).toBeNull();
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
