// Behaviour of design-system components that carries spec requirements (§16.3, §17, §20.1).
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./button";
import { ComboBox } from "./combobox";
import { ErrorSummary, type ErrorSummaryItem } from "./error-summary";
import { ExternalAppLink } from "./link";
import { PriceDisplay } from "./price-display";
import { PropertyCard } from "./property-card";
import { Sheet, useSheet } from "./sheet";
import { StatusBadge } from "./status-badge";
import { TextField } from "./text-field";

// Vitest runs without globals here, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

describe("ErrorSummary (A17)", () => {
  function Form() {
    const [errors, setErrors] = useState<ErrorSummaryItem[]>([]);
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setErrors([{ fieldId: "email", message: "Enter an email address" }]);
        }}
      >
        <ErrorSummary title="There is a problem" errors={errors} />
        <TextField id="email" label="Email address" validationBehavior="aria" />
        <button type="submit">Send question to the team</button>
      </form>
    );
  }

  it("renders nothing without errors", () => {
    render(<ErrorSummary title="There is a problem" errors={[]} />);
    expect(screen.queryByText("There is a problem")).not.toBeInTheDocument();
  });

  it("takes focus when it appears and links each error to its field", async () => {
    const user = userEvent.setup();
    render(<Form />);
    await user.click(screen.getByRole("button", { name: "Send question to the team" }));

    const summary = screen.getByRole("region", { name: "There is a problem" });
    expect(summary).toHaveFocus();

    await user.click(within(summary).getByRole("link", { name: "Enter an email address" }));
    expect(screen.getByLabelText("Email address")).toHaveFocus();
  });
});

describe("Sheet and browser Back (spec §17.2)", () => {
  function FilterSheet() {
    const sheet = useSheet();
    return (
      <>
        <button type="button" onClick={sheet.open}>
          Filters
        </button>
        <Sheet state={sheet} title="Filters" closeLabel="Close">
          <p>Filter groups</p>
        </Sheet>
      </>
    );
  }

  it("closes on Back without leaving the page", async () => {
    const user = userEvent.setup();
    render(<FilterSheet />);
    const before = window.history.length;

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    expect(window.history.length).toBe(before + 1);

    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
  });

  it("removes its history entry when closed with the close button", async () => {
    const user = userEvent.setup();
    render(<FilterSheet />);

    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(window.history.state?.msrSheet).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(window.history.state?.msrSheet).toBeUndefined());
  });
});

describe("PropertyCard (L02)", () => {
  const base = {
    href: "/en/properties/example",
    title: "Two-bedroom apartment",
    price: <PriceDisplay price={null} locale="en" onRequestLabel="Price on request" />,
    locality: "Sandanski, Blagoevgrad Province",
    facts: ["86 m² built", "2 bedrooms"],
    noPhotoLabel: "No photo yet",
    saveLabel: "Save",
    compareLabel: "Compare",
  };

  it("has exactly one main link and independent Save/Compare controls", async () => {
    const user = userEvent.setup();
    function Card() {
      const [saved, setSaved] = useState(false);
      return <PropertyCard {...base} isSaved={saved} onSavedChange={setSaved} />;
    }
    render(<Card />);

    const card = screen.getByRole("article", { name: "Two-bedroom apartment" });
    const links = within(card).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Two-bedroom apartment");
    expect(links[0]).toHaveAttribute("href", base.href);

    const save = within(card).getByRole("button", { name: /^Save/ });
    const compare = within(card).getByRole("button", { name: /^Compare/ });
    for (const control of [save, compare]) {
      expect(links[0]).not.toContainElement(control);
      expect(control.closest("a")).toBeNull();
    }
    expect(save).toHaveAttribute("aria-pressed", "false");
    await user.click(save);
    expect(save).toHaveAttribute("aria-pressed", "true");
  });

  it("states a missing photo and a price on request instead of hiding or zeroing them", () => {
    render(<PropertyCard {...base} />);
    expect(screen.getByText("No photo yet")).toBeInTheDocument();
    expect(screen.getByText("Price on request")).toBeInTheDocument();
    expect(screen.queryByText(/0/)).not.toBeInTheDocument();
  });
});

