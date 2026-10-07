import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormAction, FormState } from "./contract";
import { ActionForm, nativeFormPermalink } from "./form";
import { formSpecimenCopy } from "./specimen-copy";
import { SpecimenForm, type SpecimenValues } from "./specimen-form";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const copy = formSpecimenCopy("en");
const initialState: FormState<SpecimenValues> = {
  operationId: "server-issued-key",
  expectedRevision: 1,
  responseId: "initial",
  values: { subject: "", note: "" },
  outcome: { kind: "idle" },
};
function mount(action: FormAction<SpecimenValues>, state = initialState) {
  return render(
    <SpecimenForm
      action={action}
      initialState={state}
      permalink="/en/design/forms"
      statusHref="/operation/server-issued-key"
      copy={copy}
    />,
  );
}

describe("UI07 / S11–S17 progressive form", () => {
  it.each([1, 2])(
    "adopts a native radio choice before hydration with %i options and keeps checkbox groups",
    async (count) => {
      function NativeChoices() {
        return (
          <ActionForm
            action={async (state) => state}
            initialState={initialState}
            permalink="/practice"
            reconciliation={{ href: "/status", label: "Status" }}
            copy={copy.form}
            labels={{ subject: "Recipient", note: "Scope" }}
            submitLabel="Submit"
          >
            {(form) => (
              <>
                {Array.from({ length: count }, (_, index) => `recipient-${index}`).map(
                  (recipient) => (
                    <label key={recipient}>
                      {recipient}
                      <input
                        type="radio"
                        name="subject"
                        value={recipient}
                        checked={form.values.subject === recipient}
                        onChange={form.field("subject").onChange}
                      />
                    </label>
                  ),
                )}
                {["first", "second"].map((scope) => (
                  <label key={scope}>
                    Scope {scope}
                    <input
                      type="checkbox"
                      name="note"
                      value={scope}
                      checked={form.values.note.split("\n").includes(scope)}
                      onChange={() => {}}
                    />
                  </label>
                ))}
              </>
            )}
          </ActionForm>
        );
      }
      const container = document.createElement("div");
      document.body.append(container);
      container.innerHTML = renderToString(<NativeChoices />);
      // A visitor chooses before JavaScript arrives; hydration must not drop that choice.
      const chosen = container.querySelector<HTMLInputElement>(
        `input[value="recipient-${count - 1}"]`,
      );
      if (!chosen) throw new Error("Missing server-rendered radio");
      chosen.checked = true;
      for (const checkbox of container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
        checkbox.checked = true;
      let root: ReturnType<typeof hydrateRoot> | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(container, <NativeChoices />);
        });
        expect(chosen).toBeChecked();
        const form = container.querySelector("form");
        if (!form) throw new Error("Missing hydrated form");
        expect(new FormData(form).get("subject")).toBe(`recipient-${count - 1}`);
        expect(new FormData(form).getAll("note")).toEqual(["first", "second"]);
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    },
  );
  it("resolves the submit label from the returned review state while preserving the operation", async () => {
    const user = userEvent.setup();
    render(
      <ActionForm
        action={async (state) => ({
          ...state,
          responseId: "reviewed",
          values: { ...state.values, note: "reviewed" },
        })}
        initialState={initialState}
        permalink="/en/design/forms"
        nativeIdentity="inquiry"
        reconciliation={{ href: "/operation/server-issued-key", label: "Check operation" }}
        copy={copy.form}
        labels={{ subject: "Subject", note: "Note" }}
        submitLabel={(state) =>
          state.values.note === "reviewed" ? "Confirm exact inquiry" : "Review inquiry"
        }
      >
        {() => <p>Entered values</p>}
      </ActionForm>,
    );
    await user.click(screen.getByRole("button", { name: "Review inquiry" }));
    expect(await screen.findByRole("button", { name: "Confirm exact inquiry" })).toBeEnabled();
    expect(document.querySelector('input[name="_operationId"]')).toHaveValue("server-issued-key");
  });
  it("keeps a supplied business identity stable across server tree positions and distinct from a sibling", () => {
    const firstPosition = nativeFormPermalink(
      "/en/cases/example/email",
      "_R_first_",
      "email-approve:message A",
    );
    const reorderedPosition = nativeFormPermalink(
      "/en/cases/example/email",
      "_R_second_",
      "email-approve:message A",
    );
    expect(firstPosition).toBe("/en/cases/example/email#form-email-approve%3Amessage%20A");
    expect(reorderedPosition).toBe(firstPosition);
    expect(
      nativeFormPermalink("/en/cases/example/email", "_R_first_", "email-approve:message B"),
    ).not.toBe(firstPosition);
    expect(
      nativeFormPermalink(
        "/en/cases/example/email#history",
        "_R_second_",
        "email-approve:message A",
      ),
    ).toBe("/en/cases/example/email#history-email-approve%3Amessage%20A");
  });

  it("retains the existing positional permalink when no business identity is supplied", () => {
    expect(nativeFormPermalink("/practice", "_R_first_")).toBe("/practice#form-_R_first_");
    expect(nativeFormPermalink("/practice", "_R_second_")).toBe("/practice#form-_R_second_");
    expect(nativeFormPermalink("/practice#details", "_R_first_")).toBe(
      "/practice#details-_R_first_",
    );
  });

  it("retains native select changes and batches related field updates without losing either value", async () => {
    const action = vi.fn<FormAction<SpecimenValues>>(async (state, data) => ({
      ...state,
      responseId: "select-result",
      values: { subject: String(data.get("subject")), note: String(data.get("note")) },
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: "Review",
        fieldErrors: { note: ["Keep your draft"] },
      },
    }));
    render(
      <ActionForm
        action={action}
        initialState={initialState}
        permalink="/practice"
        reconciliation={{ href: "/status", label: "Status" }}
        copy={copy.form}
        labels={{ subject: "Contact method", note: "Contact value" }}
        submitLabel="Submit"
      >
        {(form) => (
          <>
            <label htmlFor="contact-method">Contact method</label>
            <select
              id="contact-method"
              name="subject"
              value={form.values.subject}
              disabled={form.pending}
              onChange={(event) => {
                form.setValue("subject", event.target.value);
                form.setValue("note", "Restored phone draft");
              }}
            >
              <option value="">Choose</option>
              <option value="phone">Phone</option>
            </select>
            <label htmlFor={form.field("note").id}>Contact value</label>
            <input {...form.field("note")} />
          </>
        )}
      </ActionForm>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Contact method"), "phone");
    expect(screen.getByLabelText("Contact value")).toHaveValue("Restored phone draft");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByRole("link", { name: "Contact value: Keep your draft" });
    expect(action.mock.calls[0]?.[1].get("subject")).toBe("phone");
    expect(action.mock.calls[0]?.[1].get("note")).toBe("Restored phone draft");
    expect(screen.getByLabelText("Contact method")).toHaveValue("phone");
    expect(screen.getByLabelText("Contact value")).toHaveValue("Restored phone draft");
  });

  it("retains all typed values, links each field error and refocuses repeated identical failures", async () => {
    const user = userEvent.setup();
    let attempt = 0;
    mount(async (state, data) => ({
      ...state,
      responseId: String(++attempt),
      values: { subject: String(data.get("subject")), note: String(data.get("note")) },
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: "Check",
        fieldErrors: { subject: [copy.subjectError] },
      },
    }));
    await user.type(screen.getByLabelText(copy.subject), "ab");
    await user.type(screen.getByLabelText(/Practice note/), "Keep my note");
    await user.click(screen.getByRole("button", { name: copy.submit }));
    const summary = await screen.findByRole("region", { name: copy.form.errorSummary });
    expect(summary).toHaveFocus();
    expect(screen.getByLabelText(copy.subject)).toHaveValue("ab");
    expect(screen.getByLabelText(/Practice note/)).toHaveValue("Keep my note");
    const input = screen.getByLabelText(copy.subject);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(`${copy.subjectHint} ${copy.subjectError}`);
    await user.click(screen.getByRole("link", { name: `${copy.subject}: ${copy.subjectError}` }));
    expect(input).toHaveFocus();
    await user.click(screen.getByRole("button", { name: copy.submit }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: copy.form.errorSummary })).toHaveFocus(),
    );
    expect(attempt).toBe(2);
  });

  it("blocks duplicate submissions while pending, retains a stable operation ID and does not erase the draft", async () => {
    let finish: ((state: FormState<SpecimenValues>) => void) | undefined;
    const action = vi.fn<FormAction<SpecimenValues>>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = mount(action);
    fireEvent.change(screen.getByLabelText(copy.subject), { target: { value: "Practice" } });
    const button = screen.getByRole("button", { name: copy.submit });
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(button);
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(copy.subject)).toHaveAttribute("readonly");
    expect(container.querySelector('[name="_operationId"]')).toHaveValue(initialState.operationId);
    await act(async () =>
      finish?.({
        ...initialState,
        responseId: "rejected",
        values: { subject: "Practice", note: "" },
        outcome: {
          kind: "rejected",
          code: "RATE_LIMITED",
          message: "Please try again later.",
          retryable: true,
        },
      }),
    );
    expect(screen.getByLabelText(copy.subject)).toHaveValue("Practice");
    expect(screen.getByLabelText(copy.subject)).not.toHaveAttribute("readonly");
  });

  it("shows the authorized latest projection without replacing draft values or revision, and requires deliberate reapply", async () => {
    const state: FormState<SpecimenValues> = {
      ...initialState,
      values: { subject: "My draft", note: "My note" },
      outcome: {
        kind: "conflict",
        code: "REVISION_CONFLICT",
        message: copy.conflict,
        latest: { revision: 2, values: { subject: "Another subject", note: "Another note" } },
        reapply: {
          operationId: "next-server-key",
          expectedRevision: 2,
          status: { href: "/operation/next-server-key", label: "Check operation" },
        },
      },
    };
    const action = vi.fn<FormAction<SpecimenValues>>(async (previous) => previous);
    const { container } = mount(action, state);
    expect(screen.getByLabelText(copy.subject)).toHaveValue("My draft");
    expect(screen.getByText("Current text: Another subject")).toBeVisible();
    expect(container.querySelector('[name="_expectedRevision"]')).toHaveValue("1");
    expect(action).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: copy.form.reapply }));
    const payload = action.mock.calls[0]?.[1];
    expect(payload?.get("_intent")).toBe("reapply");
    expect(payload?.get("_reapplyOperationId")).toBe("next-server-key");
    expect(payload?.get("_reapplyRevision")).toBe("2");
  });

  it.each(["accepted", "unknown"] as const)(
    "%s does not show a success receipt or an enabled command",
    (kind) => {
      mount(async (state) => state, {
        ...initialState,
        outcome:
          kind === "unknown"
            ? {
                kind,
                code: "OUTCOME_UNKNOWN",
                message: "Result unconfirmed",
                status: { href: "/status/same", label: "Check existing operation" },
              }
            : {
                kind,
                message: "Work accepted; delivery pending",
                status: { href: "/status/same", label: "Check existing operation" },
              },
      });
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(screen.queryByText(copy.confirmed)).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Check existing operation" })).toHaveAttribute(
        "href",
        "/status/same",
      );
    },
  );

  it("treats a lost transport response as unknown, preserving text and only offering reconciliation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(async () => {
      throw new Error("internal provider credential must not appear");
    });
    fireEvent.change(screen.getByLabelText(copy.subject), { target: { value: "Retained draft" } });
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    expect(await screen.findByText(copy.form.unknown)).toBeVisible();
    expect(screen.getByText("Retained draft")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/internal provider credential/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.status })).toHaveAttribute(
      "href",
      "/operation/server-issued-key",
    );
  });

  it("keeps text typed into a prefilled textarea before hydration, which resets it to the server text", async () => {
    const prefilled = {
      ...initialState,
      values: { subject: "Server subject", note: "Server note" },
    };
    const Specimen = () => (
      <SpecimenForm
        action={async (state) => state}
        initialState={prefilled}
        permalink="/practice"
        statusHref="/status"
        copy={copy}
      />
    );
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<Specimen />);
    const subject = container.querySelector<HTMLInputElement>('input[name="subject"]');
    const note = container.querySelector<HTMLTextAreaElement>('textarea[name="note"]');
    if (!subject || !note) throw new Error("Missing server-rendered fields");
    // A visitor replaces both values before JavaScript arrives.
    subject.value = "Typed subject";
    note.value = "Typed note";
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Specimen />);
      });
      expect(note).toHaveValue("Typed note");
      expect(subject).toHaveValue("Typed subject");
      const form = container.querySelector("form");
      if (!form) throw new Error("Missing hydrated form");
      expect(new FormData(form).get("note")).toBe("Typed note");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("reconciles the returned operation after restored validation, rather than the fresh page identity", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mount(
      async () => {
        throw new Error("transport lost");
      },
      {
        ...initialState,
        operationId: "reviewed-operation",
        reconciliation: { href: "/operation/reviewed-operation", label: copy.status },
        values: { subject: "My retained draft", note: "" },
        outcome: {
          kind: "validation",
          code: "VALIDATION_FAILED",
          message: copy.form.errorSummary,
          fieldErrors: { subject: [copy.subjectError] },
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: copy.submit }));
    await screen.findByText(copy.form.unknown);
    expect(screen.getByRole("link", { name: copy.status })).toHaveAttribute(
      "href",
      "/operation/reviewed-operation",
    );
  });
});
