import { describe, expect, it } from "vitest";

import { AppError } from "../errors";
import { maskContact, normalizePhone, parseInquiry } from "./intake";

// F06 / P11 validation (spec §17.1 "Validation error": field errors, values kept by the client).
const valid = {
  operationId: "0b6c0b8e-8f7a-4d1e-9a51-6f0c2b1d7e11",
  topic: "question",
  contact: { route: "email", value: "visitor@example.test" },
  message: "Is the price negotiable?",
  responseLocale: "bg",
  consent: { privacyNotice: true },
};

function fieldErrors(input: unknown) {
  try {
    parseInquiry(input);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).fieldErrors;
  }
  throw new Error("expected a validation error");
}

describe("parseInquiry", () => {
  it("accepts a minimal question: name is optional and marketing defaults to unchecked", () => {
    expect(parseInquiry(valid)).toMatchObject({
      topic: "question",
      consent: { privacyNotice: true, marketing: false },
    });
    expect(parseInquiry(valid).name).toBeUndefined();
  });

  it("treats blank optional fields as absent", () => {
    const parsed = parseInquiry({ ...valid, name: "  ", listingReference: "", callbackWindow: "" });
    expect(parsed.name).toBeUndefined();
    expect(parsed.listingReference).toBeUndefined();
    expect(parsed.callbackWindow).toBeUndefined();
  });

  it("needs a message for a question and a name and phone for a callback", () => {
    expect(fieldErrors({ ...valid, message: " " })).toEqual({ message: ["required"] });
    expect(fieldErrors({ ...valid, topic: "callback" })).toEqual({
      "contact.route": ["phone_required_for_callback"],
      name: ["required"],
    });
  });

  it("names every invalid field with a stable code", () => {
    expect(
      fieldErrors({
        operationId: "x",
        topic: "sell",
        contact: { route: "fax", value: "1" },
        responseLocale: "fr",
        listingReference: "RQ-2026-000001",
        consent: {},
      }),
    ).toEqual({
      operationId: ["invalid_operation_id"],
      topic: ["required"],
      "contact.route": ["required"],
      responseLocale: ["required"],
      "consent.privacyNotice": ["required"],
    });
    const { contact: _contact, ...withoutContact } = valid;
    expect(fieldErrors(withoutContact)).toEqual({ contact: ["required"] });
    expect(fieldErrors({ ...valid, listingReference: "RQ-2026-000001" })).toEqual({
      listingReference: ["invalid_reference"],
    });
    expect(fieldErrors({ ...valid, message: "x".repeat(4001) })).toEqual({ message: ["too_long"] });
  });
});

describe("contact helpers", () => {
  it("accepts only international phone numbers", () => {
    expect(normalizePhone("+359 (88) 123-4567")).toBe("+359881234567");
    expect(normalizePhone("00359881234567")).toBe("+359881234567");
    expect(normalizePhone("0881234567")).toBeNull();
  });

  it("masks the contact route shown on the receipt", () => {
    expect(maskContact("email", "visitor@example.test")).toBe("v•••@example.test");
    expect(maskContact("phone", "+359881234567")).toBe("+359•••567");
  });
});
