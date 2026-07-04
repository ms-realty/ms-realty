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

test("broker contacts require explicit approval and expose direct contact links", () => {
  const file = `${fs.mkdtempSync(`${os.tmpdir()}/ms-realty-broker-contacts-`)}/broker-contacts.jsonl`;
  resetBrokerContacts(file);
  assert.throws(
    () => createBrokerContact({ listingId: "MS-CRAWL-0001", broker: "broker_ru", phone: "+359880000000", reviewer: "owner" }),
    /explicitly approved/,
  );

  appendBrokerContact(
    createBrokerContact(
      {
        listingId: "MS-CRAWL-0001",
        broker: "broker_ru",
        phone: "+359 88 000 0000",
        reviewer: "owner",
        approved: true,
      },
      { reviewedAt: "2026-07-04T00:09:00Z" },
    ),
    { filePath: file },
  );

  const rows = readBrokerContacts(file);
  const contact = latestApprovedBrokerContact(rows, "MS-CRAWL-0001");
  assert.equal(assertBrokerContacts(rows), true);
  assert.equal(contact.channels.phone, "tel:+359880000000");
  assert.equal(contact.channels.whatsapp, "https://wa.me/359880000000");
  assert.equal(contact.channels.viber, "viber://chat?number=%2B359880000000");
});
