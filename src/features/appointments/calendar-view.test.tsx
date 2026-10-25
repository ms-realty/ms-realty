import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CalendarAppointment, CalendarData } from "@/server/appointments/calendar";
import { calendarCopy } from "./calendar-copy";
import { parseCalendarQuery } from "./calendar-period";
import { CalendarView, calendarAppointmentOnDay } from "./calendar-view";

afterEach(cleanup);
const query = parseCalendarQuery({ date: "2030-10-27", view: "day" }).query;
const row: CalendarAppointment = {
  id: "appointment-id",
  reference: "AP-SYNTHETIC-O08",
  caseId: "case-id",
  caseReference: "CS-SYNTHETIC-O08",
  caseTitle: "Synthetic buyer apartment search",
  hostName: "Synthetic host",
  state: "reschedule_requested",
  version: 4,
  timezone: "Europe/Sofia",
  confirmedStartsAt: new Date("2030-10-27T00:30:00Z"),
  confirmedEndsAt: new Date("2030-10-27T01:30:00Z"),
  proposedStartsAt: new Date("2030-10-28T08:00:00Z"),
  proposedEndsAt: new Date("2030-10-28T09:00:00Z"),
  propertyAccess: "confirmed",
  externalBusyCheckedAt: new Date("2030-10-26T08:00:00Z"),
  resources: [
    {
      kind: "broker",
      start: new Date("2030-10-27T00:00:00Z"),
      end: new Date("2030-10-27T02:00:00Z"),
    },
    {
      kind: "property_access",
      start: new Date("2030-10-27T00:00:00Z"),
      end: new Date("2030-10-27T02:00:00Z"),
    },
  ],
  conflicts: ["property_access"],
};
const data: CalendarData = {
  rows: [row],
  requests: [],
  hasMore: false,
  hasMoreRequests: false,
  checkedAt: new Date("2030-10-27T10:00:00Z"),
};

