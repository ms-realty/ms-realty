import { describe, expect, it } from "vitest";

import { getEnv } from "../config/env";
import { AppError } from "../errors";
import {
  isIssuedSubmissionKey,
  issueSubmissionKey,
  normalizePhone,
  parseInquiry,
  receiptSetCookie,
} from "./intake";

// P11 validation and the §6.1 submission key and receipt session (AT10, AT11).
const valid = () => ({
  submissionKey: issueSubmissionKey(),
  purpose: "question",
  locale: "bg",
  contact: { kind: "email", value: "visitor@example.test" },
  message: "Is the price negotiable?",
  privacyNotice: true,
});

function fieldErrors(input: unknown) {
  try {
    parseInquiry(input);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return (error as AppError).fieldErrors;
  }
  throw new Error("expected a validation error");
}

describe("submission keys", () => {
  it("are high-entropy and verifiable only when this server issued them", () => {
    const key = issueSubmissionKey();
    expect(key).not.toBe(issueSubmissionKey());
    expect(isIssuedSubmissionKey(key)).toBe(true);
    const [nonce] = key.split(".");
    expect(nonce).toHaveLength(43);
    expect(isIssuedSubmissionKey(`${nonce}.${"0".repeat(32)}`)).toBe(false);
    expect(isIssuedSubmissionKey("client-made-key-0000000000000000")).toBe(false);
  });
});

describe("receipt session cookie", () => {
  it("is host-only, HttpOnly and SameSite=Lax, and never names a Domain", () => {
    const cookie = receiptSetCookie(getEnv(), "a".repeat(43), new Date("2026-09-27T00:00:00Z"));
    expect(cookie).toMatch(/^msr_receipt=a{43}; Path=\/; Expires=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toMatch(/domain=/i);
  });
});

describe("parseInquiry", () => {
  it("accepts a minimal question: name optional, marketing unchecked by default", () => {
    const parsed = parseInquiry(valid());
    expect(parsed).toMatchObject({ purpose: "question", marketingOptIn: false });
    expect(parsed.name).toBeUndefined();
  });

  it("treats blank optional fields as absent", () => {
    const parsed = parseInquiry({
      ...valid(),
      name: "  ",
      listingReference: "",
      callbackWindow: "",
    });
    expect(parsed.name).toBeUndefined();
    expect(parsed.listingReference).toBeUndefined();
    expect(parsed.callbackWindow).toBeUndefined();
  });

  it("asks only what the next step needs", () => {
    expect(fieldErrors({ ...valid(), message: " " })).toEqual({ message: ["required"] });
    expect(fieldErrors({ ...valid(), purpose: "callback" })).toEqual({
      "contact.kind": ["phone_required_for_callback"],
    });
    expect(fieldErrors({ ...valid(), purpose: "viewing_request" })).toEqual({
      listingReference: ["required"],
    });
    expect(
      parseInquiry({
        ...valid(),
        purpose: "callback",
        message: undefined,
        contact: { kind: "phone", value: "+359 88 123 4567" },
      }).purpose,
    ).toBe("callback");
  });

  it("names every invalid field with a stable code", () => {
    expect(
      fieldErrors({
        submissionKey: "made-up",
        purpose: "sell",
        contact: { kind: "fax", value: "1" },
        locale: "fr",
        listingReference: "RQ-2026-000001",
        privacyNotice: false,
      }),
    ).toEqual({
      submissionKey: ["invalid"],
      purpose: ["required"],
      "contact.kind": ["required"],
      locale: ["required"],
      privacyNotice: ["required"],
    });
    expect(fieldErrors({ ...valid(), listingReference: "RQ-2026-000001" })).toEqual({
      listingReference: ["invalid_reference"],
    });
    expect(fieldErrors({ ...valid(), message: "x".repeat(4001) })).toEqual({
      message: ["too_long"],
    });
    expect(fieldErrors({ ...valid(), contact: { kind: "phone", value: "0881234567" } })).toEqual({
      "contact.value": ["phone_international_format"],
    });
  });
});

describe("normalizePhone", () => {
  it("accepts only international numbers", () => {
    expect(normalizePhone("+359 (88) 123-4567")).toBe("+359881234567");
    expect(normalizePhone("00359881234567")).toBe("+359881234567");
    expect(normalizePhone("0881234567")).toBeNull();
  });
});
