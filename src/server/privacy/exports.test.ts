import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { openPrivacyExport, sealPrivacyExport } from "./exports";

describe("AT45 person export encryption", () => {
  it("binds authenticated ciphertext to request, person, recipient and artifact", () => {
    const binding = {
      id: randomUUID(),
      requestId: randomUUID(),
      partyId: randomUUID(),
      recipientId: randomUUID(),
    };
    const clear = JSON.stringify({ synthetic: "private fixture only" });
    const encrypted = sealPrivacyExport(binding, clear);
    expect(encrypted).not.toContain("private fixture");
    expect(openPrivacyExport(binding, encrypted)).toBe(clear);
    for (const field of Object.keys(binding) as (keyof typeof binding)[])
      expect(() => openPrivacyExport({ ...binding, [field]: randomUUID() }, encrypted)).toThrow();
    expect(() => openPrivacyExport(binding, encrypted.slice(0, -10))).toThrow();
    expect(sealPrivacyExport(binding, clear)).not.toBe(encrypted);
  });
});