describe("O08 native agenda", () => {
  it.each(["bg", "ru", "en"])(
    "offers named native period, timezone and scope controls in %s",
    (locale) => {
      const c = calendarCopy(locale);
      render(<CalendarView locale={locale} query={query} data={data} />);
      const date = screen.getByLabelText(c.date, { exact: true });
      const disclosure = date.closest("details");
      if (disclosure) disclosure.open = true;
      expect(date).toHaveAttribute("type", "date");
      const form = date.closest("form");
      expect(form).toHaveAttribute("method", "get");
      expect(form).toHaveAttribute("action", `/${locale}/calendar`);
      expect(screen.getByRole("combobox", { name: c.zone })).toHaveValue("Europe/Sofia");
      expect(screen.getByRole("combobox", { name: c.scope })).toHaveValue("team");
      expect(screen.getByRole("link", { name: c.day })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("link", { name: c.next })).toHaveAttribute(
        "href",
        expect.stringContaining("date=2030-10-28"),
      );
      const appointment = screen.getByRole("article", { name: row.reference });
      expect(within(appointment).getByText(c.current, { exact: true })).toBeVisible();
      expect(within(appointment).getByText(c.replacement, { exact: true })).toBeVisible();
      expect(within(appointment).getByText(c.buffer, { exact: false })).toHaveTextContent(
        "30 / 30",
      );
      expect(within(appointment).getByRole("link", { name: c.open })).toHaveAttribute(
        "href",
        `/${locale}/calendar/${row.id}`,
      );
      expect(within(appointment).getByText(c.overlap, { exact: false })).toBeVisible();
    },
  );

  it("prints repeated wall times with distinct offsets and leaves their instants intact", () => {
    const { container } = render(<CalendarView locale="en" query={query} data={data} />);
    expect(container.querySelector('time[datetime="2030-10-27T00:30:00.000Z"]')).toHaveTextContent(
      "03:30 GMT+3",
    );
    expect(container.querySelector('time[datetime="2030-10-27T01:30:00.000Z"]')).toHaveTextContent(
      "03:30 GMT+2",
    );
    expect(row.confirmedStartsAt?.toISOString()).toBe("2030-10-27T00:30:00.000Z");
  });

  it("renders a failed read separately from an empty period and preserves a retry URL", () => {
    const c = calendarCopy("en");
    render(
      <CalendarView locale="en" query={{ ...query, scope: "mine", zone: "UTC" }} data={null} />,
    );
    expect(screen.getByText(c.failure, { exact: true })).toBeVisible();
    expect(screen.getByText(c.failureNote, { exact: true })).toBeVisible();
    expect(screen.queryByText(c.empty, { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText(c.noRequests, { exact: true })).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: c.refresh })) {
      expect(link).toHaveAttribute("href", expect.stringContaining("zone=UTC&scope=mine"));
    }
  });

  it("includes dates touched only by a travel buffer and excludes the ending boundary", () => {
    const buffered = {
      ...row,
      proposedStartsAt: null,
      proposedEndsAt: null,
      confirmedStartsAt: new Date("2030-10-27T22:15:00Z"),
      confirmedEndsAt: new Date("2030-10-27T23:15:00Z"),
      resources: [
        {
          kind: "broker" as const,
          start: new Date("2030-10-27T21:45:00Z"),
          end: new Date("2030-10-27T23:45:00Z"),
        },
      ],
    };
    expect(calendarAppointmentOnDay(buffered, "2030-10-27", "Europe/Sofia")).toBe(true);
    expect(calendarAppointmentOnDay(buffered, "2030-10-28", "Europe/Sofia")).toBe(true);
    expect(
      calendarAppointmentOnDay(
        {
          ...buffered,
          resources: [],
          confirmedStartsAt: new Date("2030-10-26T20:00:00Z"),
          confirmedEndsAt: new Date("2030-10-26T21:00:00Z"),
        },
        "2030-10-27",
        "Europe/Sofia",
      ),
    ).toBe(false);
  });

  it("orders each day's itinerary by its intersecting arrangement, not an earlier confirmation", () => {
    const late = {
      ...row,
      proposedStartsAt: new Date("2030-10-28T16:00:00Z"),
      proposedEndsAt: new Date("2030-10-28T17:00:00Z"),
    };
    const early = {
      ...row,
      id: "early-appointment",
      reference: "AP-SYNTHETIC-EARLY",
      state: "confirmed" as const,
      confirmedStartsAt: new Date("2030-10-28T09:00:00Z"),
      confirmedEndsAt: new Date("2030-10-28T10:00:00Z"),
      proposedStartsAt: null,
      proposedEndsAt: null,
      resources: [],
    };
    const { container } = render(
      <CalendarView
        locale="en"
        query={{ ...query, date: "2030-10-28", view: "week" }}
        data={{ ...data, rows: [late, early] }}
      />,
    );
    const day = container.querySelector("#calendar-day-2030-10-28")?.closest("section");
    expect(
      Array.from(day?.querySelectorAll("article") ?? []).map((article) =>
        article.getAttribute("aria-label"),
      ),
    ).toEqual([early.reference, late.reference]);
  });

  it("offers recovery from an empty later page and paginates requests independently", () => {
    const c = calendarCopy("en");
    render(
      <CalendarView
        locale="en"
        query={{ ...query, page: 2, requestPage: 2 }}
        data={{ ...data, rows: [], hasMoreRequests: true }}
        adjusted
      />,
    );
    expect(screen.getByText(c.emptyPage, { exact: true })).toBeVisible();
    expect(screen.getByText(c.adjusted, { exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: c.back })).toHaveAttribute(
      "href",
      expect.stringContaining("requestPage=2"),
    );
    expect(screen.getByRole("link", { name: c.moreRequests })).toHaveAttribute(
      "href",
      expect.stringContaining("page=2&requestPage=3"),
    );
  });

  it("O08 week previews supplement the complete resource itinerary and keep day navigation native", () => {
    const c = calendarCopy("en");
    render(<CalendarView locale="en" query={{ ...query, view: "week" }} data={data} />);
    const overview = screen.getByRole("region", { name: c.weekOverview });
    expect(within(overview).getAllByRole("link").length).toBeGreaterThan(7);
    expect(within(overview).getByText("03:30 GMT+3–03:30 GMT+2", { exact: true })).toBeVisible();
    expect(within(overview).getByText(row.reference, { exact: true }).closest("a")).toHaveAttribute(
      "href",
      `/en/calendar/${row.id}`,
    );
    const dayLink = within(overview).getAllByRole("link", { name: /Sunday, 27 October/ })[0];
    expect(dayLink).toHaveAttribute(
      "href",
      expect.stringContaining("date=2030-10-27&view=day&zone=Europe%2FSofia&scope=team"),
    );
    const full = screen.getByRole("article", { name: row.reference });
    const resourceDetails = within(full)
      .getByText(c.appointmentDetails, { exact: true })
      .closest("details");
    if (resourceDetails) resourceDetails.open = true;
    expect(within(full).getByText(c.reserved, { exact: true })).toBeVisible();
    expect(within(full).getByText(c.buffer, { exact: false })).toHaveTextContent("30 / 30");
    expect(screen.getByText(c.manualCompact, { exact: false })).toBeVisible();
    const details = screen.getByText(c.details, { exact: true }).closest("details");
    expect(details?.querySelector("summary")).toHaveTextContent(c.details);
    expect(details).toHaveTextContent(c.scopeNote);
    expect(details).toHaveTextContent(c.snapshotNote);
  });
});
