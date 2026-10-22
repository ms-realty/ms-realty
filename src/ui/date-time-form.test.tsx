import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { formInstant, readTimeFormValues } from "@/server/forms/time";
import { DateTimeField } from "./date-time-field";
import { ActionForm } from "./form/form";
import { formSpecimenCopy } from "./form/specimen-copy";

afterEach(cleanup);
const original = "2026-10-25T01:30:42.125Z";
function TimeForm({ seconds = false }: { seconds?: boolean } = {}) {
  return (
    <ActionForm
      action={async (state) => state}
      initialState={{
        operationId: "time-test",
        expectedRevision: 1,
        responseId: "initial",
        values: { dueAt: original },
        outcome: { kind: "idle" },
      }}
      permalink="/en/tasks/example"
      reconciliation={{ href: "/status", label: "Status" }}
      copy={formSpecimenCopy("en").form}
      labels={{ dueAt: "Follow-up" }}
      submitLabel="Save"
    >
      {(form) => (
        <>
          <DateTimeField
            {...form.field("dueAt")}
            step={seconds ? 1 : undefined}
            label="Follow-up"
            locale="en"
            onValueChange={(value) => form.setValue("dueAt", value)}
          />
          <output data-logical-value>{form.values.dueAt}</output>
        </>
      )}
    </ActionForm>
  );
}

describe("UI11 progressive exact-instant entry", () => {
  it("keeps typed seconds and the native one-second step for a contact observation", () => {
    const { container } = render(<TimeForm seconds />);
    const input = screen.getByLabelText("Follow-up");
    expect(input).toHaveAttribute("step", "1");
    expect(input).toHaveValue("2026-10-25T03:30:42");
    fireEvent.change(input, { target: { value: "2026-10-25T03:30:43" } });
    fireEvent.change(screen.getByLabelText("Which of the two?"), { target: { value: "earlier" } });
    expect(container.querySelector("output")?.textContent).toBe("2026-10-25T00:30:43.000Z");
    expect(container.querySelector('[id$="-readback"]')).toHaveTextContent("03:30:43");
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing native form");
    expect(formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toBe(
      "2026-10-25T00:30:43.000Z",
    );
  });

  it("preserves native second edits across hydration without changing minute-only defaults", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<TimeForm seconds />);
    const input = container.querySelector<HTMLInputElement>('input[name="dueAt"]');
    const select = container.querySelector<HTMLSelectElement>('select[name="dueAtOccurrence"]');
    const form = container.querySelector("form");
    if (!input || !select || !form) throw new Error("Missing native time form");
    expect(formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toBe(original);
    input.value = "2026-10-25T03:30:44";
    select.value = "earlier";
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <TimeForm seconds />);
      });
      expect(container.querySelector("output")?.textContent).toBe("2026-10-25T00:30:44.000Z");
      expect(input.value).toBe("2026-10-25T03:30:44");
      expect(formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toBe(
        "2026-10-25T00:30:44.000Z",
      );
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
    const minute = document.createElement("div");
    minute.innerHTML = renderToString(<TimeForm />);
    expect(minute.querySelector('input[type="datetime-local"]')).not.toHaveAttribute("step");
    expect(minute.querySelector<HTMLInputElement>('input[name="dueAt"]')?.value).toBe(
      "2026-10-25T03:30",
    );
  });
  it("offers no autumn choice for an ordinary time; the server asks after a native post", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <form>
        <DateTimeField
          id="due"
          name="dueAt"
          label="Follow-up"
          locale="en"
          defaultValue="2026-07-15T09:00:42Z"
        />
      </form>,
    );
    const input = container.querySelector<HTMLInputElement>('input[name="dueAt"]');
    const form = container.querySelector("form");
    if (!input || !form) throw new Error("Missing native time form");
    expect(container.querySelector('select[name="dueAtOccurrence"]')).toBeNull();
    input.value = "2026-10-25T03:30";
    expect(new FormData(form).get("dueAtOccurrence")).toBeNull();
    expect(() => formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toThrow();
    // The rejected value comes back with the choice it now needs.
    const again = document.createElement("div");
    again.innerHTML = renderToString(
      <DateTimeField
        id="due"
        name="dueAt"
        label="Follow-up"
        locale="en"
        defaultValue="2026-10-25T03:30"
        error="This time happens twice: the clocks go back one hour that night. Choose which one you mean."
      />,
    );
    expect(again.querySelector('select[name="dueAtOccurrence"]')).not.toBeNull();
  });
  it("native HTML posts the agency wall time, selected fold and exact prefill without JavaScript", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<TimeForm />);
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing native form");
    const data = new FormData(form);
    expect(data.get("dueAt")).toBe("2026-10-25T03:30");
    expect(data.get("dueAtOccurrence")).toBe("later");
    expect(formInstant(readTimeFormValues(data, ["dueAt"]), "dueAt")).toBe(original);
  });

  it("hydration keeps an untouched prefill's sub-minute precision and fold", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<TimeForm />);
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <TimeForm />);
      });
      expect(container.querySelector("output")?.textContent).toBe(original);
      const input = container.querySelector<HTMLInputElement>('input[name="dueAt"]');
      if (!input) throw new Error("Missing native input");
      expect(input.value).toBe("2026-10-25T03:30");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("adopts edits made to the wall time and fold before hydration", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    container.innerHTML = renderToString(<TimeForm />);
    const choice = container.querySelector<HTMLSelectElement>('select[name="dueAtOccurrence"]');
    if (!choice) throw new Error("Missing native fold choice");
    choice.value = "earlier";
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <TimeForm />);
      });
      expect(container.querySelector("output")?.textContent).toBe("2026-10-25T00:30:00.000Z");
      expect(choice.value).toBe("earlier");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("stores the chosen fold, then drops the choice when another wall time is entered", () => {
    const { container } = render(<TimeForm />);
    fireEvent.change(screen.getByLabelText("Which of the two?"), { target: { value: "earlier" } });
    expect(container.querySelector("output")?.textContent).toBe("2026-10-25T00:30:00.000Z");
    fireEvent.change(screen.getByLabelText("Follow-up"), { target: { value: "2026-10-25T04:30" } });
    // 04:30 happens once that night, so there is nothing to choose.
    expect(screen.queryByLabelText("Which of the two?")).toBeNull();
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing form");
    expect(formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toBe(
      "2026-10-25T02:30:00.000Z",
    );
  });
});
