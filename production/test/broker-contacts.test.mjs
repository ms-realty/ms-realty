import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import {
  appendBrokerContact,
  assertBrokerContacts,
  createBrokerContact,
  latestApprovedBrokerContact,
  readBrokerContacts,
  resetBrokerContacts,
} from "../lib/broker-contacts.mjs";

test("broker contacts require explicit verified approval and expose direct contact links", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-broker-contacts-`)}/broker-contacts.jsonl`;
  resetBrokerContacts(file);
  assert.throws(
    () =>
      createBrokerContact({
        listingId: "MS-CRAWL-0001",
        broker: "broker_ru",
        phone: "+447700900001",
        reviewer: "owner",
        sourceReference: "test://broker-contact/MS-CRAWL-0001",
        validationStatus: "broker_verified",
      }),
    /explicitly approved/,
  );
  assert.throws(
    () =>
      createBrokerContact({
        listingId: "MS-CRAWL-0001",
        broker: "broker_ru",
        phone: `+35988${"0".repeat(6)}`,
        reviewer: "owner",
        sourceReference: "test://broker-contact/MS-CRAWL-0001",
        validationStatus: "broker_verified",
        approved: true,
      }),
    /placeholder or test value/,
  );

  appendBrokerContact(
    createBrokerContact(
      {
        listingId: "MS-CRAWL-0001",
        broker: "broker_ru",
        phone: "+44 7700 900001",
        reviewer: "owner",
        sourceReference: "test://broker-contact/MS-CRAWL-0001",
        validationStatus: "broker_verified",
        approved: true,
      },
      { reviewedAt: "2026-07-04T00:09:00Z" },
    ),
    { filePath: file },
  );

  const rows = readBrokerContacts(file);
  const contact = latestApprovedBrokerContact(rows, "MS-CRAWL-0001");
  assert.equal(assertBrokerContacts(rows), true);
  assert.equal(contact.channels.phone, "tel:+447700900001");
  assert.equal(contact.channels.whatsapp, "https://wa.me/447700900001");
  assert.equal(contact.channels.viber, "viber://chat?number=%2B447700900001");
  const unverified = { ...contact, validation_status: "entered_pending_review" };
  assert.equal(latestApprovedBrokerContact([unverified], "MS-CRAWL-0001"), null);
  assert.throws(() => assertBrokerContacts([unverified]), /not independently verified/);
});
