import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { getEnv } from "../config/env";
import { AppError } from "../errors";
import {
  inquirySchema,
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

describe("viewing preferences", () => {
  const viewingPreferences = {
    version: 1,
    provenance: "self_declared",
    timezone: "Europe/Sofia",
    windows: [],
    accessNeeds: "Private synthetic access need",
  };

  it("accepts bounded self-declaration only with a viewing request", () => {
    expect(
      parseInquiry({
        ...valid(),
        purpose: "viewing_request",
        listingReference: "MS-00001",
        viewingPreferences,
      }).viewingPreferences,
    ).toEqual(viewingPreferences);
    expect(fieldErrors({ ...valid(), viewingPreferences })).toHaveProperty("viewingPreferences");
  });

  it("keeps elapsed intent structurally readable while a new review rejects it", () => {
    const input = {
      ...valid(),
      purpose: "viewing_request",
      listingReference: "MS-00001",
      viewingPreferences: {
        ...viewingPreferences,
        windows: [{ startsAtLocal: "2020-01-01T10:00", endsAtLocal: "2020-01-01T11:00" }],
      },
    };
    expect(inquirySchema.safeParse(input).success).toBe(true);
    expect(fieldErrors(input)).toMatchObject({
      "viewingPreferences.windows.0.startsAtLocal": ["past_time"],
    });
  });
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
  it.each([false, true])(
    "uses the served protocol, including production=%s loopback",
    (production) => {
      const env = getEnv();
      const local = receiptSetCookie(
        { ...env, production, hosts: { ...env.hosts, public: "http://localhost:3100" } },
        "a".repeat(43),
      );
      expect(local).toMatch(/^msr_receipt=/);
      expect(local).not.toContain("Secure");
      const https = receiptSetCookie(
        { ...env, production, hosts: { ...env.hosts, public: "https://makler-realty.com" } },
        "a".repeat(43),
      );
      expect(https).toMatch(/^__Host-msr_receipt=/);
      expect(https).toContain("; Secure");
    },
  );

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

describe("collective inquiry contract", () => {
  const selection = () =>
    ["MS-00303", "MS-00101", "MS-00202"].map((reference) => ({
      reference,
      observedManifestId: randomUUID(),
    }));
  it("retains all three reviewed references in visitor order", () => {
    const selectedListings = selection();
    expect(parseInquiry({ ...valid(), selectedListings }).selectedListings).toEqual(
      selectedListings,
    );
  });
  it.each([
    { selectedListings: [] },
    { selectedListings: [{ reference: "MS-00101" }] },
    { selectedListings: [{ reference: "ms-00101", observedManifestId: "bad" }] },
  ])("rejects empty or incomplete selection $selectedListings", ({ selectedListings }) => {
    expect(
      Object.keys(fieldErrors({ ...valid(), selectedListings }) ?? {}).some((key) =>
        key.startsWith("selectedListings"),
      ),
    ).toBe(true);
  });
  it("rejects duplicate, excess, extra fields and ambiguous singular context", () => {
    const selectedListings = selection();
    for (const items of [
      [selectedListings[0], selectedListings[0]],
      [...selectedListings, { reference: "MS-00404", observedManifestId: randomUUID() }],
      [{ ...selectedListings[0], title: "Caller supplied" }],
    ]) {
      expect(
        Object.keys(fieldErrors({ ...valid(), selectedListings: items }) ?? {}).some((key) =>
          key.startsWith("selectedListings"),
        ),
      ).toBe(true);
    }
    expect(
      fieldErrors({ ...valid(), selectedListings, listingReference: "MS-00101" }),
    ).toMatchObject({ selectedListings: ["ambiguous_listing_context"] });
    expect(
      fieldErrors({ ...valid(), selectedListings, observedManifestId: randomUUID() }),
    ).toMatchObject({ selectedListings: ["ambiguous_listing_context"] });
    expect(fieldErrors({ ...valid(), selectedListings, purpose: "viewing_request" })).toMatchObject(
      { purpose: ["selection_requires_question"] },
    );
  });
});

describe("individual comparison navigation contract", () => {
  const comparisonReferences = ["MS-00303", "MS-00101", "MS-00202"];
  it("keeps navigation references separate from the singular subject", () => {
    const input = parseInquiry({ ...valid(), listingReference: "MS-00101", comparisonReferences });
    expect(input.listingReference).toBe("MS-00101");
    expect(input.comparisonReferences).toEqual(comparisonReferences);
    expect(input.selectedListings).toBeUndefined();
  });
  it.each([
    { comparisonReferences: ["MS-00101", "MS-00101"] },
    { comparisonReferences: ["MS-00303"] },
    { comparisonReferences: ["https://evil.example/path"] },
    { comparisonReferences: [] },
    { comparisonReferences: ["MS-00101", "MS-00202", "MS-00303", "MS-00404"] },
    {
      comparisonReferences,
      selectedListings: [{ reference: "MS-00101", observedManifestId: randomUUID() }],
    },
  ])("rejects invalid or ambiguous navigation $comparisonReferences", (context) => {
    expect(
      Object.keys(fieldErrors({ ...valid(), listingReference: "MS-00101", ...context }) ?? {}).some(
        (key) => key.startsWith("comparisonReferences"),
      ),
    ).toBe(true);
  });
});
