import { act, cleanup } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it } from "vitest";
import type { FormState, FormValues } from "./contract";
import { ActionForm } from "./form";
import { formSpecimenCopy } from "./specimen-copy";

afterEach(cleanup);
const initialState: FormState<FormValues> = {
  operationId: "synthetic-form-operation",
  expectedRevision: 4,
  responseId: "initial",
  values: { reason: "Retained draft" },
  outcome: { kind: "idle" },
};
function NavigationHint({ enhancementField }: { enhancementField?: string }) {
  return (
    <ActionForm
      action={async (state) => state}
      initialState={initialState}
      permalink="/proposal"
      reconciliation={{ href: "/status", label: "Status" }}
      copy={formSpecimenCopy("en").form}
      labels={{ reason: "Reason" }}
      submitLabel="Submit counteroffer"
      enhancementField={enhancementField}
    >
      {(form) => (
        <label>
          Reason
          <input {...form.field("reason")} />
        </label>
      )}
    </ActionForm>
  );
}

it("marks only a hydrated submission while preserving the native draft and envelope", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = renderToString(<NavigationHint enhancementField="_navigationHint" />);
  const nativeForm = container.querySelector("form");
  const input = container.querySelector<HTMLInputElement>('input[name="reason"]');
  if (!nativeForm || !input) throw new Error("Missing native form");
  input.value = "Native typed draft";
  const native = new FormData(nativeForm);
  expect(native.get("_navigationHint")).toBe("");
  expect(native.get("reason")).toBe("Native typed draft");
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, <NavigationHint enhancementField="_navigationHint" />);
    });
    const enhanced = new FormData(nativeForm);
    expect(enhanced.getAll("_navigationHint")).toEqual(["yes"]);
    expect(enhanced.get("reason")).toBe("Native typed draft");
    expect(enhanced.get("_operationId")).toBe(native.get("_operationId"));
    expect(enhanced.get("_expectedRevision")).toBe(native.get("_expectedRevision"));
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});

it("adds no navigation hint to forms that do not opt in", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<NavigationHint />);
  const data = new FormData(container.querySelector("form") ?? undefined);
  expect(data.has("_navigationHint")).toBe(false);
});
