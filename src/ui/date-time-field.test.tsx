import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DateTimeField } from "./date-time-field";

const forbidden = /UTC|GMT|EES?T|Europe\/|YYYY|offset/i;

// Vitest runs without globals here, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

describe("DateTimeField (UI11)", () => {
  it("is a native date-time control named by its label with the zone in words", () => {
    const { container } = render(
      <DateTimeField id="due" name="dueAt" label="Follow-up time" locale="en" />,
    );
    const input = screen.getByLabelText("Follow-up time");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).toHaveAttribute("name", "dueAt");
    expect(input).toHaveAccessibleDescription("Sofia time");
    expect(container.textContent).not.toMatch(forbidden);
  });

  it("reads the chosen value back as the exact day and time", () => {
    render(<DateTimeField id="due" name="dueAt" label="Follow-up time" locale="en" />);
    const input = screen.getByLabelText("Follow-up time");
    fireEvent.change(input, { target: { value: "2030-10-19T10:00" } });
    const readback = document.getElementById("due-readback");
    expect(readback?.textContent).toMatch(/Sat.*19 October 2030.*10:00/);
    expect(input).toHaveAccessibleDescription(/Sofia time.*10:00/);
  });

  it("says plainly when the clocks make a time impossible or repeated", () => {
    render(<DateTimeField id="due" name="dueAt" label="Due" locale="bg" />);
    const input = screen.getByLabelText("Due");
    fireEvent.change(input, { target: { value: "2026-03-29T03:30" } });
    expect(document.getElementById("due-readback")).toHaveTextContent(
      "Този час не съществува: през тази нощ часовникът се мести с един час напред.",
    );
    fireEvent.change(input, { target: { value: "2026-10-25T03:30" } });
    expect(document.getElementById("due-readback")).toHaveTextContent(
      "Този час се повтаря два пъти",
    );
    expect(screen.getByText("Софийско време")).toBeVisible();
  });

  it("takes the first of a repeated hour for a preference and says so", () => {
    render(
      <DateTimeField
        id="from"
        name="viewingStart1"
        label="From"
        locale="en"
        repeatedHour="first"
        defaultValue="2026-10-25T03:30"
      />,
    );
    expect(document.getElementById("from-readback")?.textContent).toMatch(
      /25 October.*03:30.*First, before the clocks change.*The clocks go back one hour that night/,
    );
  });

  it("leaves the reason to the server error once one is shown", () => {
    render(
      <DateTimeField
        id="due"
        name="dueAt"
        label="Due"
        locale="ru"
        value="2026-03-29T03:30"
        onChange={() => {}}
        error="Такого времени не будет: в эту ночь часы переводят на час вперёд. Выберите другое время."
      />,
    );
    expect(screen.getAllByText(/Такого времени не будет/)).toHaveLength(1);
    expect(screen.getByLabelText("Due")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("По софийскому времени")).toBeVisible();
  });
});