describe("StatusBadge", () => {
  it("always carries its status as text, with a family-specific shape", () => {
    const { container } = render(
      <>
        <StatusBadge family="availability" tone="positive" label="Available" />
        <StatusBadge family="approval" tone="positive" label="Approved for publication" />
        <StatusBadge family="delivery" tone="info" label="Sent; delivery pending" />
      </>,
    );
    expect(screen.getByText("Available")).toBeVisible();
    expect(screen.getByText("Approved for publication")).toBeVisible();
    expect(screen.getByText("Sent; delivery pending")).toBeVisible();

    const badges = [...container.querySelectorAll("[data-family]")];
    expect(badges.map((badge) => badge.getAttribute("data-family"))).toEqual([
      "availability",
      "approval",
      "delivery",
    ]);
    // Availability and approval never share a visual treatment.
    expect(badges[0]?.className).not.toBe(badges[1]?.className);
    for (const badge of badges)
      expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

describe("ComboBox (A04)", () => {
  const options = [
    { id: "a-burgas", name: "Aleksandrovo", region: "Burgas Province", country: "Bulgaria" },
    { id: "a-lovech", name: "Aleksandrovo", region: "Lovech Province", country: "Bulgaria" },
    { id: "sandanski", name: "Sandanski", region: "Blagoevgrad Province", country: "Bulgaria" },
  ];
  const hint = "More than one place has this name. Choose the one in the right region.";

  it("shows region and country for each option and asks for an explicit choice on ambiguous names", async () => {
    const user = userEvent.setup();
    render(<ComboBox label="Place" options={options} ambiguousHint={hint} />);

    const input = screen.getByRole("combobox", { name: "Place" });
    await user.type(input, "aleksandrovo");
    expect(screen.getByText(hint)).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(expect.stringContaining(hint));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("Burgas Province, Bulgaria")).toBeInTheDocument();
    expect(within(listbox).getByText("Lovech Province, Bulgaria")).toBeInTheDocument();

    await user.click(within(listbox).getAllByRole("option")[1] as HTMLElement);
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
    expect(input).toHaveAccessibleDescription(expect.stringContaining("Lovech Province"));
  });
});

describe("Button", () => {
  it("explains why it is disabled", () => {
    render(<Button disabledReason="Add a phone number or email first.">Request a viewing</Button>);
    const button = screen.getByRole("button", { name: "Request a viewing" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Add a phone number or email first.");
  });

  it("shows its pending label and stays focusable while pending", () => {
    render(
      <Button isPending pendingLabel="Sending request…">
        Request a viewing
      </Button>,
    );
    const button = screen.getByRole("button", { name: /Sending request/ });
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    expect(button).toHaveFocus();
  });
});

describe("ExternalAppLink (A19)", () => {
  it("names the app and describes a handoff, not a sent message", () => {
    render(
      <ExternalAppLink
        href="https://wa.me/359879696870"
        appName="WhatsApp"
        handoffNote="Opens WhatsApp. Nothing is sent until you send it there."
      >
        Message us
      </ExternalAppLink>,
    );
    const link = screen.getByRole("link", { name: /Message us.*WhatsApp/ });
    expect(link).toHaveAccessibleDescription(
      "Opens WhatsApp. Nothing is sent until you send it there.",
    );
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("PriceDisplay (protected price fact)", () => {
  it("shows the stored minor units exactly, never rounded", () => {
    render(
      <PriceDisplay
        price={{ amountMinor: 45_050, currency: "EUR" }}
        locale="en"
        periodLabel="per month"
        onRequestLabel="Price on request"
      />,
    );
    expect(screen.getByText("€450.50")).toBeInTheDocument();
  });

  it("does not round a price up to the next whole unit", () => {
    render(
      <PriceDisplay
        price={{ amountMinor: 9_999_950, currency: "EUR" }}
        locale="en"
        onRequestLabel="Price on request"
      />,
    );
    expect(screen.getByText("€99,999.50")).toBeInTheDocument();
  });
});
