import {
  HebrewCalendar,
  parseDate,
  parseDateTime,
  parseZonedDateTime,
  toCalendar,
} from "@internationalized/date";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { type DateValue, I18nProvider } from "react-aria-components";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateField, type DateFieldProps, DatePicker } from "./date-picker";

afterEach(cleanup);

const initial = parseDate("2026-07-15");
const zone = "Bulgarian time (Europe/Sofia)";
const kinds = ["field", "picker"] as const;
type Kind = (typeof kinds)[number];
type ControlProps = Omit<DateFieldProps<DateValue>, "style" | "render">;

function Control({ kind, ...props }: ControlProps & { kind: Kind }) {
  return kind === "field" ? <DateField {...props} /> : <DatePicker {...props} />;
}

function nativeForm(kind: Kind, props: Partial<ControlProps> = {}) {
  return (
    <form>
      <Control kind={kind} label="Viewing" timeZoneLabel={zone} name="viewing" {...props} />
    </form>
  );
}

function serverContainer(element: React.ReactNode) {
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  return container;
}

function formData(container: HTMLElement) {
  const form = container.querySelector("form");
  if (!form) throw new Error("Missing native form");
  return new FormData(form);
}

function nativeInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>("[data-native-date-kind] input");
  if (!input) throw new Error("Missing native date entry");
  return input;
}

