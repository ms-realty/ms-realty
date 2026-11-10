// ADR 0014: every deal notice renders in every locale it is sent in, links only to the
// configured private hosts and carries the viewing calendar with its stable identity.
import { describe, expect, it } from "vitest";
import { publicLocales, staffLocales } from "@/config/tenant";
import type { OutboundMessage } from "../jobs/provider";
import { renderReviewedEmail } from "../jobs/resend";
import { clientNoticeCopy, staffNoticeCopy } from "./copy";
import {
  calendarEvents,
  clientNoticeEvents,
  dealNoticeTemplate,
  eventSubject,
  staffNoticeEvents,
  timedEvents,
} from "./events";
import {
  type DealNoticeParams,
  noticeCalendarUrl,
  noticePreferencesUrl,
  noticeUrl,
  renderDealNotice,
} from "./template";

const hosts = {
  public: "https://example.test",
  client: "https://my.example.test",
  staff: "https://app.example.test",
};
const caseId = "11111111-1111-4111-8111-111111111111";
const subjectId = "22222222-2222-4222-8222-222222222222";
const reference = "AP-2027-000042";
const time = { startsAt: "2027-01-15T08:00:00.000Z", endsAt: "2027-01-15T09:00:00.000Z" };
const clientRecipient = {
  kind: "client" as const,
  basis: "service_choice" as const,
  partyId: "33333333-3333-4333-8333-333333333333",
  principalId: "44444444-4444-4444-8444-444444444444",
  subscriptionId: "55555555-5555-4555-8555-555555555555",
  subscriptionVersion: 1,
  contactId: "66666666-6666-4666-8666-666666666666",
  contactVersion: 1,
  policyVersion: "service-email-preferences:1:en",
};
const staffRecipient = { kind: "staff" as const, principalId: clientRecipient.principalId };

function params(event: DealNoticeParams["event"], locale: string): DealNoticeParams {
  const client = (clientNoticeEvents as readonly string[]).includes(event);
  const subject = { type: eventSubject[event], id: subjectId, reference };
  const calendar = calendarEvents.includes(event);
  return {
    schemaVersion: 1,
    event,
    eventKey: `test:${event}`,
    caseId,
    subject,
    locale: locale as DealNoticeParams["locale"],
    recipient: client ? clientRecipient : staffRecipient,
    url: noticeUrl(hosts, client ? "client" : "staff", locale, subject, caseId, event),
    ...(client ? { preferencesUrl: noticePreferencesUrl(hosts, locale) } : {}),
    ...(timedEvents.includes(event) ? { time } : {}),
    ...(calendar
      ? {
          calendar: {
            uid: "stable-uid@appointments.example.test",
            sequence: 3,
            updatedAt: "2026-11-01T10:00:00.000Z",
            cancelled: event === "viewing.cancelled",
          },
          calendarUrl: noticeCalendarUrl(hosts, locale, subjectId),
        }
      : {}),
    ...(event === "deal.step_done" ? { step: "Notary appointment booked" } : {}),
  };
}
function message(p: DealNoticeParams, recipient = "person@example.test"): OutboundMessage {
  return {
    outboxId: "77777777-7777-4777-8777-777777777777",
    idempotencyKey: `${dealNoticeTemplate}:${p.event}:${p.eventKey}`,
    channel: "email",
    recipient,
    template: dealNoticeTemplate,
    params: p,
    secretParams: null,
  };
}
const from = "MS Realty <service@example.test>";
const now = new Date("2026-11-10T10:00:00Z");

