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
function TimeForm() {
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
  it("does not preselect an autumn choice for a prefilled ordinary time", () => {
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
    input.value = "2026-10-25T03:30";
    expect(new FormData(form).get("dueAtOccurrence")).toBe("");
    expect(() => formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toThrow();
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

  it("stores the chosen fold, then clears it when another wall time is entered", () => {
    const { container } = render(<TimeForm />);
    fireEvent.change(screen.getByLabelText("Which occurrence?"), { target: { value: "earlier" } });
    expect(container.querySelector("output")?.textContent).toBe("2026-10-25T00:30:00.000Z");
    fireEvent.change(screen.getByLabelText("Follow-up"), { target: { value: "2026-10-25T04:30" } });
    expect(screen.getByLabelText("Which occurrence?")).toHaveValue("");
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing form");
    expect(formInstant(readTimeFormValues(new FormData(form), ["dueAt"]), "dueAt")).toBe(
      "2026-10-25T02:30:00.000Z",
    );
  });
});