describe("M138 / UI11 progressive DateField and DatePicker", () => {
  it.each(kinds)(
    "%s renders a labelled native date and one successful value without JavaScript",
    (kind) => {
      const container = serverContainer(
        nativeForm(kind, {
          id: "viewing",
          description: "Choose an available day",
          defaultValue: initial,
          minValue: parseDate("2026-07-01"),
          maxValue: parseDate("2026-07-31"),
          isRequired: true,
        }),
      );
      try {
        const input = nativeInput(container);
        expect(input).toHaveAttribute("type", "date");
        expect(input).toHaveAccessibleName("Viewing");
        expect(input).toHaveAccessibleDescription(`Choose an available day ${zone}`);
        expect(input).toHaveAttribute("min", "2026-07-01");
        expect(input).toHaveAttribute("max", "2026-07-31");
        expect(input).toBeRequired();
        expect(formData(container).getAll("viewing")).toEqual(["2026-07-15"]);
        input.value = "2026-07-20";
        expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
        expect(input.checkValidity()).toBe(true);
        input.value = "2026-08-01";
        expect(input.validity.rangeOverflow).toBe(true);
        input.value = "";
        expect(input.validity.valueMissing).toBe(true);
        expect(container.querySelector('[role="spinbutton"]')).toBeNull();
      } finally {
        container.remove();
      }
    },
  );

  it.each([
    ["hour", "2026-07-15T09:00", "2026-07-01T08:00", 3600],
    ["minute", "2026-07-15T09:30", "2026-07-01T08:00", 60],
    ["second", "2026-07-15T09:30:42", "2026-07-01T08:00:01", 1],
  ] as const)(
    "posts exact local %s values with native constraints",
    (granularity, value, min, step) => {
      const container = serverContainer(
        nativeForm("picker", {
          granularity,
          defaultValue: parseDateTime(value),
          minValue: parseDateTime(min),
          maxValue: parseDateTime("2026-07-31T18:00"),
        }),
      );
      try {
        const input = nativeInput(container);
        expect(input).toHaveAttribute("type", "datetime-local");
        expect(input).toHaveAttribute("step", String(step));
        expect(input).toHaveAttribute("min", parseDateTime(min).toString());
        expect(input).toHaveAttribute("max", "2026-07-31T18:00:00");
        expect(input.checkValidity()).toBe(true);
        const values = formData(container).getAll("viewing");
        expect(values).toHaveLength(1);
        expect(parseDateTime(String(values[0])).toString()).toBe(parseDateTime(value).toString());
      } finally {
        container.remove();
      }
    },
  );

  it("preserves disabled, read-only, external form and validation semantics in server HTML", () => {
    const container = serverContainer(
      <>
        <form id="external" />
        <DateField
          label="Disabled"
          timeZoneLabel={zone}
          name="disabled"
          form="external"
          defaultValue={initial}
          isDisabled
        />
        <DatePicker
          label="Read only"
          timeZoneLabel={zone}
          name="readonly"
          form="external"
          defaultValue={initial}
          isReadOnly
          isInvalid
          errorMessage="Check the source"
        />
        <DateField
          label="ARIA validation"
          timeZoneLabel={zone}
          name="aria"
          form="external"
          isRequired
          validationBehavior="aria"
        />
      </>,
    );
    try {
      const disabled = container.querySelector('input[name="disabled"]');
      const readonly = container.querySelector('input[name="readonly"]');
      const aria = container.querySelector('input[name="aria"]');
      expect(disabled).toBeDisabled();
      expect(readonly).toHaveAttribute("readonly");
      expect(readonly).toHaveAttribute("aria-invalid", "true");
      expect(readonly).toHaveAccessibleDescription(`${zone} Check the source`);
      expect(aria).not.toHaveAttribute("required");
      expect(aria).toHaveAttribute("aria-required", "true");
      expect(formData(container).getAll("disabled")).toEqual([]);
      expect(formData(container).getAll("readonly")).toEqual([initial.toString()]);
    } finally {
      container.remove();
    }
  });

  it.each(kinds)(
    "%s adopts a pre-hydration edit once and keeps a single form value",
    async (kind) => {
      const onChange = vi.fn();
      const element = nativeForm(kind, { defaultValue: initial, onChange });
      const container = serverContainer(element);
      nativeInput(container).value = "2026-07-20";
      const recover = vi.fn();
      let root: Root | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(container, element, { onRecoverableError: recover });
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0]?.[0]?.toString()).toBe("2026-07-20");
        expect(container.querySelector("[data-native-date-kind]")).toBeNull();
        expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
        expect(recover).not.toHaveBeenCalled();
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    },
  );

  it("keeps a focused native editor and its value until blur", async () => {
    const onChange = vi.fn();
    const element = nativeForm("picker", { defaultValue: initial, onChange });
    const container = serverContainer(element);
    const input = nativeInput(container);
    input.focus();
    input.value = "2026-07-20";
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      expect(input).toHaveFocus();
      expect(nativeInput(container)).toBe(input);
      expect(input).toHaveValue("2026-07-20");
      expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
      await act(async () => {
        input.blur();
      });
      expect(container.querySelector("[data-native-date-kind]")).toBeNull();
      expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("holds incomplete native segments instead of interpreting bad input as a clear", async () => {
    const onChange = vi.fn();
    const element = nativeForm("picker", { defaultValue: initial, onChange });
    const container = serverContainer(element);
    const input = nativeInput(container);
    input.value = "";
    // jsdom has no native date sub-editor; real browsers expose this for partial date entry.
    let badInput = true;
    Object.defineProperty(input, "validity", { get: () => ({ badInput }) });
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      expect(nativeInput(container)).toBe(input);
      expect(onChange).not.toHaveBeenCalled();
      badInput = false;
      fireEvent.change(input, { target: { value: "2026-07-20" } });
      expect(container.querySelector("[data-native-date-kind]")).toBeNull();
      expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
      expect(onChange).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it.each([
    { value: initial, raw: "", expected: "" },
    {
      value: parseDateTime("2026-07-15T09:30"),
      raw: "2026-07-15T10:45",
      expected: "2026-07-15T10:45:00",
    },
    {
      value: parseDateTime("2026-07-15T09:30:42"),
      raw: "2026-07-15T10:45:43",
      expected: "2026-07-15T10:45:43",
      granularity: "second" as const,
    },
  ])(
    "adopts a pre-hydration native edit to $raw without changing its value kind",
    async ({ value, raw, expected, granularity }) => {
      const onChange = vi.fn();
      const element = nativeForm("picker", { defaultValue: value, granularity, onChange });
      const container = serverContainer(element);
      nativeInput(container).value = raw;
      let root: Root | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(container, element);
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0]?.[0];
        expect(next?.toString() ?? "").toBe(expected);
        if (next) expect(next.constructor).toBe(value.constructor);
        expect(formData(container).getAll("viewing")).toEqual([expected]);
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    },
  );

  it("waits for a controlled parent to accept a pre-hydration edit", async () => {
    const onChange = vi.fn();
    const element = nativeForm("field", { value: initial, onChange });
    const container = serverContainer(element);
    const input = nativeInput(container);
    input.value = "2026-07-20";
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      expect(input).toHaveValue("2026-07-20");
      expect(nativeInput(container)).toBe(input);
      expect(onChange).toHaveBeenCalledTimes(1);
      await act(async () => {
        root?.render(element);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
      await act(async () => {
        root?.render(nativeForm("field", { value: parseDate("2026-07-20"), onChange }));
      });
      expect(container.querySelector("[data-native-date-kind]")).toBeNull();
      expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("enhances an accepting controlled parent without duplicate callbacks", async () => {
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState<DateValue | null>(initial);
      return nativeForm("picker", {
        value,
        onChange: (next) => {
          onChange(next);
          setValue(next);
        },
      });
    }
    const container = serverContainer(<Controlled />);
    nativeInput(container).value = "2026-07-20";
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <Controlled />);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(container.querySelector("[data-native-date-kind]")).toBeNull();
      expect(formData(container).getAll("viewing")).toEqual(["2026-07-20"]);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("keeps exact zoned offsets/folds and finer-than-displayed precision in canonical baselines", async () => {
    const values = [
      parseZonedDateTime("2026-10-25T03:30:42.125+02:00[Europe/Sofia]"),
      parseZonedDateTime("2026-10-25T03:30:42.125+03:00[Europe/Sofia]"),
      parseDateTime("2026-07-15T09:30:42.125"),
    ];
    for (const value of values) {
      const onChange = vi.fn();
      const element = nativeForm("picker", {
        defaultValue: value,
        granularity: "minute",
        onChange,
      });
      const container = serverContainer(element);
      let root: Root | undefined;
      try {
        expect(nativeInput(container)).toHaveAttribute("type", "text");
        expect(formData(container).getAll("viewing")).toEqual([value.toString()]);
        await act(async () => {
          root = hydrateRoot(container, element);
        });
        expect(formData(container).getAll("viewing")).toEqual([value.toString()]);
        expect(onChange).not.toHaveBeenCalled();
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    }
  });

  it.each([
    "2026-10-25T03:30[Europe/Sofia]",
    "2026-10-25T03:30+01:00[Europe/Sofia]",
    "2026-10-25T03:30+01:00[Europe/London]",
  ])("holds unsupported zoned edit %s without choosing an offset or zone", async (raw) => {
    const onChange = vi.fn();
    const value = parseZonedDateTime("2026-10-25T03:30+02:00[Europe/Sofia]");
    const element = nativeForm("picker", { defaultValue: value, onChange });
    const container = serverContainer(element);
    const input = nativeInput(container);
    input.value = raw;
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element);
      });
      expect(nativeInput(container)).toBe(input);
      expect(input).toHaveValue(raw);
      expect(onChange).not.toHaveBeenCalled();
      expect(formData(container).getAll("viewing")).toEqual([raw]);
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("preserves the calendar and an explicitly edited zoned occurrence during hydration", async () => {
    const cases = [
      { value: toCalendar(initial, new HebrewCalendar()), raw: "2026-07-20", calendar: "hebrew" },
      {
        value: parseZonedDateTime("2026-10-25T03:30+02:00[Europe/Sofia]"),
        raw: "2026-10-25T03:30+03:00[Europe/Sofia]",
        calendar: "gregory",
      },
    ];
    for (const { value, raw, calendar } of cases) {
      const onChange = vi.fn();
      const element = nativeForm("field", { defaultValue: value, onChange });
      const container = serverContainer(element);
      nativeInput(container).value = raw;
      let root: Root | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(container, element);
        });
        expect(onChange).toHaveBeenCalledTimes(1);
        const next = onChange.mock.calls[0]?.[0];
        if (!next) throw new Error("Missing adopted date");
        expect(next.calendar.identifier).toBe(calendar);
        expect(next.toString()).toBe(
          calendar === "hebrew" ? raw : parseZonedDateTime(raw).toString(),
        );
        expect(formData(container).getAll("viewing")).toEqual([next.toString()]);
      } finally {
        await act(async () => root?.unmount());
        container.remove();
      }
    }
  });

  it("supports keyboard date edits after enhancement and native RTL reading order", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <I18nProvider locale="ar">
        {nativeForm("field", { defaultValue: initial, onChange, dir: "rtl" })}
      </I18nProvider>,
    );
    const day = container.querySelector<HTMLElement>('[data-type="day"]');
    if (!day) throw new Error("Missing enhanced day segment");
    expect(day).toHaveClass("min-h-control", "min-w-control");
    expect(day.closest("[dir]")).toHaveAttribute("dir", "rtl");
    day.focus();
    await user.keyboard("{ArrowUp}");
    expect(formData(container).getAll("viewing")).toEqual(["2026-07-16"]);
    expect(onChange).toHaveBeenCalledTimes(1);

    const native = serverContainer(nativeForm("field", { defaultValue: initial, dir: "rtl" }));
    try {
      expect(native.querySelector("[data-native-date-kind]")).toHaveAttribute("dir", "rtl");
      expect(nativeInput(native)).toHaveAttribute("dir", "ltr");
      expect(nativeInput(native)).toHaveClass("min-h-input", "focus-visible:outline-3");
    } finally {
      native.remove();
    }
  });

  it("retains library controlled callbacks and native form reset after enhancement", () => {
    const onChange = vi.fn();
    const { container } = render(nativeForm("field", { defaultValue: initial, onChange }));
    const day = container.querySelector<HTMLElement>('[data-type="day"]');
    if (!day) throw new Error("Missing enhanced day segment");
    day.focus();
    fireEvent.keyDown(day, { key: "ArrowUp" });
    expect(formData(container).getAll("viewing")).toEqual(["2026-07-16"]);
    const form = container.querySelector("form");
    if (!form) throw new Error("Missing form");
    act(() => form.reset());
    expect(formData(container).getAll("viewing")).toEqual(["2026-07-15"]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(screen.getByText(zone)).toBeVisible();
  });
});