describe("deal notice copy", () => {
  it("has one or two sentences, a subject and a link label for every event and locale", () => {
    for (const locale of publicLocales)
      for (const event of clientNoticeEvents) {
        const copy = clientNoticeCopy[locale][event];
        expect(copy.subject.length, `${locale} ${event}`).toBeGreaterThan(3);
        expect(copy.action.length).toBeGreaterThan(3);
        expect(copy.lead.split(/[.!?。](\s|$)/).filter((s) => s.trim()).length).toBeLessThanOrEqual(
          2,
        );
        if (timedEvents.includes(event)) expect(copy.lead).toContain("{time}");
        else expect(copy.lead).not.toContain("{time}");
        expect(copy.lead.includes("{step}")).toBe(event === "deal.step_done");
      }
    for (const locale of staffLocales)
      for (const event of staffNoticeEvents) {
        const copy = staffNoticeCopy[locale][event];
        expect(copy.subject.length, `${locale} ${event}`).toBeGreaterThan(3);
        expect(copy.lead.includes("{time}")).toBe(timedEvents.includes(event));
      }
  });

  it("says what changed in the subject, with the day for viewings, and names the page it opens", () => {
    const all = [
      ...publicLocales.flatMap((l) => clientNoticeEvents.map((e) => clientNoticeCopy[l][e])),
      ...staffLocales.flatMap((l) => staffNoticeEvents.map((e) => staffNoticeCopy[l][e])),
    ];
    for (const copy of all) {
      expect(copy.subject).not.toMatch(/notification|update|известие|уведомлени/i);
      expect(copy.subject + copy.action).not.toMatch(/·|→/);
      expect(copy.subject + copy.action).not.toMatch(/\b[A-ZА-Я]{4,}\b/u);
    }
    for (const locale of publicLocales) {
      for (const event of ["viewing.proposed", "viewing.confirmed", "viewing.moved"] as const)
        expect(clientNoticeCopy[locale][event].subject).toContain("{day}");
      expect(clientNoticeCopy[locale]["viewing.cancelled"].subjectNoTime).not.toContain("{day}");
    }
    expect(clientNoticeCopy.en["viewing.confirmed"].action).toBe("Open property viewing");
    expect(clientNoticeCopy.en["proposal.ready"].action).toBe("Open proposal terms");
    expect(clientNoticeCopy.en["document.requested"].action).toBe("Open document requests");
    expect(clientNoticeCopy.en["message.from_broker"].action).toBe("Open the conversation");
    expect(
      renderDealNotice(message(params("viewing.confirmed", "en")), { hosts, from }, now)?.subject,
    ).toBe(`Your viewing on Friday, 15 January 2027 is confirmed (${reference})`);
  });

  it("gives the button a 44 px target and every link meaningful text", () => {
    for (const locale of ["en", "he"] as const) {
      const html =
        renderDealNotice(message(params("viewing.confirmed", locale)), { hosts, from }, now)
          ?.html ?? "";
      expect(html).toContain("min-height:44px");
      expect(html).toContain("'Noto Sans'");
      expect(html).toContain('<meta name="viewport"');
      const texts = [...html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((m) => m[1] ?? "");
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) expect(text).not.toMatch(/^https?:/);
    }
  });

  it("never names the internal record noun to clients", () => {
    const text = JSON.stringify(clientNoticeCopy).toLowerCase();
    for (const word of ["case", "случай", "преписка", "дело", "matter"])
      expect(text).not.toMatch(new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, "u"));
  });
});

