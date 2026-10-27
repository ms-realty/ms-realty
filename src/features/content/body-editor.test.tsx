import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FormAction, FormState } from "@/ui/form/contract";
import type { ContentValues } from "./actions";
import { contentBodyCopy } from "./body-copy";
import { contentBodyValues, readCompositionFields } from "./body-fields";
import { contentDraftInput } from "./body-input";
import { contentCopy } from "./copy";
import { ContentForm } from "./forms";

afterEach(cleanup);
const copy = contentBodyCopy("en");
function initial(): FormState<ContentValues> {
  return {
    operationId: "synthetic-block-operation",
    expectedRevision: 1,
    responseId: "initial",
    outcome: { kind: "idle" },
    values: {
      kind: "service",
      slug: "synthetic",
      title: "Synthetic source",
      jurisdiction: "Synthetic",
      reviewScope: "Synthetic only",
      placeId: "",
      ...contentBodyValues({
        format: "blocks",
        title: "Synthetic source",
        blocks: [
          { type: "heading", text: "Initial heading" },
          { type: "step", title: "Initial step", text: "Initial instruction" },
        ],
      }),
    },
  };
}
const idle: FormAction<ContentValues> = async (state) => state;

describe("O21 typed authoring and native continuation", () => {
  it("creates process steps through named HTML controls with no script or hidden-snapshot authority", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToString(
      <ContentForm locale="en" id="synthetic" places={[]} initialState={initial()} action={idle} />,
    );
    const form = host.querySelector("form");
    if (!form) throw new Error("Missing native form");
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement;
    field("bodyBlocks.0.text").value = "Native heading";
    field("bodyBlocks.1.title").value = "Native first step";
    field("bodyBlocks.1.text").value = "Exact native details";
    field("bodyBlocks.2.type").value = "link";
    field("bodyBlocks.2.text").value = "Contact";
    field("bodyBlocks.2.href").value = "/bg/contact";
    const data = new FormData(form);
    expect(
      contentDraftInput({ ...initial().values, composition: readCompositionFields(data, "stale") }),
    ).toEqual({
      text: undefined,
      blocks: [
        { type: "heading", text: "Native heading" },
        { type: "step", title: "Native first step", text: "Exact native details" },
        { type: "link", text: "Contact", href: "/bg/contact" },
      ],
    });
  });

  it("preserves typed text and block choices entered before hydration", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const element = (
      <ContentForm locale="en" id="synthetic" places={[]} initialState={initial()} action={idle} />
    );
    host.innerHTML = renderToString(element);
    const text = host.querySelector<HTMLTextAreaElement>('[name="bodyBlocks.1.text"]');
    const type = host.querySelector<HTMLSelectElement>('[name="bodyBlocks.2.type"]');
    const heading = host.querySelector<HTMLTextAreaElement>('[name="bodyBlocks.2.text"]');
    if (!text || !type || !heading) throw new Error("Missing native block fields");
    text.value = "טקסט מדויק MS-00001\nSecond exact line";
    type.value = "heading";
    heading.value = "New native heading";
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(host, element);
      });
      expect(host.querySelector('[name="bodyBlocks.1.text"]')).toHaveValue(
        "טקסט מדויק MS-00001\nSecond exact line",
      );
      expect(host.querySelector('[name="bodyBlocks.2.type"]')).toHaveValue("heading");
      expect(host.querySelector('[name="bodyBlocks.2.text"]')).toHaveValue("New native heading");
    } finally {
      await act(async () => root?.unmount());
      host.remove();
    }
  });

  it("edits and reorders typed blocks using keyboard-accessible controls, then submits their exact order", async () => {
    const action = vi.fn<FormAction<ContentValues>>(async (state) => state);
    const { container } = render(
      <ContentForm
        locale="en"
        id="synthetic"
        places={[]}
        initialState={initial()}
        action={action}
      />,
    );
    const details = container.querySelectorAll("details");
    const first = details[0];
    if (!first) throw new Error("Missing first block");
    const text = within(first).getByRole("textbox", { name: copy.text });
    await userEvent.clear(text);
    await userEvent.type(text, "Edited heading");
    await userEvent.click(within(first).getByRole("button", { name: copy.down }));
    expect(container.querySelector('[name="bodyBlocks.0.type"]')).toHaveValue("step");
    expect(container.querySelector('[name="bodyBlocks.1.text"]')).toHaveValue("Edited heading");
    await userEvent.click(screen.getByRole("button", { name: contentCopy("en").save }));
    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const data = action.mock.calls[0]?.[1];
    if (!data) throw new Error("Missing submitted draft");
    expect(
      contentDraftInput({ ...initial().values, composition: readCompositionFields(data, "stale") }),
    ).toEqual({
      text: undefined,
      blocks: [
        { type: "step", title: "Initial step", text: "Initial instruction" },
        { type: "heading", text: "Edited heading" },
      ],
    });
  });
});
