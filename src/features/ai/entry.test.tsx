import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { aiCopy } from "./copy";
import { AssistanceEntry } from "./entry";
import { entryCopy } from "./entry-copy";

afterEach(cleanup);
const choice = {
  id: "10000000-0000-4000-8000-000000000001",
  reference: "RQ-ENTRY-TEST",
  purpose: "viewing_request" as const,
  locale: "bg",
};
const entry = {
  choices: [choice],
  page: 1,
  hasMore: false,
  view: "all" as const,
  access: {
    inquiries: true,
    inquiryDrafts: true,
    inventory: true,
    intakeDrafts: true,
    localeDrafts: true,
  },
};

it("uses a required native GET to review the exact source without issuing a draft request", () => {
  render(<AssistanceEntry locale="en" entry={entry} providerEnabled />);
  const select = screen.getByRole("combobox", { name: entryCopy("en").source });
  expect(select).toHaveAttribute("name", "source");
  expect(select).toBeRequired();
  expect(select).toHaveValue("");
  expect(
    within(select).getByRole("option", { name: "RQ-ENTRY-TEST · Viewing request · BG" }),
  ).toHaveValue(choice.id);
  const form = select.closest("form");
  expect(form).toHaveAttribute("method", "get");
  expect(form).toHaveAttribute("action", "/en/operations/assistance");
  expect(screen.getByRole("button", { name: entryCopy("en").inspect })).toHaveAttribute(
    "type",
    "submit",
  );
  expect(screen.queryByRole("button", { name: aiCopy("en").request })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(choice.id);
});

it("keeps pagination reachable on an empty eligible page instead of claiming the whole queue is empty", () => {
  render(
    <AssistanceEntry
      locale="ru"
      entry={{ ...entry, choices: [], page: 2, hasMore: true, view: "mine" }}
      providerEnabled={false}
    />,
  );
  expect(screen.getByText(entryCopy("ru").empty)).toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  const pages = screen.getByRole("navigation", { name: entryCopy("ru").pages });
  expect(
    within(pages)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href")),
  ).toEqual([
    "/ru/operations/assistance?view=mine&page=1",
    "/ru/operations/assistance?view=mine&page=3",
  ]);
  expect(screen.getByRole("link", { name: entryCopy("ru").manual })).toHaveAttribute(
    "href",
    "/ru/inquiries?view=mine",
  );
  expect(screen.getByText(aiCopy("ru").disabled)).toBeInTheDocument();
});

describe.each(["bg", "ru", "en"])("staff locale %s", (locale) => {
  it("offers only the implemented source tasks and preserves the manual path", () => {
    render(<AssistanceEntry locale={locale} entry={entry} providerEnabled={false} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(entryCopy(locale).title);
    expect(screen.getByRole("link", { name: entryCopy(locale).locale })).toHaveAttribute(
      "href",
      `/${locale}/operations/assistance/locale`,
    );
    expect(screen.getByRole("link", { name: entryCopy(locale).intake })).toHaveAttribute(
      "href",
      `/${locale}/operations/assistance/intake`,
    );
    expect(screen.getByRole("link", { name: entryCopy(locale).manual })).toHaveAttribute(
      "href",
      `/${locale}/inquiries?view=all`,
    );
    expect(screen.getByText(entryCopy(locale).boundary)).toBeInTheDocument();
  });
});

it("renders content-editor tasks and manual inventory without inquiry choices, facts or paths", () => {
  render(
    <AssistanceEntry
      locale="en"
      entry={{
        ...entry,
        choices: [],
        access: { ...entry.access, inquiries: false, inquiryDrafts: false },
      }}
      providerEnabled={false}
    />,
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.queryByText(entryCopy("en").inquiry)).not.toBeInTheDocument();
  expect(screen.queryByText(choice.reference)).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: entryCopy("en").manual })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: entryCopy("en").locale })).toHaveAttribute(
    "href",
    "/en/operations/assistance/locale",
  );
  expect(screen.getByRole("link", { name: entryCopy("en").intake })).toHaveAttribute(
    "href",
    "/en/operations/assistance/intake",
  );
  expect(screen.getByRole("link", { name: entryCopy("en").inventory })).toHaveAttribute(
    "href",
    "/en/inventory",
  );
});

it("provides honest manual recovery for a role with read access and no draft authority", () => {
  render(
    <AssistanceEntry
      locale="en"
      entry={{
        ...entry,
        choices: [],
        access: { ...entry.access, inquiryDrafts: false, intakeDrafts: false, localeDrafts: false },
      }}
      providerEnabled
    />,
  );
  expect(screen.getByText(entryCopy("en").unavailable)).toBeInTheDocument();
  expect(screen.getByText(entryCopy("en").manualOnly)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: entryCopy("en").manual })).toHaveAttribute(
    "href",
    "/en/inquiries",
  );
  expect(screen.getByRole("link", { name: entryCopy("en").inventory })).toHaveAttribute(
    "href",
    "/en/inventory",
  );
  expect(screen.queryByRole("link", { name: entryCopy("en").locale })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: entryCopy("en").intake })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: entryCopy("en").pages })).not.toBeInTheDocument();
});
