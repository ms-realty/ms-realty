import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { currencyCodes, type PublicLocale, publicLocales } from "@/domain/ids";
import { formatMoneyInput } from "@/i18n/money";
import { moneyCopy } from "@/i18n/money-copy";
import { amountToMinor } from "@/server/proposals/terms";
import type { FormAction, FormValues } from "@/ui/form/contract";
import { WorkflowForm } from "./form";

afterEach(cleanup);
function MoneyForm({
  locale = "en",
  action = async (state) => state,
}: {
  locale?: PublicLocale;
  action?: FormAction<FormValues>;
}) {
  const copy = moneyCopy(locale);
  return (
    <WorkflowForm
      locale={locale}
      action={action}
      initialState={{
        operationId: "synthetic-money-operation",
        expectedRevision: 1,
        responseId: "initial",
        values: { amount: formatMoneyInput(locale, 10200001, "EUR"), currency: "EUR" },
        outcome: { kind: "idle" },
      }}
      fields={[
        {
          name: "amount",
          label: copy.amount,
          type: "money",
          required: true,
          currencyField: "currency",
        },
        {
          name: "currency",
          label: copy.currency,
          type: "select",
          required: true,
          options: currencyCodes.map((value) => ({ value, label: value })),
        },
      ]}
      path={`/${locale}/proposals/example`}
      status={{ href: "/status", label: "Status" }}
      submit="Submit revised terms"
      disclosure="Propose revised terms"
    />
  );
}

it.each(publicLocales)("renders a native exact %s amount with visible ISO currency", (locale) => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(<MoneyForm locale={locale} />);
  const details = container.querySelector("details");
  expect(details?.open).toBe(false);
  const input = container.querySelector<HTMLInputElement>('input[name="amount"]');
  expect(input).toHaveAttribute("type", "text");
  expect(input).toHaveAttribute("inputmode", "decimal");
  expect(input).toHaveAttribute("dir", "ltr");
  expect(input).toHaveValue(formatMoneyInput(locale, 10200001, "EUR"));
  expect(container.querySelector(`label[for="${input?.id}"]`)).toHaveTextContent(
    `${moneyCopy(locale).amount} (EUR)`,
  );
  // Native typing posts localized text. The same server parser reads it without a hidden amount.
  if (!input) throw new Error("Missing amount");
  input.value = formatMoneyInput(locale, Number.MAX_SAFE_INTEGER, "EUR");
  const data = new FormData(container.querySelector("form") ?? undefined);
  expect(data.getAll("amount")).toEqual([input.value]);
  expect(amountToMinor(String(data.get("amount")), locale, "EUR")).toBe(Number.MAX_SAFE_INTEGER);
});

it("formats on blur, binds currency without conversion and preserves exact validation input", async () => {
  const action = vi.fn<FormAction<FormValues>>(async (state, data) => ({
    ...state,
    responseId: "money-validation",
    values: Object.fromEntries(
      ["amount", "currency"].map((name) => [name, String(data.get(name))]),
    ),
    outcome: {
      kind: "validation",
      code: "VALIDATION_FAILED",
      message: "Review the amount",
      fieldErrors: { amount: ["Review this exact amount"] },
    },
  }));
  render(<MoneyForm locale="de" action={action} />);
  await userEvent.click(screen.getByText("Propose revised terms"));
  const amount = screen.getByRole("textbox", { name: "Betrag (EUR)" });
  await userEvent.clear(amount);
  await userEvent.type(amount, "90071992547409,91");
  await userEvent.tab();
  expect(amount).toHaveValue("90.071.992.547.409,91");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "Währung" }), "BGN");
  expect(screen.getByRole("textbox", { name: "Betrag (BGN)" })).toHaveValue(
    "90.071.992.547.409,91",
  );
  await userEvent.click(screen.getByRole("button", { name: "Submit revised terms" }));
  await waitFor(() => expect(action).toHaveBeenCalledOnce());
  const posted = action.mock.calls[0]?.[1];
  expect(posted?.get("currency")).toBe("BGN");
  expect(amountToMinor(String(posted?.get("amount")), "de", "BGN")).toBe(Number.MAX_SAFE_INTEGER);
  expect(amount).toHaveValue("90.071.992.547.409,91");
  expect(amount.closest("details")?.open).toBe(true);
  expect(amount).toHaveAccessibleDescription(/Review this exact amount/);
});

it("adopts native money and currency edits during hydration before a later controlled render", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  container.innerHTML = renderToString(<MoneyForm locale="ru" />);
  const input = container.querySelector<HTMLInputElement>('input[name="amount"]');
  const currency = container.querySelector<HTMLSelectElement>('select[name="currency"]');
  if (!input || !currency) throw new Error("Missing native money controls");
  input.value = "123456,79";
  currency.value = "GBP";
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, <MoneyForm locale="ru" />);
    });
    const amount = screen.getByRole("textbox", { name: "Сумма (GBP)" });
    expect(amount).toHaveValue("123456,79");
    expect(amount.closest("details")?.open).toBe(true);
    await userEvent.click(amount);
    await userEvent.tab();
    expect(amount).toHaveValue("123\u00a0456,79");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Валюта" }), "USD");
    expect(screen.getByRole("textbox", { name: "Сумма (USD)" })).toHaveValue("123\u00a0456,79");
  } finally {
    await act(async () => root?.unmount());
    container.remove();
  }
});
