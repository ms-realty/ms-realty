import test from "node:test";
import assert from "node:assert/strict";
import {
  COMMUNICATION_TEMPLATE_LOCALES,
  assertCommunicationThreads,
  buildCommunicationThreads,
  communicationTemplatesForLead,
} from "../lib/communication-threads.mjs";

const lead = {
  lead_id: "lead-comms-1",
  received_at: "2026-07-19T08:00:00.000Z",
  lead_type: "buyer",
  intent: "viewing",
  source: "website_viewing_request",
  listing_reference: "MS-CRAWL-0114",
  original_language: "ru",
  contact_preference: "whatsapp",
  message_original: "Можно посмотреть объект?",
  request_details: { viewing_date: "2026-07-23", viewing_time: "15:30" },
};

test("communication templates cover every public locale and retain exact lead facts", () => {
  for (const locale of COMMUNICATION_TEMPLATE_LOCALES) {
    const [template] = communicationTemplatesForLead(lead, { locale });
    assert.equal(template.locale, locale);
    assert.equal(template.kind, "viewing");
    assert.equal(template.preferred_channel, "whatsapp");
    assert.match(template.body, /MS-CRAWL-0114/);
    assert.match(template.body, /2026-07-23 15:30/);
    assert.equal(template.human_review_required, true);
    assert.equal(template.can_send_without_approval, false);
  }
});

test("communication templates distinguish callback, valuation, and general enquiry journeys", () => {
  const callback = communicationTemplatesForLead({ ...lead, intent: "callback" }, { locale: "en" })[0];
  const valuation = communicationTemplatesForLead(
    { ...lead, lead_type: "seller", intent: "valuation", listing_reference: null, property: { type: "house", location: "Sandanski" } },
    { locale: "en" },
  )[0];
  const enquiry = communicationTemplatesForLead({ ...lead, intent: "inquiry" }, { locale: "en" })[0];
  assert.equal(callback.kind, "callback");
  assert.match(callback.body, /callback request/i);
  assert.equal(valuation.kind, "valuation");
  assert.match(valuation.body, /house \/ Sandanski/);
  assert.equal(enquiry.kind, "acknowledgement");
  assert.doesNotMatch(enquiry.body, /viewing is not confirmed/i);
});

test("communication threads join inbound requests, human review, and actual delivery outcomes", () => {
  const threads = buildCommunicationThreads({
    leads: [lead],
    replies: [
      {
        id: "reply-lead-comms-1",
        lead_id: lead.lead_id,
        listing_reference: lead.listing_reference,
        reviewed_at: "2026-07-19T08:10:00.000Z",
        reviewer: "broker_ru",
        reviewed_reply: "Проверенный ответ.",
        reply_language: "ru",
      },
    ],
    outcomes: [
      {
        id: "delivery-1",
        reply_id: "reply-lead-comms-1",
        lead_id: lead.lead_id,
        action: "sent",
        actor: "broker_ru",
        channel: "whatsapp",
        sent_at: "2026-07-19T08:12:00.000Z",
        recorded_at: "2026-07-19T08:13:00.000Z",
      },
    ],
  });
  assert.equal(assertCommunicationThreads(threads), true);
  assert.deepEqual(threads[0].events.map((event) => event.type), ["inbound_request", "reply_approved", "delivery_sent"]);
  assert.equal(threads[0].events[1].body, "Проверенный ответ.");
  assert.equal(threads[0].events[2].channel, "whatsapp");
});