describe("deal notice rendering", () => {
  it("renders every client event in all seven locales, text and HTML", () => {
    for (const locale of publicLocales)
      for (const event of clientNoticeEvents) {
        const p = params(event, locale);
        const rendered = renderDealNotice(message(p), { hosts, from }, now);
        expect(rendered, `${locale} ${event}`).not.toBeNull();
        if (!rendered) continue;
        expect(rendered.subject).toContain(reference);
        expect(rendered.subject).not.toMatch(/[\r\n]/);
        expect(rendered.text).toContain(p.url);
        expect(rendered.text).toContain(noticePreferencesUrl(hosts, locale));
        expect(rendered.text).toContain("MS Realty");
        expect(rendered.text).not.toMatch(/\{(time|step)\}/);
        expect(rendered.html).toContain(`lang="${locale}"`);
        expect(rendered.html).toContain(`dir="${locale === "he" ? "rtl" : "ltr"}"`);
        expect(rendered.html).toContain(`href="${p.url}"`);
        expect(rendered.html).toContain(`<bdi dir="ltr">${reference}</bdi>`);
        if (timedEvents.includes(event)) expect(rendered.text).toMatch(/\d{1,2}[:.]\d{2}/);
        if (event === "deal.step_done")
          expect(rendered.text).toContain("Notary appointment booked");
        expect(Boolean(rendered.attachments)).toBe(calendarEvents.includes(event));
      }
  });

  it("renders every staff event in the three staff locales and refuses a client locale", () => {
    for (const locale of staffLocales)
      for (const event of staffNoticeEvents) {
        const p = params(event, locale);
        const rendered = renderDealNotice(message(p), { hosts, from }, now);
        expect(rendered, `${locale} ${event}`).not.toBeNull();
        expect(rendered?.text).toContain(`${hosts.staff}/${locale}/`);
        expect(rendered?.text).not.toContain("/preferences");
        expect(rendered?.attachments).toBeUndefined();
      }
    expect(
      renderDealNotice(message(params("client.message", "de")), { hosts, from }, now),
    ).toBeNull();
  });

  it("attaches a confirmed viewing's invitation with its stable UID and SEQUENCE", () => {
    const rendered = renderDealNotice(
      message(params("viewing.confirmed", "en")),
      { hosts, from },
      now,
    );
    const file = rendered?.attachments?.[0];
    expect(file?.filename).toBe("viewing.ics");
    expect(file?.content_type).toBe("text/calendar; charset=utf-8; method=REQUEST");
    const ics = Buffer.from(file?.content ?? "", "base64").toString("utf8");
    expect(ics).toContain("UID:stable-uid@appointments.example.test");
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("DTSTART:20270115T080000Z");
    expect(ics).toContain("ORGANIZER:mailto:service@example.test");
    expect(ics).toContain("ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:person@example.test");
    expect(rendered?.text).toContain(clientNoticeCopy.en.frame.calendarAttached);

    const cancelled = renderDealNotice(
      message(params("viewing.cancelled", "bg")),
      { hosts, from },
      now,
    );
    const cancel = Buffer.from(cancelled?.attachments?.[0]?.content ?? "", "base64").toString();
    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
    expect(cancel).toContain("UID:stable-uid@appointments.example.test");
  });

  it("gives a plain-text transport the calendar as a client-area link instead", () => {
    const p = params("viewing.moved", "nl");
    const plain = renderReviewedEmail(message(p), { from, hosts }, now, { plainText: true });
    expect(plain).not.toBeNull();
    expect(plain && "attachments" in plain).toBe(false);
    expect(plain && "html" in plain).toBe(false);
    expect(plain?.text).toContain(noticeCalendarUrl(hosts, "nl", subjectId));
    const rich = renderReviewedEmail(message(p), { from, hosts }, now);
    expect(rich && "attachments" in rich).toBe(true);
  });

  it("rejects links off the configured hosts and malformed payloads", () => {
    const p = params("proposal.ready", "en");
    expect(
      renderDealNotice(message({ ...p, url: "https://evil.example/en/proposals/x" }), { hosts }),
    ).toBeNull();
    expect(renderDealNotice(message({ ...p, preferencesUrl: undefined }), { hosts })).toBeNull();
    expect(
      renderDealNotice(message({ ...p, amountMinor: 100 } as unknown as DealNoticeParams), {
        hosts,
      }),
    ).toBeNull();
    expect(renderDealNotice({ ...message(p), secretParams: { url: "x" } }, { hosts })).toBeNull();
    const step = params("deal.step_done", "en");
    expect(renderDealNotice(message({ ...step, step: "<b>x</b>" }), { hosts })).toBeNull();
    // A confirmed viewing without its calendar identity is not a valid notice.
    const confirmed = params("viewing.confirmed", "en");
    const { calendar: _c, calendarUrl: _u, ...bare } = confirmed;
    expect(renderDealNotice(message(bare as DealNoticeParams), { hosts })).toBeNull();
  });

  it("escapes HTML and keeps Hebrew right to left with left-to-right references", () => {
    const rendered = renderDealNotice(
      message({ ...params("deal.step_done", "he"), step: 'Tom & Jerry "deal"' }),
      { hosts, from },
      now,
    );
    expect(rendered?.html).toContain('<html lang="he" dir="rtl">');
    expect(rendered?.html).toContain("Tom &amp; Jerry &quot;deal&quot;");
    expect(rendered?.html).toContain("text-align:right");
    expect(rendered?.text).toContain('Tom & Jerry "deal"');
    expect(rendered?.text).not.toMatch(/[‎‏‪-‮⁦-⁩]/);
  });
});
