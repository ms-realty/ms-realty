import { describe, expect, it } from "vitest";
import {
  calendarDay,
  calendarHref,
  calendarPeriod,
  parseCalendarQuery,
  shiftCalendarDay,
} from "./calendar-period";

const query = (date: string, zone = "Europe/Sofia", view = "day") =>
  parseCalendarQuery({ date, zone, view }).query;
describe("O08 civil periods and navigation", () => {
  it.each([
    ["2030-03-31", "Europe/Sofia", "2030-03-30T22:00:00.000Z", "2030-03-31T21:00:00.000Z", 23],
    ["2030-10-27", "Europe/Sofia", "2030-10-26T21:00:00.000Z", "2030-10-27T22:00:00.000Z", 25],
    ["2030-03-10", "America/New_York", "2030-03-10T05:00:00.000Z", "2030-03-11T04:00:00.000Z", 23],
    ["2030-11-03", "America/New_York", "2030-11-03T04:00:00.000Z", "2030-11-04T05:00:00.000Z", 25],
  ])("uses the actual %s day in %s", (date, zone, start, end, hours) => {
    const period = calendarPeriod(query(date, zone));
    expect(period.start.toISOString()).toBe(start);
    expect(period.end.toISOString()).toBe(end);
    expect((period.end.getTime() - period.start.getTime()) / 3600000).toBe(hours);
    expect(calendarDay(period.start, zone)).toBe(date);
    expect(calendarDay(new Date(period.start.getTime() - 1), zone)).not.toBe(date);
    expect(calendarDay(new Date(period.end.getTime() - 1), zone)).toBe(date);
  });

  it("uses a Monday week and advances civil periods across DST, month and year boundaries", () => {
    const selected = query("2030-03-31", "Europe/Sofia", "week");
    const period = calendarPeriod(selected);
    expect(period.days).toEqual([
      "2030-03-25",
      "2030-03-26",
      "2030-03-27",
      "2030-03-28",
      "2030-03-29",
      "2030-03-30",
      "2030-03-31",
    ]);
    expect(period.end.getTime() - period.start.getTime()).toBe(167 * 3600000);
    expect(shiftCalendarDay(selected.date, 7)).toBe("2030-04-07");
    expect(shiftCalendarDay("2030-01-01", -1)).toBe("2029-12-31");
    const agenda = calendarPeriod(query("2030-10-27", "Europe/Sofia", "agenda"));
    expect(agenda.first).toBe("2030-10-27");
    expect(agenda.last).toBe("2030-11-02");
    expect(agenda.end.getTime() - agenda.start.getTime()).toBe(169 * 3600000);
  });

  it("normalizes malformed filters explicitly and derives Today in the selected zone", () => {
    const now = new Date("2030-10-27T22:30:00Z");
    expect(parseCalendarQuery({ date: "2030-02-30", zone: "UTC" }, now)).toMatchObject({
      adjusted: true,
      query: { date: "2030-10-27", zone: "UTC" },
    });
    expect(
      parseCalendarQuery(
        {
          date: ["2030-10-27"],
          zone: "Unknown/Zone",
          scope: "everyone",
          view: "month",
          page: "-4",
          requestPage: "999999",
        },
        now,
      ),
    ).toMatchObject({
      adjusted: true,
      query: {
        date: "2030-10-28",
        zone: "Europe/Sofia",
        scope: "team",
        view: "agenda",
        page: 1,
        requestPage: 1,
      },
    });
    expect(parseCalendarQuery({ zone: "America/New_York", scope: "mine" }, now)).toMatchObject({
      adjusted: false,
      query: { date: "2030-10-27", zone: "America/New_York", scope: "mine" },
    });
  });

  it("keeps scope, display zone and view in native navigation URLs", () => {
    const selected = {
      ...query("2030-10-27", "Europe/London", "week"),
      scope: "mine" as const,
      page: 2,
      requestPage: 3,
    };
    const url = new URL(
      calendarHref("bg", selected, { date: "2030-11-03", page: 1 }),
      "https://staff.example.test",
    );
    expect(url.pathname).toBe("/bg/calendar");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      date: "2030-11-03",
      view: "week",
      zone: "Europe/London",
      scope: "mine",
      requestPage: "3",
    });
  });
});
