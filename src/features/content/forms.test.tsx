import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentPlaceOption } from "@/server/content/commands";
import type { FormAction, FormState } from "@/ui/form/contract";
import type { ContentValues } from "./actions";
import { contentCopy } from "./copy";
import { ContentForm } from "./forms";

afterEach(cleanup);
const copy = contentCopy("en");
const places: ContentPlaceOption[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    level: "settlement",
    countryCode: "BG",
    nameNative: "Тестово място",
    nameLatin: "Test place",
    context: "Първа тестова община",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    level: "settlement",
    countryCode: "BG",
    nameNative: "Тестово място",
    nameLatin: "Test place",
    context: "Друга тестова община",
  },
];
function initial(placeId = ""): FormState<ContentValues> {
  return {
    operationId: "server-issued-content-key",
    expectedRevision: 1,
    responseId: "initial",
    values: {
      kind: "area",
      slug: "test-guide",
      title: "Тестов материал",
      text: "Synthetic test only.",
      jurisdiction: "Test scope",
      reviewScope: "Synthetic review",
      placeId,
    },
    outcome: { kind: "idle" },
  };
}
const idle: FormAction<ContentValues> = async (state) => state;

describe("O21 / P15B explicit edition place chooser", () => {
  it("renders a native named choice with exact identities and disambiguating ancestry for an HTML submission", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <ContentForm
        locale="en"
        id="test-page"
        places={places}
        initialState={initial(places[1]?.id)}
        action={idle}
      />,
    );
    const form = container.querySelector("form");
    const select = container.querySelector<HTMLSelectElement>('select[name="placeId"]');
    if (!form || !select) throw new Error("Missing native content form");
    expect(select.value).toBe(places[1]?.id);
    expect(new FormData(form).get("placeId")).toBe(places[1]?.id);
    expect(select.options[1]?.label).toContain("Първа тестова община");
    expect(select.options[2]?.label).toContain("Друга тестова община");
    select.value = "";
    expect(new FormData(form).get("placeId")).toBe("");
  });

  it("preserves a place selected before hydration and submits that same choice after enhancement", async () => {
    const action = vi.fn<FormAction<ContentValues>>(async (state) => state);
    const container = document.createElement("div");
    document.body.append(container);
    const form = (
      <ContentForm
        locale="en"
        id="test-page"
        places={places}
        initialState={initial()}
        action={action}
      />
    );
    container.innerHTML = renderToString(form);
    const select = container.querySelector<HTMLSelectElement>('select[name="placeId"]');
    if (!select) throw new Error("Missing native place chooser");
    select.value = places[1]?.id ?? "";
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, form);
      });
      expect(select).toHaveValue(places[1]?.id);
      await userEvent.click(screen.getByRole("button", { name: copy.save }));
      await waitFor(() => expect(action).toHaveBeenCalledOnce());
      expect(action.mock.calls[0]?.[1].get("placeId")).toBe(places[1]?.id);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("retains a rejected selection with an associated UI06 error below the control", async () => {
    const action: FormAction<ContentValues> = async (state, data) => ({
      ...state,
      responseId: "rejected-place",
      values: { ...state.values, placeId: String(data.get("placeId")) },
      outcome: {
        kind: "validation",
        code: "VALIDATION_FAILED",
        message: copy.validation,
        fieldErrors: { placeId: [copy.placeUnavailable] },
      },
    });
    render(
      <ContentForm
        locale="en"
        id="test-page"
        places={places}
        initialState={initial()}
        action={action}
      />,
    );
    const select = screen.getByRole("combobox", { name: copy.place });
    await userEvent.selectOptions(select, places[0]?.id ?? "");
    await userEvent.click(screen.getByRole("button", { name: copy.save }));
    await waitFor(() => expect(select).toHaveAttribute("aria-invalid", "true"));
    expect(select).toHaveValue(places[0]?.id);
    const error = document.getElementById(`${select.id}-error`);
    expect(error).toHaveTextContent(copy.placeUnavailable);
    expect(select.getAttribute("aria-describedby")).toContain(error?.id);
    expect(select.nextElementSibling).toBe(error);
  });

  it("shows an honest empty register and keeps an unavailable recorded identity rather than silently clearing it", () => {
    const missing = "10000000-0000-4000-8000-000000000003";
    render(
      <ContentForm
        locale="en"
        id="test-page"
        places={[]}
        initialState={initial(missing)}
        action={idle}
      />,
    );
    const select = screen.getByRole("combobox", { name: copy.place });
    expect(screen.getByText(copy.placesEmpty)).toBeVisible();
    expect(select).toHaveValue(missing);
    expect(
      screen.getByRole("option", { name: `${copy.placeUnavailable}: ${missing}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: copy.unbound })).toHaveValue("");
  });

  it("retains the binding in the native submission while a register outage disables changing it", () => {
    const state = initial(places[0]?.id);
    render(
      <ContentForm
        locale="en"
        id="test-page"
        places={[]}
        placesAvailable={false}
        initialState={state}
        action={idle}
      />,
    );
    const select = screen.getByRole("combobox", { name: copy.place });
    expect(select).toBeDisabled();
    expect(screen.getByText(copy.placesUnavailable)).toBeVisible();
    const form = select.closest("form");
    if (!form) throw new Error("Missing native form");
    expect(new FormData(form).getAll("placeId")).toEqual([places[0]?.id]);
  });

  it("filters a large register by source names, Latin names and ancestry without losing the selected identity", async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      ...(places[0] as ContentPlaceOption),
      id: `test-place-${index}`,
      nameNative: `Тест ${index}`,
      nameLatin: `Test ${index}`,
      context: `Община ${index}`,
    }));
    render(
      <ContentForm
        locale="en"
        id="test-page"
        places={many}
        initialState={initial(many[39]?.id)}
        action={idle}
      />,
    );
    const filter = screen.getByRole("searchbox", { name: copy.placeFilter });
    const select = screen.getByRole("combobox", { name: copy.place });
    await userEvent.type(filter, "Test 0");
    expect(select).toHaveValue(many[39]?.id);
    expect(screen.getAllByRole("option")).toHaveLength(3); // Unbound, selected and matching.
    await userEvent.clear(filter);
    await userEvent.type(filter, "Община 22");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await userEvent.clear(filter);
    await userEvent.type(filter, "unmatched");
    expect(screen.getByText(copy.noPlaceMatches)).toBeVisible();
    expect(select).toHaveValue(many[39]?.id);
    await userEvent.clear(filter);
    expect(screen.getAllByRole("option")).toHaveLength(41);
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <ContentForm
        locale="en"
        id="test-page"
        places={many}
        initialState={initial(many[39]?.id)}
        action={idle}
      />,
    );
    expect(container.querySelectorAll("option")).toHaveLength(41);
    expect(container.querySelector('input[type="search"]')).toBeNull();
  });

  it("makes new-page choices inert for service/help after enhancement and re-enables the retained selection for an area guide", async () => {
    const state = initial(places[0]?.id);
    state.values.kind = "help";
    render(<ContentForm locale="en" places={places} initialState={state} action={idle} />);
    const choice = screen.getByRole("combobox", { name: copy.place });
    const kind = screen.getByRole("combobox", { name: copy.kind });
    expect(choice).toBeDisabled();
    expect(screen.getByText(copy.areaPlaceOnly)).toBeVisible();
    await userEvent.selectOptions(kind, "area");
    expect(choice).toBeEnabled();
    expect(choice).toHaveValue(places[0]?.id);
    await userEvent.selectOptions(kind, "service");
    expect(choice).toBeDisabled();
    await userEvent.selectOptions(kind, "area");
    expect(choice).toBeEnabled();
    expect(choice).toHaveValue(places[0]?.id);
    const container = document.createElement("div");
    container.innerHTML = renderToString(
      <ContentForm locale="en" places={places} initialState={state} action={idle} />,
    );
    // The native form lets an editor select Area and a place in one HTML submission.
    expect(container.querySelector<HTMLSelectElement>('select[name="placeId"]')?.disabled).toBe(
      false,
    );
  });

  it.each(["service", "help"])("keeps the geography chooser out of the %s workbench", (kind) => {
    const state = initial();
    state.values.kind = kind;
    render(
      <ContentForm locale="en" id="test-page" places={[]} initialState={state} action={idle} />,
    );
    expect(screen.queryByRole("combobox", { name: copy.place })).not.toBeInTheDocument();
  });
});
